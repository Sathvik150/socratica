import { describe, expect, it } from 'vitest';
import { extractClaims } from '../index.js';

describe('extractClaims', () => {
  it('extracts factual sentences with exact spans', () => {
    const answer = 'The Zentha Bridge opened in 1987. It spans 1,240 meters across the Corvel River.';
    const claims = extractClaims(answer);
    expect(claims.map((c) => c.text)).toEqual([
      'The Zentha Bridge opened in 1987.',
      'It spans 1,240 meters across the Corvel River.',
    ]);
    for (const c of claims) expect(answer.slice(c.span.start, c.span.end)).toBe(c.text);
  });

  it('gives pronoun-led claims the previous sentence as context', () => {
    const [, second] = extractClaims('The Zentha Bridge opened in 1987. It spans 1,240 meters.');
    expect(second?.context).toContain('Zentha Bridge');
  });

  it('skips opinions, instructions, questions, hedges and filler', () => {
    const answer = [
      'Sure! Here is what I found.',
      'I think the Zentha Bridge is beautiful.',
      'You should visit it in the spring.',
      'Try walking across at sunset.',
      'Is it the longest bridge in Velmora?',
      'It might have been designed by Ilsa Varn.',
      'The best time to visit is probably May.',
      'Let me know if you have more questions.',
    ].join(' ');
    expect(extractClaims(answer)).toEqual([]);
  });

  it('splits compound sentences into atomic claims', () => {
    const answer = 'Mount Kessa is 4,102 meters tall, and it was first climbed in 1931.';
    const claims = extractClaims(answer);
    expect(claims.map((c) => c.text)).toEqual(['Mount Kessa is 4,102 meters tall', 'it was first climbed in 1931.']);
    for (const c of claims) expect(answer.slice(c.span.start, c.span.end)).toBe(c.text);
  });

  it('handles markdown lists, headings, and ignores code', () => {
    const answer = [
      '## Facts',
      '',
      '1. The Orrin Library holds 2.4 million volumes.',
      '- **Dalia Moss founded the Orrin Library in 1902.**',
      '```',
      'const founded = 1902; // The Orrin Library opened in 1902.',
      '```',
    ].join('\n');
    const claims = extractClaims(answer);
    expect(claims.map((c) => c.text)).toEqual([
      'The Orrin Library holds 2.4 million volumes.',
      'Dalia Moss founded the Orrin Library in 1902.',
    ]);
    for (const c of claims) expect(answer.slice(c.span.start, c.span.end)).toBe(c.text);
  });

  it('does not split on abbreviations or decimals', () => {
    const claims = extractClaims('Dr. Ilsa Varn measured 3.5 kilograms of ore in the Velmora mine.');
    expect(claims).toHaveLength(1);
  });

  it('respects maxClaims', () => {
    const answer = Array.from({ length: 10 }, (_, i) => `Station ${i} opened in ${1900 + i}.`).join(' ');
    expect(extractClaims(answer, { maxClaims: 3 })).toHaveLength(3);
  });
});
