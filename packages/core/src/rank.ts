import type { Claim } from './types.js';
import { contentTokens, coverage, isStopword, properNouns, splitSentences, tokenize } from './text.js';

const PRONOUN_START = /^(?:it|its|they|their|he|she|his|her|this|these|those)\b/i;

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

/**
 * Lexical relevance in [0, 1]: weighted fraction of query terms present in the passage. A long
 * claim ("Researchers at Harvard concluded that the Earth's atmospheric oxygen…") is also scored
 * against each of its focused fact queries, so a passage about just that fact still counts.
 */
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
  let score = hit / total;
  for (const terms of focusTerms(claim)) score = Math.max(score, 0.9 * coverage(terms, [...have]));
  return score;
}

/** Each fact query's content tokens, worked out once per claim (passages are scored chunk by chunk). */
const focusCache = new WeakMap<Claim, string[][]>();
function focusTerms(claim: Claim): string[][] {
  let terms = focusCache.get(claim);
  if (!terms) focusCache.set(claim, (terms = factQueries(claim).map((q) => contentTokens(q))));
  return terms;
}

/** Verbs that report a statement rather than make it ("NASA announced that…", "Scientists confirmed that…"). */
const REPORTING = /\b(?:announce[ds]?|sa(?:id|ys)|state[ds]?|confirm(?:ed|s)?|conclude[ds]?|report(?:ed|s)?|claim(?:ed|s)?|f(?:ou|i)nds?|found|reveal(?:ed|s)?|show(?:ed|s|n)?|note[ds]?|explain(?:ed|s)?|warn(?:ed|s)?|estimate[ds]?|predict(?:ed|s)?|declare[ds]?|add(?:ed|s)|insist(?:ed|s)?|argue[ds]?|suggest(?:ed|s)?|discover(?:ed|s)?|determine[ds]?|agree[ds]?|acknowledge[ds]?|admit(?:ted|s)?|indicate[ds]?|demonstrate[ds]?|observe[ds]?|wr(?:ote|ites)|believe[ds]?|t(?:old|ells))\b/i;

/**
 * The statements a claim makes, without the reporting frame around them. "NASA officials stated
 * that these changes are permanent and that the Moon will orbit…" gives ["these changes are
 * permanent", "the Moon will orbit…"]. Used to aim searches at the facts themselves.
 */
export function propositions(text: string): string[] {
  let t = text.trim().replace(/^according to [^,]{1,80},\s*/i, '');
  const verb = REPORTING.exec(t);
  if (verb && verb.index < 120) {
    const rest = t.slice(verb.index);
    const that = rest.search(/\bthat\s/i);
    if (that >= 0 && that < 80) t = rest.slice(that + 5);
  }
  return t.split(/,?\s+and that\s+/i).map((s) => s.replace(/[.!?]+$/, '').trim()).filter(Boolean);
}

/** Who reports a fact, or a vague group of people, is not what the fact is about. */
const GENERIC = new Set(
  `scientists researchers officials experts studies study reports report sources analysts critics authorities people
  residents engineers astronomers doctors according agency government scholars historians`.split(/\s+/),
);

/** Words that say how a quantity changed or how precise it is, not what it measures. */
const QUERY_FILLER = new Set(
  `increase increased increases increasing decrease decreased decreases decreasing rise rises risen rose rising fall falls
  fallen fell falling grow grows grown grew drop dropped drops change changed changes shift shifted complete completed
  begin begins began begun start starts started starting stop stopped become became reach reached approximately about
  around nearly almost roughly over more less than every each per officially also now currently since until worldwide
  globally hour hours day days week weeks month months year years minute minutes second seconds percent per cent feet foot
  meter meters metre metres km mile miles direct consequence result causing eliminating leading resulting making allowing
  following first beginning subsequently`.split(/\s+/),
);

const MONTH = /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/;

