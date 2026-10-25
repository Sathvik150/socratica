import { describe, expect, it } from 'vitest';
import { main, parseArgs, type Io } from '../cli.js';
import type { FetchLike } from '@hallucination-firewall/core';

const answer = 'The Eiffel Tower opened in 1899.';
function io(env: NodeJS.ProcessEnv = {}) {
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
      else if (url.includes('tavily.com')) data = { results: [{ title: 'Tower', url: 'https://trusted.org/tower', raw_content: 'The Eiffel Tower opened in 1889.' }] };
      return { ok: true, status: 200, json: async () => data, text: async () => 'The Eiffel Tower opened in 1889.', headers: { get: (key) => key === 'content-type' ? 'text/plain' : null } };
    },
  };
  return { x, calls, output: () => output };
}
const args = ['verify', '--answer', '-', '--format', 'json'];

describe('evidence source CLI flags', () => {
  it('parses new boolean flags without consuming the next option', () => {
    const p = parseArgs([...args, '--wikidata', '--europe-pmc', '--crossref', '--world-bank', '--gov-uk', '--fact-check', '--tavily', '--evidence-url', 'https://trusted.org/a', '--evidence-url=https://trusted.org/b']);
    for (const name of ['wikidata', 'europe-pmc', 'crossref', 'world-bank', 'gov-uk', 'fact-check', 'tavily']) expect(p.flags.get(name)).toEqual(['true']);
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

  it('reads keyed source credentials only from environment bindings', async () => {
    const t = io({ HF_GOOGLE_FACT_CHECK_API_KEY: 'google-test', HF_TAVILY_API_KEY: 'tavily-test' });
    await main([...args, '--fact-check', '--tavily'], t.x);
    expect(t.calls[0]?.init?.headers?.['x-goog-api-key']).toBe('google-test');
    expect(t.calls[1]?.init?.headers?.authorization).toBe('Bearer tavily-test');
    expect(t.output()).not.toContain('google-test');
    expect(t.output()).not.toContain('tavily-test');
  });

  it.each([['--fact-check', 'HF_GOOGLE_FACT_CHECK_API_KEY'], ['--tavily', 'HF_TAVILY_API_KEY']])('explains the missing credential for %s before any network calls', async (flag, key) => {
    const t = io();
    await expect(main([...args, flag], t.x)).rejects.toThrow(key);
    expect(t.calls).toEqual([]);
  });

  it('keeps verification offline unless a source is explicitly requested', async () => {
    const t = io();
    await main(args, t.x);
    expect(t.calls).toEqual([]);
    expect(JSON.parse(t.output()).summary.unverifiable).toBe(1);
  });

  it('rejects unsafe source URLs as usage errors', async () => {
    const t = io();
    await expect(main([...args, '--evidence-url', 'http://localhost/private'], t.x)).rejects.toThrow('public HTTPS');
    expect(t.calls).toEqual([]);
  });
});
