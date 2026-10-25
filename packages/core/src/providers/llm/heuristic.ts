import type { LLMProvider } from '../../types.js';
import { parseVerifierPrompt, type LLMVerdict } from '../../prompt.js';
import { coverage, isStopword, numbers, splitSentences, stem, tokenize } from '../../text.js';

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
    if (/^(?:The|A|An|In|On|At|It|Its|This|That|These|Those|There|He|She|They|Their|His|Her|After|Before|During|By|For|From|As|When|While|Established|Founded|With|Construction)$/.test(name)) continue;
    // Dates are not entities: "October 28" must not count as a name the claim leaves out.
    if (/^(?:January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/.test(name)) continue;
    if (!/\s/.test(name) && isStopword(name.toLowerCase())) continue;
    out.push(name);
  }
  return out;
}

/**
 * A sentence that opens with a pronoun ("It opened…") or a definite description of
 * something the previous sentence mentions ("…highest mountain. The mountain has…")
 * is read together with that previous sentence.
 */
function continuesPrevious(sentence: string, previous: string): boolean {
  if (PRONOUN_START.test(sentence) || /[,;]\s+(?:it|they|he|she)\s+(?:is|was|are|were|has|had)\b/i.test(sentence)) return true;
  const noun = /^The\s+([\p{Ll}][\p{Ll}-]+)\b/u.exec(sentence)?.[1];
  return !!noun && !isStopword(noun) && new RegExp(`\\b${noun}\\b`, 'i').test(previous);
}

/** Four-digit numbers in the usual range of years, without a unit. */
function isYear(q: Quantity): boolean {
  return !q.unit && /^\d{4}$/.test(q.value) && Number(q.value) >= 1000 && Number(q.value) <= 2100;
}

/**
 * A name counts as present if the sentence repeats it, or refers back to it by its head word
 * ("the tower", "the statue") in a passage that names it ("the Eiffel Tower", "the Statue of Liberty").
 */
