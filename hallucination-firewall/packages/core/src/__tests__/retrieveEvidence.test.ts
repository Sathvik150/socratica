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
    const fetch = fakeFetch([
      [/list=search/, { query: { search: [{ title: 'Zentha Bridge' }] } }],
      [/prop=extracts/, { query: { pages: { '1': { extract: docs[0]!.text } } } }],
    ]);
    const claims = extractClaims('The Zentha Bridge opened in 1987.');
    const passages = await new WikipediaEvidenceProvider({ fetch }).retrieve(claims[0]!, { limit: 2 });
    expect(passages[0]?.source.url).toBe('https://en.wikipedia.org/wiki/Zentha_Bridge');
    expect(passages[0]?.text).toContain('1991');
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
