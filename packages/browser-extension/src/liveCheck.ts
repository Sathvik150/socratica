/**
 * The live check on Socratica's site (the demo page, served from the search relay's own address):
 * the real pipeline in the browser, with Socratica search, Wikipedia, Wikidata and DuckDuckGo, and
 * the offline judge. Only short searches built from each claim leave the browser, never the text.
 * The relay sends no CORS headers, so this works only from the page it serves.
 */
import {
  DuckDuckGoEvidenceProvider,
  HeuristicLLM,
  SocraticaSearchEvidenceProvider,
  WikidataEvidenceProvider,
  WikipediaEvidenceProvider,
  runVerification,
  type EvidenceProvider,
  type FetchLike,
  type VerifyOutput,
} from '@socratica/core';
import { AnswerOverlay } from './overlay.js';
import { extractText } from './textMap.js';
import { OFFLINE_JUDGE_PREFIX } from './ui/theme.js';

/** Longest text one live check accepts, so a check stays within the relay's per-minute allowance. */
export const LIVE_MAX_CHARS = 4000;

const OFFLINE_NOTE = `${OFFLINE_JUDGE_PREFIX}: verdicts come from matching names, numbers and wording against the sources, without a language model. It misses paraphrases; the extension can use an AI model for more thorough checks.`;

/** A page can't set User-Agent on a cross-origin request; Wikimedia reads Api-User-Agent, which is still sent. */
export function browserFetch(fetchImpl: typeof fetch = (...a) => fetch(...a)): FetchLike {
  return ((url, init) => {
    const headers = Object.fromEntries(Object.entries(init?.headers ?? {}).filter(([k]) => k.toLowerCase() !== 'user-agent'));
    return fetchImpl(url, { ...(init as RequestInit), headers });
  }) as FetchLike;
}

/** The sources the live check uses; the relay is the one at the page's own address. */
export function liveProviders(origin: string, fetch: FetchLike): EvidenceProvider[] {
  return [
    new SocraticaSearchEvidenceProvider({ fetch, relayUrl: new URL('/api/search', origin).href }),
    new WikipediaEvidenceProvider({ fetch }),
    new WikidataEvidenceProvider({ fetch }),
    new DuckDuckGoEvidenceProvider({ fetch }),
  ];
}

export async function liveCheck(text: string, origin: string, fetch: FetchLike): Promise<{ result: VerifyOutput; warnings: string[] }> {
  const result = await runVerification({
    answer: text,
    llm: new HeuristicLLM(),
    providers: liveProviders(origin, fetch),
    // Same pacing as the extension: every claim asks at once, and waits at most 20 s for evidence.
    options: { concurrency: 4, retrievalDeadlineMs: 20_000 },
  });
  const warnings = [OFFLINE_NOTE, ...result.errors.map((e) => `${e.providerId}: ${e.message}`)];
  return { result, warnings: [...new Set(warnings)] };
}

/** Wire the "Check any text" form: render the text as an answer, check it, and annotate it in place. */
export function setupLiveCheck(doc: Document, origin: string, fetch: FetchLike): void {
  const form = doc.getElementById('try-form') as HTMLFormElement | null;
  const input = doc.getElementById('try-text') as HTMLTextAreaElement | null;
  const output = doc.getElementById('try-output');
  const answer = doc.getElementById('try-answer');
  const count = doc.getElementById('try-count');
  if (!form || !input || !output || !answer) return;
  const button = form.querySelector<HTMLButtonElement>('button[type=submit]');
  input.maxLength = LIVE_MAX_CHARS;
  const showCount = () => {
    if (count) count.textContent = `${input.value.length.toLocaleString('en-US')} / ${LIVE_MAX_CHARS.toLocaleString('en-US')} characters`;
  };
  input.addEventListener('input', showCount);
  showCount();

  let overlay: AnswerOverlay | undefined;
  let running = false;
  const run = async () => {
    const text = input.value.trim();
    if (!text || running) return;
    running = true;
    if (button) button.disabled = true;
    // Paragraphs as the page shows them; the check runs on the text read back from the page,
    // so every claim's span lines up with what is underlined.
    answer.replaceChildren(...text.split(/\n\s*\n/).map((para) => Object.assign(doc.createElement('p'), { textContent: para.trim() })));
    output.hidden = false;
    overlay?.destroy();
    const current = (overlay = new AnswerOverlay({ content: answer, onRecheck: () => void run() }));
    current.showStatus('Checking claims against evidence…');
    try {
      const shown = extractText(answer).text;
      const { result, warnings } = await liveCheck(shown, origin, fetch);
      if (current === overlay) current.render(result, shown, warnings);
    } catch (err) {
      if (current === overlay) current.showStatus(`The check failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      running = false;
      if (button) button.disabled = false;
    }
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void run();
  });
}
