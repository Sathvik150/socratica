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

Nothing leaves your machine unless you explicitly enable a network evidence source or choose a hosted judge.

## Additional evidence sources

Use `--wikidata` for structured facts, `--europe-pmc` for biomedical abstracts, or `--crossref` for
publication metadata. Use `--world-bank` for country statistics or `--gov-uk` for official UK guidance.
These are key-free network sources. Add `--evidence-url https://trusted.org/page`
for an authoritative public HTTPS page; repeat the flag for up to ten pages.

`--fact-check` uses `HF_GOOGLE_FACT_CHECK_API_KEY`; `--tavily` uses `HF_TAVILY_API_KEY`.
Keys come only from the environment. Restrict Tavily to trusted sites with repeatable
`--search-domain who.int` flags. The offline judge abstains on publisher reviews and publication
metadata: use a local or hosted model to interpret those records.

All network evidence sources are opt-in and can be combined with local documents. A failed source
produces a warning while the other sources continue. See [source behavior, privacy and trust](../../docs/evidence-sources.md).

The standalone CLI honors `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` (lowercase variants also work),
including on Node 20. Proxy credentials remain in your environment; invalid proxy configuration
errors do not expose them. TLS certificate verification stays enabled.

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
