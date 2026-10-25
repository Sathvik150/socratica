# Evidence that contradicts a hallucination

A useful contradiction includes the original claim, a passage that explicitly conflicts with it,
a verbatim quote, a source link, and a correction only when the quote states the replacement fact.
Finding a related article, a search result, or no evidence is not proof that a claim is false.
Those cases remain `unverifiable`.

For example, a claim that a tower opened in 1899 can be contradicted by a cited statement that
the same tower opened in 1889. A statement about when construction began does not establish
the opening date. Check the subject, property, date, units, and scope of the source.

## Available sources

| Source | Evidence returned | Key | Best use |
|---|---|---|---|
| Wikipedia | Plain-text article excerpts | None | General background |
| Wikidata | Rendered structured statements with entity/property links | None | Opening, birth, death and publication dates; people, places and quantities |
| Europe PMC | Biomedical abstract text, with article links | None | Evidence in biomedical papers |
| Crossref | Attributed publication metadata | None | Authors, publication dates, journals and DOI records; not study findings |
| World Bank | Country-level observations with years, units and indicator definitions | None | Population, GDP, GDP per capita, life expectancy and inflation |
| GOV.UK | Official guidance body text and guide sections | None | UK government policy, public services and rules |
| Google Fact Check | Publisher, reviewed claim, textual rating, review date and review link | Google API key | Claims already reviewed by fact-checkers |
| Trusted URLs | Readable text extracted from pages you explicitly choose | None | Authoritative sources for a particular topic |
| Tavily | Extracted page text, not generated answers or snippet fallbacks | Tavily API key | Web coverage, optionally restricted to trusted domains |
| Brave Search | Result snippets | Brave API key | Additional web discovery |

Sources have different strengths; none is an automatic guarantee of truth. Prefer a primary source
that establishes the fact in question. For biomedical claims, read the study's scope and limitations;
the existence or title of a paper is not proof of its conclusions. Wikidata is community-maintained
and can share Wikimedia rate limits. A search service may return unreliable sites: restrict Tavily
to trusted domains, or supply URLs from sources you trust.

OpenAlex, additional statistical mappings (such as Eurostat), and Exa are candidates for future
providers. Tavily implements the proposed extracted-web-search option; Europe PMC, Crossref,
World Bank and GOV.UK provide independent key-free alternatives to Wikimedia now.

For general-purpose checking, enable extracted web search and choose a local or hosted model.
Leave the domain list empty to cover all topics, or narrow it to authoritative sources for a
specific subject. The specialist APIs add evidence where their scope applies. Neither a finite
API list nor web search can guarantee a verdict for every claim: private, disputed, ambiguous,
or very new information may remain unverifiable. The system must not invent a correction just
because a user expects the claim to be false.

## Chrome extension

Open Settings and accept the updated privacy notice. Wikipedia, Wikidata and Europe PMC are enabled
by default after consent; every source has an independent toggle. Enable additional sources only
when needed. Existing users must accept consent version 2 before any requests resume.

Google Fact Check and Tavily each have their own password field. Keys are retained in
`chrome.storage.local`, not sync. For Tavily, enter one trusted domain per line, such as `who.int`
or `nih.gov`. Subdomains are included; lookalikes such as `who.int.attacker.org` are excluded by
the provider even if the search API returns them. An empty list searches the general web.

Tavily searches the general web by default when enabled, and the extension provides topic presets:
NASA/ESA for space, WHO/NIH/CDC for health, NOAA/USGS for Earth science, and World Bank/OECD/European
Commission for statistics. Choosing a preset fills the editable domain list; Save applies it.
The All topics preset clears the restriction for general-purpose coverage.
Institutional authority still depends on the topic and the specific passage. Google Fact Check is
discovery of publisher reviews; it is not general Google web search, and Google is not cited as the
author of the underlying facts.

For trusted URLs, enable the source and enter up to ten public HTTPS pages, one per line.
The extension asks for site access only to those origins. It fetches the pages without cookies,
credentials, referrers, or claim queries. Redirects are refused: supply the final HTTPS URL.
Supported inputs are HTML, plain text and Markdown up to 1 MB; PDF, login-only pages, JavaScript-only
pages and other content types are not supported. Pages are fetched on demand and cached briefly.
One failing URL does not discard evidence from another URL in the extension or CLI.

The manifest declares optional HTTPS access so users can choose arbitrary public sites. The extension
never requests the blanket `https://*/*` permission; it requests only the enabled API origins and
the specific trusted URL origins. Revoking a permission skips the source and displays a warning.
Disabling a source stops its requests, even if Chrome still retains a previously granted permission.

## CLI

The CLI stays fully offline unless you explicitly add a network source or judge.

