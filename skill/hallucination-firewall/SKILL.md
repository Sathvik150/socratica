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
   copied character-for-character from a passage (12+ characters). The validator downgrades any
   verdict whose quote is not an exact substring to `unverifiable`. Never override a downgrade.

## Paths

`SKILL_DIR` below means **the folder that contains this SKILL.md**. It is often read-only and is
not your working directory, so always call the scripts by their full path:

- claude.ai / Claude desktop: `/mnt/skills/plugins/hallucination-firewall` or `/mnt/skills/user/hallucination-firewall`
- Claude Code: `~/.claude/skills/hallucination-firewall` or `.claude/skills/hallucination-firewall`

If unsure, find it: `find / -name validate_verdicts.py -path '*hallucination-firewall*' 2>/dev/null`.

Read `SKILL.md` and the `references/` files with your file-reading tool, not with shell commands
such as `cat`. Use the shell only to run the scripts.
Do all work in a writable folder of your own (for example `./hf-work`), never inside `SKILL_DIR`.

The scripts need only **Python 3** (standard library). Node is optional.

## Workflow

1. **Save the text to check** to `hf-work/answer.txt` (use code to write it; pasted text is fine).
   Note the question that produced it if the user gives one.
2. **Extract claims** by hand, following `SKILL_DIR/references/claim-extraction.md`: atomic,
   checkable statements of fact, copied from the text. Skip opinions, instructions, questions,
   hedged statements and code. (If Node is available,
   `node SKILL_DIR/scripts/hf-verify.mjs extract --answer hf-work/answer.txt` suggests a list.)
3. **Save every evidence passage to a file** in `hf-work/sources/`, one file per source, exactly
   as retrieved. **Write files with code from the original text; don't retype sources.**
   In order of preference:
   - files the user attached (in claude.ai: `/mnt/user-data/uploads/`), or text they pasted
   - your web search / fetch tools, if available (keep the URL for each file)
   - nothing: say so, and every claim will be `unverifiable`
4. **Judge each claim** with `SKILL_DIR/references/verdict-rules.md`. For each quote, get the exact
   wording from the source file rather than typing it from memory:
   `python3 SKILL_DIR/scripts/find_quote.py hf-work/sources "approximate wording"`
   It prints the matching text exactly as it appears in the file. Use that string as the quote.
5. **Write `hf-work/verdicts.json`** in the format in `SKILL_DIR/references/validation-format.md`.
   Point each passage at its file with `"path"` (relative to `verdicts.json`) instead of copying
   the text in.
6. **Validate**:
   `python3 SKILL_DIR/scripts/validate_verdicts.py hf-work/verdicts.json --format text`
   Its output is the final result. Do not change verdicts after this step.
7. **Report** to the user, starting from the validator's text output:
   - the summary line, e.g. `5 checked, 3 supported, 1 contradicted, 1 unverifiable`
   - contradicted claims first, each with the quote, source link, and correction (only if the
     validator kept it)
   - then unverifiable claims (say what evidence was missing), then supported ones briefly
   - any downgrades, stated plainly ("verdict discarded: quote not found in source")

### Fully offline shortcut (Node only)

When the user gives documents and no model judgement is wanted, the bundled deterministic
judge does the whole pipeline (simple sentences only; it returns `unverifiable` when unsure):

```bash
node SKILL_DIR/scripts/hf-verify.mjs verify --answer hf-work/answer.txt --evidence hf-work/sources/ --format text
```

### No code execution available

Apply the same rules by hand, and tell the user plainly that the quotes were **not**
machine-validated. (In claude.ai, code execution can be turned on in Settings → Capabilities.)

## Never

- Never mark a claim `contradicted` because you could not find support for it.
- Never paraphrase, trim, or "clean up" a quote. Copy it exactly or don't cite it.
- Never present a correction that the quotes don't directly state.
- Never send the user's private text to an external service they didn't ask you to use.
