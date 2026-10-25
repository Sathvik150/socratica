# Running locally with your own model

Download `hf-verify-cli-vX.zip`, unzip it, and run it with Node.js 20+. It needs no install and no account.

```bash
unzip hf-verify-cli-v0.1.6.zip && cd hf-verify
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

If your server needs a key, set `HF_LOCAL_API_KEY`.

### Tested

On 2026-10-24, these ran with Ollama 0.40.10, CPU-only on 4 cores, from the unzipped release:

| Model | Example (`examples/`) | Benchmark (37 items) |
|---|---|---|
| `qwen2.5:7b` | n/a | 97.3% accuracy, 0.0% false-contradiction rate, ~14 min |
| `qwen2.5:3b` | 33 s; 1 supported, 2 unverifiable | 54.1% accuracy, 0.0% false-contradiction rate, 4m 13s |

**Pick a 7B-class model or larger.** In testing, the 3B model fabricated a quote: it "quoted" text that isn't in the
source. The validator caught it and downgraded the verdict to `unverifiable`, which shows why the validator exists.
Small models lose recall but don't produce false contradictions.

## Use it from your own agent

- **As a tool:** call `hf-verify verify --format json` and read `summary` / `verdicts`. Add
  `--fail-on-contradiction` to get exit code `2` when something is contradicted.
- **As a skill:** give your agent the `skill/hallucination-firewall` folder. Your model writes the verdicts,
  and `hf-verify validate` (or `validate_verdicts.py`) enforces the verbatim-quote rule.
- **As a library:** use `@hallucination-firewall/sdk` from Node/TypeScript and pass
  `new OpenAIProvider({ baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', fetch })`.
