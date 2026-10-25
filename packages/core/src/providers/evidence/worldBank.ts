import type { Claim, EvidenceProvider, FetchLike, Passage, RetrieveOptions } from '../../types.js';
import { scorePassage } from '../../rank.js';
import { EvidenceHttp, list, record, text } from './http.js';

export interface WorldBankOptions { fetch: FetchLike }

const INDICATORS = [
  { test: /\bgdp\b.*\bper capita\b|\bper capita\b.*\bgdp\b/i, id: 'NY.GDP.PCAP.CD', units: 'current US dollars per person' },
  { test: /\bgdp\b|\bgross domestic product\b/i, id: 'NY.GDP.MKTP.CD', units: 'current US dollars' },
  { test: /\bpopulation\b/i, id: 'SP.POP.TOTL', units: 'people' },
  { test: /\blife expectancy\b/i, id: 'SP.DYN.LE00.IN', units: 'years, life expectancy at birth' },
  { test: /\binflation\b/i, id: 'FP.CPI.TOTL.ZG', units: 'annual percent change in consumer prices' },
] as const;

const ALIASES: Record<string, string[]> = {
  USA: ['United States', 'United States of America', 'USA'], GBR: ['United Kingdom', 'UK', 'Britain'],
  RUS: ['Russia'], KOR: ['South Korea'], PRK: ['North Korea'], EGY: ['Egypt'],
  IRN: ['Iran'], VEN: ['Venezuela'], TUR: ['Turkey', 'Türkiye'],
};

function mentions(haystack: string, value: string): boolean {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(haystack);
}

/** Country-level official observations; never guesses indicators, currencies, dates or missing values. */
export class WorldBankEvidenceProvider implements EvidenceProvider {
  readonly id = 'world-bank';
  readonly #http: EvidenceHttp;
  constructor(opts: WorldBankOptions) { this.#http = new EvidenceHttp('World Bank', opts.fetch); }

  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    const indicator = INDICATORS.find((i) => i.test.test(claim.text));
    if (!indicator) return [];
    // These measures require other indicators, not a conversion or a silent substitution.
    if (/\b(?:PPP|purchasing power|constant|growth|urban|rural|density|male|female|men|women)\b/i.test(claim.text)) return [];
    const countries = list(await this.#http.json('https://api.worldbank.org/v2/country?format=json&per_page=400'));
    const matches = list(countries[1]).map(record).filter((r) => {
      const id = text(r.id), name = text(r.name);
      return /^[A-Z]{3}$/.test(id) && text(record(r.region).id) !== 'NA' && name &&
        [name, ...(ALIASES[id] ?? [])].some((n) => mentions(claim.context, n));
    });
    // A comparative or ambiguous country claim needs explicit multi-country reasoning.
    if (matches.length !== 1) return [];
    const country = matches[0]!, id = text(country.id);
    const years = [...new Set([...claim.text.matchAll(/\b(?:in|during|for|as of)\s+(?:the year\s+)?((?:19|20)\d{2})\b/gi)].map((m) => m[1]!))];
    if (years.length > 1) return [];
    const date = years[0];
    const data = list(await this.#http.json(`https://api.worldbank.org/v2/country/${id}/indicator/${indicator.id}?format=json&per_page=1&${date ? `date=${date}` : 'mrv=1'}`));
    const passages: Array<Omit<Passage, 'id'>> = [];
    for (const item of list(data[1])) {
      const r = record(item), year = text(r.date), value = r.value;
      if (typeof value !== 'number' || !Number.isFinite(value) || !/^\d{4}$/.test(year) || (date && year !== date)) continue;
      if (/\b(?:today|currently|now)\b/i.test(claim.text) && Number(year) !== new Date().getUTCFullYear()) continue;
      const name = text(country.name), indicatorName = text(record(r.indicator).value);
      if (!indicatorName || text(record(r.indicator).id) !== indicator.id || text(record(r.country).id) !== text(country.iso2Code)) continue;
      const rendered = `Source: World Bank\nCountry: ${name}\nIndicator: ${indicatorName} (${indicator.id})\nYear: ${year}\nValue: ${value}\nUnits: ${indicator.units}`;
      const score = scorePassage(claim, `${name} ${indicatorName} ${claim.text.match(/\bgdp\b/i) ? 'GDP' : ''}`);
      passages.push({ text: rendered, score, source: { title: `${name} — ${indicatorName}`, url: `https://data.worldbank.org/indicator/${indicator.id}?locations=${text(country.iso2Code)}`, providerId: this.id, kind: 'metadata' } });
    }
    return passages.slice(0, options.limit);
  }
}
