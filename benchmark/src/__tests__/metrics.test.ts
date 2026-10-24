import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { computeMetrics } from '../metrics.js';
import { loadDataset, parseJsonl } from '../dataset.js';
import { runBenchmark } from '../run.js';
import type { BaselineVerifier } from '../verifiers.js';

describe('computeMetrics', () => {
  it('computes precision, recall, FPR and C-vs-U accuracy', () => {
    const m = computeMetrics([
      { gold: 'contradicted', predicted: 'contradicted' },
      { gold: 'contradicted', predicted: 'unverifiable' },
      { gold: 'unverifiable', predicted: 'contradicted' },
      { gold: 'unverifiable', predicted: 'unverifiable' },
      { gold: 'supported', predicted: 'supported' },
      { gold: 'supported', predicted: 'unverifiable' },
    ]);
    expect(m.accuracy).toBeCloseTo(3 / 6);
    expect(m.perLabel.contradicted.precision).toBeCloseTo(1 / 2);
    expect(m.perLabel.contradicted.recall).toBeCloseTo(1 / 2);
    expect(m.perLabel.supported.precision).toBe(1);
    expect(m.contradictedFalsePositiveRate).toBeCloseTo(1 / 4);
    expect(m.contradictedVsUnverifiableAccuracy).toBeCloseTo(2 / 4);
    expect(m.confusion.unverifiable.contradicted).toBe(1);
  });

  it('reports n/a (null) instead of inventing values when undefined', () => {
    const m = computeMetrics([{ gold: 'supported', predicted: 'supported' }]);
    expect(m.perLabel.contradicted.precision).toBeNull();
    expect(m.contradictedVsUnverifiableAccuracy).toBeNull();
  });
});

describe('dataset', () => {
  it('has at least 30 valid items covering all three labels', () => {
    const items = loadDataset(fileURLToPath(new URL('../../data/benchmark.jsonl', import.meta.url)));
    expect(items.length).toBeGreaterThanOrEqual(30);
    expect(new Set(items.map((i) => i.label))).toEqual(new Set(['supported', 'contradicted', 'unverifiable']));
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it('rejects malformed lines', () => {
    expect(() => parseJsonl('{"id":"x","claim":"c","evidence":[],"label":"false"}')).toThrow(/line 1/);
  });
});

describe('runBenchmark', () => {
  it('runs any BaselineVerifier', async () => {
    const always: BaselineVerifier = { name: 'always-unverifiable', verify: async () => 'unverifiable' };
    const items = parseJsonl(
      ['{"id":"a","claim":"x","evidence":[],"label":"unverifiable"}', '{"id":"b","claim":"y","evidence":[],"label":"contradicted"}'].join('\n'),
    );
    const { metrics } = await runBenchmark(items, always);
    expect(metrics.accuracy).toBe(0.5);
    expect(metrics.contradictedFalsePositiveRate).toBe(0);
  });
});
