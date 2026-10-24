import type { Claim, EvidenceProvider, FetchLike, Passage, RetrieveOptions } from '../../types.js';
import { chunkText, scorePassage, searchQuery } from '../../rank.js';
import { MIN_RELEVANCE } from './documents.js';

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

  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    const q = encodeURIComponent(searchQuery(claim));
    const res = await this.#fetch(
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
        const res = await this.#fetch(
          `${this.#base}/w/api.php?action=query&prop=extracts&explaintext=1&format=json&origin=*&redirects=1&titles=${encodeURIComponent(title)}`,
        );
        if (!res.ok) throw new Error(`Wikipedia extract failed with HTTP ${res.status}`);
        const data = (await res.json()) as { query?: { pages?: Record<string, { extract?: string }> } };
        return Object.values(data.query?.pages ?? {})[0]?.extract ?? '';
      })();
      this.#articleCache.set(title, cached);
    }
    return cached;
  }
}
