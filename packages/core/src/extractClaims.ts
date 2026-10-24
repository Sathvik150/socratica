import type { Claim } from './types.js';
import { numbers, properNouns, splitSentences, tokenize } from './text.js';

/**
 * Rule-based extraction of atomic, checkable factual claims.
 *
 * Deliberately conservative: anything that looks like an opinion, an
 * instruction, a question, a hedge or conversational filler is skipped,
 * because a claim we never check cannot become a false positive.
 * Every returned claim's `text` is an exact substring of `answer` at `span`.
 */

const IMPERATIVE_STARTS = new Set(
  `try make use click go check consider remember note see open ensure avoid keep let add install run set follow
  contact ask visit read please start stop choose select enter type press imagine think look call email do don't`.split(/\s+/),
);

const HEDGES =
  /\b(might|may|could|possibly|probably|perhaps|likely|unlikely|seems?|appears?|reportedly|allegedly|supposedly|i think|i believe|i guess|i'm not sure|i am not sure|not sure|as far as i know|if i recall|it is believed|some say|some people|in my opinion|personally|arguably|i feel)\b/i;

const OPINION =
  /\b(best|worst|beautiful|amazing|awesome|great|good|bad|terrible|wonderful|delicious|favou?rite|overrated|underrated|fascinating|impressive|interesting|boring|exciting|incredible|stunning|lovely|ugly|should|ought)\b/i;

const FILLER =
  /^(sure|certainly|of course|absolutely|great question|good question|here(?:'s| is| are)|let me|i hope|hope this|feel free|in summary|in conclusion|to summarize|overall|as an ai|i'm an ai|i am an ai|happy to help|let me know|thanks|thank you)\b/i;

const SECOND_PERSON_INSTRUCTION = /\byou (?:should|can|could|may|might|need|must|will want|want to|'ll)\b/i;

/** Where a compound sentence can be split into separate atomic claims. */
const CLAUSE_SPLIT = /;\s+|,\s+(?:and|but|while|whereas)\s+(?=(?:it|its|they|their|he|she|his|her|the|this|these|those|\p{Lu})\b)/gu;

const PRONOUN_START = /^(?:it|its|they|their|he|she|his|her|this|these|those)\b/i;

export interface ExtractOptions {
  maxClaims?: number;
}

/** Replace fenced code blocks and inline code with spaces so offsets stay valid. */
function blankOutCode(answer: string): string {
  return answer
    .replace(/```[\s\S]*?(?:```|$)/g, (m) => ' '.repeat(m.length))
    .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
}

/** Strip list/heading markers and markdown emphasis from the edges of a segment. */
function trimMarkers(text: string, start: number): { text: string; start: number } {
  const m = /^(?:\s*(?:[-*+•]|\d+[.)]|#{1,6}|>)\s+)+/.exec(text);
  if (m) return { text: text.slice(m[0].length), start: start + m[0].length };
  return { text, start };
}

export function isCheckable(sentence: string): boolean {
  const s = sentence.trim();
  if (s.endsWith('?') || s.endsWith(':')) return false;
  const words = tokenize(s);
  if (words.length < 4) return false;
  const first = words[0] ?? '';
  if (IMPERATIVE_STARTS.has(first)) return false;
  if (FILLER.test(s)) return false;
  // "May 24" / "in May 1883" is a month, not the hedge "may".
  if (HEDGES.test(s.replace(/\bMay(?=\s+\d|,?\s+(?:of\s+)?\d{4})/g, ''))) return false;
  if (SECOND_PERSON_INSTRUCTION.test(s)) return false;
  if (/^(?:i|we|you)\b/i.test(s)) return false;
  const hasNumber = numbers(s).length > 0;
  if (OPINION.test(s) && !hasNumber) return false;
  // Needs something concrete to check: a number or a named entity.
  return hasNumber || properNouns(s).length > 0;
}

export function extractClaims(answer: string, options: ExtractOptions = {}): Claim[] {
  const maxClaims = options.maxClaims ?? 20;
  const scrubbed = blankOutCode(answer);
  const claims: Claim[] = [];
  let previousSentence = '';

  for (const sentence of splitSentences(scrubbed)) {
    const trimmed = trimMarkers(sentence.text, sentence.start);
    const sentenceText = trimmed.text;
    // Headings: short lines without terminal punctuation.
    if (!/[.!]["')\]’”]*$/.test(sentenceText) && tokenize(sentenceText).length < 8) {
      previousSentence = sentenceText;
      continue;
    }

    // Split into clauses, tracking offsets.
    const pieces: Array<{ text: string; start: number }> = [];
    let last = 0;
    for (const m of sentenceText.matchAll(CLAUSE_SPLIT)) {
      pieces.push({ text: sentenceText.slice(last, m.index), start: trimmed.start + last });
      last = (m.index ?? 0) + m[0].length;
    }
    pieces.push({ text: sentenceText.slice(last), start: trimmed.start + last });

    for (const piece of pieces) {
      const lead = piece.text.length - piece.text.trimStart().length;
      let text = piece.text.trim();
      let start = piece.start + lead;
      // Drop wrapping markdown emphasis like **...** so the span stays tight.
      const emph = /^(\*\*|__)(.*)\1([.!]?)$/.exec(text);
      if (emph?.[2]) {
        start += emph[1]!.length;
        text = emph[2] + (emph[3] ?? '');
      }
      if (!isCheckable(text)) continue;
      const context = PRONOUN_START.test(text) || pieces.length > 1 ? `${previousSentence} ${sentenceText}`.trim() : sentenceText;
      claims.push({
        id: `c${claims.length + 1}`,
        text,
        span: { start, end: start + text.length },
        context,
      });
      if (claims.length >= maxClaims) return claims;
    }
    previousSentence = sentenceText;
  }
  return claims;
}