/** Named things in a piece of text, with where they start (lowercased; reporters and dates excluded). */
function entitiesIn(text: string): Array<{ name: string; at: number }> {
  const lower = text.toLowerCase();
  const out: Array<{ name: string; at: number }> = [];
  let from = 0;
  for (const raw of properNouns(text)) {
    const name = raw.replace(/^(?:the|a|an)\s+/, '').replace(/['’]s$/, '');
    const at = lower.indexOf(name, from);
    if (at < 0) continue;
    from = at + name.length;
    if (name.length < 2 || NOT_SUBJECTS.test(name) || GENERIC.has(name) || MONTH.test(name)) continue;
    out.push({ name, at });
  }
  return out;
}

/** One numeric fact in a claim: what it is about, what the number measures, and the number. */
export interface FactUnit {
  /** A search for the fact: the subject plus the describing words, in the claim's order, without the number. */
  query: string;
  /** The named thing the fact is about, when there is one. */
  subject?: string;
  /** Words that say what the number measures ("launch", "oxygen concentration"). */
  words: string[];
  /** The number as written, without thousands separators ("2018", "8849", "27.3"). */
  number: string;
  /** "decreased by 15%" states an amount of change, not a value. */
  change: boolean;
}

function propositionUnits(prop: string, claim: Claim): FactUnit[] {
  const units: FactUnit[] = [];
  const subject = entitiesIn(prop)[0]?.name ?? (PRONOUN_START.test(prop) ? subjectQuery(claim) : undefined);
  // Clauses: a relative clause ("…, which has been monitoring… since its launch") is about the name before it.
  const clauses = prop.split(/,\s+(?=(?:which|who|whose|causing|eliminating|leading|resulting|making|allowing|prompting|meaning|while|but)\b)|\s+(?=(?:following|because)\b)/i);
  let before: string | undefined = subject;
  for (const clause of clauses) {
    const relative = /^(?:which|who|whose)\b/i.test(clause);
    const lower = clause.toLowerCase();
    const entities = entitiesIn(clause);
    const tokens = [...lower.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)].map((m) => ({ text: m[0].replace(/['’]s$/, ''), at: m.index ?? 0 }));
    const isEntityWord = (at: number) => entities.some((e) => at >= e.at && at < e.at + e.name.length);
    const useful = (t: { text: string; at: number }) =>
      !/^\d/.test(t.text) && !isStopword(t.text) && !QUERY_FILLER.has(t.text) && !MONTH.test(t.text) && !isEntityWord(t.at);
    tokens.forEach((t, i) => {
      if (!/^\d/.test(t.text)) return;
      // The rest of a larger number ("8,849", "27.3") belongs to its first part.
      if (/\d[,.]$/.test(lower.slice(0, t.at))) return;
      // Dates ("November 1, 2026") say when, not what.
      if (MONTH.test(tokens[i - 1]?.text ?? '') || MONTH.test(tokens[i - 2]?.text ?? '')) return;
      const written = /^\d[\d,]*(?:\.\d+)?/.exec(lower.slice(t.at))![0];
      let next = i + 1;
      while (next < tokens.length && tokens[next]!.at < t.at + written.length) next++;
      // Up to two words that describe the number, from right next to it: the first within a few
      // words ("concentration has increased to 35"), the second adjacent to the first.
      const words: Array<{ text: string; at: number }> = [];
      for (let j = next, last = next - 1; j < tokens.length && j - last <= 2 && words.length < 2 && !/^\d/.test(tokens[j]!.text); j++) {
        if (useful(tokens[j]!)) { words.push(tokens[j]!); last = j; }
      }
      for (let j = i - 1, last = i; j >= 0 && last - j <= (last === i ? 5 : 2) && words.length < 2; j--) {
        if (useful(tokens[j]!)) { words.push(tokens[j]!); last = j; }
      }
      if (!words.length) return;
      const named = relative ? [] : entities.filter((e) => e.at < t.at).map((e) => ({ text: e.name, at: e.at }));
      const owner = relative ? before : named.length ? undefined : subject;
      const parts = [...(owner ? [{ text: owner, at: -1 }] : []), ...named, ...words].sort((a, b) => a.at - b.at);
      units.push({
        query: [...new Set(parts.flatMap((p) => p.text.split(/\s+/)))].join(' '),
        ...(owner ?? named[0]?.text ? { subject: owner ?? named[0]!.text } : {}),
        words: words.sort((a, b) => a.at - b.at).map((w) => w.text),
        number: written.replace(/,/g, ''),
        change: /\bby\s+(?:about\s+|approximately\s+|roughly\s+|nearly\s+|around\s+|some\s+)?$/.test(lower.slice(0, t.at)),
      });
    });
    if (entities.length) before = entities[entities.length - 1]!.name;
  }
  return units;
}

/** The numeric facts a claim states, each with its subject and what the number measures. */
export function factUnits(claim: Claim): FactUnit[] {
  return propositions(claim.text).flatMap((prop) => propositionUnits(prop, claim));
}

/**
 * Short searches aimed at the facts a claim states: what it is about plus the words around each
 * number ("james webb space telescope launch", "earth oxygen concentration", "moon orbiting
 * earth"). The claim's own numbers are left out, since they may be the hallucination.
 */
export function factQueries(claim: Claim, max = 3): string[] {
  const queries: string[] = [];
  for (const prop of propositions(claim.text)) {
    const units = propositionUnits(prop, claim);
    for (const u of units) if (!queries.includes(u.query)) queries.push(u.query);
    // No numeric fact: the subject and the next couple of words about it.
    const first = entitiesIn(prop)[0];
    if (!units.length && first) {
      const after = tokenize(prop.slice(first.at + first.name.length)).filter((t) => !isStopword(t) && !QUERY_FILLER.has(t) && !/^\d/.test(t)).slice(0, 2);
      const q = [first.name, ...after].join(' ');
      if (after.length && !queries.includes(q)) queries.push(q);
    }
  }
  return queries.slice(0, max);
}

/** A compact search query string for external search APIs. */
const NOT_SUBJECTS = /^(?:january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday|i)$/;

/**
 * The named thing a claim's first fact is about ("james webb space telescope" for "…detected by the
 * James Webb Space Telescope, which has been monitoring… since its launch in 2018"), for looking it up.
 */
export function factSubject(claim: Claim): string | undefined {
  const first = factQueries(claim, 1)[0];
  const names = propositions(claim.text).flatMap((p) => entitiesIn(p).map((e) => e.name));
  const leading = first ? names.filter((n) => first.startsWith(`${n} `) || first === n).sort((a, b) => b.length - a.length)[0] : undefined;
  return leading ?? names[0] ?? subjectQuery(claim);
}

/**
 * The named thing a claim is about ("eiffel tower", "neil armstrong"), for
 * encyclopedia lookups: claims about the same subject share one search and one
 * cached article. Pronoun-led claims use the context's subject. Undefined when
 * no name is present.
 */
export function subjectQuery(claim: Claim): string | undefined {
  const pick = (text: string) =>
    properNouns(text)
      .map((n) => n.replace(/^(?:the|a|an)\s+/, '').replace(/['’]s$/, ''))
      .find((n) => n.length > 1 && !NOT_SUBJECTS.test(n));
  const own = PRONOUN_START.test(claim.text) ? undefined : pick(claim.text);
  return own ?? pick(claim.context);
}

/**
 * A compact search query for full-text search APIs: the claim's main statement without its
 * reporting frame ("NASA announced that…"), led by the subject when the claim opens with a pronoun.
 */
export function searchQuery(claim: Claim): string {
  const entities = properNouns(claim.context);
  const props = propositions(claim.text);
  const main = props.find((p) => /\d/.test(p)) ?? props.reduce((a, b) => (b.length > a.length ? b : a), props[0] ?? claim.text);
  const base = PRONOUN_START.test(main) ? `${entities[0] ?? ''} ${main}` : main;
  return tokenize(base).slice(0, 16).join(' ');
}

/** The query for a web search engine: the claim's first focused fact query, else its main statement. */
export function webQuery(claim: Claim): string {
  return factQueries(claim, 1)[0] ?? searchQuery(claim);
}
