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

Printed by `pnpm bench` (offline). Re-run rather than trusting this table.

| Verifier | Accuracy | FPR on contradicted | C-vs-U accuracy | Contradicted P / R |
|---|---|---|---|---|
| hallucination-firewall + `HeuristicLLM` (offline judge) | 89.2% | 0.0% | 84.0% | 100.0% / 66.7% |
| naive binary-overlap reference (no "unverifiable" output) | 51.4% | 52.0% | 28.0% | 35.0% / 58.3% |

**Caveats**
- **The set is tiny (n=37), synthetic and in-sample.** The same author wrote both the data and the heuristic
  judge. The first run scored 75.7% accuracy with a 16.0% contradicted FPR. Three generalization bugs were
  then fixed after reading its errors, so the improvement is partly fitted to this set.
- The binary-overlap baseline is a reference point, **not** a re-implementation of any existing tool.
- **No real-LLM or third-party-detector numbers have been run, so none are reported.**

## Comparing another verifier

Implement `BaselineVerifier` from `benchmark/src/verifiers.ts`:

```ts
interface BaselineVerifier {
  readonly name: string;
  verify(claim: string, evidence: EvidenceDocument[]): Promise<'supported' | 'contradicted' | 'unverifiable'>;
}
```

Then add it to the `verifiers` list in `benchmark/src/run.ts`. To run the firewall with a real judge (this
makes network calls with your key):

```bash
HF_OPENAI_API_KEY=... pnpm bench --llm openai
HF_ANTHROPIC_API_KEY=... pnpm bench --llm anthropic
```
