import { describe, expect, it } from 'vitest';
import type { FetchLike } from '@hallucination-firewall/core';
import { handleVerify } from '../verifyService.js';
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

const consented: Settings = { ...DEFAULT_SETTINGS, consent: { granted: true, version: CONSENT_VERSION } };
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
    const s = { ...consented, llm: { provider: 'openai' as const, model: '', apiKey: '' } };
    expect((await handleVerify(req, s, d)).status).toBe('error');
  });
});
