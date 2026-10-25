import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CrossrefEvidenceProvider, EuropePmcEvidenceProvider, GoogleFactCheckEvidenceProvider, HeuristicLLM,
  TavilyEvidenceProvider, UrlEvidenceProvider, WikidataEvidenceProvider, WikipediaEvidenceProvider,
  retrieveEvidence, runVerification, trustedUrl, verifyClaim, type Claim, type FetchLike, type Passage,
} from '../index.js';
import { EvidenceHttp } from '../providers/evidence/http.js';

const claim: Claim = { id: 'c1', text: 'The Eiffel Tower opened in 1899.', context: 'The Eiffel Tower opened in 1899.', span: { start: 0, end: 36 } };
const opts = { limit: 4 };
function response(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => data, text: async () => typeof data === 'string' ? data : JSON.stringify(data), headers: { get: (key: string) => headers[key.toLowerCase()] ?? null } };
}
function fake(handler: (url: string, init: Parameters<FetchLike>[1]) => ReturnType<typeof response> | Promise<ReturnType<typeof response>>) {
  const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = [];
  const fetch: FetchLike = async (url, init) => { calls.push({ url, init }); return handler(url, init); };
  return { fetch, calls };
}
function time(value: string, precision = 9) {
  return { snaktype: 'value', datavalue: { type: 'time', value: { time: value, precision, calendarmodel: 'http://www.wikidata.org/entity/Q1985727' } } };
}
function wikidata(statements: Record<string, unknown>) {
  return fake((url) => {
    if (url.includes('wbsearchentities')) return response({ search: [{ id: 'Q243', label: 'Eiffel Tower' }] });
    if (url.includes('props=labels&')) return response({ entities: { Q11573: { labels: { en: { value: 'metres' } } }, Q142: { labels: { en: { value: 'France' } } } } });
    return response({ entities: { Q243: { labels: { en: { value: 'Eiffel Tower' } }, claims: statements } } });
  });
}
afterEach(() => vi.useRealTimers());

