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
unzip hallucination-firewall-skill-v0.1.0.zip -d ~/.claude/skills/        # all projects
# or: unzip ... -d .claude/skills/                                        # this project only
```

## ChatGPT

OpenAI's Skills follow the same Agent Skills standard. Plan availability and the install flow are in
[OpenAI's help article](https://help.openai.com/en/articles/20001066-skills-in-chatgpt).
Install the same zip where your plan supports Skills.

**No Skills on your plan?** Build a Custom GPT instead:
1. Paste the body of `SKILL.md` (everything below the `---` header) into the GPT's **Instructions**.
2. Upload `references/*.md` and `scripts/validate_verdicts.py` as **Knowledge**.
3. Enable **Code Interpreter** so it can run `python3 validate_verdicts.py verdicts.json`.

## Local and other agents

Any agent that can read a folder and run shell commands can use the skill. That includes Claude Code,
Codex-style CLIs, Open Interpreter, and your own agent loop. Point it at `SKILL.md`. For a fully local setup with
your own model, see [local-ai.md](local-ai.md).

## Test status

| Host | Status |
|---|---|
| **Claude Code** | ✅ Tested on 2026-10-24. The release zip was unzipped into a project's `.claude/skills/`, then `claude -p "Fact-check answer.txt against the documents in sources/"` ran headless. Claude Code loaded the skill on its own and ran `hf-verify.mjs`. It judged the claims, including a semantic contradiction ("landlocked" vs "island nation") that the offline judge misses, then ran `validate_verdicts.py` and reported `4 checked, 1 supported, 2 contradicted, 1 unverifiable`. |
| claude.ai / Claude desktop upload | Upload confirmed: the uploaded files arrive intact. Earlier versions only "kind of worked" ([#3](https://github.com/Sathvik150/CAC26/issues/3)): SKILL.md used script paths relative to the skill folder, relied on Node, and had Claude retype source text, so correct quotes failed the exact-match check. Fixed by using full script paths, a Python-only workflow, passages read from saved files, and `find_quote.py`. Re-tested under simulated claude.ai conditions (read-only skill folder, separate working folder, no Node). ⏳ Not yet re-tested in the live claude.ai app. |
| ChatGPT Skills / Custom GPT | ⏳ Not tested: needs a ChatGPT plan with Skills. |

These hosts change quickly, so check their current docs for the skills folder or upload location.
