import type { Claim, EvidenceProvider, FetchLike, Passage, RetrieveOptions } from '../../types.js';
import { scorePassage, searchQuery } from '../../rank.js';
import { MIN_RELEVANCE } from './documents.js';

export interface BraveSearchOptions {
  /** The user's own Brave Search API key. Never bundled. */
  apiKey: string;
  fetch: FetchLike;
  count?: number;
}

/** Optional web-search evidence via the Brave Search API, using the user's own key. Passages are result snippets. */
export class BraveSearchEvidenceProvider implements EvidenceProvider {
  readonly id = 'web-search';
  readonly #opts: Required<BraveSearchOptions>;

  constructor(opts: BraveSearchOptions) {
    if (!opts.apiKey) throw new Error('BraveSearchEvidenceProvider: an API key is required');
    this.#opts = { count: 5, ...opts };
  }

  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    const q = encodeURIComponent(searchQuery(claim));
    const res = await this.#opts.fetch(`https://api.search.brave.com/res/v1/web/search?count=${this.#opts.count}&q=${q}`, {
      headers: { accept: 'application/json', 'x-subscription-token': this.#opts.apiKey },
    });
    if (!res.ok) throw new Error(`Web search failed with HTTP ${res.status}`);
    const data = (await res.json()) as {
      web?: { results?: Array<{ title: string; url: string; description?: string; extra_snippets?: string[] }> };
    };
    const passages: Array<Omit<Passage, 'id'>> = [];
    for (const r of data.web?.results ?? []) {
      for (const snippet of [r.description ?? '', ...(r.extra_snippets ?? [])]) {
        const text = stripTags(snippet);
        if (!text) continue;
        const score = scorePassage(claim, text);
        if (score >= MIN_RELEVANCE) passages.push({ text, score, source: { title: r.title, url: r.url, providerId: this.id } });
      }
    }
    return passages.sort((a, b) => b.score - a.score).slice(0, options.limit);
  }
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}
