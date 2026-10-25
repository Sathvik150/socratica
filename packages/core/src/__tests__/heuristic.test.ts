import { describe, expect, it } from 'vitest';
import { HeuristicLLM, buildVerifierPrompt, parseLLMVerdict, type Passage } from '../index.js';

async function judge(claimText: string, passageText: string) {
  const passage: Passage = { id: 'p1', text: passageText, score: 1, source: { title: 't', providerId: 'documents' } };
  const prompt = buildVerifierPrompt({ id: 'c1', text: claimText, span: { start: 0, end: claimText.length }, context: claimText }, [passage]);
  const verdict = parseLLMVerdict(await new HeuristicLLM().complete(prompt))!;
  for (const q of verdict.quotes) expect(passageText.includes(q.quote)).toBe(true);
  return verdict;
}

describe('HeuristicLLM', () => {
  it('supports a directly stated fact', async () => {
    expect((await judge('The Pell Tower is 212 meters tall.', 'The Pell Tower is 212 meters tall.')).verdict).toBe('supported');
  });

  it('contradicts a mismatched number about the same predicate and proposes a correction', async () => {
    const v = await judge('The Pell Tower is 190 meters tall.', 'The Pell Tower is 212 meters tall.');
    expect(v.verdict).toBe('contradicted');
    expect(v.correction).toBe('The Pell Tower is 212 meters tall.');
  });

  it('resolves a pronoun-led passage sentence and quotes both sentences verbatim', async () => {
    const v = await judge('The Pell Tower opened in 1960.', 'The Pell Tower stands in Dunmore. It opened in 1964.');
    expect(v.verdict).toBe('contradicted');
    expect(v.quotes[0]?.quote).toBe('The Pell Tower stands in Dunmore. It opened in 1964.');
  });

  it('does not treat a number about a different predicate as a contradiction', async () => {
    const v = await judge('The Pell Tower has 40 elevators.', 'Built in 1964, the Pell Tower is in Dunmore.');
    expect(v.verdict).toBe('unverifiable');
  });

  it('flags an entity swap only for the same predicate', async () => {
    expect((await judge('The Pell Tower was designed by Ana Fry.', 'The Pell Tower was designed by Bo Lin.')).verdict).toBe('contradicted');
    expect((await judge('The Pell Tower was designed by Ana Fry.', 'The Pell Tower was visited by Bo Lin.')).verdict).toBe('unverifiable');
  });

  it("ignores articles and possessives when comparing names", async () => {
    const v = await judge('The Dunmore city flag is green.', "Dunmore's city flag is green and white.");
    expect(v.verdict).not.toBe('contradicted');
  });

  it('flags negation conflicts', async () => {
    expect((await judge('The Pell Tower is not open to visitors.', 'The Pell Tower is open to visitors daily.')).verdict).toBe('contradicted');
  });

  describe('encyclopedic phrasing', () => {
    const eiffel = 'The Eiffel Tower is a wrought-iron lattice tower in Paris. The tower is 330 metres (1,083 ft) tall.';

    it('matches spelling variants, unit abbreviations and "the tower" back-references', async () => {
      expect((await judge('The Eiffel Tower is about 330 meters tall.', eiffel)).verdict).toBe('supported');
      expect((await judge('The Eiffel Tower stands 330 m tall.', eiffel)).verdict).toBe('supported');
    });

    it('compares a figure only with figures in the same unit', async () => {
      const v = await judge('The Eiffel Tower is 300 meters tall.', eiffel);
      expect(v.verdict).toBe('contradicted');
      expect(v.correction).toBe('The Eiffel Tower is 330 meters tall.');
      // 1,083 is the height in feet, not a different height in meters.
      expect((await judge('The Eiffel Tower is 1,083 meters tall.', eiffel)).verdict).not.toBe('supported');
    });

    it('accepts rounding to the claim precision, and hedged figures within 5%', async () => {
      const everest = 'Mount Everest is the highest mountain. Its elevation is 8,848.86 m.';
      expect((await judge('Mount Everest is 8,849 meters high.', everest)).verdict).toBe('supported');
      expect((await judge('Mount Everest is about 8,800 meters high.', everest)).verdict).toBe('supported');
      expect((await judge('Mount Everest is about 9,500 meters high.', everest)).verdict).toBe('contradicted');
    });

    it('compares a year with a year, not with the day of the month', async () => {
      const v = await judge('The Golden Gate Bridge opened in 1933.', 'The Golden Gate Bridge is a suspension bridge. The bridge opened to traffic on May 27, 1937.');
      expect(v.verdict).toBe('contradicted');
      expect(v.correction).toBe('The Golden Gate Bridge opened in 1937.');
    });

    it('does not treat a date or the subject itself as a swapped name', async () => {
      const statue = 'The Statue of Liberty is a sculpture in New York Harbor. The statue was dedicated on October 28, 1886.';
      expect((await judge('The Statue of Liberty was dedicated in 1886.', statue)).verdict).toBe('supported');
    });

    it('never contradicts a claim about a different subject', async () => {
      expect((await judge('Tokyo Tower is 333 meters tall.', eiffel)).verdict).toBe('unverifiable');
    });

    it('does not support a name attached to a different predicate in the same sentence', async () => {
      const text = 'The statue was designed by sculptor Frédéric Auguste Bartholdi and its metal framework was built by Gustave Eiffel.';
      expect((await judge('The statue was designed by Frédéric Auguste Bartholdi.', text)).verdict).toBe('supported');
      expect((await judge('The statue was designed by Gustave Eiffel.', text)).verdict).not.toBe('supported');
    });
  });

  it('is unverifiable when nothing relevant is present', async () => {
    expect((await judge('The Pell Tower has a revolving restaurant.', 'Dunmore is a coastal town.')).verdict).toBe('unverifiable');
  });
});
