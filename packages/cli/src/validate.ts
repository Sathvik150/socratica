import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { MockLLM, scoreResults, verifyClaim, type Claim, type ClaimVerdict, type Passage, type VerificationSummary } from '@hallucination-firewall/core';

/**
 * Input for `hf-verify validate`: verdicts produced by ANY model (for example,
 * the assistant running this as a skill), plus the passages it was shown.
 */
export interface ValidateInput {
  claims: Array<{ id: string; text: string }>;
  /** Give `text`, or `path` to a file (relative to `baseDir`) whose contents are used verbatim. */
  passages: Array<{ id: string; text?: string; path?: string; title?: string; url?: string }>;
  verdicts: Array<{
    claimId: string;
    verdict: string;
    confidence?: number;
    rationale?: string;
    quotes?: Array<{ passage_id: string; quote: string }>;
    correction?: string | null;
  }>;
}

/**
 * Apply exactly the same post-validation as the core pipeline: schema check,
 * verbatim-quote check, quotes required for supported/contradicted, confidence
 * floor, and correction grounding. Anything that fails becomes `unverifiable`.
 */
export async function validateVerdicts(input: ValidateInput, baseDir = '.'): Promise<{ verdicts: ClaimVerdict[]; summary: VerificationSummary }> {
  const passages: Passage[] = input.passages.map((p) => ({
    id: p.id,
    text: passageText(p, baseDir),
    score: 1,
    source: { title: p.title ?? p.id, providerId: 'supplied', ...(p.url ? { url: p.url } : {}) },
  }));
  const out: ClaimVerdict[] = [];
  for (const c of input.claims) {
    const claim: Claim = { id: c.id, text: c.text, span: { start: 0, end: c.text.length }, context: c.text };
    const v = input.verdicts.find((x) => x.claimId === c.id);
    // Missing verdict -> the "LLM" returns nothing usable -> unverifiable.
    const raw = v ? JSON.stringify({ confidence: 0.8, rationale: '', quotes: [], ...v, claimId: undefined }) : '';
    out.push(await verifyClaim(claim, passages, new MockLLM(raw)));
  }
  return scoreResults(out);
}

function passageText(p: ValidateInput['passages'][number], baseDir: string): string {
  if (typeof p.text === 'string') return p.text;
  if (p.path) return readFileSync(isAbsolute(p.path) ? p.path : join(baseDir, p.path), 'utf8');
  throw new Error(`passage "${p.id}" needs "text" or "path"`);
}
