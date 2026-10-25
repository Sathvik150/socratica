import { describe, expect, it } from 'vitest';
import type { FetchLike } from '@socratica/core';
import { handleTestJudge, handleVerify, handleVerifyText } from '../verifyService.js';
import { CONSENT_VERSION, DEFAULT_SETTINGS, type Settings } from '../settings.js';

/** Fake network: Wikipedia's search finds the bridge; the web search engine (Socratica search, the default) finds nothing. */
function deps(granted: boolean | ((origin: string) => boolean) = true) {
  const calls: string[] = [];
  const bodies: string[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push(url);
    if (url.startsWith('https://socratica-search.vercel.app/')) {
      bodies.push(init?.body ?? '');
      return { ok: true, status: 200, json: async () => ({ organic: [] }), text: async () => '' };
    }
    return { ok: true, status: 200, json: async () => ({ query: { pages: { 1: { title: 'Zentha Bridge', extract: 'The Zentha Bridge opened in 1991.' } } } }), text: async () => '' };
  };
  return { calls, bodies, deps: { fetch, hasPermission: async (origin: string) => typeof granted === 'function' ? granted(origin) : granted } };
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

  it('does nothing anywhere when switched off in the popup', async () => {
    const { calls, deps: d } = deps();
    const off = { ...consented, enabled: false };
    expect((await handleVerify(req, off, d)).status).toBe('disabled');
    expect((await handleVerifyText({ text: 'The Eiffel Tower is in Paris.' }, off, d)).status).toBe('disabled');
    expect(calls).toEqual([]);
  });

  it('after consent, searches the web and Wikipedia with only claim-derived queries', async () => {
    const { calls, bodies, deps: d } = deps();
    const res = await handleVerify(req, consented, d);
    expect(res.status).toBe('ok');
    if (res.status !== 'ok') return;
    expect(res.result.summary.contradicted).toBe(1);
    expect(calls.some((u) => u.startsWith('https://socratica-search.vercel.app/'))).toBe(true);
    expect(calls.every((u) => ['https://en.wikipedia.org/', 'https://socratica-search.vercel.app/', 'https://api.duckduckgo.com/'].some((o) => u.startsWith(o)))).toBe(true);
    // Only the claim-derived query goes to the relay.
    for (const body of bodies) expect(JSON.parse(body)).toEqual({ q: 'zentha bridge opened' });
  });

  it('skips optional sources whose host permission was declined', async () => {
    const { calls, deps: d } = deps((origin) => origin === 'https://socratica-search.vercel.app/*');
    const res = await handleVerify(req, consented, d);
    expect(res.status).toBe('ok');
    if (res.status === 'ok') expect(res.warnings.join(' ')).toMatch(/Wikipedia is enabled but its permission/);
    expect(calls.every((u) => u.startsWith('https://socratica-search.vercel.app/'))).toBe(true);
  });

  it('refuses to check, and sends nothing, without permission for the required web search', async () => {
    const { calls, deps: d } = deps(false);
    const res = await handleVerify(req, consented, d);
    expect(res).toMatchObject({ status: 'error' });
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
    evidence: { ...consented.evidence, wikipedia: false },
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
