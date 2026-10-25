import { describe, expect, it } from 'vitest';
import { createRelay, LIMITS } from '../api/search.js';

const serper = {
  answerBox: { title: 'James Webb Space Telescope launch', link: 'https://example.org/jwst', snippet: 'Launched on 25 December 2021.', extra: 'dropped' },
  knowledgeGraph: { title: 'Moon', description: 'The Moon orbits Earth in about 27.3 days.', descriptionLink: 'https://en.wikipedia.org/wiki/Moon' },
  organic: [{ title: 'Oxygen', link: 'https://example.org/air', snippet: 'Dry air is 20.95% oxygen.', position: 1 }],
  searchParameters: { q: 'not returned' },
};

function setup(opts: { apiKey?: string; status?: number; body?: unknown } = {}) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  let now = 1_000_000;
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(opts.body ?? serper), { status: opts.status ?? 200 });
  }) as typeof globalThis.fetch;
  const relay = createRelay({ fetch, apiKey: 'apiKey' in opts ? opts.apiKey : 'serper-test', now: () => now });
  const ask = (q: unknown, ip = '203.0.113.7') =>
    relay(new Request('https://relay.example/api/search', { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify({ q }) }));
  return { relay, ask, calls, advance: (ms: number) => { now += ms; } };
}

describe('search relay', () => {
  it('forwards the query to Serper with the project key and returns only what Socratica reads', async () => {
    const t = setup();
    const res = await t.ask('james webb space telescope launch');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      answerBox: { title: 'James Webb Space Telescope launch', link: 'https://example.org/jwst', snippet: 'Launched on 25 December 2021.' },
      knowledgeGraph: { title: 'Moon', description: 'The Moon orbits Earth in about 27.3 days.', descriptionLink: 'https://en.wikipedia.org/wiki/Moon' },
      organic: [{ title: 'Oxygen', link: 'https://example.org/air', snippet: 'Dry air is 20.95% oxygen.' }],
    });
    expect(t.calls[0]!.url).toBe('https://google.serper.dev/search');
    expect(t.calls[0]!.init!.headers).toMatchObject({ 'x-api-key': 'serper-test' });
    expect(JSON.parse(String(t.calls[0]!.init!.body))).toEqual({ q: 'james webb space telescope launch', num: 5 });
    // The key never goes back to the caller, and browsers on other sites get no CORS access.
    expect(JSON.stringify(body)).not.toContain('serper-test');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects anything but a short text query', async () => {
    const t = setup();
    for (const q of ['', 'x', 'a'.repeat(201), 42, null]) expect((await t.ask(q)).status).toBe(400);
    const notJson = await t.relay(new Request('https://relay.example/api/search', { method: 'POST', body: 'q=hi' }));
    expect(notJson.status).toBe(400);
    expect((await t.relay(new Request('https://relay.example/api/search'))).status).toBe(405);
    expect(t.calls).toHaveLength(0);
  });

  it('answers repeated queries from its cache for ten minutes', async () => {
    const t = setup();
    await t.ask('Earth oxygen concentration');
    await t.ask('earth  oxygen concentration');
    expect(t.calls).toHaveLength(1);
    t.advance(10 * 60_000);
    await t.ask('earth oxygen concentration');
    expect(t.calls).toHaveLength(2);
  });

  it('limits each network address per minute and per day, with Retry-After', async () => {
    const t = setup();
    for (let i = 0; i < LIMITS.perMinute; i++) expect((await t.ask(`query number ${i}`)).status).toBe(200);
    const limited = await t.ask('one too many');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    // Another network is unaffected, and the first one recovers after a minute.
    expect((await t.ask('one too many', '198.51.100.9')).status).toBe(200);
    t.advance(60_000);
    expect((await t.ask('after a minute')).status).toBe(200);
    // The daily total holds across minutes.
    for (let i = 0; t.calls.length < LIMITS.perDay + 1; i++) { t.advance(2_100); await t.ask(`daily ${i}`); }
    t.advance(60_000);
    expect((await t.ask('over the daily total')).status).toBe(429);
  });

  it('turns upstream trouble into answers callers can fall back on, without leaking details', async () => {
    expect((await setup({ apiKey: undefined }).ask('moon orbit')).status).toBe(503);
    const outOfCredits = await setup({ status: 403, body: { message: 'Not enough credits; key serper-test' } }).ask('moon orbit');
    expect(outOfCredits.status).toBe(503);
    expect(await outOfCredits.text()).not.toContain('serper-test');
    const busy = await setup({ status: 429 }).ask('moon orbit');
    expect(busy.status).toBe(429);
    expect(busy.headers.get('retry-after')).toBe('30');
  });
});
