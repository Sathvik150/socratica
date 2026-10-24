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

  it('is unverifiable when nothing relevant is present', async () => {
    expect((await judge('The Pell Tower has a revolving restaurant.', 'Dunmore is a coastal town.')).verdict).toBe('unverifiable');
  });
});