```bash
# Structured dates/numbers plus an independent key-free source
node packages/cli/dist/hf-verify.mjs verify --answer answer.txt --wikidata --europe-pmc

# Evidence from an authoritative page (replace the URL with your source)
node packages/cli/dist/hf-verify.mjs verify --answer answer.txt \
  --evidence-url https://www.who.int/news-room/fact-sheets/detail/healthy-diet

# Publisher reviews: HF_GOOGLE_FACT_CHECK_API_KEY must already be in the environment.
# A model is needed to interpret publisher ratings; the offline judge abstains on reviews.
node packages/cli/dist/hf-verify.mjs verify --answer answer.txt --fact-check \
  --llm local --model qwen2.5:7b

# Extracted web text restricted to selected sources; HF_TAVILY_API_KEY must be set.
node packages/cli/dist/hf-verify.mjs verify --answer answer.txt --tavily \
  --search-domain who.int --search-domain nih.gov

# Space claims: search NASA and ESA, and cite the original institutional page.
node packages/cli/dist/hf-verify.mjs verify --answer answer.txt --tavily \
  --search-domain nasa.gov --search-domain esa.int

# Publication metadata; choose a model to interpret it.
node packages/cli/dist/hf-verify.mjs verify --answer answer.txt --crossref \
  --llm local --model qwen2.5:7b

# Official statistics and government guidance
node packages/cli/dist/hf-verify.mjs verify --answer answer.txt --world-bank --gov-uk \
  --llm local --model qwen2.5:7b
```

Repeat `--evidence-url` for additional pages and combine sources with `--evidence` documents or
`--wikipedia`. `--fail-on-contradiction` still returns exit code 2 when a grounded contradiction
is found. API keys are read only from the environment, never CLI flags.

## SDK / core

All providers implement `EvidenceProvider`, accept an injected `fetch`, and are exported from both
core and the SDK:

```ts
import { verify, WikidataEvidenceProvider, EuropePmcEvidenceProvider,
  UrlEvidenceProvider, TavilyEvidenceProvider } from '@hallucination-firewall/sdk';

const result = await verify({
  answer: 'The Eiffel Tower opened in 1899.',
  providers: [
    new WikidataEvidenceProvider({ fetch }),
    new EuropePmcEvidenceProvider({ fetch }),
    new UrlEvidenceProvider({ fetch, urls: ['https://trusted-site.org/article'] }),
  ],
});
// Inspect result.verdicts[].quotes and result.errors, not only the verdict label.

// Optional extracted web search:
const web = new TavilyEvidenceProvider({ fetch, apiKey, domains: ['who.int', 'nih.gov'] });
```

Use a separate `UrlEvidenceProvider` for each URL if independent URL failures must be isolated,
as the extension and CLI do. When accepting URLs from untrusted callers in a server application,
also enforce DNS/IP egress policy in your fetch implementation; hostname validation alone cannot
prevent a public hostname from resolving to a private address. The core has no Node or browser
dependency and does not perform DNS resolution.

## Evidence integrity and failure handling

- Wikidata uses entity search and batched label lookups, not a broad SPARQL scan. Supported property
  IDs are explicit in `wikidata.ts`. Deprecated statements and unknown values are skipped; preferred
  statements take precedence. Dates retain their declared precision; unsupported calendars are
  skipped. Quantities retain units, uncertainty bounds and qualifiers. Rendered statements are the
  stored passages, and quotes must match those renderings exactly. An inception date is labelled
  as inception, rather than silently treated as an opening date.
- Qualified statistics and quantities (which require unit interpretation) need a model. The offline
  heuristic abstains on these passages rather than comparing mismatched dates or units.
- Google Fact Check returns an attributed review, not a new assertion of the quoted claim. The
  prompt preserves its `review` kind, tells models to interpret the rating and match claim scope,
  and requires citations to quote the full attributed review, including the actual rating. The offline
  heuristic abstains on all reviews and publication metadata. Unknown ratings are not hardcoded
  to a verdict, and no verdict is assigned merely because a search result exists.
- Missing, weak, malformed or unrelated evidence remains `unverifiable`. All surviving supported or
  contradicted verdicts still require exact passage quotes. Corrections retain the existing grounding
  validation. Retrieved passages remain untrusted data rather than instructions to the judge.
- Each new source uses a bounded five-minute cache, shares identical in-flight requests, serializes
  its network requests, and aborts requests after 15 seconds. HTTP 429/503 starts a per-provider
  cooldown honoring numeric or HTTP-date `Retry-After`; invalid/missing headers use 30 seconds.
  Failures are not cached. Wikipedia retains its single retry for short rate limits.
- Provider failures are reported in warnings and `errors`, while other providers continue. API keys
  are sent in headers only to their own API; neither response bodies nor underlying fetch exception
  text is included in provider errors.
- World Bank resolves a single country and a supported indicator without arbitrary numeric mappings.
  It requests an explicitly stated year, or labels the most recent observation with its actual year.
  Null values, ambiguous countries, multiple years and unsupported measures are skipped. The initial
  mappings cover total population, nominal GDP/current US dollars, nominal GDP per capita/current US
  dollars, life expectancy at birth and annual consumer-price inflation. Models must respect units
  and observation dates; the offline heuristic abstains on these records.
- GOV.UK fetches official Content API bodies and guide sections, not search descriptions. Withdrawn
  guidance is skipped, and content paths are restricted to the government origin.

## Tests

`pnpm test` uses fake fetch only: no live network, API keys or source availability are required.
Tests exercise the full claim → retrieval → judge → citation path, Wikimedia 429 fallback, source
permissions and renewed consent, metadata/review interpretation, unsafe URLs, domain lookalikes,
cache expiration, cooldown recovery, timeouts, CLI source selection and key isolation.
Live API coverage and hosted-judge quality are separate checks and are not established by mocks.
