import type { ClaimVerdict, VerificationSummary } from './types.js';
import { contentTokens, numbers } from './text.js';

/**
 * A correction is kept only when every new fact it introduces (content words
 * and numbers not already in the claim) appears in the contradicting quotes.
 */
export function isCorrectionGrounded(correction: string, claim: string, quotes: string[]): boolean {
  const claimTokens = new Set(contentTokens(claim));
  const quoteText = quotes.join(' ');
  const quoteTokens = new Set(contentTokens(quoteText));
  const quoteNumbers = new Set(numbers(quoteText));
  const newTokens = contentTokens(correction).filter((t) => !claimTokens.has(t));
  if (newTokens.length === 0) return false; // identical to the claim: not a correction
  if (!newTokens.every((t) => quoteTokens.has(t))) return false;
  return numbers(correction).every((n) => quoteNumbers.has(n) || numbers(claim).includes(n));
}

/** Apply correction grounding to each verdict. */
export function finalizeVerdicts(verdicts: ClaimVerdict[]): ClaimVerdict[] {
  return verdicts.map((v) => {
    if (v.correction === undefined) return v;
    const keep =
      v.verdict === 'contradicted' &&
      isCorrectionGrounded(
        v.correction,
        v.claim,
        v.quotes.map((q) => q.quote),
      );
    if (keep) return v;
    const { correction: _drop, ...rest } = v;
    return rest;
  });
}

export function summarize(verdicts: ClaimVerdict[]): VerificationSummary {
  const count = (k: ClaimVerdict['verdict']) => verdicts.filter((v) => v.verdict === k).length;
  const supported = count('supported');
  const contradicted = count('contradicted');
  const unverifiable = count('unverifiable');
  const checked = verdicts.length;
  return {
    checked,
    supported,
    contradicted,
    unverifiable,
    text: `${checked} checked, ${supported} supported, ${contradicted} contradicted, ${unverifiable} unverifiable`,
  };
}

/** Finalize verdicts (correction grounding) and compute the per-answer summary. */
export function scoreResults(verdicts: ClaimVerdict[]): { verdicts: ClaimVerdict[]; summary: VerificationSummary } {
  const finalized = finalizeVerdicts(verdicts);
  return { verdicts: finalized, summary: summarize(finalized) };
}
