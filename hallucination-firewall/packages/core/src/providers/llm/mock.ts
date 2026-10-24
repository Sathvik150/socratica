import type { LLMProvider } from '../../types.js';
import { HeuristicLLM } from './heuristic.js';

export type MockResponder = string | ((prompt: string, callIndex: number) => string);

/**
 * Deterministic LLM for tests. With no responder it behaves like
 * `HeuristicLLM`; with a responder it returns scripted output, so tests can
 * feed malformed JSON, fabricated quotes, etc. Never touches the network.
 */
export class MockLLM implements LLMProvider {
  readonly id = 'mock';
  readonly prompts: string[] = [];
  readonly #responder: MockResponder | undefined;
  readonly #fallback = new HeuristicLLM();

  constructor(responder?: MockResponder) {
    this.#responder = responder;
  }

  async complete(prompt: string): Promise<string> {
    const index = this.prompts.length;
    this.prompts.push(prompt);
    if (this.#responder === undefined) return this.#fallback.complete(prompt);
    return typeof this.#responder === 'string' ? this.#responder : this.#responder(prompt, index);
  }
}
