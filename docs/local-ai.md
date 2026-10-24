# Running locally with your own model

Download `hf-verify-cli-vX.zip`, unzip it, and run it with Node.js 20+. It needs no install and no account.

```bash
unzip hf-verify-cli-v0.1.0.zip && cd hf-verify
node hf-verify.mjs verify --answer examples/answer.txt --evidence examples/evidence/
```

## Use a local LLM as the judge

Any server with an OpenAI-compatible `/v1/chat/completions` endpoint works:

| Server | Command |
|---|---|
| [Ollama](https://ollama.com) | `node hf-verify.mjs verify --answer a.txt --evidence docs/ --llm local --model llama3.1` |
| [LM Studio](https://lmstudio.ai) | `... --llm local --model <loaded-model> --base-url http://localhost:1234/v1` |
| llama.cpp server | `... --llm local --model local --base-url http://localhost:8080/v1` |
| vLLM | `... --llm local --model <model> --base-url http://localhost:8000/v1` |

If your server needs a key, set `HF_LOCAL_API_KEY`. Small models may return invalid JSON or paraphrase quotes.
When that happens, the validator turns those verdicts into `unverifiable` instead of trusting them, so you
lose recall, not correctness.

## Use it from your own agent

- **As a tool:** call `hf-verify verify --format json` and read `summary` / `verdicts`. Add
  `--fail-on-contradiction` to get exit code `2` when something is contradicted.
- **As a skill:** give your agent the `skill/hallucination-firewall` folder. Your model writes the verdicts,
  and `hf-verify validate` (or `validate_verdicts.py`) enforces the verbatim-quote rule.
- **As a library:** use `@hallucination-firewall/sdk` from Node/TypeScript and pass
  `new OpenAIProvider({ baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', fetch })`.
