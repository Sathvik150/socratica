import { describe, expect, it } from 'vitest';
import { GovUkEvidenceProvider, WorldBankEvidenceProvider, HeuristicLLM, parseVerifierPrompt, runVerification, type Claim, type FetchLike } from '../index.js';

function response(data: unknown, status = 200) { return { ok: status === 200, status, json: async () => data, text: async () => '' }; }
const c = (text: string, context = text): Claim => ({ id: 'c1', text, context, span: { start: 0, end: text.length } });

describe('World Bank official observations', () => {
  function api(value: unknown = 1428627663, date = '2023') {
    const calls: string[] = [];
    const fetch: FetchLike = async (url) => {
      calls.push(url);
      return response(url.includes('/indicator/') ? [{}, [{ indicator: { id: url.includes('NY.GDP.PCAP.CD') ? 'NY.GDP.PCAP.CD' : url.includes('NY.GDP.MKTP.CD') ? 'NY.GDP.MKTP.CD' : 'SP.POP.TOTL', value: 'Population, total' }, country: { id: 'IN', value: 'India' }, date, value }]] : [{}, [
        { id: 'IND', iso2Code: 'IN', name: 'India', region: { id: 'SAS' } },
        { id: 'GBR', iso2Code: 'GB', name: 'United Kingdom', region: { id: 'ECS' } },
        { id: 'WLD', iso2Code: '1W', name: 'World', region: { id: 'NA' } },
      ]]);
    };
    return { fetch, calls };
  }

  it('requests the exact country, indicator and year and retains units and provenance', async () => {
    const f = api(), provider = new WorldBankEvidenceProvider(f);
    const found = await provider.retrieve(c('India had a population of 1400000000 in 2023.'), { limit: 4 });
    expect(f.calls[1]).toContain('/country/IND/indicator/SP.POP.TOTL?');
    expect(f.calls[1]).toContain('date=2023');
    expect(found[0]?.text).toContain('Country: India');
    expect(found[0]?.text).toContain('Year: 2023\nValue: 1428627663\nUnits: people');
    expect(found[0]?.source).toMatchObject({ providerId: 'world-bank', kind: 'metadata', url: 'https://data.worldbank.org/indicator/SP.POP.TOTL?locations=IN' });
    await provider.retrieve(c('India had a population of 1428627663 in 2023.'), { limit: 4 });
    expect(f.calls).toHaveLength(2);
  });

  it('distinguishes total GDP from GDP per capita without guessing a currency conversion', async () => {
    const f = api(2480), p = new WorldBankEvidenceProvider(f);
    const found = await p.retrieve(c('India had GDP per capita of 2000 dollars in 2023.'), { limit: 4 });
    expect(f.calls[1]).toContain('NY.GDP.PCAP.CD');
    expect(found[0]?.text).toContain('Units: current US dollars per person');
    expect(await p.retrieve(c('India had PPP GDP of 10 trillion dollars in 2023.'), { limit: 4 })).toEqual([]);
    expect(await p.retrieve(c('India had GDP growth of 10 percent in 2023.'), { limit: 4 })).toEqual([]);
  });

  it('can return a grounded statistical correction with a source quote and link through a model', async () => {
    const f = api();
    const llm = { id: 'fake-model', complete: async (prompt: string) => {
      const input = parseVerifierPrompt(prompt)!;
      const passage = input.passages[0]!;
      expect(passage.kind).toBe('metadata');
      expect(prompt).toContain('year, and units');
      return JSON.stringify({ verdict: 'contradicted', confidence: 0.95, rationale: 'The World Bank observation gives a different total for the same country and year.', quotes: [{ passage_id: passage.id, quote: passage.text }], correction: 'India had a population of 1428627663 in 2023.' });
    } };
    const result = await runVerification({ answer: 'India had a population of 1400000000 in 2023.', providers: [new WorldBankEvidenceProvider(f)], llm });
    expect(result.summary.contradicted).toBe(1);
    expect(result.verdicts[0]?.correction).toBe('India had a population of 1428627663 in 2023.');
    expect(result.verdicts[0]?.quotes[0]?.source.url).toContain('data.worldbank.org/indicator/SP.POP.TOTL');
  });

  it('does not invent null data, use the wrong year, or treat historical data as current', async () => {
    expect(await new WorldBankEvidenceProvider(api(null)).retrieve(c('India had a population of 1400000000 in 2023.'), { limit: 4 })).toEqual([]);
    expect(await new WorldBankEvidenceProvider(api(100, '2022')).retrieve(c('India had a population of 1400000000 in 2023.'), { limit: 4 })).toEqual([]);
    expect(await new WorldBankEvidenceProvider(api(100, '2022')).retrieve(c('India currently has a population of 1400000000.'), { limit: 4 })).toEqual([]);
  });

  it('uses a dated most-recent observation when no year is stated and the heuristic abstains', async () => {
    const f = api(), p = new WorldBankEvidenceProvider(f);
    const result = await runVerification({ answer: 'India has a population of 1400000000.', providers: [p], llm: new HeuristicLLM() });
    expect(f.calls[1]).toContain('mrv=1');
    expect(result.summary.unverifiable).toBe(1);
    expect(Object.values(result.passages)[0]?.text).toContain('Year: 2023');
  });

  it('declines multi-country, multi-year, aggregate, and unrelated claims', async () => {
    const f = api(), p = new WorldBankEvidenceProvider(f);
    for (const text of ['India has a larger population than the United Kingdom.', 'India had population 100 in 2022 and in 2023.', 'The World has population 8000000000.']) {
      expect(await p.retrieve(c(text), { limit: 4 })).toEqual([]);
    }
    const fresh = api();
    expect(await new WorldBankEvidenceProvider(fresh).retrieve(c('The Eiffel Tower opened in 1889.'), { limit: 4 })).toEqual([]);
    expect(fresh.calls).toEqual([]);
    expect(f.calls.every((url) => !url.includes('/indicator/'))).toBe(true);
  });
});

