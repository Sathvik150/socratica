# Privacy model

## Chrome extension

- **Default: no network calls.** Until you accept the privacy notice, the background worker returns before any
  provider is created. Tests cover this.
- **After consent:**
  - The web search engine you choose receives **short search queries built from individual claims**, never the
    whole conversation. Web search is required, so every check sends these queries.
  - **Socratica search** (the default) sends them to Socratica's own relay on Vercel ([`relay/`](../relay/README.md)),
    which passes each one to Serper (Google results) with the project's key. The relay does not log or store
    queries; it answers a repeated query from a 10-minute in-memory cache, and uses your network address only to
    limit searches (30 a minute, 400 a day), counted in memory. Vercel, which hosts it, and Serper see the request
    as their own services normally do.
  - The alternatives: Firecrawl (without a key it counts usage by your network address and refuses addresses it
    judges to be a VPN or proxy), and Serper or Brave Search with your own key, which receive the queries directly.
  - With Socratica search or keyless Firecrawl, DuckDuckGo's Instant Answer API also receives the name of what each
    claim is about (for example "james webb space telescope"), as a keyless backup.
  - Wikipedia, Europe PMC, GOV.UK and Google Fact Check also receive short claim-based queries. Wikidata receives
    entity names from claim context. World Bank receives country, indicator and date requests. Wikipedia, Wikidata
    and Europe PMC are enabled by default after consent; each of these can be disabled independently.
  - Trusted URLs receive only the explicitly chosen page request, not claim queries. Requests omit cookies,
    credentials and referrers and refuse redirects. Only public HTTPS URLs are accepted.
  - If you choose OpenAI or Anthropic as the judge, that provider receives, per claim: the claim, its
    surrounding sentence, your question, and the retrieved passages, sent with **your** key.
  - To send nothing at all, switch Socratica off from the toolbar popup.
- **All network calls go through the background service worker.** The content script only reads the page.
- **Keys** live only in `chrome.storage.local` (not synced). They are never logged or put in error messages,
  and they are sent only as headers to their own provider.
- **Permissions:** `storage`, content-script access to `https://chatgpt.com/*`, and `activeTab` + `scripting`.
  The last two are used only by the popup's **Check selected text**: they read the current selection in the tab where
  you clicked the toolbar button, and only at that moment. The web search engine, evidence APIs, OpenAI, Anthropic
  and `localhost` / `127.0.0.1` (for a local model) are *optional* host permissions, requested at runtime only for
  the engine you choose and the sources you enable.
  The optional HTTPS wildcard declaration enables user-supplied URLs; permission requests use only the specific
  site origins the user enters, never blanket access to all HTTPS sites.
- **Consent version 5:** adding new destinations (the web search engines in 0.2.0, the DuckDuckGo backup and the
  Socratica search relay in 0.3.0) requires existing users to accept the updated notice before any requests resume. Declining a source's permission skips that source and
  displays a warning; declining the web search engine's permission stops checks until it is allowed.
- **Local model judge:** claims and passages go only to the server URL you enter, which must be on your own machine.
- **No accounts, telemetry or analytics.** The only Socratica server is the search relay described above; choose
  another engine and nothing goes through it.

## CLI

- `verify` needs a web search engine (`--web socratica`, `--web firecrawl`, `--web serper` or `--web brave`), which receives
  claim-based queries, unless you check only against your own `--evidence` files; then it stays offline.
  More network evidence is opt-in using `--wikipedia`, `--wikidata`, `--europe-pmc`, `--world-bank`, `--gov-uk`,
  `--fact-check` or `--evidence-url`. Model requests use `--llm openai`, `--llm anthropic`, or
  `--llm local` (your own server). The source and model keys are independent.
- Keys are read from environment variables only, so they don't land in shell history.

## Socratica's site

[socratica-search.vercel.app](https://socratica-search.vercel.app) is served by the same Vercel project as the
search relay. Its example at the top runs in your browser with a mock judge and sends nothing. The live check
sends, for each claim in the text you paste, only short claim-based queries: to the relay (Google results via
Serper), Wikipedia, Wikidata and DuckDuckGo. Your text itself is not sent anywhere, the judge is the offline one
running in your browser, and the page sets no cookies and has no analytics. The relay keeps no queries (see above).

## Agent Skill

The skill runs inside your AI assistant. Whatever that assistant can see or send is governed by its own
policies. The skill instructs the assistant not to send your text to services you didn't ask it to use.
