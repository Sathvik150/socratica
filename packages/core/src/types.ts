/**
 * Core types for Socratica.
 *
 * This package is platform-agnostic: nothing here knows about the DOM,
 * browser-extension APIs, or which chatbot produced the text being verified.
 */

/** The three-way verdict. `contradicted` is reserved for explicit conflict with a retrieved passage. */
export type Verdict = 'supported' | 'contradicted' | 'unverifiable';

export const VERDICTS: readonly Verdict[] = ['supported', 'contradicted', 'unverifiable'];

/** An atomic, checkable factual claim extracted from an answer. */
export interface Claim {
  /** Stable id within one verification run, e.g. `c1`. */
  id: string;
  /** The claim text, exactly as it appears in the answer (trimmed). */
  text: string;
  /** Character offsets of `text` inside the original answer string. */
  span: { start: number; end: number };
  /**
   * The surrounding sentence(s) the claim came from, used to resolve pronouns
   * during retrieval and verification. Not itself judged.
   */
  context: string;
}

/** Where a passage came from. */
export interface EvidenceSource {
  title: string;
  url?: string;
  /** Id of the provider that returned it, e.g. `documents`, `wikipedia`, `web-search`. */
  providerId: string;
  /** Reviews and publication metadata must not be mistaken for direct assertions of a quoted claim. */
  kind?: 'review' | 'metadata' | 'structured';
}

/** A retrieved passage of evidence text. */
export interface Passage {
  /** Unique id within one verification run, e.g. `p3`. */
  id: string;
  text: string;
  source: EvidenceSource;
  /** Retrieval relevance score in [0, 1]; higher is more relevant. */
  score: number;
}

/** A user-supplied document to verify against. */
export interface EvidenceDocument {
  title: string;
  text: string;
  url?: string;
}

/** A verbatim quote from a retrieved passage that a verdict relies on. */
export interface EvidenceQuote {
  passageId: string;
  /** Guaranteed (by post-validation) to be a verbatim substring of the passage text. */
  quote: string;
  source: EvidenceSource;
}

/** Why a verdict was downgraded to `unverifiable` by the post-validation step. */
export type DowngradeReason =
  | 'no-evidence'
  | 'invalid-llm-output'
  | 'quote-not-in-passage'
  | 'no-quotes'
  | 'incomplete-review'
  | 'low-confidence'
  | 'llm-error';

export interface ClaimVerdict {
  claimId: string;
  claim: string;
  verdict: Verdict;
  /** Confidence in [0, 1] in the final verdict. */
  confidence: number;
  /** Short, human-readable reason. Never contains hidden chain-of-thought. */
  rationale: string;
  /** Empty only when `verdict` is `unverifiable`. */
  quotes: EvidenceQuote[];
  /** What the model originally answered, before post-validation (for transparency). */
  rawVerdict?: Verdict;
  /** Set when post-validation changed the verdict to `unverifiable`. */
  downgradeReason?: DowngradeReason;
  /** Proposed correction; only present for `contradicted` and only when quotes support it. */
  correction?: string;
}

export interface VerificationSummary {
  checked: number;
  supported: number;
  contradicted: number;
  unverifiable: number;
  /** e.g. "4 checked, 2 supported, 1 contradicted, 1 unverifiable" */
  text: string;
}

export interface VerificationResult {
  claims: Claim[];
  verdicts: ClaimVerdict[];
  /** All passages retrieved, keyed by passage id, so every quote can be traced. */
  passages: Record<string, Passage>;
  summary: VerificationSummary;
}

/** Minimal LLM abstraction. Implementations must not log prompts or keys. */
export interface LLMProvider {
  readonly id: string;
  complete(prompt: string): Promise<string>;
}

export interface RetrieveOptions {
  /** Max passages to return for one claim. */
  limit: number;
  /** Optional question/context that produced the answer. Used only as a retrieval hint. */
  question?: string;
}

/** Pluggable evidence source. */
export interface EvidenceProvider {
  readonly id: string;
  /** Returns passages without ids; ids are assigned by `retrieveEvidence`. */
  retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>>;
}

/**
 * Minimal `fetch` signature so core never depends on DOM or Node typings.
 * Pass `globalThis.fetch` (browser, service worker, Node 20+).
 */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: unknown; redirect?: 'error'; credentials?: 'omit'; referrerPolicy?: 'no-referrer' },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
  headers?: { get(name: string): string | null };
  /** Optional streaming body, used to bound downloaded page size before buffering it all. */
  body?: { getReader(): {
    read(): Promise<{ done: boolean; value?: Uint8Array }>;
    cancel(): Promise<void>;
  } } | null;
}>;

export interface VerifyOptions {
  /** Passages retrieved per claim (after merging providers). Default 4. */
  passagesPerClaim?: number;
  /** Non-`unverifiable` verdicts below this confidence are downgraded. Default 0.5. */
  minConfidence?: number;
  /** Quotes shorter than this are rejected as too weak to cite. Default 12. */
  minQuoteLength?: number;
  /** Max claims verified per answer. Default 20. */
  maxClaims?: number;
  /**
   * Stop waiting for evidence after this many milliseconds. Claims whose sources have not
   * answered by then are judged on what arrived (usually `unverifiable`) and an error is
   * reported per slow source. Default: no deadline.
   */
  retrievalDeadlineMs?: number;
  /**
   * Claims judged at the same time. Default 4. Evidence for every claim is requested at once:
   * each source paces its own requests.
   */
  concurrency?: number;
}
