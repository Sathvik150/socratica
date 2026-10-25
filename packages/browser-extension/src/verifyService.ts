import {
  AnthropicProvider,
  BraveSearchEvidenceProvider,
  HeuristicLLM,
  OpenAIProvider,
  WikipediaEvidenceProvider,
  runVerification,
  type EvidenceProvider,
  type FetchLike,
  type LLMProvider,
} from '@hallucination-firewall/core';
import type { PlatformId } from './adapters/adapter.js';
import type { TestJudgeResponse, VerifyResponse } from './messages.js';
import { DEFAULT_MODELS, HOST_PERMISSIONS, hasValidConsent, localOrigin, type Settings } from './settings.js';

// One Wikipedia provider per fetch function, so its article cache survives across answers
// and the extension sends Wikimedia fewer requests.
const wikipediaProviders = new WeakMap<FetchLike, WikipediaEvidenceProvider>();
function wikipediaFor(fetch: FetchLike): WikipediaEvidenceProvider {
  let p = wikipediaProviders.get(fetch);
  if (!p) wikipediaProviders.set(fetch, (p = new WikipediaEvidenceProvider({ fetch })));
  return p;
}

export interface ServiceDeps {
  fetch: FetchLike;
  /** Whether the extension currently holds a host permission (chrome.permissions.contains). */
  hasPermission(origin: string): Promise<boolean>;
}

type JudgeResult = { llm: LLMProvider; label: string } | { error: string };

/** Build the configured judge, or explain why it can't be used. Never makes a network call. */
export async function makeJudge(settings: Settings, deps: ServiceDeps): Promise<JudgeResult> {
  const { provider, apiKey, model, baseUrl } = settings.llm;
  if (provider === 'heuristic') return { llm: new HeuristicLLM(), label: 'offline heuristic judge' };
  const m = model || DEFAULT_MODELS[provider];
  if (provider === 'local') {
    const origin = localOrigin(baseUrl);
    if (!origin) return { error: `"${baseUrl}" is not a valid local server URL (expected e.g. http://localhost:11434/v1).` };
    if (!(await deps.hasPermission(origin))) {
      return { error: `Permission to contact ${baseUrl} has not been granted. Open the extension settings and press Save.` };
    }
    const fetch = withLocalHints(deps.fetch, baseUrl, m);
    return { llm: new OpenAIProvider({ baseUrl, model: m, fetch, ...(apiKey ? { apiKey } : {}) }), label: `${m} (local)` };
  }
  if (!apiKey) return { error: `No ${provider} API key is set. Add one in the extension settings.` };
  if (!(await deps.hasPermission(HOST_PERMISSIONS[provider]))) {
    return { error: `Permission to contact ${provider} has not been granted. Open the extension settings and press Save.` };
  }
  return {
    llm: provider === 'openai' ? new OpenAIProvider({ apiKey, model: m, fetch: deps.fetch }) : new AnthropicProvider({ apiKey, model: m, fetch: deps.fetch }),
    label: `${m} (${provider})`,
  };
}

/** Turn the opaque failures of local servers into actionable messages. */
function withLocalHints(fetch: FetchLike, baseUrl: string, model: string): FetchLike {
  return async (url, init) => {
    let res;
    try {
      res = await fetch(url, init);
    } catch {
      throw new Error(`Could not reach ${baseUrl}. Is your local model server running?`);
    }
    if (res.status === 403) {
      throw new Error(
        'The local server refused the extension (HTTP 403). For Ollama, restart it with OLLAMA_ORIGINS="chrome-extension://*"; for LM Studio, turn on "Enable CORS" in the server settings.',
      );
    }
    if (res.status === 404) throw new Error(`The local server has no model "${model}" (HTTP 404). For Ollama, run: ollama pull ${model}`);
    return res;
  };
}

