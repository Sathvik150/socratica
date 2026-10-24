import { describe, expect, it } from 'vitest';
import { AnthropicProvider, OpenAIProvider, type FetchLike } from '../index.js';

function capture(response: unknown, ok = true) {
  const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return { ok, status: ok ? 200 : 401, json: async () => response, text: async () => JSON.stringify(response) };
  };
  return { calls, fetch };
}

describe('LLM providers (fake fetch, no network)', () => {
  it('OpenAIProvider sends the key as a bearer header and returns message content', async () => {
    const { calls, fetch } = capture({ choices: [{ message: { content: '{"ok":true}' } }] });
    const out = await new OpenAIProvider({ apiKey: 'placeholder', fetch }).complete('hi');
    expect(out).toBe('{"ok":true}');
    expect(calls[0]!.init?.headers?.authorization).toBe('Bearer placeholder');
    expect(calls[0]!.url).not.toContain('placeholder');
  });

  it('AnthropicProvider sends required headers and joins text blocks', async () => {
    const { calls, fetch } = capture({ stop_reason: 'end_turn', content: [{ type: 'thinking' }, { type: 'text', text: '{"a":1}' }] });
    const out = await new AnthropicProvider({ apiKey: 'placeholder', fetch }).complete('hi');
    expect(out).toBe('{"a":1}');
    expect(calls[0]!.init?.headers).toMatchObject({
      'x-api-key': 'placeholder',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
  });

  it('errors do not leak the key', async () => {
    const { fetch } = capture({}, false);
    await expect(new OpenAIProvider({ apiKey: 'secret-placeholder', fetch }).complete('hi')).rejects.toThrow(/HTTP 401/);
    await expect(new OpenAIProvider({ apiKey: 'secret-placeholder', fetch }).complete('hi')).rejects.not.toThrow(/secret-placeholder/);
  });

  it('OpenAIProvider works keyless against a local OpenAI-compatible server', async () => {
    const { calls, fetch } = capture({ choices: [{ message: { content: 'ok' } }] });
    await new OpenAIProvider({ baseUrl: 'http://localhost:11434/v1/', model: 'llama3', fetch }).complete('hi');
    expect(calls[0]!.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(calls[0]!.init?.headers?.authorization).toBeUndefined();
  });

  it('requires a key', () => {
    const { fetch } = capture({});
    expect(() => new OpenAIProvider({ apiKey: '', fetch })).toThrow();
    expect(() => new AnthropicProvider({ apiKey: '', fetch })).toThrow();
  });
});
