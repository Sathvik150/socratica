# hf-verify

Command-line fact checking with evidence-linked verdicts: **supported**, **contradicted**, or **unverifiable**.
It's one file with no install step. It needs Node.js 20+.

```bash
node hf-verify.mjs --help
```

## Check an answer against your documents (offline)

```bash
node hf-verify.mjs verify --answer examples/answer.txt --evidence examples/evidence/
```

```
Summary: 3 checked, 2 supported, 1 contradicted, 0 unverifiable

✔ [SUPPORTED] The Orrin Library is a public library in Velmora.
    reason: A passage states this directly.
    evidence: "The Orrin Library is a public library in the city of Velmora."
      source: orrin-library.md

✘ [CONTRADICTED] It was founded by Dalia Moss in 1910.
    reason: The passage gives 1902 where the claim says 1910.
    evidence: "The Orrin Library is a public library in the city of Velmora. It was founded by Dalia Moss in 1902."
      source: orrin-library.md
    correction: It was founded by Dalia Moss in 1902.
...
```

`--evidence` takes `.txt`/`.md` files, a folder, or JSON `[{"title": "...", "text": "...", "url": "..."}]`. It can be repeated.

## Use a local model (Ollama, LM Studio, llama.cpp, vLLM)

Any server with an OpenAI-compatible `/v1/chat/completions` endpoint works:

```bash
# Ollama (default endpoint http://localhost:11434/v1)
node hf-verify.mjs verify --answer answer.txt --evidence sources/ --llm local --model llama3.1

# LM Studio
node hf-verify.mjs verify --answer answer.txt --evidence sources/ --llm local --model qwen2.5-7b-instruct --base-url http://localhost:1234/v1
```

Nothing leaves your machine unless you add `--wikipedia` or choose a hosted judge.

## Hosted judges (your own key, from the environment)

```bash
HF_OPENAI_API_KEY=... node hf-verify.mjs verify --answer a.txt --evidence docs/ --llm openai
HF_ANTHROPIC_API_KEY=... node hf-verify.mjs verify --answer a.txt --evidence docs/ --llm anthropic
```

## Other commands

| Command | What it does |
|---|---|
| `extract --answer <file>` | Prints the checkable factual claims as JSON. |
| `validate --input <file>` | Post-validates verdicts written by another model. Any quote that isn't a verbatim substring of its passage downgrades the verdict to `unverifiable`. |
| `verify ... --format json` | Full machine-readable result (claims, verdicts, passages, summary). |
| `verify ... --fail-on-contradiction` | Exits with code `2` if anything is contradicted (useful in CI or agent loops). |

Exit codes: `0` ok, `1` error, `2` contradiction found (with `--fail-on-contradiction`), `64` usage error.