function evidenceProviders(settings: Settings, deps: ServiceDeps, warnings: string[]): Promise<EvidenceProvider[]> {
  return (async () => {
    const providers: EvidenceProvider[] = [];
    if (settings.evidence.wikipedia) {
      if (await deps.hasPermission(HOST_PERMISSIONS.wikipedia)) providers.push(wikipediaFor(deps.fetch));
      else warnings.push('Wikipedia is enabled but its permission was not granted.');
    }
    if (settings.evidence.webSearch) {
      if (!settings.evidence.webSearchApiKey) warnings.push('Web search is enabled but no API key is set.');
      else if (!(await deps.hasPermission(HOST_PERMISSIONS.webSearch))) warnings.push('Web search is enabled but its permission was not granted.');
      else providers.push(new BraveSearchEvidenceProvider({ apiKey: settings.evidence.webSearchApiKey, fetch: deps.fetch }));
    }
    if (providers.length === 0) warnings.push('No evidence source is active, so every claim will be unverifiable.');
    return providers;
  })();
}

async function run(answer: string, question: string | undefined, settings: Settings, deps: ServiceDeps): Promise<VerifyResponse> {
  const judge = await makeJudge(settings, deps);
  if ('error' in judge) return { status: 'error', message: judge.error };
  const warnings: string[] = [];
  if (settings.llm.provider === 'heuristic') {
    warnings.push('Using the offline heuristic judge: it only recognises very literal matches, so most real-world claims come out unverifiable. Choose a model in Settings for real checks.');
  }
  const providers = await evidenceProviders(settings, deps, warnings);
  try {
    const result = await runVerification({ answer, llm: judge.llm, providers, ...(question ? { question } : {}) });
    for (const e of result.errors) warnings.push(`${e.providerId}: ${e.message}`);
    // A judge failure shows up per claim; surface it once so the user can fix it.
    const judgeError = result.verdicts.find((v) => v.downgradeReason === 'llm-error');
    if (judgeError) warnings.unshift(`Judge (${judge.label}) failed: ${judgeError.rationale}`);
    return { status: 'ok', result, warnings: [...new Set(warnings)] };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Verification failed.' };
  }
}

/**
 * The only place that decides whether conversation-derived text may leave the
 * browser. Without valid consent it returns before constructing any provider.
 */
export async function handleVerify(
  req: { platform: PlatformId; answer: string; question?: string },
  settings: Settings,
  deps: ServiceDeps,
): Promise<VerifyResponse> {
  if (!settings.platforms[req.platform]) return { status: 'disabled' };
  if (!hasValidConsent(settings)) return { status: 'consent-required' };
  return run(req.answer, req.question, settings, deps);
}

/** Text the user explicitly selected and asked to check from the popup (any site). Same consent rule. */
export async function handleVerifyText(req: { text: string }, settings: Settings, deps: ServiceDeps): Promise<VerifyResponse> {
  if (!hasValidConsent(settings)) return { status: 'consent-required' };
  if (!req.text.trim()) return { status: 'error', message: 'Select some text on the page first.' };
  return run(req.text.slice(0, 20_000), undefined, settings, deps);
}

/** One tiny request to the configured judge, for the options page. Requires consent like any other call. */
export async function handleTestJudge(settings: Settings, deps: ServiceDeps): Promise<TestJudgeResponse> {
  const judge = await makeJudge(settings, deps);
  const name = settings.llm.provider;
  if ('error' in judge) return { ok: false, judge: name, message: judge.error };
  if (!hasValidConsent(settings) && name !== 'heuristic') {
    return { ok: false, judge: judge.label, message: 'Accept the privacy notice first; nothing is sent before that.' };
  }
  const t0 = Date.now();
  try {
    const out = await judge.llm.complete('Reply with exactly this JSON and nothing else: {"ok": true}');
    if (!/\{[\s\S]*\}/.test(out)) return { ok: false, judge: judge.label, message: `The model replied but not with JSON: "${out.slice(0, 80)}"` };
    return { ok: true, judge: judge.label, ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, judge: judge.label, message: err instanceof Error ? err.message : String(err) };
  }
}
