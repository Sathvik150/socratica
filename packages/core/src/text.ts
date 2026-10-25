/** Small, dependency-free text utilities shared by retrieval, verification and the heuristic judge. */

const STOPWORDS = new Set(
  `a an the and or but if then of in on at to for from by with without as is are was were be been being
  it its this that these those there their they them he she his her we our you your i me my which who whom
  whose what when where why how than so such not no nor do does did done has have had having can could will
  would shall should may might must also only just very more most some any each every all both few many
  much other into over under about after before between during through up down out off again further once
  here s t`.split(/\s+/),
);

export function isStopword(token: string): boolean {
  return STOPWORDS.has(token);
}

export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Lowercased word tokens (letters, digits, internal apostrophes/hyphens). */
export function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).map((t) => t.replace(/['’]s$/, ''));
}

/** Very light suffix stemming so "founded"/"founding"/"founds" match. */
export function stem(token: string): string {
  if (/^\d/.test(token) || token.length <= 4) return token;
  return token.replace(/(ingly|edly|ing|ed|es|s|ly)$/, '');
}

/** Content-bearing, stemmed tokens. */
export function contentTokens(s: string): string[] {
  return tokenize(s)
    .filter((t) => !STOPWORDS.has(t))
    .map(stem);
}

/** Numbers appearing in the text, normalized (commas removed). */
export function numbers(s: string): string[] {
  return (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ''));
}

/**
 * Capitalized multi-word names that are not sentence-initial-only words.
 * Lowercased so comparison is case-insensitive.
 */
export function properNouns(s: string): string[] {
  const out: string[] = [];
  const re = /(?:^|[^\p{L}\p{N}])((?:\p{Lu}[\p{L}\p{N}'’-]*)(?:\s+(?:of|de|la|von|van|the)?\s*\p{Lu}[\p{L}\p{N}'’-]*)*)/gu;
  for (const m of s.matchAll(re)) {
    const name = m[1];
    if (!name) continue;
    const start = (m.index ?? 0) + m[0].indexOf(name);
    const sentenceInitial = start === 0 || /[.!?]\s*$/.test(s.slice(0, start));
    const single = !/\s/.test(name);
    if (sentenceInitial && single && STOPWORDS.has(name.toLowerCase())) continue;
    out.push(name.toLowerCase());
  }
  return out;
}

const ABBREVIATIONS = new Set(['e.g', 'i.e', 'etc', 'mr', 'mrs', 'ms', 'dr', 'st', 'vs', 'approx', 'no', 'jr', 'sr', 'inc', 'ltd', 'co', 'u.s', 'u.k']);

/** Split text into sentences (and lines), keeping character offsets into `text`. */
export function splitSentences(text: string): Array<{ text: string; start: number; end: number }> {
  const out: Array<{ text: string; start: number; end: number }> = [];
  let segStart = 0;
  const push = (endExclusive: number) => {
    const raw = text.slice(segStart, endExclusive);
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed) out.push({ text: trimmed, start: segStart + lead, end: segStart + lead + trimmed.length });
    segStart = endExclusive;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') {
      push(i);
      continue;
    }
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    let j = i + 1;
    while (j < text.length && /[.!?"')\]’”]/.test(text[j] ?? '')) j++;
    if (j < text.length && !/\s/.test(text[j] ?? '')) continue; // e.g. "3.5", "example.com"
    if (ch === '.') {
      if (/^\s*\d+$/.test(text.slice(segStart, i))) continue; // numbered list marker "1."
      const word = /([\p{L}.]+)$/u.exec(text.slice(segStart, i))?.[1] ?? '';
      if (ABBREVIATIONS.has(word.toLowerCase())) continue;
      if (/^\p{Lu}$/u.test(word)) continue; // initials like "J. Smith"
    }
    push(j);
    i = j - 1;
  }
  push(text.length);
  return out;
}

/** Fraction of `needle` tokens present in `haystack` tokens. */
export function coverage(needle: string[], haystack: string[]): number {
  if (needle.length === 0) return 0;
  const set = new Set(haystack);
  let hit = 0;
  for (const t of needle) if (set.has(t)) hit++;
  return hit / needle.length;
}

/** Fast non-cryptographic hash for change detection. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
