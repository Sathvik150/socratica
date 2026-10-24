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
      "text": "The Zentha Bridge is a suspension bridge in Velmora. It opened to traffic in 1991."
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

- `passages[].text` must be the exact retrieved text. The validator compares quotes against it.
- A claim with no entry in `verdicts` comes out as `unverifiable`.

The validator prints `{ "verdicts": [...], "summary": { "checked", "supported", "contradicted", "unverifiable", "text" } }`.
A verdict it changed carries `"downgradeReason"`: `quote-not-in-passage`, `no-quotes`,
`low-confidence`, `invalid-llm-output`, or `no-evidence`.