describe('GOV.UK official guidance', () => {
  it('fetches actual content, ignores search descriptions, and cites the correct guide section', async () => {
    const calls: string[] = [];
    const fetch: FetchLike = async (url) => {
      calls.push(url);
      return response(url.includes('/api/search.json') ? { results: [{ link: '/fictional-example-guide', title: 'Example guidance', description: 'The Velmora Permit lasts 20 years.' }] } : { title: 'Example guidance', withdrawn_notice: {}, details: { parts: [{ slug: 'validity', body: '<p>The Velmora Permit lasts 10 years.</p>' }] } });
    };
    const provider = new GovUkEvidenceProvider({ fetch });
    const result = await runVerification({ answer: 'The Velmora Permit lasts 20 years.', providers: [provider], llm: new HeuristicLLM() });
    expect(result.summary.contradicted).toBe(1);
    expect(result.verdicts[0]?.quotes[0]?.quote).toBe('The Velmora Permit lasts 10 years.');
    expect(result.verdicts[0]?.quotes[0]?.source.url).toBe('https://www.gov.uk/fictional-example-guide/validity');
    expect(result.verdicts[0]?.correction).toBe('The Velmora Permit lasts 10 years.');
    await provider.retrieve(c('The Velmora Permit lasts 20 years.'), { limit: 4 });
    expect(calls).toHaveLength(2);
    const query = new URL(calls[0]!).searchParams.get('q');
    expect(query).not.toContain('20');
  });

  it('skips unsafe content paths, withdrawals and snippets without body text', async () => {
    const calls: string[] = [];
    const fetch: FetchLike = async (url) => {
      calls.push(url);
      if (url.includes('/api/search.json')) return response({ results: [
        { link: 'https://attacker.org/a' }, { link: '//attacker.org/a' }, { link: '/../a' },
        { link: '/old-guide', description: 'The Velmora Permit lasts 10 years.' }, { link: '/empty-guide', description: 'The Velmora Permit lasts 10 years.' },
      ] });
      return response(url.endsWith('/old-guide') ? { withdrawn_notice: { explanation: 'Withdrawn' }, details: { body: 'The Velmora Permit lasts 10 years.' } } : {});
    };
    const found = await new GovUkEvidenceProvider({ fetch, count: 10 }).retrieve(c('The Velmora Permit lasts 20 years.'), { limit: 4 });
    expect(found).toEqual([]);
    expect(calls).toHaveLength(3);
    expect(calls.every((url) => url.startsWith('https://www.gov.uk/'))).toBe(true);
  });
});
