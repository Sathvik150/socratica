import type { Claim, EvidenceProvider, FetchLike, Passage, RetrieveOptions } from '../../types.js';
import { chunkText, scorePassage, searchQuery } from '../../rank.js';
import { MIN_RELEVANCE } from './documents.js';

/**
 * Wikimedia's API policy requires clients to identify themselves; generic
 * clients get HTTP 403/429. Browsers cannot set User-Agent, so Wikimedia
 * accepts `Api-User-Agent` for that purpose (Node also gets User-Agent).
 */
// Core has no DOM/Node typings; every runtime it targets provides setTimeout.
declare const setTimeout: (callback: () => void, ms: number) => unknown;

export const WIKIMEDIA_CLIENT_ID = 'HallucinationFirewall/0.1 (https://github.com/sathvik150/cac26)';
const WIKI_HEADERS = { 'api-user-agent': WIKIMEDIA_CLIENT_ID, 'user-agent': WIKIMEDIA_CLIENT_ID };

export interface WikipediaOptions {
  fetch: FetchLike;
  /** Wikipedia language subdomain. Default `en`. Must match the extension's host permissions. */
  lang?: string;
  /** Articles fetched per claim. Default 2. */
  maxArticles?: number;
}

/**
 * Evidence from the public Wikipedia API (no key). Only the search query
 * derived from a claim is sent, never the full conversation.
 */
export class WikipediaEvidenceProvider implements EvidenceProvider {
  readonly id = 'wikipedia';
  readonly #fetch: FetchLike;
  readonly #base: string;
  readonly #maxArticles: number;
  readonly #articleCache = new Map<string, Promise<string>>();

  constructor(opts: WikipediaOptions) {
    this.#fetch = opts.fetch;
    this.#base = `https://${opts.lang ?? 'en'}.wikipedia.org`;
    this.#maxArticles = opts.maxArticles ?? 2;
  }

  /** GET with Wikimedia headers; on HTTP 429 honors a short Retry-After (<= 5 s) once, then gives up. */
  async #get(url: string) {
    let res = await this.#fetch(url, { headers: WIKI_HEADERS });
    if (res.status === 429) {
      const retryAfter = Number(res.headers?.get('retry-after') ?? '1');
      if (Number.isFinite(retryAfter) && retryAfter <= 5) {
        await new Promise<void>((r) => setTimeout(() => r(), Math.max(0.5, retryAfter) * 1000));
        res = await this.#fetch(url, { headers: WIKI_HEADERS });
      }
    }
    return res;
  }

  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    const q = encodeURIComponent(searchQuery(claim));
    const res = await this.#get(
      `${this.#base}/w/api.php?action=query&list=search&format=json&origin=*&srlimit=${this.#maxArticles}&srsearch=${q}`,
    );
    if (!res.ok) throw new Error(`Wikipedia search failed with HTTP ${res.status}`);
    const data = (await res.json()) as { query?: { search?: Array<{ title: string }> } };
    const titles = (data.query?.search ?? []).map((r) => r.title).slice(0, this.#maxArticles);

    const passages: Array<Omit<Passage, 'id'>> = [];
    for (const title of titles) {
      const text = await this.#article(title);
      const url = `${this.#base}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
      for (const chunk of chunkText(text)) {
        const score = scorePassage(claim, chunk);
        if (score >= MIN_RELEVANCE) passages.push({ text: chunk, score, source: { title, url, providerId: this.id } });
      }
    }
    return passages.sort((a, b) => b.score - a.score).slice(0, options.limit);
  }

  #article(title: string): Promise<string> {
    let cached = this.#articleCache.get(title);
    if (!cached) {
      cached = (async () => {
        const res = await this.#get(
          `${this.#base}/w/api.php?action=query&prop=extracts&explaintext=1&format=json&origin=*&redirects=1&titles=${encodeURIComponent(title)}`,
        );
        if (!res.ok) throw new Error(`Wikipedia extract failed with HTTP ${res.status}`);
        const data = (await res.json()) as { query?: { pages?: Record<string, { extract?: string }> } };
        return Object.values(data.query?.pages ?? {})[0]?.extract ?? '';
      })();
      this.#articleCache.set(title, cached);
      // Don't cache failures; keep the cache bounded.
      cached.catch(() => this.#articleCache.delete(title));
      if (this.#articleCache.size > 50) this.#articleCache.delete(this.#articleCache.keys().next().value!);
    }
    return cached;
  }
}
