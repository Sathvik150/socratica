<div align="center">

# 🛡️ Hallucination Firewall

**Evidence-linked fact checking for AI answers.**
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
| `hallucination-firewall-extension-v0.1.0.zip` | **Chrome**: annotate ChatGPT answers in place | Ready-to-load MV3 extension plus an offline demo page |
| `hallucination-firewall-skill-v0.1.0.zip` | **Claude, ChatGPT, Claude Code** and other Agent Skills hosts | `SKILL.md`, rules, and Node and Python validators |
| `hf-verify-cli-v0.1.0.zip` | **Local use** with your own model, scripts and agents | Single-file CLI (Node 20+, no install) plus examples |

## 🚀 Quick start

<details open>
<summary><b>Chrome extension (ChatGPT)</b></summary>

1. Unzip `hallucination-firewall-extension-v0.1.0.zip`.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the unzipped folder.
3. Read and accept the privacy notice on the settings page that opens. **Nothing is checked or sent before you accept.**
4. Use [chatgpt.com](https://chatgpt.com) normally. When an answer finishes, a summary bar appears under it. Click a highlighted claim to see the reason, the source quotes and a correction.

Want to see it without ChatGPT? Open `demo.html` from the unzipped folder. It runs fully offline.

</details>

<details>
<summary><b>Agent Skill (Claude / ChatGPT / Claude Code)</b></summary>

- **Claude:** with code execution enabled, open the Skills section in Settings, click **Upload skill**, and choose `hallucination-firewall-skill-v0.1.0.zip`.
- **Claude Code:** `unzip hallucination-firewall-skill-v0.1.0.zip -d ~/.claude/skills/`
- **ChatGPT:** install the same zip where your plan supports [Skills](https://help.openai.com/en/articles/20001066-skills-in-chatgpt), or turn it into a Custom GPT.

Then ask: *"Fact-check this answer against these sources."* Full guide: [docs/skill.md](docs/skill.md).

</details>

<details>
<summary><b>CLI and local models</b></summary>

```bash
unzip hf-verify-cli-v0.1.0.zip && cd hf-verify

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

> **Review Mode, not a blocker.** A browser extension cannot guarantee it sees an answer before you do, so the extension checks answers **after** they finish streaming. Guaranteed pre-display blocking ("Shield Mode") needs API middleware. Only its interface is defined ([`shield.ts`](packages/core/src/shield.ts)).

## 🔒 Privacy

- **Off until you consent.** The extension makes no network calls until you accept its privacy notice.
- **Minimal data out.** Evidence sources get short claim-based search queries, not your conversation. A hosted judge (if you pick one) gets each claim, its sentence, your question, and the retrieved passages.
- **Your keys stay yours.** They're stored locally (`chrome.storage.local` or environment variables), never logged, and never bundled.
- **Least privilege.** The extension's only required permission is `storage`, plus access to chatgpt.com. Other sites are requested only when you enable them.
- **No server, accounts, telemetry or analytics.**

Full details: [docs/privacy.md](docs/privacy.md).

## 📊 Benchmark

Run `pnpm bench` on 37 labeled, fictional claims (12 supported, 12 contradicted, 13 unverifiable). These are the numbers it printed:

| Verifier | Accuracy | False-positive rate on contradicted | Contradicted vs unverifiable |
|---|---|---|---|
| Hallucination Firewall (offline heuristic judge) | 89.2% | 0.0% | 84.0% |
| Naive yes/no reference baseline | 51.4% | 52.0% | 28.0% |

> ⚠️ This is a tiny, synthetic, **in-sample** set written by the same author as the heuristic judge. Some fixes were made after seeing its errors. It shows the three-way design working, **not** real-world accuracy. No real-LLM or third-party comparisons have been run. See [docs/benchmark.md](docs/benchmark.md) to reproduce it or plug in your own verifier.

## ⚠️ Known limitations

- **Review Mode only.** You see the answer before it's checked.
- **ChatGPT page selectors are assumptions.** They were tested only on hand-written HTML fixtures, **not on live chatgpt.com**, and may break when the site changes. Fixes go in [`adapters/chatgpt.ts`](packages/browser-extension/src/adapters/chatgpt.ts).
- **Claim extraction is rule-based.** It can miss claims or skip facts phrased as opinions.
- **The offline judge is a lexical heuristic.** It handles simple number, name and negation conflicts. Paraphrases and multi-step reasoning come out as `unverifiable`. Use an LLM judge for those.
- **Retrieval is keyword-based.** English Wikipedia only for now.
- **Live providers are untested here.** The Wikipedia, OpenAI, Anthropic and Brave integrations have been tested only with mocked network calls. Installing the skill in each host is not tested either.
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

Requires Node.js 20+. To publish a release, push a tag like `v0.1.0`. The [release workflow](.github/workflows/release.yml) builds, tests and attaches the zips.

## 🤝 Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md); it has a few strict rules about verdict trustworthiness. To report a security issue, see [SECURITY.md](SECURITY.md).

## 📄 License

[MIT](LICENSE)