describe('Wikidata evidence', () => {
  it('checks a structured opening date, caches entity lookups, and quotes the exact rendering', async () => {
    const f = wikidata({ P1619: [{ rank: 'normal', mainsnak: time('+1889-03-31T00:00:00Z') }] });
    const provider = new WikidataEvidenceProvider(f);
    const result = await runVerification({ answer: claim.text, providers: [provider], llm: new HeuristicLLM() });
    expect(result.summary.contradicted).toBe(1);
    expect(result.verdicts[0]?.correction).toBe('The Eiffel Tower opened in 1889.');
    expect(result.verdicts[0]?.quotes[0]?.quote).toBe('Eiffel Tower opened in 1889.');
    expect(result.verdicts[0]?.quotes[0]?.source.url).toBe('https://www.wikidata.org/wiki/Q243#P1619');
    await provider.retrieve(claim, opts);
    expect(f.calls).toHaveLength(2);
    expect(decodeURIComponent(f.calls[0]!.url)).toContain('search=eiffel tower');
    expect(f.calls[0]!.url).not.toContain('1899');
    expect(f.calls[0]!.init?.headers?.['api-user-agent']).toContain('HallucinationFirewall');
  });

  it('ignores deprecated, unknown and missing values and prefers preferred statements', async () => {
    const f = wikidata({ P1619: [
      { rank: 'deprecated', mainsnak: time('+1899-01-01T00:00:00Z') },
      { rank: 'normal', mainsnak: time('+1900-01-01T00:00:00Z') },
      { rank: 'preferred', mainsnak: time('+1889-01-01T00:00:00Z') },
      { rank: 'preferred', mainsnak: { snaktype: 'somevalue' } },
    ], P999999: [{ mainsnak: time('+2000-01-01T00:00:00Z') }] });
    const found = await new WikidataEvidenceProvider(f).retrieve(claim, opts);
    expect(found.map((p) => p.text)).toEqual(['Eiffel Tower opened in 1889.']);
  });

  it('preserves date precision and refuses unsupported calendars or coarse dates', async () => {
    const f = wikidata({ P1619: [
      { mainsnak: time('+1889-03-31T00:00:00Z', 10) },
      { mainsnak: time('+1800-00-00T00:00:00Z', 7) },
      { mainsnak: { ...time('+1889-03-31T00:00:00Z'), datavalue: { type: 'time', value: { time: '+1889-03-31T00:00:00Z', precision: 9, calendarmodel: 'other' } } } },
    ] });
    expect((await new WikidataEvidenceProvider(f).retrieve(claim, opts)).map((p) => p.text)).toEqual(['Eiffel Tower opened in 1889.\nWikidata date: 1889-03']);
  });

  it('provides a year correction from a full-precision date while retaining that date', async () => {
    const f = wikidata({ P1619: [{ rank: 'normal', mainsnak: time('+1889-03-31T00:00:00Z', 11) }] });
    const result = await runVerification({ answer: claim.text, providers: [new WikidataEvidenceProvider(f)], llm: new HeuristicLLM() });
    expect(result.summary.contradicted).toBe(1);
    expect(result.verdicts[0]?.correction).toBe('The Eiffel Tower opened in 1889.');
    expect(result.verdicts[0]?.quotes[0]?.quote).toBe('Eiffel Tower opened in 1889.');
    expect(Object.values(result.passages)[0]?.text).toContain('Wikidata date: 1889-03-31');
  });

  it('compares a birth year with a birth date rather than an equally relevant birthplace', async () => {
    const fetch: FetchLike = async (url) => response(url.includes('wbsearchentities') ? { search: [{ id: 'Q937' }] } : url.includes('props=labels&') ? { entities: { Q3012: { labels: { en: { value: 'Ulm' } } } } } : {
      entities: { Q937: { labels: { en: { value: 'Albert Einstein' } }, claims: {
        P569: [{ mainsnak: time('+1879-03-14T00:00:00Z', 11) }],
        P19: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'wikibase-entityid', value: { id: 'Q3012' } } } }],
      } } },
    });
    const result = await runVerification({ answer: 'Albert Einstein was born in 1878.', providers: [new WikidataEvidenceProvider({ fetch })], llm: new HeuristicLLM() });
    expect(result.verdicts[0]?.verdict).toBe('contradicted');
    expect(result.verdicts[0]?.correction).toBe('Albert Einstein was born in 1879.');
  });

  it('batch-resolves entity and unit labels without substituting claim words', async () => {
    const f = wikidata({
      P17: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'wikibase-entityid', value: { id: 'Q142' } } } }],
      P2048: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'quantity', value: { amount: '+300', unit: 'http://www.wikidata.org/entity/Q11573' } } } }],
    });
    const found = await new WikidataEvidenceProvider(f).retrieve({ ...claim, text: 'The Eiffel Tower has height 300 metres in France.' }, opts);
    expect(found.map((p) => p.text)).toContain('Eiffel Tower has height 300 metres.');
    expect(found.map((p) => p.text)).toContain('Eiffel Tower is in the country France.');
    expect(f.calls).toHaveLength(3);
    const wrongUnits = { ...claim, text: 'The Eiffel Tower has height 300 feet.' };
    expect((await verifyClaim(wrongUnits, found.map((p, i) => ({ ...p, id: `p${i}` })), new HeuristicLLM())).verdict).toBe('unverifiable');
  });

  it('retains temporal qualifiers and avoids lexical verdicts on qualified statistics', async () => {
    const qualifiers = { P585: [time('+2020-01-01T00:00:00Z')] };
    const f = wikidata({ P1082: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'quantity', value: { amount: '+100', unit: '1' } } }, qualifiers }] });
    const c = { ...claim, text: 'The Eiffel Tower has population 200.' };
    const found = await new WikidataEvidenceProvider(f).retrieve(c, opts);
    expect(found[0]?.text).toContain(JSON.stringify(qualifiers));
    expect(found[0]?.source.kind).toBe('metadata');
    expect((await verifyClaim(c, found.map((p, i) => ({ ...p, id: `p${i}` })), new HeuristicLLM())).verdict).toBe('unverifiable');
  });

  it('handles an empty search or API-level error without inventing evidence', async () => {
    expect(await new WikidataEvidenceProvider(fake(() => response({ search: [] }))).retrieve(claim, opts)).toEqual([]);
    await expect(new WikidataEvidenceProvider(fake(() => response({ error: { code: 'maxlag' } }))).retrieve(claim, opts)).rejects.toThrow('Wikidata');
  });
});

