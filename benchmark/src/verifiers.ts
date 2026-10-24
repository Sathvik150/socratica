import {
  DocumentEvidenceProvider,
  finalizeVerdicts,
  retrieveEvidence,
  verifyClaim,
  type Claim,
  type EvidenceDocument,
  type LLMProvider,
  type Verdict,
  type VerifyOptions,
} from '@hallucination-firewall/core';
import { contentTokensForBaseline } from './baselineText.js';

/**
 * Plug-in point for comparison. Wrap any existing verifier (an open-source
 * detector, another API) in this interface and add it to the runner.
 */
export interface BaselineVerifier {
  readonly name: string;
  verify(claim: string, evidence: EvidenceDocument[]): Promise<Verdict>;
}

/** Hallucination Firewall's own pipeline (retrieve -> judge -> post-validate) for a single given claim. */
export class FirewallVerifier implements BaselineVerifier {
  readonly name: string;
  constructor(
    private readonly llm: LLMProvider,
    private readonly options: VerifyOptions = {},
    model?: string,
  ) {
    this.name = `hallucination-firewall (${llm.id}${model ? `: ${model}` : ''})`;
  }

  async verify(text: string, evidence: EvidenceDocument[]): Promise<Verdict> {
    const claim: Claim = { id: 'c1', text, span: { start: 0, end: text.length }, context: text };
    const ev = await retrieveEvidence([claim], [new DocumentEvidenceProvider(evidence)], {
      limit: this.options.passagesPerClaim ?? 4,
    });
    const verdict = await verifyClaim(claim, ev.byClaim[claim.id] ?? [], this.llm, this.options);
    return finalizeVerdicts([verdict])[0]!.verdict;
  }
}

/**
 * Reference point only, not a re-implementation of any specific tool: a
 * naive binary "grounded or hallucinated" check of the kind many detectors
 * use. It has no `unverifiable` output, so missing evidence becomes
 * `contradicted`. It shows what the three-way split is protecting against.
 */
export class BinaryOverlapBaseline implements BaselineVerifier {
  readonly name = 'binary-overlap baseline (supported if >=80% token overlap, else contradicted)';
  async verify(claim: string, evidence: EvidenceDocument[]): Promise<Verdict> {
    const claimTokens = contentTokensForBaseline(claim);
    const evidenceTokens = new Set(evidence.flatMap((d) => contentTokensForBaseline(d.text)));
    const overlap = claimTokens.length ? claimTokens.filter((t) => evidenceTokens.has(t)).length / claimTokens.length : 0;
    return overlap >= 0.8 ? 'supported' : 'contradicted';
  }
}
