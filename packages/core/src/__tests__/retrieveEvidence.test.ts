import { describe, expect, it } from 'vitest';
import {
  BraveSearchEvidenceProvider,
  DocumentEvidenceProvider,
  WikipediaEvidenceProvider,
  chunkText,
  extractClaims,
  retrieveEvidence,
  type EvidenceProvider,
  type FetchLike,
} from '../index.js';

const docs = [
  { title: 'Zentha Bridge', url: 'https://example.test/zentha', text: 'The Zentha Bridge is a suspension bridge in Velmora. It opened to traffic in 1991. Its main span is 1,240 meters long.' },
  { title: 'Velmora cuisine', text: 'Velmoran cooking relies on smoked river fish and barley bread.' },
];

describe('chunkText', () => {
  it('produces verbatim, overlapping windows', () => {
    const text = 'One a. Two b. Three c. Four d. Five e.';
    const chunks = chunkText(text, 2);
    for (const c of chunks) expect(text.includes(c)).toBe(true);
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe('retrieveEvidence', () => {
  it('ranks relevant document passages and assigns traceable ids', async () => {
    const claims = extractClaims('The Zentha Bridge opened in 1987.');
    const ev = await retrieveEvidence(claims, [new DocumentEvidenceProvider(docs)], { limit: 3 });
    const passages = ev.byClaim[claims[0]!.id]!;
    expect(passages.length).toBeGreaterThan(0);
    expect(passages[0]!.source.title).toBe('Zentha Bridge');
    expect(ev.passages[passages[0]!.id]).toBe(passages[0]);
    expect(passages.some((p) => p.source.title === 'Velmora cuisine')).toBe(false);
  });

  it('returns no passages for an unrelated claim', async () => {
    const claims = extractClaims('The Harlow Observatory was built on Mount Teague in 1904.');
    const ev = await retrieveEvidence(claims, [new DocumentEvidenceProvider(docs)]);
    expect(ev.byClaim[claims[0]!.id]).toEqual([]);
  });

  it('tolerates a failing provider and records the error', async () => {
    const broken: EvidenceProvider = { id: 'broken', retrieve: async () => { throw new Error('boom'); } };
    const claims = extractClaims('The Zentha Bridge opened in 1987.');
    const ev = await retrieveEvidence(claims, [broken, new DocumentEvidenceProvider(docs)]);
    expect(ev.errors).toEqual([{ providerId: 'broken', claimId: 'c1', message: 'boom' }]);
    expect(ev.byClaim.c1!.length).toBeGreaterThan(0);
  });
});

function fakeFetch(routes: Array<[RegExp, unknown]>, calls: Array<{ url: string; headers?: Record<string, string> }> = []): FetchLike {
  return async (url, init) => {
    calls.push({ url, ...(init?.headers ? { headers: init.headers } : {}) });
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    return { ok: true, status: 200, json: async () => hit[1], text: async () => JSON.stringify(hit[1]) };
  };
}

describe('WikipediaEvidenceProvider (fake fetch, no network)', () => {
  it('searches, fetches extracts, and returns ranked passages with article URLs', async () => {
    const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
    const fetch = fakeFetch(
      [
        [/list=search/, { query: { search: [{ title: 'Zentha Bridge' }] } }],
        [/prop=extracts/, { query: { pages: { '1': { extract: docs[0]!.text } } } }],
      ],
      calls,
    );
    const claims = extractClaims('The Zentha Bridge opened in 1987.');
    const passages = await new WikipediaEvidenceProvider({ fetch }).retrieve(claims[0]!, { limit: 2 });
    expect(passages[0]?.source.url).toBe('https://en.wikipedia.org/wiki/Zentha_Bridge');
    expect(passages[0]?.text).toContain('1991');
    // Wikimedia API policy: every request identifies the client.
    for (const c of calls) expect(c.headers?.['api-user-agent']).toMatch(/^HallucinationFirewall\//);
  });
});

describe('WikipediaEvidenceProvider rate limiting', () => {
  it('retries once after a short Retry-After, and caches articles across claims', async () => {
    let searches = 0;
    const urls: string[] = [];
    const fetch: FetchLike = async (url) => {
      urls.push(url);
      if (url.includes('list=search') && searches++ === 0) {
        return { ok: false, status: 429, headers: { get: () => '0' }, json: async () => ({}), text: async () => '' };
      }
      const body = url.includes('list=search')
        ? { query: { search: [{ title: 'Zentha Bridge' }] } }
        : { query: { pages: { 1: { extract: docs[0]!.text } } } };
      return { ok: true, status: 200, json: async () => body, text: async () => '' };
    };
    const wiki = new WikipediaEvidenceProvider({ fetch });
    const [c1, c2] = extractClaims('The Zentha Bridge opened in 1987. The Zentha Bridge is in Velmora.');
    expect((await wiki.retrieve(c1!, { limit: 2 })).length).toBeGreaterThan(0);
    await wiki.retrieve(c2!, { limit: 2 });
    // 429, then the retry; the second claim is about the same subject and reuses that search.
    expect(urls.filter((u) => u.includes('list=search'))).toHaveLength(2);
    expect(urls.filter((u) => u.includes('prop=extracts'))).toHaveLength(1); // article cached
  });

  it('gives up on a long Retry-After instead of stalling', async () => {
    const fetch: FetchLike = async () => ({ ok: false, status: 429, headers: { get: () => '21' }, json: async () => ({}), text: async () => '' });
    const [c] = extractClaims('The Zentha Bridge opened in 1987.');
    await expect(new WikipediaEvidenceProvider({ fetch }).retrieve(c!, { limit: 2 })).rejects.toThrow(/429/);
  });
});

describe('BraveSearchEvidenceProvider (fake fetch, no network)', () => {
  it('sends the key only as a header and strips HTML from snippets', async () => {
    const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
    const fetch = fakeFetch(
      [[/search\.brave\.com/, { web: { results: [{ title: 'Zentha', url: 'https://example.test/z', description: 'The <strong>Zentha Bridge</strong> opened in 1991.' }] } }]],
      calls,
    );
    const claims = extractClaims('The Zentha Bridge opened in 1987.');
    const passages = await new BraveSearchEvidenceProvider({ apiKey: 'test-key-placeholder', fetch }).retrieve(claims[0]!, { limit: 2 });
    expect(passages[0]?.text).toBe('The Zentha Bridge opened in 1991.');
    expect(calls[0]!.url).not.toContain('test-key-placeholder');
    expect(calls[0]!.headers?.['x-subscription-token']).toBe('test-key-placeholder');
  });
});