describe('Google Fact Check evidence', () => {
  function reviews() {
    return fake(() => response({ claims: [{ text: claim.text, claimReview: [{ publisher: { name: 'Example Checker' }, textualRating: 'False', title: 'Tower opening checked', url: 'https://checker.org/tower', reviewDate: '2026-01-01' }] }] }));
  }
  it('preserves publisher attribution and rating, passes key only in its header', async () => {
    const f = reviews();
    const passages = await new GoogleFactCheckEvidenceProvider({ ...f, apiKey: 'private-test-key' }).retrieve(claim, opts);
    expect(passages[0]?.text).toContain('Publisher rating: "False"');
    expect(passages[0]?.text).toContain(`Reviewed claim: ${JSON.stringify(claim.text)}`);
    expect(passages[0]?.source).toMatchObject({ kind: 'review', url: 'https://checker.org/tower' });
    expect(f.calls[0]?.init?.headers?.['x-goog-api-key']).toBe('private-test-key');
    expect(f.calls[0]?.url).not.toContain('private-test-key');
  });

  it('never treats the reviewed false claim as lexical support', async () => {
    const result = await runVerification({ answer: claim.text, providers: [new GoogleFactCheckEvidenceProvider({ ...reviews(), apiKey: 'test' })], llm: new HeuristicLLM() });
    expect(result.summary.unverifiable).toBe(1);
    expect(result.summary.supported).toBe(0);
  });

  it('rejects a review citation that quotes only the claim, and accepts the attributed full review', async () => {
    const found = await new GoogleFactCheckEvidenceProvider({ ...reviews(), apiKey: 'test' }).retrieve(claim, opts);
    const passage: Passage = { ...found[0]!, id: 'p1' };
    const judge = (quote: string) => ({ id: 'fake', complete: async () => JSON.stringify({ verdict: 'contradicted', confidence: 0.9, rationale: 'Publisher rated this claim false.', quotes: [{ passage_id: 'p1', quote }], correction: null }) });
    expect((await verifyClaim(claim, [passage], judge(claim.text))).downgradeReason).toBe('incomplete-review');
    const good = await verifyClaim(claim, [passage], judge(passage.text));
    expect(good.verdict).toBe('contradicted');
    expect(good.quotes[0]?.quote).toBe(passage.text);
  });

  it('does not fabricate reviews from missing ratings or unsafe links', async () => {
    const f = fake(() => response({ claims: [{ text: claim.text, claimReview: [{ textualRating: 'False', url: 'javascript:alert(1)' }, {}] }] }));
    expect(await new GoogleFactCheckEvidenceProvider({ ...f, apiKey: 'test' }).retrieve(claim, opts)).toEqual([]);
  });
});

