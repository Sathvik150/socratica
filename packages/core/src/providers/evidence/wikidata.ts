import type { Claim, EvidenceProvider, FetchLike, Passage, RetrieveOptions } from '../../types.js';
import { scorePassage } from '../../rank.js';
import { properNouns } from '../../text.js';
import { MIN_RELEVANCE } from './documents.js';
import { EvidenceHttp, list, record, text } from './http.js';
import { WIKIMEDIA_CLIENT_ID } from './wikipedia.js';

export interface WikidataOptions { fetch: FetchLike }

// Fixed renderings describe the property, independent of the claim being checked.
const PROPERTIES: Record<string, (name: string, value: string) => string> = {
  P571: (n, v) => `${n} — inception: ${v}.`,
  P1619: (n, v) => `${n} opened in ${v}.`,
  P569: (n, v) => `${n} was born in ${v}.`,
  P570: (n, v) => `${n} died in ${v}.`,
  P19: (n, v) => `${n} was born in ${v}.`,
  P20: (n, v) => `${n} died in ${v}.`,
  P17: (n, v) => `${n} is in the country ${v}.`,
  P27: (n, v) => `${n} has country of citizenship ${v}.`,
  P36: (n, v) => `${n} has capital ${v}.`,
  P112: (n, v) => `${n} was founded by ${v}.`,
  P50: (n, v) => `${n} was written by ${v}.`,
  P577: (n, v) => `${n} was published in ${v}.`,
  P2048: (n, v) => `${n} has height ${v}.`,
  P2046: (n, v) => `${n} has area ${v}.`,
  P1082: (n, v) => `${n} has population ${v}.`,
};

function entityId(value: unknown): string {
  const v = record(value);
  const id = text(v.id);
  return /^Q\d+$/.test(id) ? id : '';
}
function label(entity: unknown): string { return text(record(record(record(entity).labels).en).value); }

function renderValue(snak: unknown, entities: Record<string, unknown>): string {
  const s = record(snak);
  if (s.snaktype !== 'value') return '';
  const dv = record(s.datavalue), v = record(dv.value);
  if (dv.type === 'wikibase-entityid') return label(entities[entityId(dv.value)]);
  if (dv.type === 'string') return text(dv.value);
  if (dv.type === 'time') {
    // Never invent finer precision or convert non-Gregorian calendars implicitly.
    if (v.calendarmodel !== 'http://www.wikidata.org/entity/Q1985727' || typeof v.precision !== 'number' || v.precision < 9) return '';
    const m = /^\+(\d{4,})-(\d{2})-(\d{2})T/.exec(text(v.time));
    if (!m) return '';
    return v.precision >= 11 ? `${m[1]}-${m[2]}-${m[3]}` : v.precision === 10 ? `${m[1]}-${m[2]}` : m[1]!;
  }
  if (dv.type === 'quantity') {
    const amount = text(v.amount);
    // Uncertainty bounds and units must survive rendering.
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(amount)) return '';
    const unit = text(v.unit);
    const id = /\/(Q\d+)$/.exec(unit)?.[1];
    const unitLabel = id ? label(entities[id]) : '';
    if (unit !== '1' && !unitLabel) return '';
    const bounds = v.lowerBound || v.upperBound ? ` (bounds: ${text(v.lowerBound) || '?'}, ${text(v.upperBound) || '?'})` : '';
    return `${amount.replace(/^\+/, '')}${unitLabel ? ` ${unitLabel}` : ''}${bounds}`;
  }
  return '';
}

export class WikidataEvidenceProvider implements EvidenceProvider {
  readonly id = 'wikidata';
  readonly #http: EvidenceHttp;
  readonly #headers = { 'api-user-agent': WIKIMEDIA_CLIENT_ID };
  constructor(opts: WikidataOptions) { this.#http = new EvidenceHttp('Wikidata', opts.fetch); }

  async #api(params: string): Promise<Record<string, unknown>> {
    const data = record(await this.#http.json(`https://www.wikidata.org/w/api.php?format=json&origin=*&${params}`, { headers: this.#headers }));
    if (data.error) throw new Error('Wikidata API returned an error.');
    return data;
  }

  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    const names = properNouns(claim.context).filter((n) => !/^(the|a|an|it|he|she|they|in|on)$/.test(n));
    const query = (names[0] ?? '').replace(/^(the|a|an) /, '');
    if (!query) return [];
    const search = await this.#api(`action=wbsearchentities&language=en&type=item&limit=1&search=${encodeURIComponent(query)}`);
    const id = text(record(list(search.search)[0]).id);
    if (!/^Q\d+$/.test(id)) return [];
    const response = await this.#api(`action=wbgetentities&ids=${id}&props=labels|claims&languages=en`);
    const entities = record(response.entities), entity = record(entities[id]), name = label(entity);
    if (!name) return [];
    const claims = record(entity.claims);
    const rows: Array<{ property: string; statement: Record<string, unknown> }> = [];
    const related = new Set<string>();
    for (const property of Object.keys(PROPERTIES)) {
      const all = list(claims[property]).map(record).filter((s) => s.rank !== 'deprecated');
      const preferred = all.filter((s) => s.rank === 'preferred');
      for (const statement of (preferred.length ? preferred : all).slice(0, 10)) {
        rows.push({ property, statement });
        const dv = record(record(statement.mainsnak).datavalue), value = record(dv.value);
        const target = entityId(dv.value), unit = /\/(Q\d+)$/.exec(text(value.unit))?.[1];
        if (target) related.add(target);
        if (unit) related.add(unit);
      }
    }
    const ids = [...related];
    for (let i = 0; i < ids.length; i += 50) {
      const data = await this.#api(`action=wbgetentities&ids=${ids.slice(i, i + 50).join('|')}&props=labels&languages=en`);
      Object.assign(entities, record(data.entities));
    }
    const passages: Array<Omit<Passage, 'id'>> = [];
    for (const { property, statement } of rows) {
      const value = renderValue(statement.mainsnak, entities);
      if (!value) continue;
      const qualifiers = record(statement.qualifiers);
      const hasQualifiers = Object.keys(qualifiers).length > 0;
      const quantity = record(record(record(statement.mainsnak).datavalue).value);
      const needsInterpretation = hasQualifiers || property === 'P1082' || typeof quantity.amount === 'string';
      const date = /^\d{4,}-\d{2}(?:-\d{2})?$/.test(value) && record(record(statement.mainsnak).datavalue).type === 'time';
      // A year statement is entailed by a precise date. Retain the full precision
      // separately so a year-only claim can receive a directly quoted correction.
      const rendered = PROPERTIES[property]!(name, date ? value.split('-')[0]! : value) +
        (date ? `\nWikidata date: ${value}` : '') +
        (hasQualifiers ? `\nQualifiers (Wikidata JSON): ${JSON.stringify(qualifiers)}` : '');
      const score = scorePassage(claim, rendered);
      if (score >= MIN_RELEVANCE) passages.push({ text: rendered, score, source: { title: `${name} — Wikidata ${property}`, url: `https://www.wikidata.org/wiki/${id}#${property}`, providerId: this.id, kind: needsInterpretation ? 'metadata' : 'structured' } });
    }
    return passages.sort((a, b) => b.score - a.score).slice(0, options.limit);
  }
}
