import type { EvidenceDocument, EvidenceProvider, LLMProvider, VerificationResult, VerifyOptions } from './types.js';
import { extractClaims } from './extractClaims.js';
import { retrieveEvidence } from './retrieveEvidence.js';
import { verifyClaims } from './verifyClaims.js';
import { scoreResults } from './scoreResults.js';
import { DocumentEvidenceProvider } from './providers/evidence/documents.js';

export interface VerifyInput {
  answer: string;
  question?: string;
  /** User-supplied documents. Always searched first when present. */
  documents?: EvidenceDocument[];
  /** Additional evidence providers (e.g. Wikipedia, web search). */
  providers?: EvidenceProvider[];
  llm: LLMProvider;
  options?: VerifyOptions;
}

export interface VerifyOutput extends VerificationResult {
  errors: Array<{ providerId: string; claimId: string; message: string }>;
}

/** Full pipeline: extract -> retrieve -> verify -> score. */
export async function runVerification(input: VerifyInput): Promise<VerifyOutput> {
  const opts = input.options ?? {};
  const claims = extractClaims(input.answer, { maxClaims: opts.maxClaims ?? 20 });
  const providers: EvidenceProvider[] = [
    ...(input.documents?.length ? [new DocumentEvidenceProvider(input.documents)] : []),
    ...(input.providers ?? []),
  ];
  const evidence = await retrieveEvidence(claims, providers, {
    limit: opts.passagesPerClaim ?? 4,
    ...(input.question ? { question: input.question } : {}),
    ...(opts.concurrency ? { concurrency: opts.concurrency } : {}),
    ...(opts.retrievalDeadlineMs ? { deadlineMs: opts.retrievalDeadlineMs } : {}),
  });
  const raw = await verifyClaims(claims, evidence.byClaim, input.llm, {
    ...opts,
    ...(input.question ? { question: input.question } : {}),
  });
  const { verdicts, summary } = scoreResults(raw);
  return { claims, verdicts, passages: evidence.passages, summary, errors: evidence.errors };
}
