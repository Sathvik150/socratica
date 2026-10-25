# Benchmark

```bash
pnpm build && pnpm bench
```

`benchmark/data/benchmark.jsonl` has 37 hand-written items about **fictional** entities, so the labels are
unambiguous: 12 supported, 12 contradicted, 13 unverifiable. Each item is
`{ id, claim, evidence: [{ title, text, url? }], label, note }`.

For each verifier, the runner reports:
- precision, recall and F1 per label, accuracy, and a confusion matrix
- the **false-positive rate on `contradicted`**: non-contradicted items predicted as contradicted
- **accuracy on items whose gold label is contradicted or unverifiable**
- every misclassified item

## Results

Printed by `pnpm bench` on 2026-10-24. Local models ran CPU-only on a 4-core machine. Re-run rather than trusting this table.

| Verifier | Accuracy | FPR on contradicted | C-vs-U accuracy | Contradicted P / R | Run time |
|---|---|---|---|---|---|
| socratica + **qwen2.5:7b** (Ollama, `--llm local`) | 97.3% | 0.0% | 96.0% | 100.0% / 91.7% | 13m 53s |
| socratica + `HeuristicLLM` (offline judge) | 89.2% | 0.0% | 84.0% | 100.0% / 66.7% | < 1s |
| socratica + **qwen2.5:3b** (Ollama, `--llm local`) | 54.1% | 0.0% | 40.0% | 100.0% / 25.0% | 4m 13s |
| naive binary-overlap reference (no "unverifiable" output) | 51.4% | 52.0% | 28.0% | 35.0% / 58.3% | < 1s |

Reproduce the local runs:

```bash
ollama pull qwen2.5:7b
pnpm build && pnpm bench --llm local --model qwen2.5:7b
```

**Caveats**
- **The set is tiny (n=37) and synthetic.** For the **heuristic judge** it is also **in-sample**: the same author wrote the data and the heuristic. The first run scored 75.7% accuracy with a 16.0% contradicted FPR, and three generalization bugs were fixed after reading its errors. The local models were not tuned on this set.
- qwen2.5:7b's only error was calling a contradiction `unverifiable` (the safe direction). qwen2.5:3b mostly answered `unverifiable` and marked 6 unverifiable claims as supported. Small models are weak judges, but none of these runs produced a false `contradicted`.
- The binary-overlap baseline is a reference point, **not** a re-implementation of any existing tool.
- **No hosted LLM (OpenAI or Anthropic API) or third-party detector has been benchmarked, so no numbers are reported for them.**

## Comparing another verifier

Implement `BaselineVerifier` from `benchmark/src/verifiers.ts`:

```ts
interface BaselineVerifier {
  readonly name: string;
  verify(claim: string, evidence: EvidenceDocument[]): Promise<'supported' | 'contradicted' | 'unverifiable'>;
}
```

Then add it to the `verifiers` list in `benchmark/src/run.ts`. To run the firewall with a real judge:

```bash
pnpm bench --llm local --model qwen2.5:7b                 # local OpenAI-compatible server (default Ollama)
SOCRATICA_OPENAI_API_KEY=... pnpm bench --llm openai             # network, your key
SOCRATICA_ANTHROPIC_API_KEY=... pnpm bench --llm anthropic       # network, your key
```
