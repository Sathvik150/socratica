import type { Claim } from './types.js';
import { contentTokens, properNouns, splitSentences, tokenize } from './text.js';

/** Split a document into overlapping windows of up to `windowSize` sentences. */
export function chunkText(text: string, windowSize = 3, maxChars = 700): string[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];
  const chunks: string[] = [];
  const step = Math.max(1, windowSize - 1);
  for (let i = 0; i < sentences.length; i += step) {
    const first = sentences[i]!;
    let j = i;
    while (j + 1 < sentences.length && j + 1 < i + windowSize && sentences[j + 1]!.end - first.start <= maxChars) j++;
    // Slice the original text so passages are verbatim.
    chunks.push(text.slice(first.start, sentences[j]!.end));
    if (j === sentences.length - 1) break;
  }
  return chunks;
}

/** Retrieval query terms for a claim: its own content tokens plus named entities from its context. */
export function queryTerms(claim: Claim): { primary: string[]; secondary: string[] } {
  const primary = [...new Set(contentTokens(claim.text))];
  const secondary = [
    ...new Set(properNouns(claim.context).flatMap((n) => contentTokens(n)).filter((t) => !primary.includes(t))),
  ];
  return { primary, secondary };
}

/** Lexical relevance in [0, 1]: weighted fraction of query terms present in the passage. */
export function scorePassage(claim: Claim, passage: string): number {
  const { primary, secondary } = queryTerms(claim);
  // The number in a hallucination may be wrong. Matching it in an unrelated
  // measurement must not outweigh matching the claim's subject and property.
  const weight = (term: string) => /^\d/.test(term) ? 0.25 : 1;
  const total = primary.reduce((sum, t) => sum + weight(t), 0) +
    0.5 * secondary.reduce((sum, t) => sum + weight(t), 0);
  if (total === 0) return 0;
  const have = new Set(contentTokens(passage));
  let hit = 0;
  for (const t of primary) if (have.has(t)) hit += weight(t);
  for (const t of secondary) if (have.has(t)) hit += 0.5 * weight(t);
  return hit / total;
}

/** A compact search query string for external search APIs. */
export function searchQuery(claim: Claim): string {
  const entities = properNouns(claim.context);
  const base = /^(?:it|its|they|their|he|she|his|her|this|these|those)\b/i.test(claim.text)
    ? `${entities[0] ?? ''} ${claim.text}`
    : claim.text;
  return tokenize(base).slice(0, 16).join(' ');
}
