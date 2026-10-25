import type { LLMProvider } from '../../types.js';
import { parseVerifierPrompt, type LLMVerdict } from '../../prompt.js';
import { contentTokens, coverage, numbers, splitSentences } from '../../text.js';

/**
 * Deterministic, offline "judge" that implements the LLMProvider interface by
 * reading the structured input embedded in the verifier prompt and comparing
 * the claim with passage sentences lexically (numbers, named entities,
 * negation). It is a transparent baseline, not a language model: it handles
 * simple factual sentences and will miss paraphrase and multi-hop evidence.
 */
export class HeuristicLLM implements LLMProvider {
  readonly id: string = 'heuristic';

  async complete(prompt: string): Promise<string> {
    const input = parseVerifierPrompt(prompt);
    if (!input) return JSON.stringify(unverifiable('Input could not be parsed.'));
    // Lexical overlap cannot interpret publisher ratings or distinguish a paper title from its findings.
    return JSON.stringify(judge(input.claim, input.passages.filter((p) => p.kind !== 'review' && p.kind !== 'metadata')));
  }
}

function unverifiable(rationale: string): LLMVerdict {
  return { verdict: 'unverifiable', confidence: 0.5, rationale, quotes: [], correction: null };
}

const PRONOUN_START = /^(?:it|its|they|their|he|she|his|her|this|these|those)\b/i;

const NEGATION = /\b(?:not|never|no|none|neither|nor|cannot)\b|n't\b/i;

/** Capitalized names in original case, without a leading article or possessive. */
function names(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/\p{Lu}[\p{L}\p{N}'’-]*(?:\s+(?:of\s+|de\s+|von\s+|van\s+)?\p{Lu}[\p{L}\p{N}'’-]*)*/gu)) {
    const name = m[0].replace(/^(?:The|A|An)\s+/, '').replace(/['’]s$/, '');
    if (/^(?:The|A|An|In|On|At|It|Its|This|That|These|Those|There|He|She|They|Their|His|Her|After|Before|During|By|For|From|As|When|While|Established|Founded)$/.test(name)) continue;
    out.push(name);
  }
  return out;
}

function nonNumeric(tokens: string[]): string[] {
  return tokens.filter((t) => !/^\d/.test(t));
}

function judge(claim: string, passages: Array<{ id: string; text: string }>): LLMVerdict {
  const claimTokens = nonNumeric(contentTokens(claim));
  let best: { passageId: string; sentence: string; overlap: number } | undefined;
  for (const p of passages) {
    const sentences = splitSentences(p.text);
    sentences.forEach((s, i) => {
      // A pronoun-led sentence is read together with the previous one (quoted verbatim as a span).
      const prev = i > 0 && PRONOUN_START.test(s.text) ? sentences[i - 1] : undefined;
      const sentence = prev ? p.text.slice(prev.start, s.end) : s.text;
      const overlap = coverage(claimTokens, contentTokens(sentence));
      if (!best || overlap > best.overlap) best = { passageId: p.id, sentence, overlap };
    });
  }
  if (!best || best.overlap < 0.5) return unverifiable('No passage addresses this claim directly.');

  const { sentence, overlap, passageId } = best;
  const quotes = [{ passage_id: passageId, quote: sentence }];
  const claimNums = numbers(claim);
  const sentNums = numbers(sentence);
  const missingNums = claimNums.filter((n) => !sentNums.includes(n));
  const extraNums = sentNums.filter((n) => !claimNums.includes(n));
  const negationMismatch = NEGATION.test(claim) !== NEGATION.test(sentence);
  const lowerSentence = sentence.toLowerCase();
  const lowerClaim = claim.toLowerCase();
  const claimOnlyNames = names(claim).filter((n) => !lowerSentence.includes(n.toLowerCase()));
  const sentenceOnlyNames = names(sentence).filter((n) => !lowerClaim.includes(n.toLowerCase()));
  // A conflict only counts when the passage talks about the same predicate: every
  // non-name, non-number word of the claim ("opened", "tall", "founded") must appear.
  const nameTokens = new Set(names(claim).flatMap((n) => contentTokens(n)));
  const predicate = claimTokens.filter((t) => !nameTokens.has(t));
  const samePredicate = predicate.length > 0 && coverage(predicate, contentTokens(sentence)) === 1;

  if (samePredicate && overlap >= 0.6 && missingNums.length > 0 && extraNums.length > 0) {
    const correction =
      missingNums.length === 1 && extraNums.length === 1 ? replaceNumber(claim, missingNums[0]!, extraNums[0]!) : null;
    return {
      verdict: 'contradicted',
      confidence: round(0.55 + 0.4 * overlap),
      rationale: `The passage gives ${extraNums.join(', ')} where the claim says ${missingNums.join(', ')}.`,
      quotes,
      correction,
    };
  }
  if (samePredicate && overlap >= 0.6 && negationMismatch && missingNums.length === 0) {
    return {
      verdict: 'contradicted',
      confidence: round(0.5 + 0.4 * overlap),
      rationale: 'The passage states the opposite of the claim.',
      quotes,
      correction: null,
    };
  }
  if (samePredicate && overlap >= 0.6 && missingNums.length === 0 && claimOnlyNames.length === 1 && sentenceOnlyNames.length === 1) {
    const wrong = claimOnlyNames[0]!;
    const right = sentenceOnlyNames[0]!;
    return {
      verdict: 'contradicted',
      confidence: round(0.5 + 0.4 * overlap),
      rationale: `The passage names ${right} where the claim names ${wrong}.`,
      quotes,
      correction: claim.replace(wrong, right),
    };
  }
  const noConflict = missingNums.length === 0 && !negationMismatch && claimOnlyNames.length === 0;
  if (noConflict && (overlap >= 0.8 || (claimNums.length > 0 && overlap >= 0.7))) {
    return {
      verdict: 'supported',
      confidence: round(0.6 + 0.4 * overlap),
      rationale: 'A passage states this directly.',
      quotes,
      correction: null,
    };
  }
  return unverifiable('Related passages were found, but none states or refutes this claim explicitly.');
}

function replaceNumber(claim: string, from: string, to: string): string | null {
  const re = new RegExp(`\\b${from.replace(/\B(?=(\d{3})+(?!\d))/g, ',?').replace('.', '\\.')}\\b`);
  return re.test(claim) ? claim.replace(re, to) : null;
}

function round(n: number): number {
  return Math.round(Math.min(1, n) * 100) / 100;
}
