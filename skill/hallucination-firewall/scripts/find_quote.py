#!/usr/bin/env python3
"""Find the exact wording of a quote in saved source files (stdlib only).

Usage:  python3 find_quote.py <file-or-folder> "approximate quote text"

Matching ignores case, whitespace runs and curly-vs-straight quotes/dashes, but every
match is printed EXACTLY as it appears in the file, so it can be used as a verbatim
quote. Prints one JSON object per match: {"path", "quote"}. Exit code 1 if none found.
"""
import json
import os
import re
import sys

FOLD = str.maketrans({"‘": "'", "’": "'", "‚": "'", "“": '"', "”": '"', "„": '"',
                      "–": "-", "—": "-", "‑": "-", " ": " "})


def files(target):
    if os.path.isdir(target):
        for root, _, names in os.walk(target):
            for n in sorted(names):
                yield os.path.join(root, n)
    else:
        yield target


def pattern(approx):
    parts = [re.escape(w.translate(FOLD)) for w in approx.split()]
    return re.compile(r"\s+".join(parts), re.IGNORECASE)


def main():
    if len(sys.argv) != 3 or not sys.argv[2].strip():
        sys.exit(__doc__)
    pat, found = pattern(sys.argv[2]), 0
    for path in files(sys.argv[1]):
        try:
            text = open(path, encoding="utf-8").read()
        except (UnicodeDecodeError, OSError):
            continue
        # Folding maps each character to exactly one character, so offsets line up with the original.
        for m in pat.finditer(text.translate(FOLD)):
            print(json.dumps({"path": path, "quote": text[m.start():m.end()]}, ensure_ascii=False))
            found += 1
    sys.exit(0 if found else 1)


if __name__ == "__main__":
    main()
