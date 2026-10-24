import type { FetchLike, LLMProvider } from '../../types.js';

export interface OpenAIOptions {
  /** Required for api.openai.com. Optional for a custom `baseUrl` (e.g. a local Ollama/LM Studio server). */
  apiKey?: string;
  fetch: FetchLike;
  model?: string;
  /** Override for OpenAI-compatible endpoints. Must be covered by the extension's host permissions. */
  baseUrl?: string;
}

/**
 * OpenAI Chat Completions provider. Also works with any OpenAI-compatible
 * server (Ollama, LM Studio, llama.cpp, vLLM) via `baseUrl`.
 * The key is only ever sent in the Authorization header.
 */
export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai';
  readonly #opts: Required<Omit<OpenAIOptions, 'apiKey'>> & { apiKey: string };

  constructor(opts: OpenAIOptions) {
    if (!opts.apiKey && !opts.baseUrl) throw new Error('OpenAIProvider: an API key is required');
    this.#opts = { model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', ...opts, apiKey: opts.apiKey ?? '' };
  }

  async complete(prompt: string): Promise<string> {
    const res = await this.#opts.fetch(`${this.#opts.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.#opts.apiKey ? { authorization: `Bearer ${this.#opts.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.#opts.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI request failed with HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('OpenAI response had no message content');
    return text;
  }
}
