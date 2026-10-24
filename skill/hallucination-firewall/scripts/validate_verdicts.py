#!/usr/bin/env python3
"""Post-validate fact-check verdicts (Python port of `hf-verify validate`; stdlib only).

Usage:  python3 validate_verdicts.py verdicts.json        (or "-" for stdin)

Input JSON: {"claims":[{"id","text"}], "passages":[{"id","text","title"?,"url"?}],
             "verdicts":[{"claimId","verdict","confidence","rationale","quotes":[{"passage_id","quote"}],"correction"}]}

Rules (same as the TypeScript core):
  * verdict must be supported | contradicted | unverifiable, confidence in [0, 1]
  * every quote must be a VERBATIM substring (exact, >= 12 chars) of the passage it cites,
    otherwise the verdict becomes "unverifiable"
  * supported / contradicted need at least one quote
  * confidence below 0.5 -> unverifiable
  * a correction survives only on contradicted verdicts, and only if every new word and
    number it introduces appears in the quotes
"""
import json
import re
import sys

MIN_QUOTE = 12
MIN_CONFIDENCE = 0.5
VERDICTS = {"supported", "contradicted", "unverifiable"}
STOP = set("""a an the and or but if then of in on at to for from by with without as is are was were be been being
it its this that these those there their they them he she his her we our you your i me my which who whom whose what
when where why how than so such not no nor do does did done has have had having can could will would shall should
may might must also only just very more most some any each every all both few many much other into over under about
after before between during through up down out off again further once here s t""".split())


def tokens(s):
    out = []
    for t in re.findall(r"[^\W_]+(?:['’-][^\W_]+)*", s.lower()):
        t = re.sub(r"['’]s$", "", t)
        if t in STOP:
            continue
        if not t[0].isdigit() and len(t) > 4:
            t = re.sub(r"(ingly|edly|ing|ed|es|s|ly)$", "", t)
        out.append(t)
    return out


def numbers(s):
    return [n.replace(",", "") for n in re.findall(r"\d[\d,]*(?:\.\d+)?", s)]


def correction_grounded(correction, claim, quotes):
    claim_tokens = set(tokens(claim))
    quote_text = " ".join(quotes)
    quote_tokens = set(tokens(quote_text))
    new = [t for t in tokens(correction) if t not in claim_tokens]
    if not new or not all(t in quote_tokens for t in new):
        return False
    qn, cn = set(numbers(quote_text)), set(numbers(claim))
    return all(n in qn or n in cn for n in numbers(correction))


def downgrade(v, reason, rationale):
    v.pop("correction", None)
    v.update(verdict="unverifiable", downgradeReason=reason, rationale=rationale,
             confidence=min(v.get("confidence", 0), 0.5))
    return v


def validate_one(claim, raw, passages):
    base = {"claimId": claim["id"], "claim": claim["text"], "confidence": 0, "rationale": "", "quotes": []}
    if not passages:
        return dict(base, verdict="unverifiable", downgradeReason="no-evidence",
                    rationale="No evidence passages were found for this claim.")
    ok = (isinstance(raw, dict) and raw.get("verdict") in VERDICTS
          and isinstance(raw.get("confidence", 0.8), (int, float)) and 0 <= raw.get("confidence", 0.8) <= 1
          and isinstance(raw.get("quotes", []), list))
    if not ok:
        return dict(base, verdict="unverifiable", downgradeReason="invalid-llm-output",
                    rationale="The verdict did not match the required schema.")
    by_id = {p["id"]: p for p in passages}
    quotes, all_valid = [], True
    for q in raw.get("quotes", []):
        p = by_id.get(q.get("passage_id")) if isinstance(q, dict) else None
        text = q.get("quote", "") if isinstance(q, dict) else ""
        if p and len(text.strip()) >= MIN_QUOTE and text in p["text"]:
            quotes.append({"passageId": p["id"], "quote": text,
                           "source": {k: v for k, v in (("title", p.get("title", p["id"])), ("url", p.get("url"))) if v}})
        else:
            all_valid = False
    v = dict(base, verdict=raw["verdict"], rawVerdict=raw["verdict"],
             confidence=round(float(raw.get("confidence", 0.8)), 2),
             rationale=str(raw.get("rationale", "")).strip(), quotes=quotes)
    if raw["verdict"] == "contradicted" and raw.get("correction"):
        v["correction"] = str(raw["correction"]).strip()
    if raw["verdict"] == "unverifiable":
        v.pop("correction", None)
        return v
    if not all_valid:
        return downgrade(v, "quote-not-in-passage", "A cited quote does not appear verbatim in the evidence, so the verdict was discarded.")
    if not quotes:
        return downgrade(v, "no-quotes", "The verdict had no evidence quotes, so it was discarded.")
    if v["confidence"] < MIN_CONFIDENCE:
        return downgrade(v, "low-confidence", "Evidence was too weak for a confident verdict.")
    if "correction" in v and not correction_grounded(v["correction"], v["claim"], [q["quote"] for q in quotes]):
        v.pop("correction")
    return v


def validate(data):
    verdicts = []
    for c in data["claims"]:
        raw = next((x for x in data["verdicts"] if x.get("claimId") == c["id"]), None)
        verdicts.append(validate_one(c, raw, data["passages"]))
    counts = {k: sum(1 for v in verdicts if v["verdict"] == k) for k in ("supported", "contradicted", "unverifiable")}
    summary = dict(checked=len(verdicts), **counts)
    summary["text"] = "{checked} checked, {supported} supported, {contradicted} contradicted, {unverifiable} unverifiable".format(**summary)
    return {"verdicts": verdicts, "summary": summary}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = sys.stdin if sys.argv[1] == "-" else open(sys.argv[1], encoding="utf-8")
    print(json.dumps(validate(json.load(src)), indent=2, ensure_ascii=False))