function present(name: string, sentence: string, passage: string): boolean {
  const lower = name.toLowerCase();
  if (sentence.toLowerCase().includes(lower)) return true;
  const words = lower.split(/\s+/);
  if (words.length < 2 || !passage.toLowerCase().includes(lower)) return false;
  const heads = [words[words.length - 1]!, ...(words.includes('of') ? [words[0]!] : [])];
  return heads.some((head) => new RegExp(`\\b${head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(sentence));
}

/** Word positions (character index) with their judge token, for proximity checks. */
function wordPositions(s: string): Array<{ index: number; token: string }> {
  return [...s.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)].map((m) => {
    const raw = m[0].toLowerCase().replace(/['’]s$/, '');
    return { index: m.index ?? 0, token: CANONICAL[raw] ?? stem(raw) };
  });
}

function nonNumeric(tokens: string[]): string[] {
  return tokens.filter((t) => !/^\d/.test(t));
}

/**
 * Words that carry no fact of their own in encyclopedic text ("stands 330 m
 * tall", "is located in"), dropped so they don't block a match.
 */
const FILLER = new Set(
  `approximately roughly nearly almost around estimated approx circa ca currently today still originally officially
  widely total totals totaling totalling located situated stands stand stood standing measures measure measured measuring
  reaches reached reach rises rose rising`.split(/\s+/),
);

/** Spelling variants, abbreviations and near-synonyms that encyclopedic text uses interchangeably. */
const CANONICAL: Record<string, string> = {
  metre: 'meter', metres: 'meter', meters: 'meter', m: 'meter',
  kilometre: 'kilometer', kilometres: 'kilometer', kilometers: 'kilometer', km: 'kilometer',
  centimetre: 'centimeter', centimetres: 'centimeter', centimeters: 'centimeter', cm: 'centimeter',
  ft: 'feet', foot: 'feet', mi: 'mile', miles: 'mile', kg: 'kilogram', kilograms: 'kilogram', kilogrammes: 'kilogram',
  lb: 'pound', lbs: 'pound', pounds: 'pound',
  tall: 'height', high: 'height', height: 'height', heights: 'height', elevation: 'height', altitude: 'height',
  won: 'receive', wins: 'receive', win: 'receive', received: 'receive', receives: 'receive', awarded: 'receive',
  birth: 'born', died: 'death', dies: 'death', death: 'death',
  founded: 'found', founding: 'found', founder: 'found', founders: 'found', established: 'found', establishment: 'found',
  built: 'build', constructed: 'build', construction: 'build', building: 'build',
  opened: 'open', opening: 'open', inaugurated: 'open',
  wrote: 'write', written: 'write', authored: 'write', author: 'write',
  invented: 'invent', inventor: 'invent', invention: 'invent',
  discovered: 'discover', discovery: 'discover', discoverer: 'discover',
  largest: 'large', biggest: 'large', centre: 'center', colour: 'color',
};

/** Content tokens for judging: stemmed, without filler, with spelling variants unified. */
function judgeTokens(s: string): string[] {
  const out: string[] = [];
  for (const raw of tokenize(s)) {
    if (isStopword(raw) || FILLER.has(raw)) continue;
    out.push(CANONICAL[raw] ?? stem(raw));
  }
  return out;
}

/** Units a number can carry, grouped so "330 m" and "1,083 ft" are never compared as if they were the same quantity. */
const UNITS: Array<[RegExp, string]> = [
  [/^(?:m|metres?|meters?)\b/i, 'm'], [/^(?:km|kilometres?|kilometers?)\b/i, 'km'], [/^(?:cm|centimetres?|centimeters?)\b/i, 'cm'],
  [/^(?:ft|feet|foot)\b/i, 'ft'], [/^(?:mi|miles?)\b/i, 'mi'], [/^(?:kg|kilogram(?:me)?s?)\b/i, 'kg'], [/^(?:lbs?|pounds?)\b/i, 'lb'],
  [/^(?:%|percent|per cent)/i, '%'], [/^(?:km2|sq(?:uare)? ?(?:km|kilomet(?:re|er)s?))\b/i, 'km2'], [/^(?:mi2|sq(?:uare)? ?miles?)\b/i, 'mi2'],
  [/^(?:million|billion|trillion)\b/i, 'scale'], [/^(?:years?|yrs?)\b/i, 'yr'],
];

interface Quantity { value: string; unit: string | undefined }

/** Numbers with the unit that follows them ("330 m", "1,083 ft", "48%"). */
function quantities(s: string): Quantity[] {
  const out: Quantity[] = [];
  for (const m of s.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const after = s.slice((m.index ?? 0) + m[0].length).replace(/^[\s -]+/, '');
    const unit = UNITS.find(([re]) => re.test(after))?.[1];
    out.push({ value: m[0].replace(/,/g, '').replace(/\.0+$/, ''), unit });
  }
  return out;
}

const HEDGE = /\b(?:about|approximately|roughly|around|nearly|almost|over|more than|less than|some|circa|ca\.|estimated)\s+$/i;

/**
 * Equal; rounded to the claim's own precision (8,849 for 8,848.86); or within 5% when the claim
 * hedges ("about 330 m"). Years and exact counts otherwise must match exactly.
 */
function sameValue(claim: string, q: Quantity, other: Quantity): boolean {
  if (q.value === other.value) return true;
  // A claim may round to its own precision: 8,849 for 8,848.86, or 8,848.9.
  const decimals = q.value.split('.')[1]?.length ?? 0;
  if ((other.value.split('.')[1]?.length ?? 0) > decimals && Number(other.value).toFixed(decimals) === Number(q.value).toFixed(decimals)) return true;
  const idx = claim.search(new RegExp(`\\b${q.value.replace(/\B(?=(\d{3})+(?!\d))/g, ',?').replace('.', '\\.')}\\b`));
  if (idx < 0 || !HEDGE.test(claim.slice(0, idx))) return false;
  const a = Number(q.value);
  const b = Number(other.value);
  return a > 0 && Math.abs(a - b) / a <= 0.05;
}

/** A unit on only one side (e.g. a year, or "the 330-m tower") still compares. */
function unitsAgree(a: Quantity, b: Quantity): boolean {
  return !a.unit || !b.unit || a.unit === b.unit;
}

function judge(claim: string, passages: Array<{ id: string; text: string; source?: string }>): LLMVerdict {
  const claimTokens = nonNumeric(judgeTokens(claim));
  const claimQs = quantities(claim);
  const claimNames = names(claim);
  const nameTokens = new Set(claimNames.flatMap((n) => judgeTokens(n)));
  const predicate = claimTokens.filter((t) => !nameTokens.has(t));
  // Word overlap where a name the sentence refers back to ("the bridge") counts as present.
  const overlapWith = (sentence: string, passage: string) => {
    const tokens = new Set(judgeTokens(sentence));
    for (const n of claimNames) if (present(n, sentence, passage)) for (const t of judgeTokens(n)) tokens.add(t);
    return coverage(claimTokens, [...tokens]);
  };
  const matches = (sentence: string) => {
    const qs = quantities(sentence);
    return claimQs.filter((q) => qs.some((o) => sameValue(claim, q, o) && unitsAgree(q, o))).length;
  };
  let best: { passage: { id: string; text: string; source?: string }; sentence: string; overlap: number; numberHits: number; hasNumber: boolean } | undefined;
  for (const p of passages) {
    const sentences = splitSentences(p.text);
    sentences.forEach((s, i) => {
      // A sentence that refers back ("It…", "The mountain…") is read with the previous one (quoted verbatim as a span).
      const prev = i > 0 && continuesPrevious(s.text, sentences[i - 1]!.text) ? sentences[i - 1] : undefined;
      const sentence = prev ? p.text.slice(prev.start, s.end) : s.text;
      const overlap = overlapWith(sentence, `${p.source ?? ''}\n${p.text}`);
      const hasNumber = claimQs.length > 0 && numbers(sentence).length > 0;
      const numberHits = claimQs.length ? matches(sentence) : 0;
      // For a numeric claim, an equally relevant statement that has the claim's numbers
      // (or at least some number) can answer it where a place/name statement cannot.
      if (
        !best || overlap > best.overlap ||
        (overlap === best.overlap && (numberHits > best.numberHits || (numberHits === best.numberHits && hasNumber && !best.hasNumber)))
      ) {
        best = { passage: p, sentence, overlap, numberHits, hasNumber };
      }
    });
  }
  if (!best || best.overlap < 0.5) return unverifiable('No passage addresses this claim directly.');

  const { sentence, overlap, passage } = best;
  const quotes = [{ passage_id: passage.id, quote: sentence }];
  const sentQs = quantities(sentence);
  const missing = claimQs.filter((q) => !sentQs.some((o) => sameValue(claim, q, o) && unitsAgree(q, o)));
  // Only numbers of the same kind conflict: "330 m" vs "1,083 ft" is a conversion, not a contradiction.
  // A year only conflicts with a year ("opened in 1933" vs "on May 27, 1937", not vs the 27).
  const extra = sentQs.filter((o) => missing.some((q) => q.unit === o.unit && isYear(q) === isYear(o)) && !claimQs.some((q) => sameValue(claim, q, o)));
  const missingNums = missing.map((q) => q.value);
  const extraNums = [...new Set(extra.map((q) => q.value))];
  const negationMismatch = NEGATION.test(claim) !== NEGATION.test(sentence);
  const fullPassage = `${passage.source ?? ''}\n${passage.text}`;
  const lowerPassage = fullPassage.toLowerCase();
  const lowerClaim = claim.toLowerCase();
  const claimOnlyNames = claimNames.filter((n) => !present(n, sentence, fullPassage));
  const sentenceOnlyNames = names(sentence).filter((n) => !lowerClaim.includes(n.toLowerCase()));
  // A conflict only counts when the passage talks about the same predicate: every
  // non-name, non-number word of the claim ("opened", "tall", "founded") must appear.
  const predicateCoverage = coverage(predicate, judgeTokens(sentence));
  const samePredicate = predicate.length > 0 && predicateCoverage === 1;
  // ...and only about the same subject: "Tokyo Tower is 333 m" says nothing about the Eiffel Tower.
  const sameSubject = claimOnlyNames.length === 0;

  if (samePredicate && sameSubject && overlap >= 0.6 && missingNums.length > 0 && extraNums.length > 0) {
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
  if (samePredicate && sameSubject && overlap >= 0.6 && negationMismatch && missingNums.length === 0) {
    return {
      verdict: 'contradicted',
      confidence: round(0.5 + 0.4 * overlap),
      rationale: 'The passage states the opposite of the claim.',
      quotes,
      correction: null,
    };
  }
  // An entity swap: the claim's name appears nowhere in the source (so it is not the subject being
  // referred back to), and the sentence has exactly one other name in its place.
  const swapped = claimOnlyNames.length === 1 && !lowerPassage.includes(claimOnlyNames[0]!.toLowerCase());
  if (samePredicate && overlap >= 0.6 && missingNums.length === 0 && swapped && sentenceOnlyNames.length === 1) {
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
  // "designed by A and … built by B": a claim naming B for "designed" must not be read as supported.
  const predicateSet = new Set(predicate);
  const words = wordPositions(sentence);
  const predicateAt = words.find((w) => predicateSet.has(w.token))?.index;
  const otherFullNames = sentenceOnlyNames.filter((n) => /\s/.test(n)).map((n) => sentence.indexOf(n)).filter((i) => i >= 0);
  const ambiguous = predicateAt !== undefined && claimNames.some((n) => {
    const at = sentence.toLowerCase().indexOf(n.toLowerCase());
    return at > predicateAt && otherFullNames.some((i) => i > predicateAt && i < at);
  });
  // Support always needs the claim's own predicate ("opened", "designed"), not just its subject and numbers.
  const noConflict = missingNums.length === 0 && !negationMismatch && sameSubject && !ambiguous && (predicate.length === 0 || predicateCoverage >= 0.5);
  if (noConflict && (overlap >= 0.8 || (claimQs.length > 0 && overlap >= 0.7))) {
    return {
      verdict: 'supported',
      confidence: round(0.6 + 0.4 * overlap),
      rationale: 'A passage states this directly.',
      quotes,
      correction: null,
    };
  }
  // Every number in the claim appears, with its unit, in a sentence about the same subject that
  // shares most of the claim's wording: encyclopedic text rarely states the same figure for something else.
  if (noConflict && claimQs.length > 0 && overlap >= 0.5) {
    return {
      verdict: 'supported',
      confidence: round(0.55 + 0.3 * overlap),
      rationale: 'A passage about the same subject gives the same figures.',
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
