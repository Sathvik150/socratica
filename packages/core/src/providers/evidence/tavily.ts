import type { Claim, EvidenceProvider, FetchLike, Passage, RetrieveOptions } from '../../types.js';
import { chunkText, scorePassage, searchQuery } from '../../rank.js';
import { MIN_RELEVANCE } from './documents.js';
import { count, EvidenceHttp, list, record, text } from './http.js';
import { trustedDomains, trustedUrl } from './urls.js';

export interface TavilyOptions { fetch: FetchLike; apiKey: string; count?: number; domains?: string[] }

export class TavilyEvidenceProvider implements EvidenceProvider {
  readonly id = 'tavily';
  readonly #http: EvidenceHttp;
  readonly #key: string;
  readonly #count: number;
  readonly #domains: string[];
  constructor(opts: TavilyOptions) {
    if (!opts.apiKey.trim()) throw new Error('Tavily requires an API key.');
    this.#http = new EvidenceHttp('Tavily', opts.fetch, false, 3);
    this.#key = opts.apiKey;
    this.#count = count(opts.count);
    this.#domains = trustedDomains(opts.domains ?? []);
  }

  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    const data = record(await this.#http.json('https://api.tavily.com/search', {
      method: 'POST', headers: { authorization: `Bearer ${this.#key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: searchQuery(claim), max_results: this.#count, include_raw_content: 'text', include_answer: false, search_depth: 'basic', ...(this.#domains.length ? { include_domains: this.#domains } : {}) }),
    }));
    const passages: Array<Omit<Passage, 'id'>> = [];
    for (const item of list(data.results)) {
      const r = record(item);
      const url = text(r.url);
      if (!/^https?:\/\//i.test(url)) continue;
      // Enforce the restriction locally as well as asking the search service to honor it.
      if (this.#domains.length) {
        let origin;
        try { origin = trustedUrl(url).origin; } catch { continue; }
        const host = origin.slice('https://'.length, -2).toLowerCase().replace(/\.$/, '');
        if (!this.#domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) continue;
      }
      // Only extracted page text, never Tavily's generated answer or a snippet fallback.
      for (const chunk of chunkText(text(r.raw_content))) {
        const score = scorePassage(claim, chunk);
        if (score >= MIN_RELEVANCE) passages.push({ text: chunk, score, source: { title: text(r.title) || url, url, providerId: this.id } });
      }
    }
    return passages.sort((a, b) => b.score - a.score).slice(0, options.limit);
  }
}
