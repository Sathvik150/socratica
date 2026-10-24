---
name: hallucination-firewall
description: Fact-check an AI answer, draft, or document against evidence. Splits the text into atomic factual claims and gives each one a verdict of supported, contradicted, or unverifiable, backed by verbatim quotes from the sources, with a correction when the evidence states the right fact. Use when the user asks to fact-check, verify claims, detect hallucinations, or check text against sources or documents.
license: MIT
---

# Hallucination Firewall

Evidence-linked fact checking with a strict three-way verdict. The point is **trust**: every
verdict must be traceable to text that was actually retrieved, and missing evidence is never
reported as a falsehood.

## The three rules that matter

1. **Judge only against retrieved passages.** Do not use your own background knowledge to decide
   a verdict, even when you are confident. If the passages don't settle it, the claim is
   `unverifiable`.
2. **`contradicted` needs explicit conflict.** A passage must state something that cannot be true
   at the same time as the claim. Silence, a different topic, or partial overlap is
   `unverifiable`, never `contradicted`.
3. **Quotes are verbatim.** Every `supported`/`contradicted` verdict cites at least one quote
   copied character-for-character from a passage (12+ characters). Run the validator; any
   verdict whose quote is not an exact substring is downgraded to `unverifiable`. Never override
   a downgrade.

## Workflow

Work in a scratch folder. `scripts/` holds `hf-verify.mjs` (Node 20+, no install needed) and
`validate_verdicts.py` (Python 3, stdlib only). Use whichever runtime is available.

1. **Get the text** to check and save it as `answer.txt`. Ask what question produced it if that
   matters for context.
2. **Extract claims.** Run `node scripts/hf-verify.mjs extract --answer answer.txt`, or extract
   them by hand following `references/claim-extraction.md`. Skip opinions, instructions,
   questions, hedged statements and code.
3. **Collect evidence passages.** In order of preference:
   - documents the user supplied
   - your web search / fetch tools, if available (keep the exact passage text and URL)
   - nothing: say so, and every claim will be `unverifiable`
   Give each passage an id (`p1`, `p2`, …) and keep its text **exactly** as retrieved.
4. **Judge each claim** with `references/verdict-rules.md`. Write `verdicts.json` in the format
   in `references/validation-format.md`.
5. **Validate.** Run `node scripts/hf-verify.mjs validate --input verdicts.json` or
   `python3 scripts/validate_verdicts.py verdicts.json`. Its output is the final result.
6. **Report** to the user:
   - the summary line, e.g. `5 checked, 3 supported, 1 contradicted, 1 unverifiable`
   - contradicted claims first, each with the quote, source link, and correction (only if the
     validator kept it)
   - then unverifiable claims (say what evidence was missing), then supported ones briefly
   - any downgrades, stated plainly ("verdict discarded: quote not found in source")

### Fully offline shortcut

When the user gives documents and no model judgement is wanted, the bundled deterministic
judge does the whole pipeline (simple sentences only; it returns `unverifiable` when unsure):

```bash
node scripts/hf-verify.mjs verify --answer answer.txt --evidence sources/ --format text
```

`--evidence` accepts `.txt`/`.md` files, a folder of them, or JSON `[{"title","text","url"}]`.

### No code execution available

Apply the same rules by hand, and tell the user the quotes were **not** machine-validated.

## Never

- Never mark a claim `contradicted` because you could not find support for it.
- Never paraphrase, trim, or "clean up" a quote. Copy it exactly or don't cite it.
- Never present a correction that the quotes don't directly state.
- Never send the user's private text to an external service they didn't ask you to use.
