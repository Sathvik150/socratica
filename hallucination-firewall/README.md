# Hallucination Firewall

**Install one extension. Keep using your chatbot normally. Claims get independently verified and annotated with evidence inside the existing conversation.**

Hallucination Firewall is an open-source, model-independent fact-verification system. It has two parts:

- **`@hallucination-firewall/core`**: a platform-agnostic TypeScript engine. It extracts checkable claims from an answer, retrieves evidence, judges each claim against only that evidence, and scores the result. The engine has no DOM or browser-extension code and doesn't know which chatbot produced the text.
- **A Chrome (Manifest V3) extension** for **ChatGPT only** in this version. It checks answers after they finish streaming, highlights flagged claims, and shows the evidence behind every verdict.

It is not a chatbot and does not generate answers.

## What makes the verdicts different

1. **Evidence-linked verdicts.** Every `supported` or `contradicted` verdict carries quotes from passages that were actually retrieved. Code checks that each quote is a **verbatim substring** of the passage it cites (exact match, minimum 12 characters). If any quote fails that check, the verdict is downgraded to `unverifiable`.
2. **Three-way verdicts.** `supported` / `contradicted` / `unverifiable`. `contradicted` requires a passage that explicitly conflicts with the claim. Missing evidence always yields `unverifiable`, never `contradicted`. When no passages are found, the LLM is not even called.
3. **Built to keep false positives low.** Opinions, instructions, questions, hedged statements, filler and code blocks are not checked at all. Invalid model output, verdicts without quotes, and low-confidence verdicts all fall back to `unverifiable`. A suggested correction is shown only when every new fact in it appears in the contradicting quotes.

## The interception limitation (please read)

**A browser extension cannot guarantee that it checks an answer before you see it.** The extension runs in **Review Mode**: it waits until ChatGPT finishes streaming, then verifies and annotates. You will see the original answer first.

Guaranteed pre-display blocking (**Shield Mode**) needs middleware between the application and the model API, which buffers the answer and releases it only after verification. That is **out of scope**. Only its interface is defined, in [`packages/core/src/shield.ts`](packages/core/src/shield.ts), and nothing implements it.

## Install (load unpacked)

Requirements: Node 20+ and pnpm 10 (`corepack enable` provides it).

```bash
cd hallucination-firewall
pnpm install
pnpm -r build
```

Then in Chrome:

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and select `packages/browser-extension/dist`.
3. The options page opens with the **privacy notice**. Nothing is checked, and nothing is sent anywhere, until you tick the box and click **Accept and enable checking**. Chrome then asks for permission to reach the sources you enabled.
4. Open https://chatgpt.com and ask something. When the answer finishes, a summary bar appears under it, and flagged claims are underlined (red for contradicted, dashed amber for unverifiable). Click a highlight to see the reason, the evidence quotes with source links, and a correction when one is available.

Click the toolbar icon to reopen the settings.

### Offline demo (no ChatGPT, no network)

After building, open `packages/browser-extension/dist/demo.html` directly in a browser, or open `chrome-extension://<id>/demo.html` once the extension is loaded. It runs the real core pipeline with `MockLLM` and a supplied (fictional) document against a ChatGPT-like page. The answer contains one wrong year, and the page shows **1 contradicted** claim with its evidence quote, source link and suggested correction. The same scenario runs as an automated test in `packages/browser-extension/src/__tests__/endToEnd.test.ts`.

## Options

| Setting | Default | Notes |
|---|---|---|
| Consent | **not given** | Mandatory before any checking. Can be withdrawn. Re-required if the notice changes. |
| Platforms | ChatGPT on | Claude and Gemini are shown as not supported. |
| Auto-check | on | When off, each answer gets a "Check this answer" button. |
| Judge (LLM) | Offline heuristic | Or OpenAI / Anthropic with **your own API key**; the model is configurable. |
| Evidence | Wikipedia on, web search off | Web search uses the Brave Search API with **your own key**. |

## Privacy model

- **Default: no network calls.** Until you accept the notice, the background worker returns before any provider is created (covered by tests).
- **What leaves the browser, after consent:**
  - Evidence sources (Wikipedia, optional Brave Search) receive **short search queries built from individual claims**, never the whole conversation.
  - If you pick OpenAI or Anthropic as the judge, that provider receives, per claim: the claim, its surrounding sentence, your question, and the retrieved passages, sent with **your** key.
  - With the offline judge and no evidence sources enabled, nothing leaves the browser.
