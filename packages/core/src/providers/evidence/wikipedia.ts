import type { Claim, EvidenceProvider, FetchLike, Passage, RetrieveOptions } from '../../types.js';
import { chunkText, scorePassage, searchQuery, subjectQuery } from '../../rank.js';
import { MIN_RELEVANCE } from './documents.js';
import { EvidenceHttp } from './http.js';

/**
 * Wikimedia's API policy requires clients to identify themselves; generic
 * clients get HTTP 403/429. Browsers cannot set User-Agent, so Wikimedia
 * accepts `Api-User-Agent` for that purpose (Node also gets User-Agent).
 */

export const WIKIMEDIA_CLIENT_ID = 'Socratica/0.1 (https://github.com/sathvik150/cac26)';
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
  readonly #http: EvidenceHttp;
  readonly #base: string;
  readonly #maxArticles: number;

  constructor(opts: WikipediaOptions) {
    // Wikimedia asks API clients to send requests one at a time.
    this.#http = new EvidenceHttp('Wikipedia', opts.fetch, true);
    this.#base = `https://${opts.lang ?? 'en'}.wikipedia.org`;
    this.#maxArticles = opts.maxArticles ?? 2;
  }

  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    // Search by subject first: claims about the same thing share one cached search and
    // article, which cuts requests (and rate-limit pressure) for a typical answer several-fold.
    const subject = subjectQuery(claim);
    if (subject) {
      const found = await this.#retrieveFor(subject, claim, options);
      if (found.length) return found;
    }
    return this.#retrieveFor(searchQuery(claim), claim, options);
  }

  async #retrieveFor(query: string, claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    const q = encodeURIComponent(query);
    const data = (await this.#http.json(
      `${this.#base}/w/api.php?action=query&list=search&format=json&origin=*&srlimit=${this.#maxArticles}&srsearch=${q}`,
      { headers: WIKI_HEADERS },
    )) as { query?: { search?: Array<{ title: string }> } };
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

  async #article(title: string): Promise<string> {
    const data = (await this.#http.json(
      `${this.#base}/w/api.php?action=query&prop=extracts&explaintext=1&format=json&origin=*&redirects=1&titles=${encodeURIComponent(title)}`,
      { headers: WIKI_HEADERS },
    )) as { query?: { pages?: Record<string, { extract?: string }> } };
    return Object.values(data.query?.pages ?? {})[0]?.extract ?? '';
  }
}
