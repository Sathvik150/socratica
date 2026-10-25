import { describe, expect, it } from 'vitest';
import { main, parseArgs, type Io } from '../cli.js';
import type { FetchLike } from '@socratica/core';

const answer = 'The Eiffel Tower opened in 1899.';
function io(env: NodeJS.ProcessEnv = {}, webResults: Array<{ title: string; url: string; description: string }> = []) {
  let output = '';
  const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = [];
  const x: Io = {
    stdout: (s) => { output += s; }, stdin: () => answer, env,
    fetch: async (url, init) => {
      calls.push({ url, init });
      let data: unknown = {};
      if (url.includes('wbsearchentities')) data = { search: [{ id: 'Q243' }] };
      else if (url.includes('wbgetentities')) data = { entities: { Q243: { labels: { en: { value: 'Eiffel Tower' } }, claims: { P1619: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'time', value: { time: '+1889-03-31T00:00:00Z', precision: 9, calendarmodel: 'http://www.wikidata.org/entity/Q1985727' } } } }] } } } };
      else if (url.includes('ebi.ac.uk')) data = { resultList: { result: [{ id: '123', source: 'MED', title: 'Tower', abstractText: 'The Eiffel Tower opened in 1889.' }] } };
      else if (url.includes('api.firecrawl.dev')) data = { success: true, data: { web: webResults } };
      else if (url.includes('google.serper.dev')) data = { organic: webResults.map((r) => ({ title: r.title, link: r.url, snippet: r.description })) };
      return { ok: true, status: 200, json: async () => data, text: async () => 'The Eiffel Tower opened in 1889.', headers: { get: (key) => key === 'content-type' ? 'text/plain' : null } };
    },
  };
  return { x, calls, output: () => output };
}
// Web search is required without local evidence; Firecrawl needs no key. Its fake returns nothing unless a test asks.
const args = ['verify', '--answer', '-', '--format', 'json', '--web', 'firecrawl'];
const tower = [{ title: 'Eiffel Tower', url: 'https://example.org/tower', description: 'The Eiffel Tower opened in 1889.' }];

describe('evidence source CLI flags', () => {
  it('parses new boolean flags without consuming the next option', () => {
    const p = parseArgs([...args, '--wikidata', '--europe-pmc', '--world-bank', '--gov-uk', '--fact-check', '--evidence-url', 'https://trusted.org/a', '--evidence-url=https://trusted.org/b']);
    for (const name of ['wikidata', 'europe-pmc', 'world-bank', 'gov-uk', 'fact-check']) expect(p.flags.get(name)).toEqual(['true']);
    expect(p.flags.get('web')).toEqual(['firecrawl']);
    expect(p.flags.get('evidence-url')).toEqual(['https://trusted.org/a', 'https://trusted.org/b']);
  });

  it.each(['--wikidata', '--europe-pmc', '--evidence-url'])('runs %s through retrieval, judging and report generation', async (flag) => {
    const t = io();
    const code = await main([...args, flag, ...(flag === '--evidence-url' ? ['https://trusted.org/a'] : []), '--fail-on-contradiction'], t.x);
    expect(code).toBe(2);
    const result = JSON.parse(t.output());
    expect(result.summary.contradicted).toBe(1);
    expect(result.verdicts[0].correction).toBe('The Eiffel Tower opened in 1889.');
    expect(t.calls.length).toBeGreaterThan(0);
  });

  it('Firecrawl works without a key and its snippets settle the claim', async () => {
    const t = io({}, tower);
    expect(await main([...args, '--fail-on-contradiction'], t.x)).toBe(2);
    expect(t.calls[0]?.url).toBe('https://api.firecrawl.dev/v2/search');
    expect(t.calls[0]?.init?.headers).not.toHaveProperty('authorization');
    expect(JSON.parse(t.output()).verdicts[0].quotes[0].source.url).toBe('https://example.org/tower');
  });

  it('falls back to DuckDuckGo, with no key, when Firecrawl refuses the network', async () => {
    const t = io();
    const fetch = t.x.fetch;
    t.x.fetch = async (url, init) => {
      if (url.includes('api.firecrawl.dev')) return { ok: false, status: 403, json: async () => ({ success: false }), text: async () => '' };
      if (url.includes('api.duckduckgo.com')) return { ok: true, status: 200, text: async () => '', json: async () => ({ Heading: 'Eiffel Tower', AbstractSource: 'Wikipedia', AbstractURL: 'https://en.wikipedia.org/wiki/Eiffel_Tower', AbstractText: 'The Eiffel Tower opened in 1889.' }) };
      return fetch(url, init);
    };
    expect(await main([...args, '--fail-on-contradiction'], t.x)).toBe(2);
    const result = JSON.parse(t.output());
    expect(result.verdicts[0].quotes[0].source.providerId).toBe('duckduckgo');
    expect(result.errors[0].message).toContain("Firecrawl's free tier doesn't search from this network (HTTP 403)");
  });

  it('uses no DuckDuckGo backup when Firecrawl has a key', async () => {
    const t = io({ SOCRATICA_FIRECRAWL_API_KEY: 'fc-test' }, tower);
    await main(args, t.x);
    expect(t.calls.some((c) => c.url.includes('duckduckgo'))).toBe(false);
  });

  it('reads keyed source credentials only from environment bindings', async () => {
    const t = io({ SOCRATICA_GOOGLE_FACT_CHECK_API_KEY: 'google-test', SOCRATICA_SERPER_API_KEY: 'serper-test' }, tower);
    await main(['verify', '--answer', '-', '--format', 'json', '--web', 'serper', '--fact-check'], t.x);
    expect(t.calls.find((c) => c.url.includes('factchecktools'))?.init?.headers?.['x-goog-api-key']).toBe('google-test');
    expect(t.calls.find((c) => c.url.includes('serper.dev'))?.init?.headers?.['x-api-key']).toBe('serper-test');
    expect(t.output()).not.toContain('google-test');
    expect(t.output()).not.toContain('serper-test');
  });

  it('still reads the pre-0.2 HF_* variable names', async () => {
    const t = io({ HF_SERPER_API_KEY: 'legacy-test' }, tower);
    await main(['verify', '--answer', '-', '--format', 'json', '--web', 'serper'], t.x);
    expect(t.calls[0]?.init?.headers?.['x-api-key']).toBe('legacy-test');
  });

  it.each([
    [['--fact-check'], 'SOCRATICA_GOOGLE_FACT_CHECK_API_KEY'],
    [['--web', 'serper'], 'SOCRATICA_SERPER_API_KEY'],
    [['--web', 'brave'], 'SOCRATICA_BRAVE_API_KEY'],
  ])('explains the missing credential for %s before any network calls', async (flags, key) => {
    const t = io();
    await expect(main(['verify', '--answer', '-', ...flags, ...(flags[0] === '--web' ? [] : ['--web', 'firecrawl'])], t.x)).rejects.toThrow(key);
    expect(t.calls).toEqual([]);
  });

  it('requires a web search engine unless local evidence files are supplied', async () => {
    const t = io();
    await expect(main(['verify', '--answer', '-'], t.x)).rejects.toThrow('--web firecrawl (free, no key needed)');
    await expect(main(['verify', '--answer', '-', '--web', 'toString'], t.x)).rejects.toThrow('Unknown --web toString');
    expect(t.calls).toEqual([]);
  });

  it('rejects unsafe source URLs as usage errors', async () => {
    const t = io();
    await expect(main([...args, '--evidence-url', 'http://localhost/private'], t.x)).rejects.toThrow('public HTTPS');
    expect(t.calls).toEqual([]);
  });
});
