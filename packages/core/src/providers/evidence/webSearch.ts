import type { Claim, EvidenceProvider, FetchLike, Passage, RetrieveOptions } from '../../types.js';
import { scorePassage, webQuery } from '../../rank.js';
import { MIN_RELEVANCE } from './documents.js';
import { count, EvidenceHttp, list, record, text } from './http.js';

/**
 * General web search engines. Passages are the result snippets each engine returns, so every
 * quote stays a verbatim substring of text the engine actually sent. Only the search query
 * derived from a claim leaves the machine, never the conversation.
 */

type Hit = { title: string; url: string; snippet: string };

function toPassages(claim: Claim, hits: Hit[], providerId: string, limit: number): Array<Omit<Passage, 'id'>> {
  const passages: Array<Omit<Passage, 'id'>> = [];
  for (const hit of hits) {
    if (!/^https?:\/\//i.test(hit.url)) continue;
    const snippet = cleanSnippet(hit.snippet);
    if (!snippet) continue;
    const score = scorePassage(claim, snippet, hit.title);
    if (score >= MIN_RELEVANCE) passages.push({ text: snippet, score, source: { title: hit.title || hit.url, url: hit.url, providerId } });
  }
  return passages.sort((a, b) => b.score - a.score).slice(0, limit);
}

function cleanSnippet(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface FirecrawlSearchOptions {
  fetch: FetchLike;
  /**
   * Optional. Firecrawl answers without a key on most networks (free, capped per IP address per day).
   * Its no-key tier refuses VPN, proxy and IPv6 addresses, where `DuckDuckGoEvidenceProvider` is the
   * keyless backup; a free key works from anywhere.
   */
  apiKey?: string;
  /** Results per search, 1-20. Default 5. */
  count?: number;
}

const FIRECRAWL_KEY_HINT = 'The other sources were still used. A free Firecrawl key (optional; sign up with Google or GitHub at firecrawl.dev) adds full web results on this network.';

/** What a Firecrawl error status means, and what to do about it. */
export function firecrawlError(status: number, hasKey: boolean): string | undefined {
  if (!hasKey) {
    // Firecrawl's no-key tier answers 403 for addresses it judges to be a VPN or proxy, and 401 for
    // IPv6 addresses (its per-address caps can't be enforced there).
    if (status === 401 || status === 403) return `Firecrawl's free tier doesn't search from this network (HTTP ${status}): it turns away VPN, proxy and IPv6 connections. ${FIRECRAWL_KEY_HINT}`;
    if (status === 429 || status === 402) return `Firecrawl's free searches for this network are used up for today (HTTP ${status}). ${FIRECRAWL_KEY_HINT}`;
    return undefined;
  }
  if (status === 401) return 'Firecrawl rejected the API key (HTTP 401). Check the key in Settings.';
  if (status === 402) return 'Your Firecrawl key has run out of credits (HTTP 402). Top it up at firecrawl.dev, or choose another engine in Settings.';
  if (status === 403) return 'Firecrawl refused the request for this key (HTTP 403). Check the key and its plan at firecrawl.dev.';
  return undefined;
}

/**
 * Web search through Firecrawl's search API. Works without an account or key on most networks,
 * which is why it is the default engine. https://docs.firecrawl.dev/api-reference/endpoint/search
 */
export class FirecrawlSearchEvidenceProvider implements EvidenceProvider {
  readonly id = 'firecrawl';
  readonly #http: EvidenceHttp;
  readonly #key: string;
  readonly #count: number;

  constructor(opts: FirecrawlSearchOptions) {
    this.#key = opts.apiKey?.trim() ?? '';
    const hasKey = Boolean(this.#key);
    this.#http = new EvidenceHttp('Firecrawl', opts.fetch, false, 2, (status) => firecrawlError(status, hasKey));
    this.#count = count(opts.count);
  }

  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    const data = record(await this.#http.json('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.#key ? { authorization: `Bearer ${this.#key}` } : {}) },
      body: JSON.stringify({ query: webQuery(claim), limit: this.#count }),
    }));
    // v2 nests web results under data.web; v1 returned them as data[].
    const results = Array.isArray(data.data) ? data.data : list(record(data.data).web);
    const hits = results.map(record).map((r) => ({ title: text(r.title), url: text(r.url), snippet: text(r.description) }));
    return toPassages(claim, hits, this.id, options.limit);
  }
}

export interface SerperOptions {
  fetch: FetchLike;
  /** The user's own Serper key (free sign-up, 2,500 searches). Never bundled. */
  apiKey: string;
  /** Results per search, 1-20. Default 5. */
  count?: number;
}

/**
 * Google web results through Serper (https://serper.dev). Uses the answer box and knowledge
 * panel text when Google shows one, then the organic result snippets.
 */
export class SerperEvidenceProvider implements EvidenceProvider {
  readonly id = 'serper';
  readonly #http: EvidenceHttp;
  readonly #key: string;
  readonly #count: number;

  constructor(opts: SerperOptions) {
    if (!opts.apiKey?.trim()) throw new Error('Serper requires an API key.');
    this.#http = new EvidenceHttp('Serper', opts.fetch, false, 3);
    this.#key = opts.apiKey.trim();
    this.#count = count(opts.count);
  }

  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    const data = record(await this.#http.json('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.#key },
      body: JSON.stringify({ q: webQuery(claim), num: this.#count }),
    }));
    return toPassages(claim, serperHits(data, this.#count), this.id, options.limit);
  }
}

/** Serper's answer box and knowledge panel (when Google shows them), then its result snippets. */
function serperHits(data: Record<string, unknown>, max: number): Hit[] {
  const hits: Hit[] = [];
  const box = record(data.answerBox);
  if (text(box.link)) hits.push({ title: text(box.title), url: text(box.link), snippet: text(box.snippet) || text(box.answer) });
  const panel = record(data.knowledgeGraph);
  if (text(panel.descriptionLink)) hits.push({ title: text(panel.title), url: text(panel.descriptionLink), snippet: text(panel.description) });
  for (const item of list(data.organic).slice(0, max)) {
    const r = record(item);
    hits.push({ title: text(r.title), url: text(r.link), snippet: text(r.snippet) });
  }
  return hits;
}

/** Socratica's own search relay (the `relay/` folder, on Vercel): Google results via Serper, with no key for the user. */
export const SOCRATICA_RELAY_URL = 'https://socratica-search.vercel.app/api/search';

export interface SocraticaSearchOptions {
  fetch: FetchLike;
  /** Another deployment of the relay. Default `SOCRATICA_RELAY_URL`. */
  relayUrl?: string;
}

/** What a relay error status means for the user. A busy relay (429) gets the usual "try again in N seconds". */
export function relayError(status: number): string | undefined {
  // 404: no relay deployed at this address yet.
  if (status === 503 || status === 502 || status === 504 || status === 404) return `Socratica's shared search is unavailable right now (HTTP ${status}). The other sources were still used.`;
  return undefined;
}

/**
 * Web search through Socratica's relay, the default engine: nobody needs a key. Only the
 * claim-derived query is sent; the relay forwards it to Serper and keeps no log of it.
 */
export class SocraticaSearchEvidenceProvider implements EvidenceProvider {
  readonly id = 'socratica';
  readonly #http: EvidenceHttp;
  readonly #url: string;

  constructor(opts: SocraticaSearchOptions) {
    this.#url = opts.relayUrl ?? SOCRATICA_RELAY_URL;
    if (!/^https:\/\/[^/]+\/./.test(this.#url)) throw new Error('The search relay URL must be an https:// address.');
    this.#http = new EvidenceHttp('Socratica search', opts.fetch, false, 3, relayError);
  }

  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    const data = record(await this.#http.json(this.#url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: webQuery(claim) }),
    }));
    return toPassages(claim, serperHits(data, 5), this.id, options.limit);
  }
}

export interface BraveSearchOptions {
  /** The user's own Brave Search API key. Never bundled. */
  apiKey: string;
  fetch: FetchLike;
  /** Results per search, 1-20. Default 5. */
  count?: number;
}

/** Web search through the Brave Search API, using the user's own key. */
export class BraveSearchEvidenceProvider implements EvidenceProvider {
  readonly id = 'brave';
  readonly #http: EvidenceHttp;
  readonly #key: string;
  readonly #count: number;

  constructor(opts: BraveSearchOptions) {
    if (!opts.apiKey?.trim()) throw new Error('Brave Search requires an API key.');
    // Brave's free plan allows about one request per second.
    this.#http = new EvidenceHttp('Brave Search', opts.fetch, true, 1);
    this.#key = opts.apiKey.trim();
    this.#count = count(opts.count);
  }

  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    const q = encodeURIComponent(webQuery(claim));
    const data = record(await this.#http.json(`https://api.search.brave.com/res/v1/web/search?count=${this.#count}&q=${q}`, {
      headers: { accept: 'application/json', 'x-subscription-token': this.#key },
    }));
    const hits: Hit[] = [];
    for (const item of list(record(data.web).results)) {
      const r = record(item);
      for (const snippet of [text(r.description), ...list(r.extra_snippets).map(text)]) {
        hits.push({ title: text(r.title), url: text(r.url), snippet });
      }
    }
    return toPassages(claim, hits, this.id, options.limit);
  }
}

