import type { Claim, EvidenceProvider, FetchLike, Passage, RetrieveOptions } from '../../types.js';
import { chunkText, factSubject, scorePassage, searchQuery } from '../../rank.js';
import { MIN_RELEVANCE } from './documents.js';
import { EvidenceHttp, list, record, text } from './http.js';

export interface DuckDuckGoOptions { fetch: FetchLike }

/**
 * DuckDuckGo's Instant Answer API (https://duckduckgo.com/api): free, keyless and without documented
 * network limits, so it backs up keyless Firecrawl wherever Firecrawl's free tier refuses to search (VPNs,
 * proxies, IPv6, a used-up daily allowance). It answers with a short summary of the named thing a
 * claim is about (usually from Wikipedia) and related topics, not full web results.
 */
export class DuckDuckGoEvidenceProvider implements EvidenceProvider {
  readonly id = 'duckduckgo';
  readonly #http: EvidenceHttp;

  constructor(opts: DuckDuckGoOptions) {
    this.#http = new EvidenceHttp('DuckDuckGo', opts.fetch, false, 2);
  }

  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    // Instant answers are about named things, so ask about the claim's subject ("james webb space telescope").
    const query = factSubject(claim) ?? searchQuery(claim);
    const data = record(await this.#http.json(
      `https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&no_redirect=1&t=socratica&q=${encodeURIComponent(query)}`,
    ));
    const heading = text(data.Heading) || query;
    const found: Array<{ text: string; title: string; url: string }> = [];
    const summaryUrl = text(data.AbstractURL);
    if (/^https?:\/\//i.test(summaryUrl)) {
      const from = text(data.AbstractSource);
      for (const chunk of chunkText(text(data.AbstractText))) found.push({ text: chunk, title: from ? `${heading} (${from}, via DuckDuckGo)` : heading, url: summaryUrl });
    }
    for (const item of list(data.RelatedTopics)) {
      const topic = record(item);
      const url = text(topic.FirstURL);
      if (text(topic.Text) && /^https?:\/\//i.test(url)) found.push({ text: text(topic.Text), title: `${heading}, related (DuckDuckGo)`, url });
    }
    const passages: Array<Omit<Passage, 'id'>> = [];
    for (const f of found) {
      const score = scorePassage(claim, f.text);
      if (score >= MIN_RELEVANCE) passages.push({ text: f.text, score, source: { title: f.title, url: f.url, providerId: this.id } });
    }
    return passages.sort((a, b) => b.score - a.score).slice(0, options.limit);
  }
}
