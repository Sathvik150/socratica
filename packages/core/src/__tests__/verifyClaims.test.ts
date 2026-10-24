import { describe, expect, it } from 'vitest';
import { MockLLM, isVerbatimQuote, verifyClaim, type Claim, type Passage } from '../index.js';

const claim: Claim = { id: 'c1', text: 'The Zentha Bridge opened in 1987.', span: { start: 0, end: 33 }, context: 'The Zentha Bridge opened in 1987.' };
const passage: Passage = {
  id: 'p1',
  text: 'The Zentha Bridge is a suspension bridge in Velmora. It opened to traffic in 1991 after six years of construction.',
  source: { title: 'Zentha Bridge', url: 'https://example.test/zentha', providerId: 'documents' },
  score: 0.9,
};

const respond = (obj: unknown) => new MockLLM(JSON.stringify(obj));

describe('isVerbatimQuote', () => {
  it('accepts exact substrings and rejects anything else', () => {
    expect(isVerbatimQuote('It opened to traffic in 1991', passage)).toBe(true);
    expect(isVerbatimQuote('It opened to traffic in 1987', passage)).toBe(false);
    expect(isVerbatimQuote('it opened to traffic in 1991', passage)).toBe(false); // case matters
    expect(isVerbatimQuote('It opened  to traffic in 1991', passage)).toBe(false); // whitespace matters
    expect(isVerbatimQuote('in 1991', passage)).toBe(false); // too short to cite
    expect(isVerbatimQuote('It opened to traffic in 1991', undefined)).toBe(false);
  });
});

describe('verifyClaim three-way logic', () => {
  it('returns unverifiable without calling the LLM when there is no evidence', async () => {
    const llm = respond({ verdict: 'contradicted', confidence: 1, rationale: 'x', quotes: [] });
    const v = await verifyClaim(claim, [], llm);
    expect(v.verdict).toBe('unverifiable');
    expect(v.downgradeReason).toBe('no-evidence');
    expect(llm.prompts).toHaveLength(0);
  });

  it('keeps a contradicted verdict backed by a verbatim quote', async () => {
    const v = await verifyClaim(
      claim,
      [passage],
      respond({
        verdict: 'contradicted',
        confidence: 0.9,
        rationale: 'The passage says 1991.',
        quotes: [{ passage_id: 'p1', quote: 'It opened to traffic in 1991 after six years of construction.' }],
        correction: 'The Zentha Bridge opened in 1991.',
      }),
    );
    expect(v.verdict).toBe('contradicted');
    expect(v.quotes[0]?.source.url).toBe('https://example.test/zentha');
    expect(v.correction).toBe('The Zentha Bridge opened in 1991.');
  });

  it('downgrades a verdict with a fabricated quote to unverifiable', async () => {
    const v = await verifyClaim(
      claim,
      [passage],
      respond({
        verdict: 'contradicted',
        confidence: 0.95,
        rationale: 'The passage says it opened in 1991.',
        quotes: [{ passage_id: 'p1', quote: 'The bridge was completed and opened in 1991.' }],
        correction: 'The Zentha Bridge opened in 1991.',
      }),
    );
    expect(v.verdict).toBe('unverifiable');
    expect(v.rawVerdict).toBe('contradicted');
    expect(v.downgradeReason).toBe('quote-not-in-passage');
    expect(v.correction).toBeUndefined();
    expect(v.quotes).toEqual([]);
  });

  it('downgrades when one of several quotes is fabricated', async () => {
    const v = await verifyClaim(
      claim,
      [passage],
      respond({
        verdict: 'supported',
        confidence: 0.9,
        rationale: 'x',
        quotes: [
          { passage_id: 'p1', quote: 'The Zentha Bridge is a suspension bridge' },
          { passage_id: 'p1', quote: 'The Zentha Bridge opened in 1987' },
        ],
      }),
    );
    expect(v.verdict).toBe('unverifiable');
    expect(v.downgradeReason).toBe('quote-not-in-passage');
  });

  it('downgrades a quote attributed to the wrong passage id', async () => {
    const v = await verifyClaim(
      claim,
      [passage],
      respond({ verdict: 'contradicted', confidence: 0.9, rationale: 'x', quotes: [{ passage_id: 'p9', quote: 'It opened to traffic in 1991' }] }),
    );
    expect(v.verdict).toBe('unverifiable');
    expect(v.downgradeReason).toBe('quote-not-in-passage');
  });

  it('downgrades supported/contradicted without any quotes', async () => {
    const v = await verifyClaim(claim, [passage], respond({ verdict: 'contradicted', confidence: 0.9, rationale: 'x', quotes: [] }));
    expect(v.verdict).toBe('unverifiable');
    expect(v.downgradeReason).toBe('no-quotes');
  });

  it('downgrades low-confidence verdicts', async () => {
    const v = await verifyClaim(
      claim,
      [passage],
      respond({ verdict: 'contradicted', confidence: 0.3, rationale: 'x', quotes: [{ passage_id: 'p1', quote: 'It opened to traffic in 1991' }] }),
    );
    expect(v.verdict).toBe('unverifiable');
    expect(v.downgradeReason).toBe('low-confidence');
  });

  it('treats malformed or schema-violating output as unverifiable', async () => {
    for (const raw of ['not json', '{"verdict":"false","confidence":1,"rationale":"x","quotes":[]}', '{"verdict":"supported"}']) {
      const v = await verifyClaim(claim, [passage], new MockLLM(raw));
      expect(v.verdict).toBe('unverifiable');
      expect(v.downgradeReason).toBe('invalid-llm-output');
    }
  });

  it('accepts JSON wrapped in a code fence', async () => {
    const body = JSON.stringify({ verdict: 'supported', confidence: 0.9, rationale: 'x', quotes: [{ passage_id: 'p1', quote: 'The Zentha Bridge is a suspension bridge' }] });
    const v = await verifyClaim(claim, [passage], new MockLLM('```json\n' + body + '\n```'));
    expect(v.verdict).toBe('supported');
  });

  it('turns LLM errors into unverifiable', async () => {
    const llm = new MockLLM(() => {
      throw new Error('HTTP 500');
    });
    const v = await verifyClaim(claim, [passage], llm);
    expect(v.verdict).toBe('unverifiable');
    expect(v.downgradeReason).toBe('llm-error');
  });

  it('never attaches a correction to non-contradicted verdicts', async () => {
    const v = await verifyClaim(
      claim,
      [passage],
      respond({ verdict: 'unverifiable', confidence: 0.9, rationale: 'x', quotes: [], correction: 'Something else.' }),
    );
    expect(v.correction).toBeUndefined();
  });

  it('builds a prompt that restricts the model to the passages and asks for no hidden reasoning', async () => {
    const llm = respond({ verdict: 'unverifiable', confidence: 0.5, rationale: 'x', quotes: [] });
    await verifyClaim(claim, [passage], llm);
    const prompt = llm.prompts[0]!;
    expect(prompt).toContain('using ONLY the PASSAGES');
    expect(prompt).toContain('Do not include step-by-step reasoning');
    expect(prompt).toContain(passage.text);
  });
});