- **All network calls go through the background service worker.** The content script only reads the page and talks to the worker.
- **Keys** are stored only in `chrome.storage.local` (not synced). They are never hardcoded, logged, or included in error messages, and they are sent only as request headers to the provider they belong to.
- **Permissions:** `storage` only, plus content-script access to `https://chatgpt.com/*`. The Wikipedia, OpenAI, Anthropic and Brave endpoints are **optional host permissions**, requested at runtime only for the sources you enable.
- **No backend, accounts, telemetry or analytics.**

## Architecture

```
 chatgpt.com tab                                   extension service worker
┌──────────────────────────────────────────┐      ┌──────────────────────────────────────┐
│ contentScript.ts                         │      │ background.ts                        │
│  adapters/chatgpt.ts  (ALL site DOM      │ msg  │  verifyService.ts                    │
│     assumptions live here)               │─────▶│   consent gate ── no consent: stop   │
│  watcher.ts  MutationObserver + debounce │      │   settings (chrome.storage.local)    │
│     + "still streaming?" check           │◀─────│   builds providers, calls core       │
│  overlay.ts  Shadow DOM: highlights,     │result│                                      │
│     evidence panel, summary bar          │      └──────────────┬───────────────────────┘
└──────────────────────────────────────────┘                     │ plain text in, JSON out
                                                                 ▼
 @hallucination-firewall/core  (no DOM, no chrome.*, no knowledge of the chatbot)
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ extractClaims ──▶ retrieveEvidence ──────▶ verifyClaims ─────────────▶ scoreResults   │
│ atomic factual    providers/evidence:      providers/llm: judge sees   summary line,  │
│ claims; skips     documents (user-given)   ONLY retrieved passages;    correction only│
│ opinions, hedges, wikipedia (no key)       Zod-validated JSON;         if grounded in │
│ instructions,     web search (user key)    quotes must be verbatim     the quotes     │
│ code              ranked passages + URLs   substrings, else downgrade                 │
└───────────────────────────────────────────────────────────────────────────────────────┘
        ▲                                                   ▲
        │ packages/sdk: verify({ question, answer, evidence })   benchmark/: labeled JSONL + runner
```

### Repository layout

```
packages/core/                 engine: extractClaims, retrieveEvidence, verifyClaims, scoreResults, types,
                               providers/llm (OpenAI, Anthropic, HeuristicLLM, MockLLM),
                               providers/evidence (documents, Wikipedia, Brave web search), shield.ts (interface only)
packages/browser-extension/    manifest.json, background, content script, overlay, options page, demo,
                               adapters/ (chatgpt.ts; claude.ts and gemini.ts are stubs that throw), fixtures/
packages/sdk/                  verify({ question, answer, evidence }) wrapper over core
benchmark/                     data/benchmark.jsonl + runner (metrics, BaselineVerifier interface)
tests/no-network.ts            loaded by every test suite; any real fetch fails the test
```

## SDK usage

```ts
import { verify, OpenAIProvider, WikipediaEvidenceProvider } from '@hallucination-firewall/sdk';

// Offline: supplied documents + the deterministic heuristic judge.
const result = await verify({
  question: 'When did the Zentha Bridge open?',
  answer: 'The Zentha Bridge opened in 1987.',
  evidence: [{ title: 'Zentha Bridge', url: 'https://example.org/zentha', text: 'The Zentha Bridge opened in 1991.' }],
});
result.summary.text; // "1 checked, 0 supported, 1 contradicted, 0 unverifiable"
result.verdicts[0];  // { verdict: 'contradicted', quotes: [...], correction: 'The Zentha Bridge opened in 1991.', ... }

// With a real judge and Wikipedia (your key, your network):
await verify({
  answer,
  llm: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY!, fetch }),
  providers: [new WikipediaEvidenceProvider({ fetch })],
});
```

The LLM interface is just `complete(prompt: string): Promise<string>`, and evidence providers implement `retrieve(claim, { limit })`. Both are defined in `packages/core/src/types.ts`.

The judge prompt (`packages/core/src/prompt.ts`) does four things:
- tells the model to use **only** the provided passages
- treats passage text as untrusted data
- asks for a short rationale, **not** step-by-step reasoning
- requires a single JSON object, which is validated with Zod

## Tests

```bash
pnpm -r test
```

