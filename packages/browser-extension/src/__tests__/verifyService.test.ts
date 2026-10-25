import { describe, expect, it } from 'vitest';
import type { FetchLike } from '@hallucination-firewall/core';
import { handleTestJudge, handleVerify, handleVerifyText } from '../verifyService.js';
import { CONSENT_VERSION, DEFAULT_SETTINGS, type Settings } from '../settings.js';

function deps(granted = true) {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    if (url.includes('list=search')) return { ok: true, status: 200, json: async () => ({ query: { search: [{ title: 'Zentha Bridge' }] } }), text: async () => '' };
    return { ok: true, status: 200, json: async () => ({ query: { pages: { 1: { extract: 'The Zentha Bridge opened in 1991.' } } } }), text: async () => '' };
  };
  return { calls, deps: { fetch, hasPermission: async () => granted } };
}

const consented: Settings = { ...DEFAULT_SETTINGS, consent: { granted: true, version: CONSENT_VERSION }, evidence: { ...DEFAULT_SETTINGS.evidence, wikidata: false, europePmc: false } };
const req = { platform: 'chatgpt' as const, answer: 'The Zentha Bridge opened in 1987.' };

describe('background verify service', () => {
  it('makes no network calls before consent (the default)', async () => {
    const { calls, deps: d } = deps();
    expect(await handleVerify(req, DEFAULT_SETTINGS, d)).toEqual({ status: 'consent-required' });
    expect(calls).toEqual([]);
  });

  it('treats consent to an older notice version as no consent', async () => {
    const { calls, deps: d } = deps();
    const stale = { ...DEFAULT_SETTINGS, consent: { granted: true, version: CONSENT_VERSION - 1 } };
    expect((await handleVerify(req, stale, d)).status).toBe('consent-required');
    expect(calls).toEqual([]);
  });

  it('does nothing when the platform is disabled', async () => {
    const { calls, deps: d } = deps();
    const off = { ...consented, platforms: { ...consented.platforms, chatgpt: false } };
    expect((await handleVerify(req, off, d)).status).toBe('disabled');
    expect(calls).toEqual([]);
  });

  it('after consent, uses Wikipedia with only claim-derived queries', async () => {
    const { calls, deps: d } = deps();
    const res = await handleVerify(req, consented, d);
    expect(res.status).toBe('ok');
    if (res.status !== 'ok') return;
    expect(res.result.summary.contradicted).toBe(1);
    expect(calls.every((u) => u.startsWith('https://en.wikipedia.org/'))).toBe(true);
  });

  it('skips sources whose host permission was declined', async () => {
    const { calls, deps: d } = deps(false);
    const res = await handleVerify(req, consented, d);
    expect(res.status).toBe('ok');
    if (res.status === 'ok') expect(res.warnings.join(' ')).toMatch(/permission/);
    expect(calls).toEqual([]);
  });

  it('requires a key for remote LLM providers', async () => {
    const { deps: d } = deps();
    const s = { ...consented, llm: { provider: 'openai' as const, model: '', apiKey: '', baseUrl: '' } };
    expect((await handleVerify(req, s, d)).status).toBe('error');
  });
});

describe('local model judge', () => {
  const local: Settings = {
    ...consented,
    evidence: { ...consented.evidence, wikipedia: false, webSearch: false, webSearchApiKey: '' },
    llm: { provider: 'local', model: 'qwen2.5:7b', apiKey: '', baseUrl: 'http://localhost:11434/v1' },
  };

  it('calls the OpenAI-compatible endpoint on localhost', async () => {
    const urls: string[] = [];
    const fetch: FetchLike = async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"ok": true}' } }] }), text: async () => '' };
    };
    const res = await handleTestJudge(local, { fetch, hasPermission: async () => true });
    expect(res).toMatchObject({ ok: true, judge: 'qwen2.5:7b (local)' });
    expect(urls).toEqual(['http://localhost:11434/v1/chat/completions']);
  });

  it('explains an HTTP 403 from Ollama (missing OLLAMA_ORIGINS)', async () => {
    const fetch: FetchLike = async () => ({ ok: false, status: 403, json: async () => ({}), text: async () => '' });
    const res = await handleTestJudge(local, { fetch, hasPermission: async () => true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain('OLLAMA_ORIGINS="chrome-extension://*"');
  });

  it('explains an unreachable server', async () => {
    const fetch: FetchLike = async () => {
      throw new TypeError('Failed to fetch');
    };
    const res = await handleTestJudge(local, { fetch, hasPermission: async () => true });
    if (!res.ok) expect(res.message).toMatch(/Is your local model server running/);
  });

  it('requires the localhost permission', async () => {
    const { deps: d } = deps(false);
    const res = await handleVerify(req, local, d);
    expect(res).toMatchObject({ status: 'error' });
  });
});

describe('selected-text checks', () => {
  it('need consent, like page checks', async () => {
    const { calls, deps: d } = deps();
    expect(await handleVerifyText({ text: 'The Zentha Bridge opened in 1987.' }, DEFAULT_SETTINGS, d)).toEqual({ status: 'consent-required' });
    expect(calls).toEqual([]);
  });

  it('run the same pipeline, regardless of which site the text came from', async () => {
    const { deps: d } = deps();
    const res = await handleVerifyText({ text: 'The Zentha Bridge opened in 1987.' }, consented, d);
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.result.summary.contradicted).toBe(1);
      expect(res.warnings.join(' ')).toMatch(/offline heuristic judge/);
    }
  });
});
