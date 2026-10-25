# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [SemVer](https://semver.org/).

## [0.1.4] - 2026-10-25

### Changed
- **Redesigned extension UI** (popup, settings, in-ChatGPT overlay, demo) with one shared design system in plain CSS:
  light/dark themes, switch toggles, verdict meter and icons, evidence panel with confidence meter, and a new
  extension icon. The overlay follows ChatGPT's own light/dark theme.
- **Highlights use the CSS Custom Highlight API** where available: the browser styles the claim text itself, so
  highlights no longer lag behind the text while scrolling and no DOM is rebuilt. Positioned boxes remain as a fallback.
- **Rate-limit (HTTP 429) and source failures** are shown as plain-language notes ("Wikipedia is rate-limiting
  requests right now (try again in 29s). Other enabled sources were still used.").
- Claim details under an answer start collapsed, and the "checking" bar matches the final bar's height, so results
  no longer push the page down.

### Performance
- Verdict validation uses `zod/mini` (same rules, ~13 KB instead of ~440 KB).
- Extension and CLI bundles are minified, with linked source maps (not shipped in release zips).
  background.js 848 KB → 59 KB, demo.js 828 KB → 60 KB, hf-verify.mjs 886 KB → 467 KB.

### Removed
- Crossref evidence source (core provider, CLI `--crossref` flag, extension option and permission).

## [0.1.3] - 2026-10-24

### Added
- Six release downloads: Chrome extension, full and instruction-only Agent Skills,
  full and instruction-only ChatGPT plugins, and the standalone CLI. The plugin
  and instruction-only bundles were merged after the v0.1.2 tag and were not in that release.
- Plugin archives include a root `plugin.json` and `skills/hallucination-firewall/`.
  Instruction-only variants use manual quote checks without bundled scripts.
- Evidence sources and retrieval improvements merged since v0.1.2, including
  Wikidata, World Bank, scholarly sources, GOV.UK, fact-check search, Tavily, and supplied URLs.

### Fixed
- Release notes and installation instructions distinguish plugin uploads from standalone skill uploads.
- CLI proxy support and evidence retrieval fixes from live validation.

## [0.1.2] - 2026-10-25

### Fixed
- Skill: SKILL.md now names the folder claude.ai actually uses for uploaded skills
  (`/mnt/skills/plugins/hallucination-firewall`) and tells Claude to read reference files with its
  file tool rather than shell commands, which claude.ai's command check can interrupt.

## [0.1.1] - 2026-10-25

### Added
- **Toolbar popup**: shows on/off state, judge and evidence setup, answers detected on the current ChatGPT tab and the
  last result. Includes **Check latest answer**, and **Check selected text** for any website (`activeTab` + `scripting`).
- **Local model judge in the extension** (Ollama, LM Studio, any OpenAI-compatible server on localhost), with a
  **Test connection** button and specific guidance for the common HTTP 403 (`OLLAMA_ORIGINS`) and 404 (model not pulled) errors.
- Warnings when the limited offline judge is in use, and when the judge itself fails.

### Changed
- Clicking the toolbar icon opens the popup instead of the settings tab.

### Fixed
- Agent Skill on claude.ai (#3): SKILL.md now calls scripts by their full path (the skill folder is
  read-only and isn't the working directory) and needs only Python. Passages can be given as `"path"`
  to a saved source file instead of retyped text, `find_quote.py` returns exact source wording for
  quotes, and `validate_verdicts.py --format text` prints a ready-to-paste report.
  `hf-verify validate` supports the same `"path"` passages and `--format text`.

## [0.1.0] - 2026-10-24

### Fixed (from live testing)
- ChatGPT adapter now supports the current chatgpt.com transcript UI (`li[data-message-role]`,
  `[data-assistant-markdown-root]`, `data-message-complete`), verified on the live site. Fixtures are captured from it.
- Highlights merge into one box per line (live ChatGPT splits text into many spans).
- The month "May" is no longer treated as the hedge word "may".
- The Wikipedia provider follows Wikimedia's client-identification policy and backs off on HTTP 429.
- `pnpm bench --llm local` runs the benchmark against Ollama or other OpenAI-compatible servers.

### Added
- **Core engine**: claim extraction, pluggable evidence retrieval (your documents, Wikipedia, optional Brave web
  search), three-way verdicts with verbatim-quote validation, grounded corrections, summary scoring.
- **Chrome extension (MV3)** for ChatGPT in Review Mode, with inline highlights, an evidence panel and a summary bar
  in Shadow DOM. It shows a mandatory consent screen and makes no network calls by default.
- **`hf-verify` CLI**: `verify`, `extract` and `validate`. Works offline, with OpenAI or Anthropic keys, or with local
  OpenAI-compatible servers (Ollama, LM Studio, llama.cpp, vLLM).
- **Agent Skill** (`SKILL.md`) for Claude, ChatGPT and other Agent Skills hosts, with Node and Python validators.
- **SDK**: `verify({ question, answer, evidence })`.
- **Benchmark**: 37 labeled synthetic items, a runner, and a `BaselineVerifier` plug-in interface.
- Release packaging (`pnpm package`) and GitHub Actions for CI and tagged releases.

[0.1.4]: https://github.com/sathvik150/cac26/releases/tag/v0.1.4
[0.1.3]: https://github.com/sathvik150/cac26/releases/tag/v0.1.3
[0.1.2]: https://github.com/sathvik150/cac26/releases/tag/v0.1.2
[0.1.1]: https://github.com/sathvik150/cac26/releases/tag/v0.1.1
[0.1.0]: https://github.com/sathvik150/cac26/releases/tag/v0.1.0
