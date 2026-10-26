import type { Claim, EvidenceProvider, Passage } from './types.js';
import { normalizeWhitespace } from './text.js';

declare const setTimeout: (fn: () => void, ms: number) => unknown;
declare const clearTimeout: (timer: unknown) => void;

export interface RetrievedEvidence {
  /** Ranked passages per claim id. */
  byClaim: Record<string, Passage[]>;
  /** Every passage by id, for tracing quotes back to sources. */
  passages: Record<string, Passage>;
  /** Provider failures (message only; never request bodies or keys). */
  errors: Array<{ providerId: string; claimId: string; message: string }>;
}

export interface RetrieveEvidenceOptions {
  limit?: number;
  question?: string;
  /**
   * Claims retrieved at the same time. Default: all of them, since each source already limits
   * its own requests in flight; a claim no longer waits behind another claim's slowest source.
   */
  concurrency?: number;
  /** Stop waiting for providers after this many milliseconds (whole run). Default: none. */
  deadlineMs?: number;
}

/** Run `task` over `items` with at most `limit` in flight, preserving result order. */
export async function mapConcurrent<T, R>(items: readonly T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await task(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

class DeadlineError extends Error {}

/** Most passages one page may give a claim while other pages have relevant ones. */
const PER_PAGE = 2;

/**
 * Query every provider for every claim, merge, de-duplicate and rank.
 * Claims run concurrently (sources still apply their own per-host request
 * pacing). A failing or slow provider never fails the run: its claims just get
 * fewer passages, which can only push verdicts toward `unverifiable`.
 */
export async function retrieveEvidence(
  claims: Claim[],
  providers: EvidenceProvider[],
  options: RetrieveEvidenceOptions = {},
): Promise<RetrievedEvidence> {
  const limit = options.limit ?? 4;
  const result: RetrievedEvidence = { byClaim: {}, passages: {}, errors: [] };

  // One shared deadline for the whole run.
  let deadlineTimer: unknown;
  const deadlineMs = options.deadlineMs;
  const deadline =
    deadlineMs === undefined
      ? undefined
      : new Promise<never>((_, reject) => {
          deadlineTimer = setTimeout(() => reject(new DeadlineError()), deadlineMs);
        });
  deadline?.catch(() => undefined); // only observed through Promise.race below

  const perClaim = await mapConcurrent(claims, options.concurrency ?? claims.length, async (claim) => {
    const merged: Array<Omit<Passage, 'id'>> = [];
    await Promise.all(
      providers.map(async (provider) => {
        try {
          const call = provider.retrieve(claim, { limit, ...(options.question ? { question: options.question } : {}) });
          const found = deadline ? await Promise.race([call, deadline]) : await call;
          merged.push(...found);
        } catch (err) {
          const message =
            err instanceof DeadlineError
              ? `${provider.id} did not answer within ${Math.max(1, Math.round(deadlineMs! / 1000))} seconds.`
              : err instanceof Error
                ? err.message
                : String(err);
          result.errors.push({ providerId: provider.id, claimId: claim.id, message });
        }
      }),
    );
    return merged;
  });
  if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);

  // Assign passage ids in claim order so results are deterministic regardless of timing.
  const idByText = new Map<string, string>();
  let next = 1;
  claims.forEach((claim, i) => {
    const seen = new Set<string>();
    const chosen: Array<{ p: Omit<Passage, 'id'>; key: string }> = [];
    const spare: typeof chosen = [];
    const fromPage = new Map<string, number>();
    for (const p of perClaim[i]!.sort((a, b) => b.score - a.score || a.source.title.localeCompare(b.source.title))) {
      const page = p.source.url ?? p.source.title;
      const key = `${page}\u0000${normalizeWhitespace(p.text)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // One long page ("Geological history of oxygen") must not fill every slot: a passage from
      // another page may be the one that states the fact.
      const count = fromPage.get(page) ?? 0;
      if (count >= PER_PAGE) {
        spare.push({ p, key });
        continue;
      }
      fromPage.set(page, count + 1);
      chosen.push({ p, key });
      if (chosen.length >= limit) break;
    }
    // Too few other pages: the next passages from the same ones fill the rest.
    chosen.push(...spare.slice(0, Math.max(0, limit - chosen.length)));
    result.byClaim[claim.id] = chosen.map(({ p, key }) => {
      let id = idByText.get(key);
      if (!id) {
        id = `p${next++}`;
        idByText.set(key, id);
        result.passages[id] = { ...p, id };
      }
      return result.passages[id]!;
    });
  });
  // Errors in claim order, too.
  const order = new Map(claims.map((c, i) => [c.id, i]));
  result.errors.sort((a, b) => order.get(a.claimId)! - order.get(b.claimId)! || a.providerId.localeCompare(b.providerId));
  return result;
}
