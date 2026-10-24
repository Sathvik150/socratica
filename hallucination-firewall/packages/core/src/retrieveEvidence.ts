import type { Claim, EvidenceProvider, Passage } from './types.js';
import { normalizeWhitespace } from './text.js';

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
}

/**
 * Query every provider for every claim, merge, de-duplicate and rank.
 * A failing provider never fails the run: its claims just get fewer passages,
 * which can only push verdicts toward `unverifiable`.
 */
export async function retrieveEvidence(
  claims: Claim[],
  providers: EvidenceProvider[],
  options: RetrieveEvidenceOptions = {},
): Promise<RetrievedEvidence> {
  const limit = options.limit ?? 4;
  const result: RetrievedEvidence = { byClaim: {}, passages: {}, errors: [] };
  const idByText = new Map<string, string>();
  let next = 1;

  for (const claim of claims) {
    const merged: Array<Omit<Passage, 'id'>> = [];
    await Promise.all(
      providers.map(async (provider) => {
        try {
          const found = await provider.retrieve(claim, {
            limit,
            ...(options.question ? { question: options.question } : {}),
          });
          merged.push(...found);
        } catch (err) {
          result.errors.push({
            providerId: provider.id,
            claimId: claim.id,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );

    const seen = new Set<string>();
    const ranked: Passage[] = [];
    for (const p of merged.sort((a, b) => b.score - a.score || a.source.title.localeCompare(b.source.title))) {
      const key = `${p.source.url ?? p.source.title}\u0000${normalizeWhitespace(p.text)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let id = idByText.get(key);
      if (!id) {
        id = `p${next++}`;
        idByText.set(key, id);
        result.passages[id] = { ...p, id };
      }
      ranked.push(result.passages[id]!);
      if (ranked.length >= limit) break;
    }
    result.byClaim[claim.id] = ranked;
  }
  return result;
}
