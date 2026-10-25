<div align="center">

<img src="docs/images/banner.png" alt="Socratica: a firewall against AI hallucinations" width="720">

**Question more. Trust better.**

Socratica checks the factual claims in a ChatGPT answer against evidence from the web, right where you read it.
Every claim is marked supported, contradicted or unverifiable, and every verdict cites the exact source text behind it.

[![CI](https://github.com/sathvik150/cac26/actions/workflows/ci.yml/badge.svg)](https://github.com/sathvik150/cac26/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-a9884f.svg)](LICENSE)
![Node 20+](https://img.shields.io/badge/node-%3E%3D20-a9884f?logo=node.js&logoColor=white)
![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-a9884f?logo=typescript&logoColor=white)
![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-a9884f?logo=googlechrome&logoColor=white)
![Agent Skill](https://img.shields.io/badge/Agent%20Skill-SKILL.md-a9884f)

[Download](#download) · [Quick start](#quick-start) · [How it works](#how-it-works) · [Privacy](#privacy) · [Benchmark](#benchmark) · [Limitations](#known-limitations)

<img src="docs/images/demo.png" alt="A contradicted claim highlighted in a ChatGPT-style answer, with the evidence panel showing the source quote and a suggested correction" width="760">

*The unexamined answer is not worth trusting.*

</div>

---

## Why it's different

Plenty of tools say "this might be a hallucination." Socratica is built so you can **trust the flag**:

- **Evidence-linked verdicts.** A claim is marked supported or contradicted only with a quote from a passage that was actually retrieved. Code checks that the quote is a **verbatim substring** of the passage. If it isn't, the verdict is thrown out and becomes `unverifiable`.
- **Three-way verdicts.** "Demonstrably false" (`contradicted`) is kept separate from "couldn't find evidence" (`unverifiable`). Missing evidence is **never** reported as false.
- **Low false positives by design.** Opinions, advice, questions, hedged statements and code are not checked. Weak or malformed judgments fall back to `unverifiable`, and a correction is shown only when the source states it directly.
- **Web search for everyone, no key needed.** Every check searches the web. The default engine, Socratica search, gets Google results through Socratica's own relay, with no key or sign-up for anyone, and DuckDuckGo's keyless answers back it up. Firecrawl, and Serper or Brave Search with your own key, are there too.
- **Model-independent.** Use the offline judge, your own OpenAI or Anthropic key, or a **local model** (Ollama, LM Studio, llama.cpp, vLLM).

## Download

Grab the zips from the **[latest release](https://github.com/sathvik150/cac26/releases/latest)**, or build them yourself with `pnpm build && pnpm package`.

| Zip | For | What's inside |
|---|---|---|
| socratica-extension-v0.3.1.zip | **Chrome**: annotate ChatGPT answers in place | Ready-to-load MV3 extension plus an offline demo page |
| socratica-plugin-v0.3.1.zip | **ChatGPT → Plugins → New Plugin** | Plugin manifest plus full skill and validators |
| socratica-plugin-instructions-v0.3.1.zip | **ChatGPT plugin troubleshooting** | Plugin manifest plus instruction-only skill; manual quote checks |
| socratica-skill-instructions-v0.3.1.zip | **Skills upload troubleshooting** | Instruction-only variant; manual quote checks, no scripts ([details](docs/skill.md#troubleshooting-a-chatgpt-upload-failure)) |
| socratica-skill-v0.3.1.zip | **Claude, Claude Code** and other Agent Skills hosts | `SKILL.md`, rules, and Node and Python validators |
| socratica-cli-v0.3.1.zip | **Local use** with your own model, scripts and agents | Single-file CLI (Node 20+, no install) plus examples |

## Quick start

<details open>
<summary><b>Chrome extension (ChatGPT)</b></summary>

1. Unzip `socratica-extension-v0.3.1.zip`.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the unzipped folder.
3. Read and accept the privacy notice on the settings page that opens. **Nothing is checked or sent before you accept.**
4. **Web search** is required and already set up, with no key: **Socratica search** gets Google results through Socratica's own relay, and if the relay is busy, DuckDuckGo's keyless answers stand in. You can switch to Firecrawl (no key), or to Serper or Brave Search with your own key.
5. **Choose a judge** in the same settings page. The default offline judge only recognises very literal matches, so on real answers it mostly says "unverifiable". For real checks, pick one of:
   - **Local model (free, private):** install [Ollama](https://ollama.com), run `ollama pull qwen2.5:7b`, then start it with `OLLAMA_ORIGINS="chrome-extension://*" ollama serve`. In settings, choose **Local model**, press **Save**, then **Test connection**.
   - **OpenAI or Anthropic:** paste your own API key.
6. Use [chatgpt.com](https://chatgpt.com) normally. When an answer finishes, a summary bar appears under it. Click a highlighted claim to see the reason, the source quotes and a correction.
7. Click the toolbar icon at any time for the **popup**. Its **Verify** tab checks the latest answer, or selected text on any website. **Sources** shows the web search engine, the other sources and the judge in use. **Insights** breaks down the last result. The switch in its corner turns Socratica off, and then nothing is sent.

<img src="docs/images/popup.png" alt="The toolbar popup: the Verify, Sources and Insights tabs, with a check of the latest answer" width="320">

Want to see it without ChatGPT? Open `demo.html` from the unzipped folder. It runs fully offline.

</details>

<details>
<summary><b>Agent Skill (Claude / ChatGPT / Claude Code)</b></summary>

- **Claude:** with code execution enabled, open the Skills section in Settings, click **Upload skill**, and choose `socratica-skill-v0.3.1.zip`.
- **Claude Code:** `unzip socratica-skill-v0.3.1.zip -d ~/.claude/skills/`
- **ChatGPT plugin:** download `socratica-plugin-v0.3.1.zip`, keep it zipped, then open **Plugins → New Plugin**, upload it, and select **Add plugin**. Use `socratica-plugin-instructions-v0.3.1.zip` for the variant without bundled scripts.
- **Standalone Skills upload:** use `socratica-skill-v0.3.1.zip` in a Skills uploader, or `socratica-skill-instructions-v0.3.1.zip` for manual quote checks. A standalone skill ZIP does not contain the manifest required by the plugin uploader.

Install one full or instruction-only variant at a time; they share the same plugin/skill name. Instruction-only variants do not machine-validate quotes.

Then ask: *"Fact-check this answer against these sources."* Full guide: [docs/skill.md](docs/skill.md).

</details>

<details>
<summary><b>CLI and local models</b></summary>

```bash
unzip socratica-cli-v0.3.1.zip && cd socratica-cli

# Offline: your documents + the built-in deterministic judge
node socratica.mjs verify --answer examples/answer.txt --evidence examples/evidence/

# Real-world claims: web search with no key (Socratica search), plus Wikipedia
node socratica.mjs verify --answer answer.txt --web socratica --wikipedia

# With a local model through Ollama (any OpenAI-compatible server works)
node socratica.mjs verify --answer answer.txt --web socratica --llm local --model llama3.1
```

```
Summary: 3 checked, 2 supported, 1 contradicted, 0 unverifiable

[CONTRADICTED] It was founded by Dalia Moss in 1910.
    reason: The passage gives 1902 where the claim says 1910.
    evidence: "The Orrin Library is a public library in the city of Velmora. It was founded by Dalia Moss in 1902."
      source: orrin-library.md
    correction: It was founded by Dalia Moss in 1902.
```

More in [packages/cli/README.md](packages/cli/README.md) and [docs/local-ai.md](docs/local-ai.md).

</details>

<details>
<summary><b>TypeScript SDK</b></summary>

```ts
import { verify } from '@socratica/sdk';

const result = await verify({
  question: 'When did the Zentha Bridge open?',
  answer: 'The Zentha Bridge opened in 1987.',
  evidence: [{ title: 'Zentha Bridge', url: 'https://example.org/zentha', text: 'The Zentha Bridge opened in 1991.' }],
});

result.summary.text;          // "1 checked, 0 supported, 1 contradicted, 0 unverifiable"
result.verdicts[0].correction; // "The Zentha Bridge opened in 1991."
```

Pass `llm` (e.g. `new OpenAIProvider({ apiKey, fetch })`, or `{ baseUrl: 'http://localhost:11434/v1', model, fetch }` for a local model) and `providers` (e.g. `createWebSearch('firecrawl', { fetch })` or `new WikipediaEvidenceProvider({ fetch })`, both from `@socratica/core`) to go beyond the offline defaults.

</details>

## How it works

```
 answer ──▶ extractClaims ──▶ retrieveEvidence ──▶ verifyClaims ──────────────▶ scoreResults ──▶ report
            atomic facts;     web search, your     judge sees ONLY the          summary +
            skips opinions,   documents,           passages; JSON is schema-    grounded
            advice, hedges    Wikipedia ...        checked; quotes must be      corrections
                                                   verbatim or → unverifiable
```

| Verdict | Meaning |
|---|---|
| **supported** | A retrieved passage explicitly states the claim, and the quote proves it. |
| **contradicted** | A retrieved passage explicitly conflicts with the claim, and the quote proves it. |
| **unverifiable** | Anything else: no evidence, ambiguous evidence, or a verdict that failed validation. |

The core engine has no DOM or browser code and doesn't know which chatbot wrote the text. The extension, CLI, skill and SDK are thin layers on top of it. Details: [docs/architecture.md](docs/architecture.md).

**Web search is required.** Pick one engine:

| Engine | Key | Good to know |
|---|---|---|
| **Socratica search** (default) | None | Google results through Socratica's own relay ([`relay/`](relay/README.md), on Vercel, via Serper). No sign-up; limited to 30 searches a minute and 400 a day per network. If it's busy, DuckDuckGo's keyless answers stand in |
| **Firecrawl** | None | Free, no sign-up, with a daily limit per network. Its free tier turns away VPN, proxy and IPv6 connections; there, DuckDuckGo's keyless answers stand in, and an optional free key restores full web results |
| **Google results via Serper** | Free key from [serper.dev](https://serper.dev) (2,500 searches, no card) | Google's answer box, knowledge panel and results. Google's own Custom Search API is closed to new customers |
| **Brave Search** | Brave Search API key | Brave's independent index |

Evidence can also come from **Wikipedia, Wikidata, Europe PMC, World Bank, GOV.UK, Google Fact Check and trusted
URLs**. Enable them independently in extension settings, or use CLI flags such as `--web socratica`,
`--wikidata --europe-pmc`, `--evidence-url <url>` or `--fact-check`. Wikipedia, Wikidata and Europe PMC are on
by default after accepting the privacy notice. A failed source does not stop other sources. Contradictions must
cite an explicitly conflicting passage; missing evidence stays unverifiable. See
[the source and trust guide](docs/evidence-sources.md).

> **Review Mode, not a blocker.** A browser extension cannot guarantee it sees an answer before you do, so the extension checks answers **after** they finish streaming. Guaranteed pre-display blocking ("Shield Mode") needs API middleware. Only its interface is defined ([`shield.ts`](packages/core/src/shield.ts)).

## Privacy

- **Off until you consent.** The extension makes no network calls until you accept its privacy notice.
- **Minimal data out.** The web search engine and other evidence sources get short claim-based search queries, not your conversation. A hosted judge (if you pick one) gets each claim, its sentence, your question, and the retrieved passages.
- **Your keys stay yours.** They're stored locally (`chrome.storage.local` or environment variables), never logged, and never bundled.
- **Least privilege.** The extension's required permissions are `storage`, access to chatgpt.com, `activeTab` and `scripting`. The last two let **Check selected text** read your selection, and only in the tab where you clicked the toolbar button. The web search engine, evidence sources and model servers are requested only for what you choose.
- **An off switch.** Turn Socratica off from the popup and nothing is checked or sent.
- **One small server, no accounts, telemetry or analytics.** The only Socratica server is the search relay behind the default engine. It passes claim-based search queries to Serper and keeps no record of them; your network address is used only to limit searches, in memory. Pick another engine and nothing goes through it.

Full details: [docs/privacy.md](docs/privacy.md).

## Benchmark

Run `pnpm bench` on 37 labeled, fictional claims (12 supported, 12 contradicted, 13 unverifiable). These are the numbers it printed:

| Judge | Accuracy | False-positive rate on contradicted | Contradicted vs unverifiable |
|---|---|---|---|
| **qwen2.5:7b, local via Ollama** (`--llm local`) | **97.3%** | **0.0%** | **96.0%** |
| Offline heuristic judge (default, no model) | 89.2% | 0.0% | 84.0% |
| qwen2.5:3b, local via Ollama | 54.1% | 0.0% | 40.0% |
| Naive yes/no reference baseline | 51.4% | 52.0% | 28.0% |

All of these judges are in-repo or local; **no hosted LLM (OpenAI or Anthropic API) has been benchmarked**. The local models ran CPU-only on 4 cores; the 7B run took about 14 minutes.

> **Note:** this is a tiny synthetic set. The heuristic judge was written by the same author, and some fixes came after seeing its errors, so its number is **in-sample**. The local models were not tuned on it. It shows the three-way design working, **not** real-world accuracy. See [docs/benchmark.md](docs/benchmark.md) to reproduce it or plug in your own verifier.

### Offline judge on encyclopedia-style wording

Real Wikipedia text says "the tower is 330 metres (1,083 ft) tall", while ChatGPT says "the Eiffel Tower is about 330 meters tall". Two hand-written sets test that gap. The claims are about real topics, but the evidence text was **written for testing in Wikipedia's style, not copied from Wikipedia**, and the labels are what the given evidence establishes.

| Set | Offline judge before (v0.1.4) | After | False-positive rate on contradicted |
|---|---|---|---|
| [`wiki-style.jsonl`](benchmark/data/wiki-style.jsonl), 46 items, **used while improving the judge** | 50.0% | 82.6% | 6.3% → **0.0%** |
| [`wiki-style-holdout.jsonl`](benchmark/data/wiki-style-holdout.jsonl), 24 items, **written after the rules were frozen and run once** | 45.8% | **75.0%** | 6.7% → **0.0%** |

On the held-out set, true claims are now marked supported 90% of the time instead of 40%. Every remaining miss is a safe `unverifiable`, mostly swapped places or people ("located in Abu Dhabi") that need world knowledge. Reproduce with `pnpm bench -- --data data/wiki-style-holdout.jsonl`. These are small sets written by the same author, so treat them as a sanity check, not a measure of real-world accuracy.

## What has been tested

| Surface | How it was tested | Result |
|---|---|---|
| Core, SDK, CLI, extension logic | Automated tests (`pnpm test`); no network | Pass |
| GitHub CI | Node 20 and 22 on GitHub Actions, building, testing, benchmarking and packaging | Pass |
| Search relay | Unit tests with a fake Serper: query validation, key only in a header, caching, per-network limits, error mapping. Live on Vercel at `socratica-search.vercel.app`, 2026-10-25 | Pass. Live searches returned Google results; no key and no CORS headers in responses; GET answered 405 and bad queries 400; a repeated search came from the cache |
| A synthetic NASA misinformation paragraph, **live** | CLI with Socratica search and the offline judge, 2026-10-25 | The 2018 Webb launch and 35% oxygen claims were contradicted, quoting Wikipedia. The other four (rotation, gravity and sea levels, the UN calendar, the Moon) were unverifiable: the offline judge doesn't contradict them |
| Web search engines (Firecrawl, Serper, Brave) and the DuckDuckGo backup | Fake-fetch tests of each API's documented request and response shape; live keyless requests | Tests pass. Live, Firecrawl's free tier answered HTTP 403 on a user's network (its VPN/proxy refusal) and HTTP 429 from a cloud machine (daily limit used); DuckDuckGo answered a keyless query from that cloud machine with the Wikipedia summary. No successful live Firecrawl search is recorded yet; Serper and Brave not run live |
| Extension on **live chatgpt.com** | Real Chromium with the extension, logged-out ChatGPT, 2026-10-24 (version 0.1.x, before the rename) | Detects finished answers, extracts claims, highlights and explains them |
| Agent Skill in **Claude Code** | Installed from the release zip into `.claude/skills`, then a fact-check request run headless | Skill auto-loaded, validator ran, semantic contradiction caught |
| CLI with a **local model** | Ollama 0.40.10, `qwen2.5:3b` and `qwen2.5:7b`, from the unzipped release | Works; quality depends on the model (see benchmark) |
| Skill upload to **claude.ai / ChatGPT** | Not tested | Needs a logged-in account (see [docs/skill.md](docs/skill.md)) |
| Logged-in ChatGPT | Chrome with the unpacked extension, 2026-10-24 (version 0.1.x); public Brooklyn Bridge test conversation | Popup detects 1 answer; fresh checks after regeneration and prompt editing, following completion (see [verification notes](docs/chatgpt-logged-in.md)) |
| Hosted OpenAI/Anthropic judges | Not tested | Needs your API key |

## Known limitations

- **Review Mode only.** You see the answer before it's checked.
- **ChatGPT's page can change.** The adapter was verified on live chatgpt.com in logged-out and logged-in UIs on 2026-10-24, with sanitized fixtures for both. This covers the tested layouts; other accounts or rollouts may differ. Older selectors are kept as a fallback. Fixes go in [`adapters/chatgpt.ts`](packages/browser-extension/src/adapters/chatgpt.ts).
- **Free web search has limits.** Socratica search allows 30 searches a minute and 400 a day per network, and stops when its prepaid search credits run out; keyless Firecrawl turns away VPN, proxy and IPv6 connections. In those cases checks continue with the DuckDuckGo backup, Wikipedia and Wikidata, which give encyclopedia-style answers rather than full web results.
- **Search snippets are short.** A snippet decides a verdict only when it states the fact itself, so many claims checked only against snippets stay `unverifiable`.
- **Wikimedia rate limits.** Wikipedia and Wikidata can be throttled by IP (HTTP 429). Requests are cached and backed off; independent sources continue when a source fails. Claims without sufficient evidence remain `unverifiable`.
- **The offline heuristic judge is lexical.** It understands units, spelling variants ("metres"), rounding, "the tower"-style back-references and simple number, name and negation conflicts, but not paraphrase that needs world knowledge (see the benchmark above). It abstains on publisher reviews, publication metadata and qualified statistics. For real-world answers, use an LLM judge: OpenAI or Anthropic in the extension, or a local model with the CLI.
- **Local models need one setting.** Ollama refuses browser extensions unless started with `OLLAMA_ORIGINS="chrome-extension://*"`; LM Studio needs **Enable CORS**. The extension tells you this if it hits the error. Only servers on `localhost` / `127.0.0.1` are allowed. The first request can take minutes while the model loads.
- **Small local models are unreliable judges.** In testing, `qwen2.5:3b` fabricated a quote, which the validator caught and downgraded, and it missed most contradictions. 7B-class models did far better.
- **Claim extraction is rule-based.** It can miss claims, such as pronoun clauses without a named entity.
- **Only ChatGPT is supported.** Claude and Gemini adapters are stubs.

## Project structure

```
├── packages/
│   ├── core/                 # the engine: extract → retrieve → verify → score (no DOM, no chrome.*)
│   ├── browser-extension/    # Chrome MV3 extension, ChatGPT adapter, overlay, options, demo
│   ├── cli/                  # socratica command-line tool
│   └── sdk/                  # verify({ question, answer, evidence })
├── relay/                    # search relay: a Vercel Function, Google results via Serper, no user key
├── skill/socratica/          # Agent Skill (SKILL.md + references + validators)
├── benchmark/                # labeled JSONL + runner
├── examples/                 # sample answer, evidence and verdicts
├── docs/                     # architecture, privacy, benchmark, skill and local-AI guides
└── scripts/                  # release packaging
```

## Development

```bash
corepack enable          # pnpm 10
pnpm install
pnpm build               # all packages + extension (packages/browser-extension/dist) + CLI
pnpm test                # no network or API key needed
pnpm bench               # offline benchmark
pnpm package             # release zips → release/
```

Requires Node.js 20+. To publish a release, push a tag like `v0.1.0`, or push a commit whose message contains `[release]` (the workflow then creates the `v<version>` tag itself). The [release workflow](.github/workflows/release.yml) builds, tests and attaches the zips.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md); it has a few strict rules about verdict trustworthiness. To report a security issue, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). The bundled Garogier display typeface is licensed under the GPL, version 2 or later; see
[its notice](packages/browser-extension/static/fonts/README.md).

Socratica was called Hallucination Firewall before version 0.2.0.
