# Privacy model

## Chrome extension

- **Default: no network calls.** Until you accept the privacy notice, the background worker returns before any
  provider is created. Tests cover this.
- **After consent:**
  - Evidence sources (Wikipedia, optional Brave Search) receive **short search queries built from individual
    claims**, never the whole conversation.
  - If you choose OpenAI or Anthropic as the judge, that provider receives, per claim: the claim, its
    surrounding sentence, your question, and the retrieved passages, sent with **your** key.
  - With the offline judge and no evidence sources, nothing leaves the browser.
- **All network calls go through the background service worker.** The content script only reads the page.
- **Keys** live only in `chrome.storage.local` (not synced). They are never logged or put in error messages,
  and they are sent only as headers to their own provider.
- **Permissions:** `storage`, content-script access to `https://chatgpt.com/*`, and `activeTab` + `scripting`.
  The last two are used only by the popup's **Check selected text**: they read the current selection in the tab where
  you clicked the toolbar button, and only at that moment. Wikipedia, OpenAI, Anthropic, Brave and `localhost` /
  `127.0.0.1` (for a local model) are *optional* host permissions, requested at runtime only for what you enable.
- **Local model judge:** claims and passages go only to the server URL you enter, which must be on your own machine.
- **No backend, accounts, telemetry or analytics.**

## CLI

- Offline by default. The network is used only with `--wikipedia`, `--llm openai`, `--llm anthropic`, or
  `--llm local` (your own server).
- Keys are read from environment variables only, so they don't land in shell history.

## Agent Skill

The skill runs inside your AI assistant. Whatever that assistant can see or send is governed by its own
policies. The skill instructs the assistant not to send your text to services you didn't ask it to use.
