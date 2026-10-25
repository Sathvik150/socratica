import type { Claim, EvidenceProvider, FetchLike, Passage, RetrieveOptions } from '../../types.js';
import { chunkText, scorePassage, searchQuery } from '../../rank.js';
import { MIN_RELEVANCE } from './documents.js';
import { htmlText } from './urls.js';
import { count, EvidenceHttp, list, record, text } from './http.js';

export interface ScholarlyOptions { fetch: FetchLike; count?: number }

/** Europe PMC core search returns biomedical abstracts in the search response (no per-paper fetch). */
export class EuropePmcEvidenceProvider implements EvidenceProvider {
  readonly id = 'europe-pmc';
  readonly #http: EvidenceHttp;
  readonly #count: number;
  constructor(opts: ScholarlyOptions) { this.#http = new EvidenceHttp('Europe PMC', opts.fetch, false, 4); this.#count = count(opts.count); }
  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    const data = record(await this.#http.json(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&resultType=core&pageSize=${this.#count}&query=${encodeURIComponent(searchQuery(claim))}`));
    const passages: Array<Omit<Passage, 'id'>> = [];
    for (const item of list(record(data.resultList).result)) {
      const r = record(item);
      const id = text(r.id), source = text(r.source);
      if (!id || !source) continue;
      for (const chunk of chunkText(htmlText(text(r.abstractText)))) {
        const score = scorePassage(claim, chunk);
        if (score >= MIN_RELEVANCE) passages.push({ text: chunk, score, source: { title: text(r.title) || id, url: `https://europepmc.org/article/${encodeURIComponent(source)}/${encodeURIComponent(id)}`, providerId: this.id } });
      }
    }
    return passages.sort((a, b) => b.score - a.score).slice(0, options.limit);
  }
}
