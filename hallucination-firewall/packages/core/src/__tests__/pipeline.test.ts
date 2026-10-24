import { describe, expect, it } from 'vitest';
import { HeuristicLLM, MockLLM, runVerification } from '../index.js';

const documents = [
  {
    title: 'Orrin Library (Velmora Encyclopedia)',
    url: 'https://example.test/orrin',
    text: 'The Orrin Library is a public library in the city of Velmora. It was founded by Dalia Moss in 1902. The library holds 2.4 million volumes and is open every day except Sunday.',
  },
];

describe('runVerification end to end (MockLLM + supplied documents)', () => {
  it('flags exactly one contradicted claim with evidence and a correction', async () => {
    const answer =
      'The Orrin Library is a public library in Velmora. It was founded by Dalia Moss in 1910. The library holds 2.4 million volumes. I think it is the nicest library in the region.';
    const result = await runVerification({ answer, documents, llm: new MockLLM() });

    expect(result.summary.contradicted).toBe(1);
    const bad = result.verdicts.find((v) => v.verdict === 'contradicted')!;
    expect(bad.claim).toBe('It was founded by Dalia Moss in 1910.');
    expect(bad.quotes[0]!.quote).toBe('It was founded by Dalia Moss in 1902.');
    expect(bad.quotes[0]!.source.url).toBe('https://example.test/orrin');
    expect(result.passages[bad.quotes[0]!.passageId]!.text).toContain(bad.quotes[0]!.quote);
    expect(bad.correction).toBe('It was founded by Dalia Moss in 1902.');
    expect(result.summary.supported).toBe(2);
    expect(result.summary.text).toBe('3 checked, 2 supported, 1 contradicted, 0 unverifiable');
  });

  it('marks claims with no evidence as unverifiable, never contradicted', async () => {
    const result = await runVerification({
      answer: 'The Orrin Library has a rooftop garden designed by Ilsa Varn in 1950.',
      documents,
      llm: new HeuristicLLM(),
    });
    expect(result.verdicts.map((v) => v.verdict)).toEqual(['unverifiable']);
  });

  it('works with no providers at all (everything unverifiable)', async () => {
    const result = await runVerification({ answer: 'The Orrin Library was founded in 1902.', llm: new MockLLM() });
    expect(result.summary.text).toBe('1 checked, 0 supported, 0 contradicted, 1 unverifiable');
  });
});
