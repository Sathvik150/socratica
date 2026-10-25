# ChatGPT DOM fixtures

| File | Source | Covers |
|---|---|---|
| `chatgpt-live-finished.html` | **Captured from live chatgpt.com** (logged-out web UI), 2026-10-24 | `li[data-message-role]`, `[data-assistant-markdown-root]`, `data-message-complete` present |
| `chatgpt-live-streaming.html` | **Captured from live chatgpt.com** mid-answer, 2026-10-24 | same turn without `data-message-complete` |
| `chatgpt-live-logged-in-finished.html` | **Captured from one logged-in test turn via DevTools**, 2026-10-24; reduced and sanitized | `[data-chatgpt-search-unit-key]`, `[data-markdown-text-style="assistant-message"]`, ancestor `data-talvt-turn-state="complete"` |
| `chatgpt-finished.html` | Hand-written | legacy `[data-message-author-role]` / `.markdown` UI |
| `chatgpt-streaming.html` | Hand-written | legacy `.result-streaming` class and stop button |

The live captures contain only a public-knowledge test prompt and ChatGPT's answer. UUIDs were replaced and
scripts removed. The logged-in fixture additionally removes styles, classes, icons, controls and unrelated wrappers;
it contains no account metadata or sidebar. Non-complete logged-in states in tests are simulated, not live captures.
If detection breaks, capture a sanitized
copy of one conversation turn, add it here, and update `src/adapters/chatgpt.ts`.
