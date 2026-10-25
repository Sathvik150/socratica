import type { Claim, EvidenceProvider, FetchLike, Passage, RetrieveOptions } from '../../types.js';
import { scorePassage, searchQuery } from '../../rank.js';
import { MIN_RELEVANCE } from './documents.js';
import { count, EvidenceHttp, list, record, text } from './http.js';

export interface GoogleFactCheckOptions { fetch: FetchLike; apiKey: string; count?: number }

/** ClaimReview records are attributed reviews, never assertions that the reviewed claim is true. */
export class GoogleFactCheckEvidenceProvider implements EvidenceProvider {
  readonly id = 'google-fact-check';
  readonly #http: EvidenceHttp;
  readonly #count: number;
  readonly #key: string;
  constructor(opts: GoogleFactCheckOptions) {
    if (!opts.apiKey.trim()) throw new Error('Google Fact Check requires an API key.');
    this.#http = new EvidenceHttp('Google Fact Check', opts.fetch);
    this.#key = opts.apiKey;
    this.#count = count(opts.count);
  }

  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    const data = record(await this.#http.json(`https://factchecktools.googleapis.com/v1alpha1/claims:search?languageCode=en&pageSize=${this.#count}&query=${encodeURIComponent(searchQuery(claim))}`, {
      headers: { accept: 'application/json', 'x-goog-api-key': this.#key },
    }));
    const passages: Array<Omit<Passage, 'id'>> = [];
    for (const item of list(data.claims)) {
      const row = record(item);
      const reviewed = text(row.text);
      if (!reviewed) continue;
      const score = scorePassage(claim, reviewed);
      if (score < MIN_RELEVANCE) continue;
      for (const review of list(row.claimReview)) {
        const r = record(review);
        const publisher = text(record(r.publisher).name);
        const rating = text(r.textualRating);
        const url = text(r.url);
        if (!publisher || !rating || !/^https:\/\//i.test(url)) continue;
        // Stable rendering of API fields; rating and claim remain verbatim JSON strings.
        const rendered = `Publisher: ${publisher}\nReviewed claim: ${JSON.stringify(reviewed)}\nPublisher rating: ${JSON.stringify(rating)}${text(r.reviewDate) ? `\nReview date: ${text(r.reviewDate)}` : ''}`;
        passages.push({ text: rendered, score, source: { title: text(r.title) || `${publisher} fact check`, url, providerId: this.id, kind: 'review' } });
      }
    }
    return passages.sort((a, b) => b.score - a.score).slice(0, options.limit);
  }
}
