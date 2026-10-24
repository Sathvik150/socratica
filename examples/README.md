# Examples

All facts here are fictional, so the results are unambiguous.

```bash
node hf-verify.mjs verify --answer examples/answer.txt --evidence examples/evidence/
node hf-verify.mjs validate --input examples/verdicts.json
```

- `answer.txt`: an answer with one wrong year.
- `evidence/`: the source document.
- `verdicts.json`: the validator input format, with one honest verdict and one that cites a fabricated quote (which the validator downgrades).
