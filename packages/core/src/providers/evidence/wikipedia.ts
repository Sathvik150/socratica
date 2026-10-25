import type { Claim, EvidenceProvider, FetchLike, Passage, RetrieveOptions } from '../../types.js';
import { chunkText, scorePassage, searchQuery } from '../../rank.js';
import { MIN_RELEVANCE } from './documents.js';

/**
 * Wikimedia's API policy requires clients to identify themselves; generic
 * clients get HTTP 403/429. Browsers cannot set User-Agent, so Wikimedia
 * accepts `Api-User-Agent` for that purpose (Node also gets User-Agent).
 */
// Core has no DOM/Node typings; every runtime it targets provides setTimeout.
declare const setTimeout: (callback: () => void, ms: number) => unknown;

export const WIKIMEDIA_CLIENT_ID = 'HallucinationFirewall/0.1 (https://github.com/sathvik150/cac26)';
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
  readonly #fetch: FetchLike;
  readonly #base: string;
  readonly #maxArticles: number;
  readonly #articleCache = new Map<string, Promise<string>>();
  readonly #searchCache = new Map<string, Promise<string[]>>();
  #retryAt = 0;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(opts: WikipediaOptions) {
    this.#fetch = opts.fetch;
    this.#base = `https://${opts.lang ?? 'en'}.wikipedia.org`;
    this.#maxArticles = opts.maxArticles ?? 2;
  }

  #rateLimitError() {
    const seconds = Math.max(1, Math.ceil((this.#retryAt - Date.now()) / 1000));
    return new Error(`Wikipedia is rate-limiting this connection (HTTP 429); try again in ${seconds} seconds`);
  }

  /** Serialize network calls so a 429 also stops requests already in the queue. */
  #get(url: string): ReturnType<FetchLike> {
    const request = this.#queue.then(async () => {
      if (Date.now() < this.#retryAt) throw this.#rateLimitError();
      for (let attempt = 0; ; attempt++) {
        const res = await this.#fetch(url, { headers: WIKI_HEADERS });
        if (res.status !== 429) return res;
        const header = res.headers?.get('retry-after')?.trim();
        const now = Date.now();
        // Retry-After may be delta-seconds or an HTTP date. Invalid/missing
        // values get a conservative cooldown rather than immediate retries.
        const delay = header && /^\d+$/.test(header)
          ? Number(header) * 1000
          : header && /^[A-Za-z]{3},?\s/.test(header) ? Date.parse(header) - now : NaN;
        const wait = Number.isFinite(delay) ? Math.max(500, delay) : 30_000;
        this.#retryAt = now + wait;
        if (attempt > 0 || wait > 5000) throw this.#rateLimitError();
        await new Promise<void>((resolve) => setTimeout(resolve, wait));
      }
    });
    // A rejected request must not poison the queue after the cooldown expires.
    this.#queue = request.catch(() => undefined);
    return request;
  }

  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    const titles = await this.#search(searchQuery(claim));

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

  #search(query: string): Promise<string[]> {
    let cached = this.#searchCache.get(query);
    if (!cached) {
      cached = (async () => {
        const res = await this.#get(
          `${this.#base}/w/api.php?action=query&list=search&format=json&origin=*&srlimit=${this.#maxArticles}&srsearch=${encodeURIComponent(query)}`,
        );
        if (!res.ok) throw new Error(`Wikipedia search failed with HTTP ${res.status}`);
        const data = (await res.json()) as { query?: { search?: Array<{ title: string }> } };
        return [...new Set((data.query?.search ?? []).map((r) => r.title))].slice(0, this.#maxArticles);
      })();
      this.#searchCache.set(query, cached);
      cached.catch(() => {
        if (this.#searchCache.get(query) === cached) this.#searchCache.delete(query);
      });
      if (this.#searchCache.size > 50) this.#searchCache.delete(this.#searchCache.keys().next().value!);
    }
    return cached;
  }

  #article(title: string): Promise<string> {
    let cached = this.#articleCache.get(title);
    if (!cached) {
      cached = (async () => {
        const res = await this.#get(
          `${this.#base}/w/api.php?action=query&prop=extracts&explaintext=1&format=json&origin=*&redirects=1&titles=${encodeURIComponent(title)}`,
        );
        if (!res.ok) throw new Error(`Wikipedia extract failed with HTTP ${res.status}`);
        const data = (await res.json()) as { query?: { pages?: Record<string, { extract?: string }> } };
        return Object.values(data.query?.pages ?? {})[0]?.extract ?? '';
      })();
      this.#articleCache.set(title, cached);
      // Don't cache failures; keep the cache bounded.
      cached.catch(() => {
        if (this.#articleCache.get(title) === cached) this.#articleCache.delete(title);
      });
      if (this.#articleCache.size > 50) this.#articleCache.delete(this.#articleCache.keys().next().value!);
    }
    return cached;
  }
}
