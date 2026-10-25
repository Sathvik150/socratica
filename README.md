<div align="center">

<img src="packages/browser-extension/static/icons/icon-128.png" alt="" width="88" height="88">

<h1>Hallucination Firewall</h1>

**Evidence-linked fact checking for AI answers, right inside ChatGPT.**
Every claim gets a verdict of ✔ supported, ✘ contradicted, or ? unverifiable, and every verdict cites the exact source text behind it.

[![CI](https://github.com/sathvik150/cac26/actions/workflows/ci.yml/badge.svg)](https://github.com/sathvik150/cac26/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node 20+](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)
![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)
![Agent Skill](https://img.shields.io/badge/Agent%20Skill-SKILL.md-orange)

[Download](#-download) · [Quick start](#-quick-start) · [How it works](#-how-it-works) · [Privacy](#-privacy) · [Benchmark](#-benchmark) · [Limitations](#%EF%B8%8F-known-limitations)

<img src="docs/images/demo.png" alt="A contradicted claim highlighted in a ChatGPT-style answer, with the evidence panel showing the source quote and a suggested correction" width="760">

</div>

---

## ✨ Why it's different

Plenty of tools say "this might be a hallucination." Hallucination Firewall is built so you can **trust the flag**:

- **🔗 Evidence-linked verdicts.** A claim is marked supported or contradicted only with a quote from a passage that was actually retrieved. Code checks that the quote is a **verbatim substring** of the passage. If it isn't, the verdict is thrown out and becomes `unverifiable`.
- **⚖️ Three-way verdicts.** "Demonstrably false" (`contradicted`) is kept separate from "couldn't find evidence" (`unverifiable`). Missing evidence is **never** reported as false.
- **🎯 Low false positives by design.** Opinions, advice, questions, hedged statements and code are not checked. Weak or malformed judgments fall back to `unverifiable`, and a correction is shown only when the source states it directly.
- **🧩 Model-independent.** Use the offline judge, your own OpenAI or Anthropic key, or a **local model** (Ollama, LM Studio, llama.cpp, vLLM).

## 📦 Download

Grab the zips from the **[latest release](https://github.com/sathvik150/cac26/releases/latest)**, or build them yourself with `pnpm build && pnpm package`.

| Zip | For | What's inside |
|---|---|---|
| hallucination-firewall-extension-v0.1.4.zip | **Chrome**: annotate ChatGPT answers in place | Ready-to-load MV3 extension plus an offline demo page |
| hallucination-firewall-plugin-v0.1.4.zip | **ChatGPT → Plugins → New Plugin** | Plugin manifest plus full skill and validators |
| hallucination-firewall-plugin-instructions-v0.1.4.zip | **ChatGPT plugin troubleshooting** | Plugin manifest plus instruction-only skill; manual quote checks |
| hallucination-firewall-skill-instructions-v0.1.4.zip | **Skills upload troubleshooting** | Instruction-only variant; manual quote checks, no scripts ([details](docs/skill.md#troubleshooting-a-chatgpt-upload-failure)) |
| hallucination-firewall-skill-v0.1.4.zip | **Claude, Claude Code** and other Agent Skills hosts | `SKILL.md`, rules, and Node and Python validators |
| hf-verify-cli-v0.1.4.zip | **Local use** with your own model, scripts and agents | Single-file CLI (Node 20+, no install) plus examples |

## 🚀 Quick start

<details open>
<summary><b>Chrome extension (ChatGPT)</b></summary>

1. Unzip `hallucination-firewall-extension-v0.1.4.zip`.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the unzipped folder.
3. Read and accept the privacy notice on the settings page that opens. **Nothing is checked or sent before you accept.**
4. **Choose a judge** in the same settings page. The default offline judge only recognises very literal matches, so on real answers it mostly says "unverifiable". For real checks, pick one of:
  - **Local model (free, private):** install [Ollama](https://ollama.com), run `ollama pull qwen2.5:7b`, then start it with `OLLAMA_ORIGINS="chrome-extension://*" ollama serve`. In settings, choose **Local model**, press **Save**, then **Test connection**.
   - **OpenAI or Anthropic:** paste your own API key.
5. Use [chatgpt.com](https://chatgpt.com) normally. When an answer finishes, a summary bar appears under it. Click a highlighted claim to see the reason, the source quotes and a correction.
6. Click the toolbar icon at any time for the **popup**. It shows whether checking is on, which judge is in use, how many answers were detected, and the last result. It has a **Check latest answer** button, plus **Check selected text**, which works on any website.

<img src="docs/images/popup.png" alt="The toolbar popup: setup, detected answers, last result, and a selected-text check" width="300">

Want to see it without ChatGPT? Open `demo.html` from the unzipped folder. It runs fully offline.

</details>

<details>
<summary><b>Agent Skill (Claude / ChatGPT / Claude Code)</b></summary>

- **Claude:** with code execution enabled, open the Skills section in Settings, click **Upload skill**, and choose `hallucination-firewall-skill-v0.1.4.zip`.
- **Claude Code:** `unzip hallucination-firewall-skill-v0.1.4.zip -d ~/.claude/skills/`
- **ChatGPT plugin:** download `hallucination-firewall-plugin-v0.1.4.zip`, keep it zipped, then open **Plugins → New Plugin**, upload it, and select **Add plugin**. Use `hallucination-firewall-plugin-instructions-v0.1.4.zip` for the variant without bundled scripts.
- **Standalone Skills upload:** use `hallucination-firewall-skill-v0.1.4.zip` in a Skills uploader, or `hallucination-firewall-skill-instructions-v0.1.4.zip` for manual quote checks. A standalone skill ZIP does not contain the manifest required by the plugin uploader.

Install one full or instruction-only variant at a time; they share the same plugin/skill name. Instruction-only variants do not machine-validate quotes.

Then ask: *"Fact-check this answer against these sources."* Full guide: [docs/skill.md](docs/skill.md).

</details>

<details>
<summary><b>CLI and local models</b></summary>

```bash
unzip hf-verify-cli-v0.1.4.zip && cd hf-verify

# Offline: your documents + the built-in deterministic judge
node hf-verify.mjs verify --answer examples/answer.txt --evidence examples/evidence/

# With a local model through Ollama (any OpenAI-compatible server works)
node hf-verify.mjs verify --answer answer.txt --evidence docs/ --llm local --model llama3.1
```

```
Summary: 3 checked, 2 supported, 1 contradicted, 0 unverifiable

✘ [CONTRADICTED] It was founded by Dalia Moss in 1910.
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
import { verify } from '@hallucination-firewall/sdk';

const result = await verify({
  question: 'When did the Zentha Bridge open?',
  answer: 'The Zentha Bridge opened in 1987.',
  evidence: [{ title: 'Zentha Bridge', url: 'https://example.org/zentha', text: 'The Zentha Bridge opened in 1991.' }],
});

result.summary.text;          // "1 checked, 0 supported, 1 contradicted, 0 unverifiable"
result.verdicts[0].correction; // "The Zentha Bridge opened in 1991."
```

Pass `llm` (e.g. `new OpenAIProvider({ apiKey, fetch })`, or `{ baseUrl: 'http://localhost:11434/v1', model, fetch }` for a local model) and `providers` (e.g. `new WikipediaEvidenceProvider({ fetch })`) to go beyond the offline defaults.

</details>

## 🔍 How it works

```
 answer ──▶ extractClaims ──▶ retrieveEvidence ──▶ verifyClaims ──────────────▶ scoreResults ──▶ report
            atomic facts;     your documents,      judge sees ONLY the          summary +
            skips opinions,   Wikipedia, web       passages; JSON is schema-    grounded
            advice, hedges    search (your key)    checked; quotes must be      corrections
                                                   verbatim or → unverifiable
```

| Verdict | Meaning |
|---|---|
| ✔ **supported** | A retrieved passage explicitly states the claim, and the quote proves it. |
| ✘ **contradicted** | A retrieved passage explicitly conflicts with the claim, and the quote proves it. |
| ? **unverifiable** | Anything else: no evidence, ambiguous evidence, or a verdict that failed validation. |

The core engine has no DOM or browser code and doesn't know which chatbot wrote the text. The extension, CLI, skill and SDK are thin layers on top of it. Details: [docs/architecture.md](docs/architecture.md).

Evidence can come from **Wikipedia, Wikidata, Europe PMC, World Bank, GOV.UK, Google Fact Check, trusted URLs,
Tavily or Brave Search**. Enable sources independently in extension settings, or use CLI flags such as
`--wikidata --europe-pmc`, `--evidence-url <url>`, `--fact-check`, or `--tavily --search-domain who.int`.
Wikipedia, Wikidata and Europe PMC are enabled by default after accepting the updated privacy notice.
A failed source does not stop other sources. Contradictions must cite an explicitly conflicting passage;
missing evidence stays unverifiable. See [the source and trust guide](docs/evidence-sources.md).

> **Review Mode, not a blocker.** A browser extension cannot guarantee it sees an answer before you do, so the extension checks answers **after** they finish streaming. Guaranteed pre-display blocking ("Shield Mode") needs API middleware. Only its interface is defined ([`shield.ts`](packages/core/src/shield.ts)).

## 🔒 Privacy

- **Off until you consent.** The extension makes no network calls until you accept its privacy notice.
- **Minimal data out.** Evidence sources get short claim-based search queries, not your conversation. A hosted judge (if you pick one) gets each claim, its sentence, your question, and the retrieved passages.
- **Your keys stay yours.** They're stored locally (`chrome.storage.local` or environment variables), never logged, and never bundled.
- **Least privilege.** The extension's required permissions are `storage`, access to chatgpt.com, `activeTab` and `scripting`. The last two let **Check selected text** read your selection, and only in the tab where you clicked the toolbar button. Evidence sources and model servers are requested only when you enable them.
- **No server, accounts, telemetry or analytics.**

Full details: [docs/privacy.md](docs/privacy.md).

## 📊 Benchmark

Run `pnpm bench` on 37 labeled, fictional claims (12 supported, 12 contradicted, 13 unverifiable). These are the numbers it printed:

| Judge | Accuracy | False-positive rate on contradicted | Contradicted vs unverifiable |
|---|---|---|---|
| **qwen2.5:7b, local via Ollama** (`--llm local`) | **97.3%** | **0.0%** | **96.0%** |
| Offline heuristic judge (default, no model) | 89.2% | 0.0% | 84.0% |
| qwen2.5:3b, local via Ollama | 54.1% | 0.0% | 40.0% |
| Naive yes/no reference baseline | 51.4% | 52.0% | 28.0% |

All of these judges are in-repo or local; **no hosted LLM (OpenAI or Anthropic API) has been benchmarked**. The local models ran CPU-only on 4 cores; the 7B run took about 14 minutes.

> ⚠️ This is a tiny synthetic set. The heuristic judge was written by the same author, and some fixes came after seeing its errors, so its number is **in-sample**. The local models were not tuned on it. It shows the three-way design working, **not** real-world accuracy. See [docs/benchmark.md](docs/benchmark.md) to reproduce it or plug in your own verifier.

### Offline judge on encyclopedia-style wording

Real Wikipedia text says "the tower is 330 metres (1,083 ft) tall", while ChatGPT says "the Eiffel Tower is about 330 meters tall". Two hand-written sets test that gap. The claims are about real topics, but the evidence text was **written for testing in Wikipedia's style, not copied from Wikipedia**, and the labels are what the given evidence establishes.

| Set | Offline judge before (v0.1.4) | After | False-positive rate on contradicted |
|---|---|---|---|
| [`wiki-style.jsonl`](benchmark/data/wiki-style.jsonl), 46 items, **used while improving the judge** | 50.0% | 82.6% | 6.3% → **0.0%** |
| [`wiki-style-holdout.jsonl`](benchmark/data/wiki-style-holdout.jsonl), 24 items, **written after the rules were frozen and run once** | 45.8% | **75.0%** | 6.7% → **0.0%** |

On the held-out set, true claims are now marked supported 90% of the time instead of 40%. Every remaining miss is a safe `unverifiable`, mostly swapped places or people ("located in Abu Dhabi") that need world knowledge. Reproduce with `pnpm bench -- --data data/wiki-style-holdout.jsonl`. These are small sets written by the same author, so treat them as a sanity check, not a measure of real-world accuracy.

## ✅ What has been tested

| Surface | How it was tested | Result |
|---|---|---|
| Core, SDK, CLI, extension logic | Automated tests (`pnpm test`); no network | ✅ pass |
| GitHub CI | Node 20 and 22 on GitHub Actions, building, testing, benchmarking and packaging | ✅ pass |
| Extension on **live chatgpt.com** | Real Chromium with the extension, logged-out ChatGPT, 2026-10-24 | ✅ detects finished answers, extracts claims, highlights and explains them (details below) |
| Agent Skill in **Claude Code** | Installed from the release zip into `.claude/skills`, then a fact-check request run headless | ✅ skill auto-loaded, validator ran, semantic contradiction caught |
| CLI with a **local model** | Ollama 0.40.10, `qwen2.5:3b` and `qwen2.5:7b`, from the unzipped release | ✅ works; quality depends on the model (see benchmark) |
| Skill upload to **claude.ai / ChatGPT** | Not tested | ⏳ needs a logged-in account (see [docs/skill.md](docs/skill.md)) |
| Logged-in ChatGPT | Chrome with the unpacked extension, 2026-10-24; public Brooklyn Bridge test conversation | ✅ popup detects 1 answer; fresh checks after regeneration and prompt editing, following completion (see [verification notes](docs/chatgpt-logged-in.md)) |
| Hosted OpenAI/Anthropic judges | Not tested | ⏳ needs your API key |

<img src="docs/images/live-chatgpt.png" alt="The extension running on live chatgpt.com: dashed underlines on claims, the evidence panel, and the summary bar under the answer" width="760">

## ⚠️ Known limitations

- **Review Mode only.** You see the answer before it's checked.
- **ChatGPT's page can change.** The adapter was verified on live chatgpt.com in logged-out and logged-in UIs on 2026-10-24, with sanitized fixtures for both. This covers the tested layouts; other accounts or rollouts may differ. Older selectors are kept as a fallback. Fixes go in [`adapters/chatgpt.ts`](packages/browser-extension/src/adapters/chatgpt.ts).
- **Wikimedia rate limits.** Wikipedia and Wikidata can be throttled by IP (HTTP 429). Requests are cached and backed off; independent sources continue when a source fails. Claims without sufficient evidence remain `unverifiable`.
- **The offline heuristic judge is lexical.** It understands units, spelling variants ("metres"), rounding, "the tower"-style back-references and simple number, name and negation conflicts, but not paraphrase that needs world knowledge (see the benchmark above). It abstains on publisher reviews, publication metadata and qualified statistics. For real-world answers, use an LLM judge: OpenAI or Anthropic in the extension, or a local model with the CLI.
- **Local models need one setting.** Ollama refuses browser extensions unless started with `OLLAMA_ORIGINS="chrome-extension://*"`; LM Studio needs **Enable CORS**. The extension tells you this if it hits the error. Only servers on `localhost` / `127.0.0.1` are allowed. The first request can take minutes while the model loads.
- **Small local models are unreliable judges.** In testing, `qwen2.5:3b` fabricated a quote, which the validator caught and downgraded, and it missed most contradictions. 7B-class models did far better.
- **Claim extraction is rule-based.** It can miss claims, such as pronoun clauses without a named entity.
- **Only ChatGPT is supported.** Claude and Gemini adapters are stubs.

## 🗂️ Project structure

```
├── packages/
│   ├── core/                 # the engine: extract → retrieve → verify → score (no DOM, no chrome.*)
│   ├── browser-extension/    # Chrome MV3 extension, ChatGPT adapter, overlay, options, demo
│   ├── cli/                  # hf-verify command-line tool
│   └── sdk/                  # verify({ question, answer, evidence })
├── skill/hallucination-firewall/   # Agent Skill (SKILL.md + references + validators)
├── benchmark/                # labeled JSONL + runner
├── examples/                 # sample answer, evidence and verdicts
├── docs/                     # architecture, privacy, benchmark, skill and local-AI guides
└── scripts/                  # release packaging
```

## 🛠️ Development

```bash
corepack enable          # pnpm 10
pnpm install
pnpm build               # all packages + extension (packages/browser-extension/dist) + CLI
pnpm test                # no network or API key needed
pnpm bench               # offline benchmark
pnpm package             # release zips → release/
```

Requires Node.js 20+. To publish a release, push a tag like `v0.1.0`, or push a commit whose message contains `[release]` (the workflow then creates the `v<version>` tag itself). The [release workflow](.github/workflows/release.yml) builds, tests and attaches the zips.

## 🤝 Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md); it has a few strict rules about verdict trustworthiness. To report a security issue, see [SECURITY.md](SECURITY.md).

## 📄 License

[MIT](LICENSE)
