# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [SemVer](https://semver.org/).

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

[0.1.0]: https://github.com/sathvik150/cac26/releases/tag/v0.1.0
