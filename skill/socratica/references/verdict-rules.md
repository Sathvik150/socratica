# Verdict rules

Judge one claim at a time against **only** its passages.

| Verdict | When | Needs |
|---|---|---|
| `supported` | At least one passage explicitly states the claim (paraphrase is fine if the meaning is identical). | ≥1 verbatim quote |
| `contradicted` | At least one passage explicitly states something that cannot be true at the same time as the claim (different year, number, name, or the negation). | ≥1 verbatim quote |
| `unverifiable` | Anything else: no relevant passage, partial or ambiguous evidence, or a passage about a different attribute of the same entity. **When unsure, choose this.** | nothing |

Checks before choosing `contradicted`:

- Is the passage about the **same thing**? "Built in 1964" does not contradict "has 40 elevators".
- Is it about the **same predicate**? A different population figure for a *different year* is not a contradiction.
- Would a careful editor call the claim *false* based on this passage alone? If not, it's `unverifiable`.

Fields per verdict:

- `confidence`: 0–1. Below 0.5 is downgraded to `unverifiable` by the validator.
- `rationale`: one or two sentences naming the deciding passage. No step-by-step reasoning.
- `correction`: only for `contradicted`, and only if a quote directly states the correct fact. It
  should restate the claim with the corrected fact. Otherwise `null`.
