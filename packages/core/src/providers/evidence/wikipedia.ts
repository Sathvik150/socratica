import type { Claim, EvidenceProvider, FetchLike, Passage, RetrieveOptions } from '../../types.js';
import { chunkText, factQueries, factSubject, scorePassage, searchQuery } from '../../rank.js';
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
  /** Searches (one article each) per claim. Default 3. */
  maxArticles?: number;
}

/**
 * Evidence from the public Wikipedia API (no key). Only search queries derived from a claim are
 * sent, never the full conversation.
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
    this.#maxArticles = opts.maxArticles ?? 3;
  }

  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    // Focused searches for each fact ("james webb space telescope launch"), then the claim's subject.
    // Each is one request for the top article's text, cached, so claims about the same thing share them.
    const queries = [...new Set([...factQueries(claim, 2), factSubject(claim)].filter((q): q is string => !!q))];
    if (!queries.length) queries.push(searchQuery(claim));
    const passages: Array<Omit<Passage, 'id'>> = [];
    let failure: unknown;
    for (const query of queries.slice(0, this.#maxArticles)) {
      try { passages.push(...await this.#retrieveFor(query, claim)); }
      catch (err) { failure ??= err; }
    }
    if (!passages.length && failure) throw failure;
    const seen = new Set<string>();
    return passages
      .sort((a, b) => b.score - a.score)
      .filter((p) => !seen.has(p.text) && seen.add(p.text))
      .slice(0, options.limit);
  }

  async #retrieveFor(query: string, claim: Claim): Promise<Array<Omit<Passage, 'id'>>> {
    // generator=search returns the top result's plain-text extract in the same request.
    const data = (await this.#http.json(
      `${this.#base}/w/api.php?action=query&generator=search&gsrlimit=1&prop=extracts&explaintext=1&exlimit=1&redirects=1&format=json&origin=*&gsrsearch=${encodeURIComponent(query)}`,
      { headers: WIKI_HEADERS },
    )) as { query?: { pages?: Record<string, { title?: string; extract?: string }> } };
    const passages: Array<Omit<Passage, 'id'>> = [];
    for (const page of Object.values(data.query?.pages ?? {})) {
      if (!page.title || !page.extract) continue;
      const url = `${this.#base}/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`;
      for (const chunk of chunkText(page.extract)) {
        const score = scorePassage(claim, chunk, page.title);
        if (score >= MIN_RELEVANCE) passages.push({ text: chunk, score, source: { title: page.title, url, providerId: this.id } });
      }
    }
    return passages;
  }
}
