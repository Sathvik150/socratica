/**
 * @hallucination-firewall/sdk — the small public surface over core.
 *
 *   const result = await verify({ question, answer, evidence: [{ title, text, url }] });
 *
 * By default this runs fully offline: evidence comes only from the documents
 * you pass, and the judge is the deterministic `HeuristicLLM`. Pass `llm`
 * (e.g. `new OpenAIProvider({ apiKey, fetch })`) and/or extra `providers`
 * (e.g. `new WikipediaEvidenceProvider({ fetch })`) to go further.
 */
import {
  HeuristicLLM,
  runVerification,
  type EvidenceDocument,
  type EvidenceProvider,
  type LLMProvider,
  type VerifyOptions,
  type VerifyOutput,
} from '@hallucination-firewall/core';

export interface VerifyRequest {
  answer: string;
  question?: string;
  evidence?: EvidenceDocument[];
  llm?: LLMProvider;
  providers?: EvidenceProvider[];
  options?: VerifyOptions;
}

export async function verify(request: VerifyRequest): Promise<VerifyOutput> {
  return runVerification({
    answer: request.answer,
    llm: request.llm ?? new HeuristicLLM(),
    ...(request.question ? { question: request.question } : {}),
    ...(request.evidence ? { documents: request.evidence } : {}),
    ...(request.providers ? { providers: request.providers } : {}),
    ...(request.options ? { options: request.options } : {}),
  });
}

export * from '@hallucination-firewall/core';
