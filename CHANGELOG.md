# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [SemVer](https://semver.org/).

## [0.1.0] - 2026-10-24

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
