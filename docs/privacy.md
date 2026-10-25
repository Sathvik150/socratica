# Privacy model

## Chrome extension

- **Default: no network calls.** Until you accept the privacy notice, the background worker returns before any
  provider is created. Tests cover this.
- **After consent:**
  - Wikipedia, Europe PMC, Crossref, GOV.UK, Google Fact Check, Tavily and Brave Search receive **short search queries
    built from individual claims**, never the whole conversation. Wikidata receives entity names from claim context.
    World Bank receives country, indicator and date requests. Wikipedia, Wikidata and Europe PMC are enabled by default after consent; each source can be disabled independently.
  - Trusted URLs receive only the explicitly chosen page request, not claim queries. Requests omit cookies,
    credentials and referrers and refuse redirects. Only public HTTPS URLs are accepted.
  - If you choose OpenAI or Anthropic as the judge, that provider receives, per claim: the claim, its
    surrounding sentence, your question, and the retrieved passages, sent with **your** key.
  - With the offline judge and no evidence sources, nothing leaves the browser.
- **All network calls go through the background service worker.** The content script only reads the page.
- **Keys** live only in `chrome.storage.local` (not synced). They are never logged or put in error messages,
  and they are sent only as headers to their own provider.
- **Permissions:** `storage`, content-script access to `https://chatgpt.com/*`, and `activeTab` + `scripting`.
  The last two are used only by the popup's **Check selected text**: they read the current selection in the tab where
  you clicked the toolbar button, and only at that moment. Evidence APIs, OpenAI, Anthropic and `localhost` /
  `127.0.0.1` (for a local model) are *optional* host permissions, requested at runtime only for what you enable.
  The optional HTTPS wildcard declaration enables user-supplied URLs; permission requests use only the specific
  site origins the user enters, never blanket access to all HTTPS sites.
- **Consent version 2:** adding new destinations requires existing users to accept the updated notice before
  any requests resume. Declining an origin permission skips that source and displays a warning.
- **Local model judge:** claims and passages go only to the server URL you enter, which must be on your own machine.
- **No backend, accounts, telemetry or analytics.**

## CLI

- Offline by default. Network evidence is opt-in using `--wikipedia`, `--wikidata`, `--europe-pmc`, `--crossref`, `--world-bank`, `--gov-uk`,
  `--fact-check`, `--tavily` or `--evidence-url`. Model requests use `--llm openai`, `--llm anthropic`, or
  `--llm local` (your own server). The source and model keys are independent.
- Keys are read from environment variables only, so they don't land in shell history.

## Agent Skill

The skill runs inside your AI assistant. Whatever that assistant can see or send is governed by its own
policies. The skill instructs the assistant not to send your text to services you didn't ask it to use.
