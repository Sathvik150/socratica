# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [SemVer](https://semver.org/).

## [0.3.1] - 2026-10-25

### Fixed
- **A false figure could slip through when vaguer results came first.** Checking "the Earth's atmospheric oxygen
  concentration has increased to 35%" live, Google sometimes returned four snippets that only mention Earth's oxygen
  ahead of the one that gives the figure ("dry air contains 78.08% nitrogen, 20.95% oxygen", from the "Atmosphere of
  Earth" page). Only the top four passages reach the judge, so the claim came back unverifiable. A web or Wikipedia
  passage now also counts the subject in its page title, and a passage that gives a figure of the same kind right next
  to what the claim measures ranks above ones that only mention the topic. Benchmark numbers are unchanged.

## [0.3.0] - 2026-10-25

### Added
- **Socratica search, the new default engine: Google results with no key for anyone.** A small search relay
  ([`relay/`](relay/README.md), one Vercel Function) forwards each claim-based query to Serper with the project's key,
  which lives only in Vercel's environment settings. It keeps no record of queries, answers repeats from a 10-minute
  in-memory cache, and limits each network address to 30 searches a minute and 400 a day. When it is busy or out of
  credits, the DuckDuckGo backup takes over. Settings from 0.2 that used Firecrawl without a key move to it; the CLI
  uses it with `--web socratica` (`SOCRATICA_RELAY_URL` points at another deployment). It is a new destination, so the
  privacy notice moves to version 5.

### Fixed
- **Firecrawl's "could not be reached (HTTP 403)", and no key needed anywhere.** Without a key, Firecrawl turns away
  addresses it judges to be a VPN or proxy (HTTP 403) and IPv6 addresses (HTTP 401), and stops after its daily allowance
  (HTTP 429). Keyless Firecrawl is now backed up by DuckDuckGo's Instant Answer API, which needs no key and has no documented network limits,
  so checks carry on with DuckDuckGo, Wikipedia and Wikidata and nobody has to add a key. The note says what happened and
  that an optional free Firecrawl key adds full web results on that network. The CLI's `--web firecrawl` uses the same
  backup.
- **Every claim came back unverifiable on long, framed answers.** Searches went to the reporter or the first capitalized
  word ("NASA", "According", "Scientists") and passages about the actual fact scored too low to reach the judge.
  Searches now target each fact (`james webb space telescope launch`, `earth oxygen concentration`,
  `moon orbiting earth`) and passages are scored against those facts.
- **Sources timing out.** Evidence for every claim is requested at once (each source still paces itself), Wikipedia needs
  one request per search instead of three, and the extension waits up to 20 seconds instead of 10. The note for a slow
  source now says it missed only some claims.

### Changed
- The offline judge checks each numeric fact inside a long claim on its own, so "…since its launch in 2018" is
  contradicted by "The telescope was launched on 25 December 2021". It never supports a whole claim from one fact.
  Benchmark results are unchanged (89.2%; 82.6% and 75.0% on the encyclopedia-style sets; no false contradictions).
- Wikidata also reads launch dates, elevation, orbital period and rotation period.
- The toolbar icon is the gold laurel alone, as in the README, without the letter or the tile.
- A source's rate-limit cooldown is cleared once its short `Retry-After` wait is over; a timer firing slightly early
  could leave it in place and fail the next request.

## [0.2.0] - 2026-10-25

Hallucination Firewall is now **Socratica**. This release also replaces the unreleased 0.1.6 design restore.

### Changed
- **New name and look.** Socratica has a laurel mark, a "SOCRATICA" wordmark in the Garogier serif, a subtle
  off-white canvas, and one antique-gold accent, in light and dark. The structure follows the Claude design
  analyses from open-design and awesome-design-md; Tailwind CSS compiles it. See
  [`DESIGN.md`](packages/browser-extension/DESIGN.md).
- **Web search is required.** Every check searches the web with one engine you choose:
  - **Firecrawl** (the default) needs no account or key. A daily limit applies per network; a free Firecrawl
    key raises it.
  - **Google results via Serper** needs a free Serper key.
  - **Brave Search** needs a Brave Search API key.
  The extension won't check, and says why, if the engine needs a key that isn't set or its site permission was
  declined. Settings refuses to save an engine that needs a missing key. The CLI's `verify` needs
  `--web <engine>` unless you check only against your own `--evidence` files.
- The popup has **Verify**, **Sources** and **Insights** tabs.
- The evidence panel shows a verdict seal and meaning, the claim, confidence, the reason, the suggested correction,
  and each source as a card with its quote.
- The CLI prints `[CONTRADICTED] claim` without the check-mark glyphs; the skill's Python validator does the same.
- Packages are `@socratica/core`, `@socratica/sdk`, `@socratica/cli` and `@socratica/browser-extension`; the
  CLI is `socratica` (`socratica.mjs`), the skill is `skill/socratica`, and the release zips are `socratica-*`.
- Environment variables are `SOCRATICA_*`. The old `HF_*` names still work as fallbacks.
- The privacy notice is version 3, because the web search engines are new destinations. Existing users accept it
  again before anything is sent.
- Settings move to a new storage key and are migrated: a Brave key becomes the Brave engine choice.
- The README has no emojis.

### Removed
- **Tavily**, its trusted-domain list and topic presets, and the CLI's `--tavily` and `--search-domain` flags.
  Web search now goes through Firecrawl, Serper or Brave.
- The optional "Brave Search" source toggle, replaced by the engine choice.

## [0.1.5] - 2026-10-25

### Added
- **On/off switch** at the top of the popup. Off means nothing is read, highlighted or sent anywhere; open ChatGPT
  tabs clear their highlights immediately and re-check when it's switched back on.
- **Skeleton loaders** in the popup, the settings page, the selected-text check and the in-page bar, each the same
  size as the content it stands in for.
- `benchmark/data/wiki-style.jsonl` and `wiki-style-holdout.jsonl`: encyclopedia-style evidence for the offline judge.

### Changed
- **Faster checks.** Claims are retrieved and judged 4 at a time; Wikipedia searches once per subject instead of once
  per claim; independent sources such as Europe PMC send up to 4 requests at once (Wikimedia stays at one at a time);
  a slow source is dropped after 10 s (8 s per request) instead of holding up the result; finished ChatGPT turns are
  picked up in ~150 ms instead of after 1.5 s of quiet. On a simulated 15-claim answer with 250 ms per request:
  4.3 s → 1.5 s and 33 → 19 requests (600 ms per request: 10.3 s → 3.6 s).
- **The offline judge gives real verdicts on encyclopedia wording**: unit-aware numbers (330 m vs 1,083 ft is a
  conversion, not a conflict), metres/meters and other spelling variants, rounding (8,849 for 8,848.86), hedged
  figures within 5%, "the tower"/"the statue" back-references, and years compared with years. It no longer mistakes
  a date or the subject itself for a swapped name. Held-out accuracy 45.8% → 75.0% with no false contradictions.
- **Summary bar:** the details (claim list, how the check ran, source notes) are behind a "Show details" toggle at
  the bottom. The offline-judge notice is a quiet "Offline judge" label instead of a warning, and source notes appear
  once per source.
- **The evidence panel follows the underlined text** when the page or the chat scrolls, instead of staying fixed on
  screen.
- **UI rebuilt with Tailwind CSS v4** on design tokens from open-design's Linear package and the rules of the Linear
  DESIGN.md from awesome-design-md (see `packages/browser-extension/DESIGN.md`): one lavender accent, stepped
  surfaces, hairline borders, no gradients. The popup is a rounded card.
- README title uses the extension icon.

### Fixed
- Markdown headings in an answer ("The History of the Eiffel Tower: Six Detailed Paragraphs") are no longer
  checked as claims.

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

[0.3.1]: https://github.com/sathvik150/cac26/releases/tag/v0.3.1
[0.3.0]: https://github.com/sathvik150/cac26/releases/tag/v0.3.0
[0.2.0]: https://github.com/sathvik150/cac26/releases/tag/v0.2.0
[0.1.5]: https://github.com/sathvik150/cac26/releases/tag/v0.1.5
[0.1.4]: https://github.com/sathvik150/cac26/releases/tag/v0.1.4
[0.1.3]: https://github.com/sathvik150/cac26/releases/tag/v0.1.3
[0.1.2]: https://github.com/sathvik150/cac26/releases/tag/v0.1.2
[0.1.1]: https://github.com/sathvik150/cac26/releases/tag/v0.1.1
[0.1.0]: https://github.com/sathvik150/cac26/releases/tag/v0.1.0
