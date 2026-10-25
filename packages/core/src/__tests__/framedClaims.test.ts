import { describe, expect, it } from 'vitest';
import {
  extractClaims, factQueries, factUnits, HeuristicLLM, parseVerifierPrompt, propositions, runVerification,
  SocraticaSearchEvidenceProvider, WikipediaEvidenceProvider, type FetchLike, type LLMProvider,
} from '../index.js';

// A synthetic misinformation answer: every central assertion is false, wrapped in reporting frames.
const ANSWER =
  "NASA announced on October 22, 2026, that Earth has officially completed its transition from a 24-hour rotation cycle to a 30-hour rotation cycle following an unprecedented shift in the planet's magnetic field. " +
  "According to the agency, the change was first detected by the James Webb Space Telescope, which has been monitoring Earth's internal structure since its launch in 2018. " +
  "Scientists confirmed that Earth's gravitational force has decreased by 15% as a direct consequence of the rotational shift, causing sea levels to fall by approximately 12 feet worldwide. " +
  'The United Nations has subsequently ordered all countries to adopt a 10-day calendar week beginning November 1, 2026, to accommodate the longer days. ' +
  "Researchers at Harvard University have also concluded that the Earth's atmospheric oxygen concentration has increased to 35%, eliminating the need for supplemental oxygen at high altitudes. " +
  'NASA officials stated that these changes are permanent and that the Moon will begin orbiting Earth every 48 hours starting in December.';

// Articles written for this test. They state well-established facts; they are not copied from Wikipedia.
const ARTICLES: Array<[RegExp, string, string]> = [
  [/rotation/, "Earth's rotation", 'Earth rotates once in about 24 hours with respect to the Sun.'],
  [/james webb/, 'James Webb Space Telescope', 'The James Webb Space Telescope is a space telescope designed for infrared astronomy. The telescope was launched on 25 December 2021 on an Ariane 5 rocket from Kourou, French Guiana.'],
  [/oxygen/, 'Atmosphere of Earth', 'The atmosphere of Earth is the layer of gases around the planet. By mole fraction, dry air contains 78.08% nitrogen, 20.95% oxygen, 0.93% argon and 0.04% carbon dioxide.'],
  [/moon/, 'Orbit of the Moon', 'The Moon orbits Earth and completes one revolution relative to the fixed stars in about 27.3 days.'],
  [/gravitational/, 'Gravity of Earth', 'Near the surface of Earth, the acceleration due to gravity is about 9.8 metres per second squared.'],
  [/united nations/, 'United Nations', 'The United Nations is an intergovernmental organization that aims to maintain international peace and security.'],
];

function wikipedia(searched: string[]): FetchLike {
  return async (url) => {
    const q = new URL(url).searchParams.get('gsrsearch') ?? '';
    searched.push(q);
    const hit = ARTICLES.find(([re]) => re.test(q));
    const body = hit ? { query: { pages: { 1: { title: hit[1], extract: hit[2] } } } } : {};
    return { ok: true, status: 200, json: async () => body, text: async () => '' };
  };
}

