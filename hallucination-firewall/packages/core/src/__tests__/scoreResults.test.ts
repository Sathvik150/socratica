import { describe, expect, it } from 'vitest';
import { isCorrectionGrounded, scoreResults, type ClaimVerdict } from '../index.js';

const src = { title: 't', providerId: 'documents' };
const v = (over: Partial<ClaimVerdict>): ClaimVerdict => ({
  claimId: 'c1',
  claim: 'The Zentha Bridge opened in 1987.',
  verdict: 'unverifiable',
  confidence: 0.8,
  rationale: '',
  quotes: [],
  ...over,
});

describe('scoreResults', () => {
  it('summarizes counts', () => {
    const { summary } = scoreResults([
      v({ verdict: 'supported' }),
      v({ verdict: 'supported' }),
      v({ verdict: 'contradicted', quotes: [{ passageId: 'p1', quote: 'It opened in 1991.', source: src }] }),
      v({ verdict: 'unverifiable' }),
    ]);
    expect(summary).toMatchObject({ checked: 4, supported: 2, contradicted: 1, unverifiable: 1 });
    expect(summary.text).toBe('4 checked, 2 supported, 1 contradicted, 1 unverifiable');
  });

  it('handles an empty answer', () => {
    expect(scoreResults([]).summary.text).toBe('0 checked, 0 supported, 0 contradicted, 0 unverifiable');
  });

  it('keeps a correction only when the quotes support it', () => {
    const quotes = [{ passageId: 'p1', quote: 'It opened to traffic in 1991.', source: src }];
    const kept = scoreResults([v({ verdict: 'contradicted', quotes, correction: 'The Zentha Bridge opened in 1991.' })]);
    expect(kept.verdicts[0]?.correction).toBe('The Zentha Bridge opened in 1991.');

    const dropped = scoreResults([v({ verdict: 'contradicted', quotes, correction: 'The Zentha Bridge opened in 1993.' })]);
    expect(dropped.verdicts[0]?.correction).toBeUndefined();
  });

  it('drops corrections on verdicts that are not contradicted', () => {
    const out = scoreResults([v({ verdict: 'supported', correction: 'x y z' })]);
    expect(out.verdicts[0]?.correction).toBeUndefined();
  });
});

describe('isCorrectionGrounded', () => {
  it('rejects a correction identical to the claim', () => {
    expect(isCorrectionGrounded('The bridge opened in 1987.', 'The bridge opened in 1987.', ['The bridge opened in 1987.'])).toBe(false);
  });
  it('rejects new entities that are not in the quotes', () => {
    expect(isCorrectionGrounded('Ilsa Varn designed it.', 'Tomas Reel designed it.', ['It was designed by Petra Lund.'])).toBe(false);
    expect(isCorrectionGrounded('Petra Lund designed it.', 'Tomas Reel designed it.', ['It was designed by Petra Lund.'])).toBe(true);
  });
});