/** The engines a user can pick from, with what each one needs. */
export const WEB_SEARCH_ENGINES = {
  socratica: { name: 'Socratica search', keyRequired: false, origin: 'https://socratica-search.vercel.app/*', signup: '' },
  firecrawl: { name: 'Firecrawl', keyRequired: false, origin: 'https://api.firecrawl.dev/*', signup: 'https://www.firecrawl.dev/app/api-keys' },
  serper: { name: 'Google (via Serper)', keyRequired: true, origin: 'https://google.serper.dev/*', signup: 'https://serper.dev' },
  brave: { name: 'Brave Search', keyRequired: true, origin: 'https://api.search.brave.com/*', signup: 'https://brave.com/search/api/' },
} as const;
export type WebSearchEngine = keyof typeof WEB_SEARCH_ENGINES;

/** Build the chosen engine. Throws a plain-language error when a required key is missing. */
export function createWebSearch(engine: WebSearchEngine, opts: { fetch: FetchLike; apiKey?: string; relayUrl?: string }): EvidenceProvider {
  const apiKey = opts.apiKey?.trim() ?? '';
  if (WEB_SEARCH_ENGINES[engine].keyRequired && !apiKey) {
    throw new Error(`${WEB_SEARCH_ENGINES[engine].name} needs an API key (free sign-up at ${WEB_SEARCH_ENGINES[engine].signup}), or choose Socratica search, which needs none.`);
  }
  switch (engine) {
    case 'socratica': return new SocraticaSearchEvidenceProvider({ fetch: opts.fetch, ...(opts.relayUrl ? { relayUrl: opts.relayUrl } : {}) });
    case 'firecrawl': return new FirecrawlSearchEvidenceProvider({ fetch: opts.fetch, ...(apiKey ? { apiKey } : {}) });
    case 'serper': return new SerperEvidenceProvider({ fetch: opts.fetch, apiKey });
    case 'brave': return new BraveSearchEvidenceProvider({ fetch: opts.fetch, apiKey });
  }
}
