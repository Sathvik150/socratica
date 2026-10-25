# Logged-in ChatGPT adapter verification

Verified in Chrome with the unpacked extension on 2026-10-24 using a public-knowledge Brooklyn Bridge conversation.
This covers one logged-in account/layout, not every ChatGPT rollout.

The popup initially reported no answers after installation, consent, and a page reload.
DevTools inspection of the test turn revealed a layout distinct from the logged-out transcript:

| Purpose | Observed markup |
|---|---|
| Assistant block | `[data-chatgpt-search-unit-key$=":assistant"]` |
| User block | `[data-chatgpt-search-unit-key$=":user"]` |
| Question text | `[data-user-message-bubble]` |
| Answer content | `[data-markdown-text-style="assistant-message"]` |
| Assistant ID | descendant `[data-chatgpt-selection-message-id]` |
| Completion | ancestor `[data-talvt-turn-state="complete"]` |

The reduced, sanitized capture is [`chatgpt-live-logged-in-finished.html`](../packages/browser-extension/fixtures/chatgpt-live-logged-in-finished.html).
It contains only the test turn; account metadata, sidebar, scripts, styling, and action controls are excluded.
Non-complete states in the automated tests are simulated from this finished capture.

After updating and rebuilding the adapter, reloading the extension in `chrome://extensions`, and reloading the conversation:

- The popup reported **1 ChatGPT answer detected**.
- The original four-sentence response received a **4 checked** summary.
- **Regenerate response → Try again** displayed the Stop control during generation, then **Response complete** and a fresh **Checking claims against evidence…** status. The regenerated answer received a new **4 checked** summary.
- Editing the original prompt to request six sentences again displayed Stop during generation, then **Response complete** and a fresh checking status. The replacement answer received a **6 checked** summary.

The judge was the offline heuristic. The final summaries marked all claims unverifiable; these checks validate detection and lifecycle behavior, not verdict accuracy. Evidence settings in the live run showed Wikipedia and Brave enabled, with a warning that no Brave API key was set.

The watcher must observe both `data-message-complete` and `data-talvt-turn-state` attribute changes: completion may arrive after text has already stopped changing. Regression tests cover that transition, debounce timing, and renewed checks after changed regenerated/edited answers for both captured layouts.
