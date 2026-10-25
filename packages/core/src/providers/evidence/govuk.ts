import type { Claim, EvidenceProvider, FetchLike, Passage, RetrieveOptions } from '../../types.js';
import { chunkText, scorePassage, searchQuery } from '../../rank.js';
import { MIN_RELEVANCE } from './documents.js';
import { count, EvidenceHttp, list, record, text } from './http.js';
import { htmlText } from './urls.js';

export interface GovUkOptions { fetch: FetchLike; count?: number }

/** The UK government's public Search and Content APIs; evidence is body text, not search snippets. */
export class GovUkEvidenceProvider implements EvidenceProvider {
  readonly id = 'gov-uk';
  readonly #http: EvidenceHttp;
  readonly #count: number;
  constructor(opts: GovUkOptions) { this.#http = new EvidenceHttp('GOV.UK', opts.fetch); this.#count = count(opts.count, 2); }

  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    const search = record(await this.#http.json(`https://www.gov.uk/api/search.json?count=${this.#count}&q=${encodeURIComponent(searchQuery(claim))}`));
    const passages: Array<Omit<Passage, 'id'>> = [];
    for (const result of list(search.results).slice(0, this.#count)) {
      const r = record(result), path = text(r.link);
      // Content API paths must remain within this fixed origin; never follow an API-supplied URL.
      if (!/^\/[a-z0-9][a-z0-9/_-]*$/i.test(path)) continue;
      const data = record(await this.#http.json(`https://www.gov.uk/api/content${path}`));
      if (record(data.withdrawn_notice).explanation || data.withdrawn_notice) continue;
      const details = record(data.details);
      // Guide sections have their own section URL; other content formats have a body.
      const bodies = [
        { text: text(details.body), url: `https://www.gov.uk${path}` },
        ...list(details.parts).map((p) => {
          const part = record(p), slug = text(part.slug);
          return { text: text(part.body), url: /^[a-z0-9_-]+$/i.test(slug) ? `https://www.gov.uk${path}/${slug}` : `https://www.gov.uk${path}` };
        }),
      ];
      for (const body of bodies) for (const chunk of chunkText(htmlText(body.text))) {
        const score = scorePassage(claim, chunk);
        if (score >= MIN_RELEVANCE) passages.push({ text: chunk, score, source: { title: text(data.title) || text(r.title) || path, url: body.url, providerId: this.id } });
      }
    }
    return passages.sort((a, b) => b.score - a.score).slice(0, options.limit);
  }
}
