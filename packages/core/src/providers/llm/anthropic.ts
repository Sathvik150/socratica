import type { FetchLike, LLMProvider } from '../../types.js';

export interface AnthropicOptions {
  apiKey: string;
  fetch: FetchLike;
  model?: string;
}

/**
 * Anthropic Messages API provider over raw fetch (no SDK, to keep core dependency-free).
 * The `anthropic-dangerous-direct-browser-access` header is required for calls from a
 * browser context such as an extension service worker; the key is the user's own.
 */
export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic';
  readonly #opts: Required<AnthropicOptions>;

  constructor(opts: AnthropicOptions) {
    if (!opts.apiKey) throw new Error('AnthropicProvider: an API key is required');
    this.#opts = { model: 'claude-opus-5-5', ...opts };
  }

  async complete(prompt: string): Promise<string> {
    const res = await this.#opts.fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.#opts.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.#opts.model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic request failed with HTTP ${res.status}`);
    const data = (await res.json()) as { stop_reason?: string; content?: Array<{ type: string; text?: string }> };
    if (data.stop_reason === 'refusal') throw new Error('Anthropic model declined the request');
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
    if (!text) throw new Error('Anthropic response had no text content');
    return text;
  }
}
