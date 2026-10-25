import type { Claim, ClaimVerdict, DowngradeReason, EvidenceQuote, LLMProvider, Passage, VerifyOptions } from './types.js';
import { buildVerifierPrompt, parseLLMVerdict } from './prompt.js';

export interface VerifyClaimsOptions extends VerifyOptions {
  question?: string;
}

const DEFAULTS = { minConfidence: 0.5, minQuoteLength: 12 };

/**
 * Validate that a quote is a verbatim substring of the passage it cites.
 * Exact match only: no case folding, whitespace collapsing or fuzzy matching.
 */
export function isVerbatimQuote(quote: string, passage: Passage | undefined, minLength = DEFAULTS.minQuoteLength): boolean {
  if (!passage) return false;
  if (quote.trim().length < minLength) return false;
  return passage.text.includes(quote);
}

function downgrade(base: Omit<ClaimVerdict, 'verdict' | 'downgradeReason'>, reason: DowngradeReason, rationale: string): ClaimVerdict {
  const { correction: _drop, ...rest } = base;
  return { ...rest, verdict: 'unverifiable', downgradeReason: reason, rationale, confidence: Math.min(base.confidence, 0.5) };
}

/**
 * Judge one claim against ONLY its retrieved passages, then post-validate:
 *  - no passages            -> unverifiable (the LLM is not even called)
 *  - unparseable/invalid    -> unverifiable
 *  - any non-verbatim quote -> unverifiable
 *  - supported/contradicted without quotes -> unverifiable
 *  - confidence below threshold -> unverifiable
 * So `contradicted` can only survive with a real, quoted, conflicting passage.
 */
export async function verifyClaim(
  claim: Claim,
  passages: Passage[],
  llm: LLMProvider,
  options: VerifyClaimsOptions = {},
): Promise<ClaimVerdict> {
  const minConfidence = options.minConfidence ?? DEFAULTS.minConfidence;
  const minQuoteLength = options.minQuoteLength ?? DEFAULTS.minQuoteLength;
  const base = { claimId: claim.id, claim: claim.text, confidence: 0, rationale: '', quotes: [] as EvidenceQuote[] };

  if (passages.length === 0) {
    return { ...base, verdict: 'unverifiable', downgradeReason: 'no-evidence', rationale: 'No evidence passages were found for this claim.' };
  }

  let raw: string;
  try {
    raw = await llm.complete(buildVerifierPrompt(claim, passages, options.question));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return { ...base, verdict: 'unverifiable', downgradeReason: 'llm-error', rationale: `The verifier could not be reached (${message}).` };
  }

  const parsed = parseLLMVerdict(raw);
  if (!parsed) {
    return { ...base, verdict: 'unverifiable', downgradeReason: 'invalid-llm-output', rationale: 'The verifier returned output that did not match the required schema.' };
  }

  const byId = new Map(passages.map((p) => [p.id, p]));
  const allValid = parsed.quotes.every((q) => isVerbatimQuote(q.quote, byId.get(q.passage_id), minQuoteLength));
  const quotes: EvidenceQuote[] = parsed.quotes
    .filter((q) => isVerbatimQuote(q.quote, byId.get(q.passage_id), minQuoteLength))
    .map((q) => ({ passageId: q.passage_id, quote: q.quote, source: byId.get(q.passage_id)!.source }));

  const quotedScores = quotes.map((q) => byId.get(q.passageId)!.score);
  const retrievalStrength = quotedScores.length ? Math.max(...quotedScores) : 0;
  const confidence = Math.round(Math.min(parsed.confidence, 0.5 + 0.5 * retrievalStrength) * 100) / 100;

  const verdict: ClaimVerdict = {
    ...base,
    verdict: parsed.verdict,
    rawVerdict: parsed.verdict,
    confidence,
    rationale: parsed.rationale.trim(),
    quotes,
    ...(parsed.verdict === 'contradicted' && parsed.correction ? { correction: parsed.correction.trim() } : {}),
  };

  if (parsed.verdict === 'unverifiable') {
    const { correction: _drop, ...rest } = verdict;
    return rest;
  }
  if (!allValid) {
    return downgrade(verdict, 'quote-not-in-passage', 'The verifier cited text that does not appear verbatim in the retrieved evidence, so its verdict was discarded.');
  }
  if (quotes.length === 0) {
    return downgrade(verdict, 'no-quotes', 'The verifier gave a verdict without quoting evidence, so it was discarded.');
  }
  if (quotes.some((q) => q.source.kind === 'review' && q.quote !== byId.get(q.passageId)!.text)) {
    return downgrade(verdict, 'incomplete-review', 'A fact-check citation must include both the reviewed claim and the publisher rating; quoting the claim alone does not establish its truth.');
  }
  if (confidence < minConfidence) {
    return downgrade(verdict, 'low-confidence', `Evidence was too weak for a confident verdict (${verdict.rationale})`);
  }
  return verdict;
}

export async function verifyClaims(
  claims: Claim[],
  evidence: Record<string, Passage[]>,
  llm: LLMProvider,
  options: VerifyClaimsOptions = {},
): Promise<ClaimVerdict[]> {
  const out: ClaimVerdict[] = [];
  // Sequential on purpose: keeps request rate to the user's own API key modest.
  for (const claim of claims) out.push(await verifyClaim(claim, evidence[claim.id] ?? [], llm, options));
  return out;
}
