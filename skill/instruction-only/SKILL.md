---
name: socratica
description: Fact-check answers, drafts, and documents against supplied or retrieved evidence, reporting supported, contradicted, or unverifiable claims with verbatim source quotes. Use when asked to verify claims or detect hallucinations. This instruction-only variant does not machine-validate quotes.
license: MIT
---

# Socratica

Check factual claims only against passages actually supplied or retrieved. Background
knowledge cannot establish a verdict. Missing evidence means `unverifiable`.

1. Extract atomic factual claims using `references/claim-extraction.md`. Skip opinions,
   instructions, questions, hedged statements, and code.
2. Collect relevant passages from user documents or available search tools. Preserve
   their exact text, source URLs or document names, and stable passage identifiers.
   Without evidence, mark every claim `unverifiable`.
3. Apply `references/verdict-rules.md`. A `contradicted` verdict requires an explicit
   conflict, never mere absence of support. Every `supported` or `contradicted` verdict
   needs a character-for-character quote of at least 12 characters from a passage.
4. Manually check each quote against its passage. Downgrade to `unverifiable` if you
   cannot confirm the exact quote. Give a correction only when the quoted evidence
   directly states it. Use `references/validation-format.md` when JSON is requested;
   its validator commands describe the full bundle and are unavailable here.
5. Report counts, then contradicted claims with quotes, sources, and supported
   corrections, followed by unverifiable and supported claims. State clearly:
   **Quotes were checked manually and were not machine-validated.**

This bundle contains no scripts or automatic validator. Do not claim to have run one.
Never send private user text to an external service without their authorization.
