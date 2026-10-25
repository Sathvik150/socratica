import { describe, expect, it } from 'vitest';
import { extractClaims, retrieveEvidence, type EvidenceProvider } from '../index.js';
import { mapConcurrent } from '../retrieveEvidence.js';
import { subjectQuery } from '../rank.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('mapConcurrent', () => {
  it('keeps result order and never runs more than the limit at once', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapConcurrent([30, 5, 20, 1, 10], 2, async (ms, i) => {
      running++;
      peak = Math.max(peak, running);
      await wait(ms);
      running--;
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });
});

describe('retrieveEvidence speed', () => {
  const claims = extractClaims('The Zentha Bridge opened in 1991. The Orrin Library holds 2.4 million volumes. Mount Kessa is 4,102 meters tall. Lake Corrow is in Velmora.');
  const slowProvider = (ms: number): EvidenceProvider => ({
    id: 'slow',
    retrieve: async (claim) => (await wait(ms), [{ text: claim.text, score: 1, source: { title: 't', providerId: 'slow' } }]),
  });

  it('checks claims in parallel', async () => {
    const t0 = Date.now();
    const ev = await retrieveEvidence(claims, [slowProvider(60)], { concurrency: 4 });
    expect(Date.now() - t0).toBeLessThan(60 * claims.length - 20); // serial would take 4 × 60 ms
    expect(Object.keys(ev.byClaim)).toHaveLength(claims.length);
  });

  it('assigns passage ids in claim order regardless of which claim finishes first', async () => {
    const jittery: EvidenceProvider = {
      id: 'jitter',
      retrieve: async (claim) => (await wait(claim.text.length % 3 === 0 ? 30 : 1), [{ text: claim.text, score: 1, source: { title: 't', providerId: 'jitter' } }]),
    };
    const a = await retrieveEvidence(claims, [jittery], { concurrency: 4 });
    const b = await retrieveEvidence(claims, [jittery], { concurrency: 1 });
    expect(a).toEqual(b);
  });

  it('stops waiting for a slow source at the deadline and reports it, keeping faster sources', async () => {
    const fast: EvidenceProvider = { id: 'fast', retrieve: async (claim) => [{ text: claim.text, score: 1, source: { title: 'f', providerId: 'fast' } }] };
    const t0 = Date.now();
    const ev = await retrieveEvidence(claims, [fast, slowProvider(5_000)], { deadlineMs: 80 });
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(Object.values(ev.byClaim).every((ids) => ids.length > 0)).toBe(true);
    expect(ev.errors[0]).toMatchObject({ providerId: 'slow' });
    expect(ev.errors[0]!.message).toBe('slow did not answer within 1 seconds.');
  });
});

describe('subjectQuery', () => {
  it('uses the claim subject, so claims about the same thing share one search', () => {
    const [a, b] = extractClaims('The Zentha Bridge opened in 1991. The Zentha Bridge is 1,240 meters long.');
    expect(subjectQuery(a!)).toBe('zentha bridge');
    expect(subjectQuery(b!)).toBe(subjectQuery(a!));
  });

  it('resolves a pronoun-led claim from its context and skips months', () => {
    const [, it] = extractClaims('The Orrin Library is in Velmora. It opened in March 1902.');
    expect(subjectQuery(it!)).toBe('orrin library');
  });
});
