# `verdicts.json` format (input to the validator)

```json
{
  "claims": [
    { "id": "c1", "text": "The Zentha Bridge opened in 1987." }
  ],
  "passages": [
    {
      "id": "p1",
      "title": "Zentha Bridge",
      "url": "https://example.org/zentha",
      "path": "sources/zentha.txt"
    },
    {
      "id": "p2",
      "title": "Pasted note",
      "text": "The Zentha Bridge is a suspension bridge in Velmora."
    }
  ],
  "verdicts": [
    {
      "claimId": "c1",
      "verdict": "contradicted",
      "confidence": 0.9,
      "rationale": "p1 gives the opening year as 1991.",
      "quotes": [{ "passage_id": "p1", "quote": "It opened to traffic in 1991." }],
      "correction": "The Zentha Bridge opened in 1991."
    }
  ]
}
```

- Give each passage either `"path"` (preferred: a file relative to `verdicts.json`, read verbatim)
  or `"text"` (the exact retrieved text). The validator compares quotes against it.
- Get quote wording from the file with `scripts/find_quote.py`; don't type quotes from memory.
- A claim with no entry in `verdicts` comes out as `unverifiable`.

Run with `--format text` for a ready-to-paste report, or without it for JSON. The JSON output is `{ "verdicts": [...], "summary": { "checked", "supported", "contradicted", "unverifiable", "text" } }`.
A verdict it changed carries `"downgradeReason"`: `quote-not-in-passage`, `no-quotes`,
`low-confidence`, `invalid-llm-output`, or `no-evidence`.
