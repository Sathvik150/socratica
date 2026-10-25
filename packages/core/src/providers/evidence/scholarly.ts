import type { Claim, EvidenceProvider, FetchLike, Passage, RetrieveOptions } from '../../types.js';
import { chunkText, scorePassage, searchQuery } from '../../rank.js';
import { MIN_RELEVANCE } from './documents.js';
import { htmlText } from './urls.js';
import { contentTokens } from '../../text.js';
import { count, EvidenceHttp, list, record, text } from './http.js';

export interface ScholarlyOptions { fetch: FetchLike; count?: number }

/** Europe PMC core search returns biomedical abstracts in the search response (no per-paper fetch). */
export class EuropePmcEvidenceProvider implements EvidenceProvider {
  readonly id = 'europe-pmc';
  readonly #http: EvidenceHttp;
  readonly #count: number;
  constructor(opts: ScholarlyOptions) { this.#http = new EvidenceHttp('Europe PMC', opts.fetch); this.#count = count(opts.count); }
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

/** Crossref supplies publication metadata, not evidence for the findings described in a title. */
export class CrossrefEvidenceProvider implements EvidenceProvider {
  readonly id = 'crossref';
  readonly #http: EvidenceHttp;
  readonly #count: number;
  constructor(opts: ScholarlyOptions) { this.#http = new EvidenceHttp('Crossref', opts.fetch); this.#count = count(opts.count); }
  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    const expectedTitle = /["“]([^"”]{8,})["”]/.exec(claim.text)?.[1] ??
      /^(?:(?:the\s+)?(?:paper|article|study|book)\s+)?(.+?)\s+was\s+published\b/i.exec(claim.text)?.[1];
    const query = expectedTitle ?? searchQuery(claim).replace(/\b\d{4}\b/g, '').trim();
    const field = expectedTitle ? 'query.title' : 'query.bibliographic';
    const data = record(await this.#http.json(`https://api.crossref.org/works?rows=${this.#count}&${field}=${encodeURIComponent(query)}`));
    const passages: Array<Omit<Passage, 'id'>> = [];
    for (const item of list(record(data.message).items)) {
      const r = record(item);
      const title = text(list(r.title)[0]), doi = text(r.DOI);
      if (!title || !doi) continue;
      if (expectedTitle && contentTokens(title).join(' ') !== contentTokens(expectedTitle).join(' ')) continue;
      const authors = list(r.author).map((a) => { const v = record(a); return [text(v.given), text(v.family)].filter(Boolean).join(' '); }).filter(Boolean);
      const date = list(list(record(r.published)['date-parts'])[0]).filter((n) => typeof n === 'number').join('-');
      const rendered = [`Title: ${title}`, `DOI: ${doi}`, authors.length ? `Authors: ${authors.join(', ')}` : '', date ? `Published: ${date}` : '', text(list(r['container-title'])[0]) ? `Journal: ${text(list(r['container-title'])[0])}` : ''].filter(Boolean).join('\n');
      const score = scorePassage(claim, rendered);
      if (score >= MIN_RELEVANCE) passages.push({ text: rendered, score, source: { title, url: `https://doi.org/${encodeURI(doi)}`, providerId: this.id, kind: 'metadata' } });
    }
    return passages.sort((a, b) => b.score - a.score).slice(0, options.limit);
  }
}