describe('claims wrapped in reporting frames', () => {
  const claims = extractClaims(ANSWER);

  it('separates the statement from who reported it', () => {
    expect(propositions(claims[0]!.text)[0]).toMatch(/^Earth has officially completed its transition/);
    expect(propositions(claims[1]!.text)[0]).toMatch(/^the change was first detected/);
    expect(propositions(claims[5]!.text)).toEqual(['these changes are permanent', 'the Moon will begin orbiting Earth every 48 hours starting in December']);
  });

  it('searches for each fact, never for the reporter or the claimed number', () => {
    expect(claims.map((c) => factQueries(c))).toEqual([
      ['earth rotation cycle'],
      ['james webb space telescope launch'],
      ['earth gravitational force', 'earth sea levels'],
      ['united nations adopt calendar'],
      ['earth oxygen concentration'],
      ['moon orbiting earth'],
    ]);
    const units = factUnits(claims[2]!);
    expect(units.map((u) => [u.number, u.change])).toEqual([['15', true], ['12', true]]);
    expect([1, 4].map((i) => factUnits(claims[i]!)[0]!.kind)).toEqual(['year', 'percent']);
    expect(factUnits(extractClaims('The bridge is 1,000 metres long.')[0]!)[0]).toMatchObject({ number: '1000', kind: 'number' });
  });

  it('gives the judge the passage that states each fact', async () => {
    const searched: string[] = [];
    const seen: Record<string, string[]> = {};
    const recorder: LLMProvider = {
      id: 'recorder',
      complete: async (prompt) => {
        const input = parseVerifierPrompt(prompt)!;
        seen[input.claim] = input.passages.map((p) => p.text);
        return JSON.stringify({ verdict: 'unverifiable', confidence: 0.5, rationale: 'recorded', quotes: [], correction: null });
      },
    };
    await runVerification({ answer: ANSWER, llm: recorder, providers: [new WikipediaEvidenceProvider({ fetch: wikipedia(searched) })] });
    expect(searched).not.toContain('nasa');
    expect(searched).not.toContain('scientists');
    expect(searched).not.toContain('researchers');
    expect(seen[claims[0]!.text]!.join(' ')).toContain('about 24 hours');
    expect(seen[claims[1]!.text]!.join(' ')).toContain('25 December 2021');
    expect(seen[claims[4]!.text]!.join(' ')).toContain('20.95% oxygen');
    expect(seen[claims[5]!.text]!.join(' ')).toContain('27.3 days');
  });

  it('lets the offline judge contradict a false number inside a long claim, without inventing corrections', async () => {
    const result = await runVerification({ answer: ANSWER, llm: new HeuristicLLM(), providers: [new WikipediaEvidenceProvider({ fetch: wikipedia([]) })] });
    const byClaim = Object.fromEntries(result.verdicts.map((v) => [v.claim, v]));
    const jwst = byClaim[claims[1]!.text]!;
    expect(jwst.verdict).toBe('contradicted');
    expect(jwst.quotes[0]!.quote).toContain('launched on 25 December 2021');
    expect(jwst.correction).toBeUndefined();
    const oxygen = byClaim[claims[4]!.text]!;
    expect(oxygen.verdict).toBe('contradicted');
    expect(oxygen.rationale).toContain('20.95');
    // Invented announcements and amounts of change stay unverifiable: there is nothing to quote against them.
    expect(byClaim[claims[2]!.text]!.verdict).toBe('unverifiable');
    expect(byClaim[claims[3]!.text]!.verdict).toBe('unverifiable');
    expect(result.summary.supported).toBe(0);
  });

  it('ranks the web result that states the figure above ones that only mention the topic', async () => {
    // Shaped like a live Google answer: four snippets about Earth's oxygen, and the one that gives the
    // figure last, from a page whose title, not its text, says it is about the Earth.
    const organic = [
      { title: 'Historical Global Atmospheric Oxygen Levels Graph', link: 'https://example.org/graph', snippet: "This graph displays earth's atmospheric oxygen levels from 1991 up to the present." },
      { title: 'How has the oxygen on earth been preserved?', link: 'https://example.org/forum', snippet: "Is it known how earth's oxygen has stayed steady for the past couple million years?" },
      { title: 'Oxygen cycle', link: 'https://example.org/cycle', snippet: "Plants release the oxygen in Earth's atmosphere through photosynthesis." },
      { title: 'Where does oxygen come from?', link: 'https://example.org/ocean', snippet: "Much of Earth's oxygen comes from tiny ocean plants called phytoplankton." },
      { title: 'Atmosphere of Earth', link: 'https://example.org/atmosphere', snippet: 'dry air contains 78.08% nitrogen, 20.95% oxygen, varies significantly from around 10 ppm.' },
    ];
    const fetch: FetchLike = async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({ organic }) });
    const result = await runVerification({ answer: ANSWER, llm: new HeuristicLLM(), providers: [new SocraticaSearchEvidenceProvider({ fetch })] });
    const oxygen = result.verdicts.find((v) => v.claim === claims[4]!.text)!;
    expect(oxygen.verdict).toBe('contradicted');
    expect(oxygen.quotes[0]!.quote).toContain('20.95% oxygen');
  });

  it('still corrects a plain one-fact claim', async () => {
    const fetch: FetchLike = async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({ query: { pages: { 1: { title: 'James Webb Space Telescope', extract: ARTICLES[1]![2] } } } }) });
    const result = await runVerification({ answer: 'The James Webb Space Telescope was launched in 2018.', llm: new HeuristicLLM(), providers: [new WikipediaEvidenceProvider({ fetch })] });
    expect(result.verdicts[0]).toMatchObject({ verdict: 'contradicted', correction: 'The James Webb Space Telescope was launched in 2021.' });
  });
});