The tests need no network and no API key. `tests/no-network.ts` replaces `fetch` with a function that throws, and providers are tested with injected fake `fetch`. Coverage includes:

- claim extraction
- quote-substring validation (a fabricated quote is downgraded to `unverifiable`)
- the three-way verdict rules
- scoring and correction grounding
- the ChatGPT adapter against the two saved HTML fixtures (finished and streaming)
- the watcher (debounce, streaming, regenerate)
- the consent gate
- the options page
- the end-to-end demo path

## Benchmark

```bash
pnpm -r build
pnpm bench
```

`benchmark/data/benchmark.jsonl` holds 37 hand-written items about **fictional** entities, so the labels are unambiguous: 12 supported, 12 contradicted, 13 unverifiable. Each item has a claim, an evidence set and a gold label. The runner reports, per verifier:
- precision, recall and F1 per label, plus accuracy
- the **false-positive rate on `contradicted`**: the share of non-contradicted items predicted as contradicted
- **accuracy on contradicted-vs-unverifiable items**

Plug in another verifier by implementing `BaselineVerifier` (`benchmark/src/verifiers.ts`) and adding it to the runner. To run the firewall with a real LLM (this makes network calls with your key): `HF_OPENAI_API_KEY=... pnpm bench -- --llm openai`, or `--llm anthropic` with `HF_ANTHROPIC_API_KEY`.

**Results.** These are the numbers `pnpm bench` printed for this commit, offline. Re-run it rather than trusting this table.

| Verifier | Accuracy | FPR on contradicted | C-vs-U accuracy | Contradicted P / R |
|---|---|---|---|---|
| hallucination-firewall + `HeuristicLLM` (offline judge) | 89.2% | 0.0% | 84.0% | 100.0% / 66.7% |
| naive binary-overlap reference (no "unverifiable" output) | 51.4% | 52.0% | 28.0% | 35.0% / 58.3% |

Read these numbers with care:

- **The set is tiny (n=37), synthetic and in-sample.** The same author wrote both the dataset and the heuristic judge. On the first run the heuristic scored 75.7% accuracy with a 16.0% contradicted FPR. Three generalization bugs were then fixed after looking at its errors (pronoun-led passage sentences, "The X"/"X's" name normalization, and requiring a conflict to be about the same predicate). The improvement is therefore partly fitted to this set.
- The binary-overlap baseline is a **reference point, not a re-implementation of any existing tool**. It shows what happens when "no evidence" is treated as "hallucinated".
- **No real-LLM numbers are reported, because none have been run.** No comparison against existing detectors has been run either.
- Real chatbot answers are messier than these items. **No accuracy claim for live ChatGPT answers is made.**

## Known limitations

- **Review Mode only.** Answers are visible before they are checked. Shield Mode is an interface, not an implementation.
- **ChatGPT DOM selectors are unverified assumptions.** `[data-message-author-role="assistant"]`, `.markdown`, `.result-streaming` and the stop-button selectors were tested only against **hand-written** fixtures, not captured pages. ChatGPT can change its markup at any time and break detection; fixes belong in `packages/browser-extension/src/adapters/chatgpt.ts`. **The extension has not been tested on live chatgpt.com.**
- **Claim extraction is rule-based** (sentence and clause splitting plus filters). It can miss claims, split awkwardly, or skip facts phrased as opinions. Pronoun claims get the previous sentence as context but are not rewritten.
- **The offline `HeuristicLLM` judge is a lexical baseline**, not a language model. It handles simple numeric, name and negation conflicts in single sentences, and misses paraphrase, world knowledge and multi-hop evidence. In those cases it returns `unverifiable`, by design.
- **Retrieval is lexical** (token overlap). Wikipedia search uses the claim text, so obscure or ambiguous entities may retrieve nothing useful (→ `unverifiable`). Only English Wikipedia is permitted.
- **The Wikipedia, OpenAI, Anthropic and Brave providers have not been run against the live services** here. They are tested only with fake `fetch`.
- Quote validation is exact. A judge that changes whitespace or punctuation while quoting is downgraded to `unverifiable`, which deliberately trades recall for trust.
- Highlights are positioned overlays. They are redrawn on scroll and resize, but layout changes from other causes may leave them slightly offset until the next scroll.
- The background bundle is about 0.8 MB (unminified, mostly the schema library).
- Claude and Gemini adapters are stubs that throw "not implemented".

## License

MIT. See [LICENSE](LICENSE).