describe('trusted URLs', () => {
  it('prefers the relevant property over unrelated measurements that contain the false number', async () => {
    const f = fake(() => response('<main><p>Mars has a radius of 3,390 kilometers.</p><p>Mars is a dry planet.</p><p>It is about half the size of Earth.</p><p>The distance from the Sun varies.</p><p>Mars has two small moons, Phobos and Deimos.</p></main>', 200, { 'content-type': 'text/html' }));
    const found = await new UrlEvidenceProvider({ ...f, urls: ['https://science.nasa.gov/mars/facts/'] }).retrieve({ ...claim, text: 'Mars has 3 moons.', context: 'Mars has 3 moons.' }, { limit: 1 });
    expect(found[0]?.text).toContain('Mars has two small moons');
    expect(found[0]?.text).not.toContain('radius');
  });
  it('ranks actual main-page content instead of navigation that happens to match the claim', async () => {
    const f = fake(() => response('<html><div>Earth\nThe Moon\nMars</div><main><h1>Mars facts</h1><p>Mars has two small moons, Phobos and Deimos.</p></main><div>Other stories about Mars</div></html>', 200, { 'content-type': 'text/html' }));
    const found = await new UrlEvidenceProvider({ ...f, urls: ['https://science.nasa.gov/mars/facts/'] }).retrieve({ ...claim, text: 'Mars has 3 moons.', context: 'Mars has 3 moons.' }, opts);
    expect(found[0]?.text).toContain('Mars has two small moons');
    expect(found.map((p) => p.text).join(' ')).not.toContain('Earth');
  });

  it('extracts a single article when a page has no main landmark', async () => {
    const f = fake(() => response('<div>The Eiffel Tower opened in 1899.</div><article><p>The Eiffel Tower opened in 1889.</p></article>', 200, { 'content-type': 'text/html' }));
    const found = await new UrlEvidenceProvider({ ...f, urls: ['https://trusted.org/tower'] }).retrieve(claim, opts);
    expect(found[0]?.text).toBe('The Eiffel Tower opened in 1889.');
  });
  it('fetches once for multiple claims, omits credentials, rejects redirects and chunks readable text', async () => {
    const f = fake(() => response('<html><script>The Eiffel Tower opened in 1899.</script><p>The Eiffel Tower opened in 1889.</p><p>It is in France &amp; is open to visitors.</p></html>', 200, { 'content-type': 'text/html; charset=utf-8' }));
    const provider = new UrlEvidenceProvider({ ...f, urls: ['https://trusted.org/tower#history'] });
    const result = await runVerification({ answer: claim.text, providers: [provider], llm: new HeuristicLLM() });
    expect(result.summary.contradicted).toBe(1);
    await provider.retrieve(claim, opts);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toMatchObject({ url: 'https://trusted.org/tower', init: { redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer' } });
    expect(Object.values(result.passages)[0]?.text).not.toContain('1899');
    expect(Object.values(result.passages)[0]?.source.providerId).toBe('urls');
  });

  it.each(['http://trusted.org', 'file:///tmp/source', 'https://localhost/a', 'https://localhost./a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://2130706433/a', 'https://a.internal/a', 'https://home.arpa/a', 'https://user:password@trusted.org/a', 'https://trusted.org:8443/a'])('rejects unsafe URL %s before fetching', (url) => {
    const f = fake(() => response(''));
    expect(() => new UrlEvidenceProvider({ ...f, urls: [url] })).toThrow(/public HTTPS/);
    expect(f.calls).toHaveLength(0);
  });

  it.each([
    ['application/pdf', 'PDF'], ['application/json', '{}'], ['text/plain', 'x'.repeat(1_000_001)],
  ])('refuses unsupported or excessive content (%s)', async (type, body) => {
    const f = fake(() => response(body, 200, { 'content-type': type }));
    await expect(new UrlEvidenceProvider({ ...f, urls: ['https://trusted.org/source'] }).retrieve(claim, opts)).rejects.toThrow(/unsupported/);
  });

  it('normalizes fragments, limits source count and recovers after a failed fetch', async () => {
    expect(trustedUrl('https://trusted.org/page#part')).toEqual({ url: 'https://trusted.org/page', origin: 'https://trusted.org/*' });
    let fails = true;
    const f = fake(() => fails ? response('', 500) : response('The Eiffel Tower opened in 1889.', 200, { 'content-type': 'text/plain' }));
    const p = new UrlEvidenceProvider({ ...f, urls: ['https://trusted.org/page'] });
    await expect(p.retrieve(claim, opts)).rejects.toThrow('HTTP 500');
    fails = false;
    expect(await p.retrieve(claim, opts)).toHaveLength(1);
    expect(() => new UrlEvidenceProvider({ ...f, urls: Array(11).fill('https://trusted.org/page') })).toThrow(/1 and 10/);
  });

  it('cancels a streamed page as soon as it exceeds the byte limit', async () => {
    let cancelled = false;
    const read = vi.fn(async () => ({ done: false, value: new Uint8Array(600_000) }));
    const fetch: FetchLike = async () => ({ ...response('', 200, { 'content-type': 'text/plain' }), body: { getReader: () => ({ read, cancel: async () => { cancelled = true; } }) } });
    await expect(new UrlEvidenceProvider({ fetch, urls: ['https://trusted.org/a'] }).retrieve(claim, opts)).rejects.toThrow('unsupported response');
    expect(read).toHaveBeenCalledTimes(2);
    expect(cancelled).toBe(true);
  });
});

describe('independent search sources', () => {
  it('restricts Tavily to trusted domains and rejects lookalike domains even if returned by the API', async () => {
    const raw = 'The Eiffel Tower opened in 1889.';
    const f = fake(() => response({ results: ['https://who.int/tower', 'https://data.who.int/tower', 'https://who.int.attacker.org/tower', 'https://notwho.int/tower'].map((url) => ({ title: 'Tower', url, raw_content: raw })) }));
    const found = await new TavilyEvidenceProvider({ ...f, apiKey: 'test', domains: ['who.int'] }).retrieve(claim, opts);
    expect(found.map((p) => p.source.url)).toEqual(['https://who.int/tower', 'https://data.who.int/tower']);
    expect(JSON.parse(f.calls[0]!.init!.body!).include_domains).toEqual(['who.int']);
    expect(() => new TavilyEvidenceProvider({ ...f, apiKey: 'test', domains: ['https://who.int/path'] })).toThrow(/hostnames/);
  });
  it('Tavily uses extracted page text, not a generated answer or snippet', async () => {
    const raw = 'The Eiffel Tower opened in 1889.';
    const f = fake(() => response({ answer: claim.text, results: [{ title: 'Tower', url: 'https://trusted.org/tower', raw_content: raw, content: claim.text }, { url: 'https://trusted.org/snippet', content: claim.text }] }));
    const found = await new TavilyEvidenceProvider({ ...f, apiKey: 'tavily-private-test' }).retrieve(claim, opts);
    expect(found.map((p) => p.text)).toEqual([raw]);
    expect(f.calls[0]?.init?.headers?.authorization).toBe('Bearer tavily-private-test');
    expect(f.calls[0]?.init?.body).not.toContain('tavily-private-test');
    expect(JSON.parse(f.calls[0]!.init!.body!)).toMatchObject({ include_raw_content: 'text', include_answer: false });
  });

  it('Europe PMC quotes actual abstracts with stable source links', async () => {
    const f = fake(() => response({ resultList: { result: [{ id: '123', source: 'MED', title: 'Tower study', abstractText: '<p>The Eiffel Tower opened in 1889.</p>' }, { id: '124', source: 'MED', title: claim.text }] } }));
    const found = await new EuropePmcEvidenceProvider(f).retrieve(claim, opts);
    expect(found).toHaveLength(1);
    expect(found[0]?.text).toBe('The Eiffel Tower opened in 1889.');
    expect(found[0]?.source.url).toBe('https://europepmc.org/article/MED/123');
  });

  it('Crossref labels metadata and the heuristic does not use a paper title as a finding', async () => {
    const f = fake(() => response({ message: { items: [{ title: [claim.text], DOI: '10.1234/tower', author: [{ given: 'Ada', family: 'Lovelace' }], published: { 'date-parts': [[2024, 3, 1]] }, 'container-title': ['Example Journal'] }] } }));
    const provider = new CrossrefEvidenceProvider(f);
    const found = await provider.retrieve(claim, opts);
    expect(found[0]?.text).toContain('Authors: Ada Lovelace\nPublished: 2024-3-1\nJournal: Example Journal');
    expect(found[0]?.source).toMatchObject({ kind: 'metadata', url: 'https://doi.org/10.1234/tower' });
    const result = await runVerification({ answer: claim.text, providers: [provider], llm: new HeuristicLLM() });
    expect(result.summary.unverifiable).toBe(1);
  });

  it('searches the publication title without the claimed year and rejects similarly named papers', async () => {
    const title = 'Deep Residual Learning for Image Recognition';
    const f = fake(() => response({ message: { items: [
      { title: [`${title}: A Survey`], DOI: '10.0000/survey', published: { 'date-parts': [[2022]] } },
      { title: [title], DOI: '10.1109/cvpr.2016.90', published: { 'date-parts': [[2016, 6]] } },
    ] } }));
    const found = await new CrossrefEvidenceProvider(f).retrieve({ ...claim, text: `${title} was published in 2015.` }, opts);
    expect(decodeURIComponent(f.calls[0]!.url)).toContain(`query.title=${title}`);
    expect(f.calls[0]!.url).not.toContain('2015');
    expect(found).toHaveLength(1);
    expect(found[0]?.text).toContain('Published: 2016-6');
    expect(found[0]?.source.url).toBe('https://doi.org/10.1109/cvpr.2016.90');
  });

  it('keeps independent evidence when Wikipedia returns 429', async () => {
    const wiki = fake(() => response({}, 429, { 'retry-after': '120' }));
    const pmc = fake(() => response({ resultList: { result: [{ id: '123', source: 'MED', title: 'Tower', abstractText: 'The Eiffel Tower opened in 1889.' }] } }));
    const providers = [new WikipediaEvidenceProvider(wiki), new EuropePmcEvidenceProvider(pmc)];
    const result = await runVerification({ answer: claim.text, providers, llm: new HeuristicLLM() });
    expect(result.summary.contradicted).toBe(1);
    expect(result.errors[0]).toMatchObject({ providerId: 'wikipedia' });
    await retrieveEvidence([claim], providers);
    expect(wiki.calls).toHaveLength(1);
    expect(pmc.calls).toHaveLength(1);
  });
});

describe('network failures and bounded caches', () => {
  it('serializes queued requests and honors Retry-After before retrying after cooldown', async () => {
    vi.useFakeTimers();
    let limited = true;
    const f = fake(() => limited ? response({}, 429, { 'retry-after': '120' }) : response({ ok: true }));
    const http = new EvidenceHttp('Test source', f.fetch);
    const outcomes = await Promise.allSettled([http.json('https://api.org/1'), http.json('https://api.org/2')]);
    expect(outcomes.every((r) => r.status === 'rejected')).toBe(true);
    expect(f.calls).toHaveLength(1);
    limited = false;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await http.json('https://api.org/1')).toEqual({ ok: true });
    expect(f.calls).toHaveLength(2);
  });

  it('handles HTTP-date Retry-After and uses a conservative fallback for invalid values', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const f = fake(() => response({}, 429, { 'retry-after': 'Thu, 01 Jan 2026 00:01:00 GMT' }));
    const http = new EvidenceHttp('Test', f.fetch);
    await expect(http.json('https://api.org/1')).rejects.toThrow('429');
    await vi.advanceTimersByTimeAsync(31_000);
    await expect(http.json('https://api.org/2')).rejects.toThrow('429');
    expect(f.calls).toHaveLength(1);
    const bad = fake(() => response({}, 429, { 'retry-after': 'nonsense' }));
    const other = new EvidenceHttp('Test', bad.fetch);
    await expect(other.json('https://api.org/1')).rejects.toThrow('429');
    await expect(other.json('https://api.org/2')).rejects.toThrow('429');
    expect(bad.calls).toHaveLength(1);
  });

  it('shares in-flight requests, expires cached results and bounds cache size', async () => {
    vi.useFakeTimers();
    const f = fake(() => response({ ok: true })), http = new EvidenceHttp('Test', f.fetch);
    await Promise.all([http.json('https://api.org/a'), http.json('https://api.org/a')]);
    expect(f.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(300_001);
    await http.json('https://api.org/a');
    expect(f.calls).toHaveLength(2);
    for (let i = 0; i < 101; i++) await http.json(`https://api.org/${i}`);
    await http.json('https://api.org/a');
    expect(f.calls).toHaveLength(104);
  });

  it('does not retain an API-level error returned with HTTP 200', async () => {
    let fail = true;
    const f = fake(() => response(fail ? { error: { message: 'private details' } } : { results: [] }));
    const http = new EvidenceHttp('Test', f.fetch);
    await expect(http.json('https://api.org/a')).rejects.toThrow('unsupported response');
    fail = false;
    expect(await http.json('https://api.org/a')).toEqual({ results: [] });
    expect(f.calls).toHaveLength(2);
  });

  it('aborts stalled requests without exposing fetch exception text or credentials', async () => {
    vi.useFakeTimers();
    const fetch: FetchLike = async (_, init) => new Promise((_, reject) => {
      (init!.signal as AbortSignal).addEventListener('abort', () => reject(new Error('private-key-in-original-error')));
    });
    const p = new EvidenceHttp('Test', fetch).json('https://api.org');
    const check = expect(p).rejects.toThrow('Test request failed or timed out.');
    await vi.advanceTimersByTimeAsync(15_001);
    await check;
  });

  it.each([GoogleFactCheckEvidenceProvider, TavilyEvidenceProvider])('requires credentials and hides provider error bodies', async (Provider) => {
    const f = fake(() => response({ error: 'private-key-in-body' }, 401));
    expect(() => new Provider({ ...f, apiKey: '' })).toThrow(/API key/);
    const p = new Provider({ ...f, apiKey: 'test' });
    await expect(p.retrieve(claim, opts)).rejects.toThrow('HTTP 401');
    await expect(p.retrieve(claim, opts)).rejects.not.toThrow('private-key-in-body');
  });
});
