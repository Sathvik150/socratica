import { describe, expect, it } from 'vitest';
import { VERDICTS } from '../index.js';

describe('types', () => {
  it('exposes exactly the three verdicts', () => {
    expect([...VERDICTS].sort()).toEqual(['contradicted', 'supported', 'unverifiable']);
  });
});
