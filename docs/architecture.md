# Architecture

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
 @socratica/core  (no DOM, no chrome.*, no knowledge of the chatbot)
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ extractClaims ──▶ retrieveEvidence ──────▶ verifyClaims ─────────────▶ scoreResults   │
│ atomic factual    providers/evidence:      providers/llm: judge sees   summary line,  │
│ claims; skips     documents (user-given)   ONLY retrieved passages;    correction only│
│ opinions, hedges, wikipedia (no key)       Zod-validated JSON;         if grounded in │
│ instructions,     web search (user key)    quotes must be verbatim     the quotes     │
│ code              ranked passages + URLs   substrings, else downgrade                 │
└───────────────────────────────────────────────────────────────────────────────────────┘
     ▲                         ▲                          ▲                       ▲
     │ packages/sdk            │ packages/cli (socratica) │ skill/ (SKILL.md)     │ benchmark/
     │ verify({...})           │ verify/extract/validate  │ uses socratica or the │ labeled JSONL
                                                           Python validator
```

## Pipeline

1. **`extractClaims`** splits the answer into sentences and clauses, and keeps only checkable facts (a number
   or a named entity). It skips opinions, instructions, questions, hedges, filler and code. Every claim
   keeps its exact character span, so the extension can highlight it.
2. **`retrieveEvidence`** queries every provider for every claim, then merges, de-duplicates and ranks the
   results. A failing provider never fails the run: it only makes verdicts more likely to be `unverifiable`.
3. **`verifyClaims`** sends one prompt per claim containing only that claim's passages
   (`packages/core/src/prompt.ts`). The model's JSON is validated with Zod, then post-validated in code:
   - no passages → `unverifiable` (the LLM is not called)
   - invalid output, a quote that is not an exact substring of its cited passage, or no quotes → `unverifiable`
   - confidence below 0.5 → `unverifiable`
4. **`scoreResults`** keeps a correction only if every new word and number in it appears in the
   contradicting quotes, and computes the summary.

## Packages

| Path | Purpose |
|---|---|
| `packages/core` | The engine. Interfaces: `LLMProvider.complete(prompt)`, `EvidenceProvider.retrieve(claim, opts)`. |
| `packages/sdk` | `verify({ question, answer, evidence, llm?, providers? })`. |
| `packages/cli` | `socratica`, bundled into one file (`dist/socratica.mjs`). |
| `packages/browser-extension` | MV3 extension: adapters, watcher, overlay, options, background, demo. |
| `skill/socratica` | Agent Skill: `SKILL.md`, references, Python validator. |
| `benchmark` | Labeled dataset, metrics, runner, `BaselineVerifier`. |
| `relay` | Search relay: one Vercel Function that forwards claim-based queries to Serper with the project's key, so the default engine needs no user key. Keeps no queries; rate-limits per network address in memory. The same deployment serves Socratica's site: the extension's demo page with a live check (`src/liveCheck.ts`) and the release downloads, built into `public/` on deploy. See [`relay/README.md`](../relay/README.md). |

## Shield Mode (interface only)

Guaranteed pre-display blocking needs middleware between an app and its model API. That middleware buffers
the answer and releases it only after verification. `packages/core/src/shield.ts` defines the interface.
Nothing implements it yet.
