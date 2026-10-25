import { afterEach, describe, expect, it, vi } from 'vitest';
import { WikipediaEvidenceProvider, extractClaims, HeuristicLLM, runVerification, type FetchLike } from '../index.js';

const [claim, other] = extractClaims('The Zentha Bridge opened in 1987. The Zentha Bridge is in Velmora.');
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });
const limited = (header: string | null) => ({ ...ok({}), ok: false, status: 429, headers: { get: () => header } });
const search = { query: { search: [{ title: 'Zentha Bridge' }] } };
const article = { query: { pages: { 1: { extract: 'The Zentha Bridge opened in 1991 in Velmora.' } } } };

afterEach(() => vi.useRealTimers());

describe('Wikipedia shared cooldown', () => {
  it('stops concurrent and subsequent claims, reports remaining seconds, and resumes after expiry', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<FetchLike>().mockResolvedValue(limited('21'));
    const wiki = new WikipediaEvidenceProvider({ fetch });
    const results = await Promise.allSettled([wiki.retrieve(claim!, { limit: 2 }), wiki.retrieve(other!, { limit: 2 })]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(wiki.retrieve(other!, { limit: 2 })).rejects.toThrow('try again in 20 seconds');
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000);
    fetch.mockResolvedValue(ok({}));
    await expect(wiki.retrieve(claim!, { limit: 2 })).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(3); // subject search found nothing, so the claim's own search ran too
  });

  it.each([null, '', 'invalid', '-1'])('uses a safe fallback for Retry-After %s', async (header) => {
    vi.useFakeTimers();
    const fetch = vi.fn<FetchLike>().mockResolvedValue(limited(header));
    const wiki = new WikipediaEvidenceProvider({ fetch });
    await expect(wiki.retrieve(claim!, { limit: 2 })).rejects.toThrow('30 seconds');
    await expect(wiki.retrieve(other!, { limit: 2 })).rejects.toThrow('30 seconds');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('honors an HTTP-date Retry-After', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const fetch = vi.fn<FetchLike>().mockResolvedValue(limited('Thu, 01 Jan 2026 00:01:00 GMT'));
    await expect(new WikipediaEvidenceProvider({ fetch }).retrieve(claim!, { limit: 2 })).rejects.toThrow('60 seconds');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('remembers a second 429 after the one allowed short retry', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<FetchLike>().mockResolvedValueOnce(limited('1')).mockResolvedValue(limited('21'));
    const wiki = new WikipediaEvidenceProvider({ fetch });
    const result = expect(wiki.retrieve(claim!, { limit: 2 })).rejects.toThrow('21 seconds');
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    await expect(wiki.retrieve(other!, { limit: 2 })).rejects.toThrow('21 seconds');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('shares search/extract work and serves cached evidence during cooldown', async () => {
    const fetch = vi.fn<FetchLike>(async (url) => ok(url.includes('list=search') ? search : article));
    const wiki = new WikipediaEvidenceProvider({ fetch });
    const results = await Promise.all([wiki.retrieve(claim!, { limit: 2 }), wiki.retrieve(claim!, { limit: 2 })]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0]!.length).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockResolvedValue(limited('21'));
    // Another claim about the same subject is answered from the cached search and article, even while rate-limited.
    expect((await wiki.retrieve(other!, { limit: 2 })).length).toBeGreaterThan(0);
    await expect(wiki.retrieve(claim!, { limit: 2 })).resolves.toEqual(results[0]);
    expect(fetch).toHaveBeenCalledTimes(2);
    // A claim about something else still needs a request, and gets the cooldown error.
    const [unrelated] = extractClaims('The Orrin Library holds 2.4 million volumes.');
    await expect(wiki.retrieve(unrelated!, { limit: 2 })).rejects.toThrow('21 seconds');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('applies extract 429 cooldowns and does not cache failed extracts', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<FetchLike>().mockResolvedValueOnce(ok(search)).mockResolvedValueOnce(limited('21')).mockResolvedValue(ok(article));
    const wiki = new WikipediaEvidenceProvider({ fetch });
    await expect(wiki.retrieve(claim!, { limit: 2 })).rejects.toThrow('21 seconds');
    await expect(wiki.retrieve(other!, { limit: 2 })).rejects.toThrow('21 seconds');
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(21_000);
    expect((await wiki.retrieve(claim!, { limit: 2 })).length).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('keeps missing evidence unverifiable when Wikipedia is rate-limited', async () => {
    const fetch = vi.fn<FetchLike>().mockResolvedValue(limited('21'));
    const result = await runVerification({
      answer: 'The Zentha Bridge opened in 1987. The Zentha Bridge is in Velmora.',
      llm: new HeuristicLLM(), providers: [new WikipediaEvidenceProvider({ fetch })],
    });
    expect(result.summary.checked).toBeGreaterThan(0);
    expect(result.summary.unverifiable).toBe(result.summary.checked);
    expect(result.summary.contradicted).toBe(0);
    expect(result.errors[0]?.message).toContain('try again in 21 seconds');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
