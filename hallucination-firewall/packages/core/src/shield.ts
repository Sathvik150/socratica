/**
 * Shield Mode — DOCUMENTED INTERFACE ONLY, NOT IMPLEMENTED.
 *
 * A browser extension cannot guarantee that it intercepts a chatbot answer
 * before the user sees it, so the extension ships "Review Mode" (verify after
 * streaming completes). Guaranteed pre-display blocking requires sitting
 * between the application and the model API. This interface describes what
 * such API middleware would implement on top of `core`; nothing in this repo
 * implements it.
 */
import type { EvidenceDocument, VerificationResult } from './types.js';

export type ShieldPolicy = 'annotate' | 'block-contradicted' | 'block-unverified';

export interface ShieldRequest {
  question: string;
  /** Full model answer, buffered by the middleware before it is shown. */
  answer: string;
  documents?: EvidenceDocument[];
  policy: ShieldPolicy;
}

export interface ShieldDecision {
  /** Whether the middleware lets the answer through to the user. */
  release: boolean;
  /** Answer text to display (possibly annotated); undefined when blocked. */
  displayText?: string;
  result: VerificationResult;
}

export interface ShieldMiddleware {
  beforeDisplay(request: ShieldRequest): Promise<ShieldDecision>;
}
