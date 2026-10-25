# Using Hallucination Firewall as an Agent Skill

`hallucination-firewall-skill-vX.zip` contains one folder, `hallucination-firewall/`, in the
[Agent Skills](https://agentskills.io) format:

```
hallucination-firewall/
├── SKILL.md                     instructions the assistant follows
├── references/                  verdict rules, claim extraction, validator input format
├── scripts/hf-verify.mjs        Node 20+ CLI (extract / verify / validate), no install needed
├── scripts/validate_verdicts.py Python 3 validator (stdlib only); works in claude.ai's sandbox
├── scripts/find_quote.py        finds the exact wording of a quote in saved sources (Python 3)
└── LICENSE
```

The assistant does the judging itself. It then runs the validator, which downgrades any verdict whose
quote is not a verbatim substring of a retrieved passage. Missing evidence stays `unverifiable`.

## Claude (claude.ai and desktop app)

1. Download `hallucination-firewall-skill-vX.zip` from the [latest release](https://github.com/sathvik150/cac26/releases/latest).
2. Make sure code execution is enabled in your settings (skills need it).
3. Open the Skills section in Settings, choose **Upload skill**, and select the zip.
4. Ask: *"Fact-check this answer against these sources"* and attach or paste the sources.

## Claude Code

```bash
unzip hallucination-firewall-skill-v0.1.2.zip -d ~/.claude/skills/        # all projects
# or: unzip ... -d .claude/skills/                                        # this project only
```

## ChatGPT

For ChatGPT's **Plugins → New Plugin** upload dialog, use
`hallucination-firewall-plugin-vX.zip`. It contains a root `plugin.json` manifest and
`skills/hallucination-firewall/SKILL.md`, following
[OpenAI's plugin packaging guide](https://developers.openai.com/plugins/build/plugins).
The standalone `hallucination-firewall-skill-vX.zip` is for Agent Skills hosts and
is missing the plugin manifest required by that dialog.

1. Build with `pnpm build && pnpm package`.
2. Download `release/hallucination-firewall-plugin-vX.zip` without extracting it.
3. In **Plugins → New Plugin**, choose that ZIP and select **Add plugin**.
4. If it fails, capture the exact error. The plugin bundles have local archive checks,
   but successful installation in a logged-in ChatGPT account remains unverified.

For a plugin without bundled code, use `hallucination-firewall-plugin-instructions-vX.zip`.
It performs manual quote checks and discloses that quotes are not machine-validated.
Install one variant at a time because they use the same plugin and skill names.

**No Skills on your plan?** Build a Custom GPT instead:
1. Paste the body of `SKILL.md` (everything below the `---` header) into the GPT's **Instructions**.
2. Upload `references/*.md` and `scripts/validate_verdicts.py` as **Knowledge**.
3. Enable **Code Interpreter** so it can run `python3 validate_verdicts.py verdicts.json`.

## Troubleshooting a ChatGPT upload failure

A screenshot confirms that the instruction-only standalone skill ZIP was uploaded to
**Plugins → New Plugin**, which returned “Couldn't add plugin. Try again.” Both
standalone skill variants lack a plugin manifest. That is a documented format mismatch
with the plugin uploader, although the generic error does not prove it is the only issue.
Use the new `hallucination-firewall-plugin-vX.zip` in that dialog first.

A partial upload of `hallucination-firewall-skill-v0.1.0.zip` was also reported. The
reference validator reportedly accepts it, but the cause and ChatGPT compatibility
remain unconfirmed. Plan/workspace access, the upload location, and handling of bundled
scripts are hypotheses, not established causes.

Before reproducing, record:

- ChatGPT plan, workspace, web/desktop app and version or browser.
- Exact UI path used to upload, exact error text, and a screenshot if available.
- Exact archive filename (skill, instruction-only skill, extension, or CLI), size,
  and SHA-256 hash, plus the time of the attempt.

Build with `pnpm build && pnpm package`. The full skill archive now includes explicit
ZIP directory entries and normalizes files to mode `0644` (directories `0755`).
Run scripts through `node` or `python3`; files do not need executable bits.
These are compatibility experiments, not a confirmed fix.

Try `hallucination-firewall-skill-instructions-vX.zip` in the same Skills upload flow.
It contains one `hallucination-firewall/` folder, one `SKILL.md`, the shared references,
and the license, with no `scripts/`. It uses manual claim extraction and quote checking
and explicitly reports that quotes are not machine-validated. Install one variant at
a time: both have the same skill name. If only this variant uploads, that narrows the
problem to differences in bundle contents; it does not prove `.mjs` files are forbidden.
If both fail, capture the error before drawing conclusions about archive contents.

The [OpenAI API Skills guide](https://developers.openai.com/api/docs/guides/tools-skills)
documents API bundle validation, including a single top-level folder, exactly one
manifest, and size/count limits. Those API rules do not confirm ChatGPT UI acceptance.
See [Skills & Plugins](https://learn.chatgpt.com/docs/skills-and-plugins) for the
ChatGPT product context. Use the Custom GPT fallback above if Skills upload is unavailable;
copy the instruction-only variant's body if code execution is unavailable too.

## Local and other agents

Any agent that can read a folder and run shell commands can use the skill. That includes Claude Code,
Codex-style CLIs, Open Interpreter, and your own agent loop. Point it at `SKILL.md`. For a fully local setup with
your own model, see [local-ai.md](local-ai.md).

## Test status

| Host | Status |
|---|---|
| **Claude Code** | ✅ Tested on 2026-10-24. The release zip was unzipped into a project's `.claude/skills/`, then `claude -p "Fact-check answer.txt against the documents in sources/"` ran headless. Claude Code loaded the skill on its own and ran `hf-verify.mjs`. It judged the claims, including a semantic contradiction ("landlocked" vs "island nation") that the offline judge misses, then ran `validate_verdicts.py` and reported `4 checked, 1 supported, 2 contradicted, 1 unverifiable`. |
| claude.ai / Claude desktop upload | Upload confirmed: the uploaded files arrive intact. Earlier versions only "kind of worked" ([#3](https://github.com/Sathvik150/CAC26/issues/3)): SKILL.md used script paths relative to the skill folder, relied on Node, and had Claude retype source text, so correct quotes failed the exact-match check. Fixed by using full script paths, a Python-only workflow, passages read from saved files, and `find_quote.py`. claude.ai installs uploaded skills under `/mnt/skills/plugins/` (seen in a live run). Re-tested under simulated claude.ai conditions (read-only skill folder, separate working folder, no Node). ⏳ Not yet re-tested in the live claude.ai app. |
| ChatGPT plugin | ✅ Plugin ZIP successfully uploaded through Plugins → New Plugin. Fact-checking behavior after installation still needs verification. |
| Custom GPT fallback | ⏳ Not tested in a logged-in account. |

These hosts change quickly, so check their current docs for the skills folder or upload location.
