import { describe, expect, it } from 'vitest';
import { verify } from '../index.js';

describe('sdk verify()', () => {
  it('verifies an answer against supplied evidence offline', async () => {
    const result = await verify({
      question: 'When did the Zentha Bridge open?',
      answer: 'The Zentha Bridge opened in 1987.',
      evidence: [{ title: 'Zentha Bridge', text: 'The Zentha Bridge opened in 1991 after six years of work.' }],
    });
    expect(result.summary.contradicted).toBe(1);
    expect(result.verdicts[0]?.correction).toBe('The Zentha Bridge opened in 1991.');
  });

  it('is unverifiable without evidence', async () => {
    const result = await verify({ answer: 'The Zentha Bridge opened in 1987.' });
    expect(result.verdicts[0]?.verdict).toBe('unverifiable');
  });
});
