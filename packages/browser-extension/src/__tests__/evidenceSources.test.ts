import { afterEach, describe, expect, it, vi } from 'vitest';
import { type FetchLike, parseVerifierPrompt } from '@hallucination-firewall/core';
import { CONSENT_VERSION, DEFAULT_SETTINGS, HOST_PERMISSIONS, hasValidConsent, loadSettings, requiredOrigins, type Settings } from '../settings.js';
import { handleVerifyText } from '../verifyService.js';
import { mountOptions, type OptionsApi } from '../optionsView.js';
import { mountPopup, renderResult, type PopupApi } from '../popupView.js';
import manifest from '../../manifest.json';

const answer = 'The Eiffel Tower opened in 1899.';
const offline = { ...DEFAULT_SETTINGS.evidence, wikipedia: false, wikidata: false, europePmc: false };
const settings: Settings = { ...DEFAULT_SETTINGS, evidence: offline, consent: { granted: true, version: CONSENT_VERSION } };
const flush = () => new Promise((r) => setTimeout(r, 0));
function response(data: unknown, status = 200, type = 'application/json') {
  return { ok: status === 200, status, json: async () => data, text: async () => typeof data === 'string' ? data : JSON.stringify(data), headers: { get: (key: string) => key === 'content-type' ? type : null } };
}
afterEach(() => vi.unstubAllGlobals());

describe('source settings and consent migration', () => {
  it('migrates old stored settings without losing keys or treating old consent as valid', async () => {
    vi.stubGlobal('chrome', { storage: { local: { get: async () => ({ 'hf-settings': { consent: { granted: true, version: 1 }, evidence: { wikipedia: false, webSearch: true, webSearchApiKey: 'old-placeholder' } } }) } } });
    const s = await loadSettings();
    expect(s.evidence).toMatchObject({ wikidata: true, europePmc: true, urls: false, trustedUrls: [], googleFactCheck: false, webSearchApiKey: 'old-placeholder' });
    expect(hasValidConsent(s)).toBe(false);
  });

  it('declares all API permissions but only requests enabled exact origins, including pasted URL sites', () => {
    const s = { ...settings, evidence: { ...offline, wikidata: true, europePmc: true, crossref: true, worldBank: true, govUk: true, googleFactCheck: true, tavily: true, urls: true, trustedUrls: ['https://trusted.org/a', 'https://trusted.org/b'] } };
    const origins = requiredOrigins(s);
    expect(origins).toEqual([HOST_PERMISSIONS.wikidata, HOST_PERMISSIONS.europePmc, HOST_PERMISSIONS.crossref, HOST_PERMISSIONS.worldBank, HOST_PERMISSIONS.govUk, HOST_PERMISSIONS.googleFactCheck, HOST_PERMISSIONS.tavily, 'https://trusted.org/*']);
    expect(origins).not.toContain('https://*/*');
    for (const origin of Object.values(HOST_PERMISSIONS)) expect(manifest.optional_host_permissions).toContain(origin);
    expect(manifest.optional_host_permissions).toContain('https://*/*');
  });

  it('does not send any queries or URL requests with stale consent, even when all sources are enabled', async () => {
    const fetch = vi.fn<FetchLike>();
    const s = { ...settings, consent: { granted: true, version: 1 }, evidence: { ...DEFAULT_SETTINGS.evidence, googleFactCheck: true, googleFactCheckApiKey: 'test', tavily: true, tavilyApiKey: 'test', crossref: true, urls: true, trustedUrls: ['https://trusted.org/a'] } };
    expect(await handleVerifyText({ text: answer }, s, { fetch, hasPermission: async () => true })).toEqual({ status: 'consent-required' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('source options', () => {
  async function mount(consented = true) {
    let saved = structuredClone(consented ? settings : DEFAULT_SETTINGS);
    const requested: string[][] = [];
    const api: OptionsApi = { load: async () => saved, save: async (s) => { saved = s; }, requestPermissions: async (origins) => { requested.push(origins); return true; } };
    document.body.innerHTML = '<main id="app"></main>';
    await mountOptions(document.getElementById('app')!, api);
    return { saved: () => saved, requested };
  }
  const set = (id: string, value: string | boolean) => {
    const element = document.getElementById(id) as HTMLInputElement;
    if (typeof value === 'boolean') element.checked = value; else element.value = value;
  };

  it('saves all new toggles, keys and trusted URLs and requests only their enabled sites', async () => {
    const state = await mount();
    for (const id of ['ev-wikidata', 'ev-europe-pmc', 'ev-crossref', 'ev-world-bank', 'ev-gov-uk', 'ev-fact-check', 'ev-tavily', 'ev-urls']) set(id, true);
    set('ev-fact-check-key', 'google-placeholder'); set('ev-tavily-key', 'tavily-placeholder');
    set('ev-tavily-domains', 'who.int\nnih.gov');
    set('ev-trusted-urls', 'https://trusted.org/a#fragment\nhttps://trusted.org/b');
    document.querySelector<HTMLButtonElement>('#save')!.click();
    await flush();
    expect(state.saved().evidence).toMatchObject({ wikidata: true, europePmc: true, crossref: true, googleFactCheck: true, googleFactCheckApiKey: 'google-placeholder', tavily: true, tavilyApiKey: 'tavily-placeholder', tavilyDomains: ['who.int', 'nih.gov'], urls: true, trustedUrls: ['https://trusted.org/a', 'https://trusted.org/b'] });
    expect(state.saved().evidence).toMatchObject({ worldBank: true, govUk: true });
    expect(state.requested[0]).toContain('https://trusted.org/*');
    expect(state.requested[0]).not.toContain('https://*/*');
    expect((document.getElementById('ev-fact-check-key') as HTMLInputElement).type).toBe('password');
    expect((document.getElementById('ev-tavily-key') as HTMLInputElement).type).toBe('password');
  });

  it('rejects unsafe URLs before saving or requesting permissions', async () => {
    const state = await mount(); set('ev-urls', true); set('ev-trusted-urls', 'https://127.0.0.1/private');
    document.querySelector<HTMLButtonElement>('#save')!.click(); await flush();
    expect(state.saved().evidence.urls).toBe(false);
    expect(state.requested).toEqual([]);
    expect(document.getElementById('status')!.textContent).toContain('public HTTPS');
  });

  it('lets users choose NASA/ESA as trusted search sources and persists that restriction', async () => {
    const state = await mount();
    const select = document.getElementById('ev-source-preset') as HTMLSelectElement;
    select.value = 'space'; select.dispatchEvent(new Event('change'));
    expect((document.getElementById('ev-tavily-domains') as HTMLTextAreaElement).value).toBe('nasa.gov\nesa.int');
    set('ev-tavily', true); set('ev-tavily-key', 'test');
    document.querySelector<HTMLButtonElement>('#save')!.click(); await flush();
    expect(state.saved().evidence.tavilyDomains).toEqual(['nasa.gov', 'esa.int']);
    expect(state.requested[0]).toContain(HOST_PERMISSIONS.tavily);
  });

  it('supports general web coverage without a fixed institution whitelist', async () => {
    await mount();
    const select = document.getElementById('ev-source-preset') as HTMLSelectElement;
    select.value = 'space'; select.dispatchEvent(new Event('change'));
    select.value = 'general'; select.dispatchEvent(new Event('change'));
    expect((document.getElementById('ev-tavily-domains') as HTMLTextAreaElement).value).toBe('');
    expect(DEFAULT_SETTINGS.evidence.tavilyDomains).toEqual([]);
  });

  it('describes every destination and saves preferences without permissions before consent', async () => {
    const state = await mount(false);
    for (const name of ['Wikipedia', 'Wikidata', 'Europe PMC', 'Crossref', 'Google Fact Check', 'Tavily', 'Brave']) expect(document.getElementById('consent')!.textContent).toContain(name);
    set('ev-tavily', true); set('ev-tavily-key', 'placeholder');
    document.querySelector<HTMLButtonElement>('#save')!.click(); await flush();
    expect(state.saved().evidence.tavily).toBe(true);
    expect(state.requested).toEqual([]);
  });
});

describe('background source integration', () => {
  it('skips every denied source and does not make network calls', async () => {
    const fetch = vi.fn<FetchLike>();
    const s = { ...settings, evidence: { ...DEFAULT_SETTINGS.evidence, crossref: true, googleFactCheck: true, googleFactCheckApiKey: 'google', tavily: true, tavilyApiKey: 'tavily', urls: true, trustedUrls: ['https://trusted.org/a'] } };
    const r = await handleVerifyText({ text: answer }, s, { fetch, hasPermission: async () => false });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.warnings.filter((w) => w.includes('permission'))).toHaveLength(7);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('warns about missing API keys without making keyed-provider calls', async () => {
    const fetch = vi.fn<FetchLike>();
    const s = { ...settings, evidence: { ...offline, googleFactCheck: true, tavily: true } };
    const r = await handleVerifyText({ text: answer }, s, { fetch, hasPermission: async () => true });
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.warnings.join(' ')).toContain('Google Fact Check is enabled but no API key');
    expect(r.warnings.join(' ')).toContain('Tavily is enabled but no API key');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses Europe PMC when Wikipedia is rate-limited and retains caches/cooldowns across checks', async () => {
    const calls: string[] = [];
    const fetch: FetchLike = async (url) => {
      calls.push(url);
      return url.startsWith('https://en.wikipedia.org') ? response({}, 429) : response({ resultList: { result: [{ id: '123', source: 'MED', title: 'Tower', abstractText: 'The Eiffel Tower opened in 1889.' }] } });
    };
    const s = { ...settings, evidence: { ...offline, wikipedia: true, europePmc: true } };
    const deps = { fetch, hasPermission: async () => true };
    for (let i = 0; i < 2; i++) {
      const r = await handleVerifyText({ text: answer }, s, deps);
      if (r.status !== 'ok') throw new Error(r.status);
      expect(r.result.summary.contradicted).toBe(1);
      expect(r.warnings.join(' ')).toContain('429');
    }
    expect(calls).toHaveLength(2);
  });

  it('fetches allowed trusted sites only and keeps working when another URL fails', async () => {
    const calls: string[] = [];
    const fetch: FetchLike = async (url) => { calls.push(url); return url.includes('/missing') ? response('', 404) : response('The Eiffel Tower opened in 1889.', 200, 'text/plain'); };
    const s = { ...settings, evidence: { ...offline, urls: true, trustedUrls: ['https://trusted.org/tower', 'https://trusted.org/missing', 'https://denied.org/a'] } };
    const r = await handleVerifyText({ text: answer }, s, { fetch, hasPermission: async (origin) => origin === 'https://trusted.org/*' });
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.result.summary.contradicted).toBe(1);
    expect(r.warnings.join(' ')).toContain('HTTP 404');
    expect(r.warnings.join(' ')).toContain('permission');
    expect(calls).toEqual(['https://trusted.org/tower', 'https://trusted.org/missing']);
    const panel = renderResult(document, r);
    expect(panel.textContent).toContain('Contradicted');
    expect(panel.querySelector('blockquote')!.textContent).toContain('The Eiffel Tower opened in 1889.');
    expect(panel.querySelector('a')!.getAttribute('href')).toBe('https://trusted.org/tower');
    expect(panel.querySelector('.correction')!.textContent).toBe('Correction: The Eiffel Tower opened in 1889.');
  });

  it('passes publisher ratings to the selected model and keeps keys scoped to their API', async () => {
    const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = [];
    const fetch: FetchLike = async (url, init) => {
      calls.push({ url, init });
      if (url.startsWith('https://factchecktools.googleapis.com')) return response({ claims: [{ text: answer, claimReview: [{ publisher: { name: 'Checker' }, textualRating: 'False', url: 'https://checker.org/tower' }] }] });
      const prompt = JSON.parse(init!.body!).messages[0].content as string;
      const input = parseVerifierPrompt(prompt)!;
      expect(input.passages[0]?.kind).toBe('review');
      return response({ choices: [{ message: { content: JSON.stringify({ verdict: 'contradicted', confidence: 0.9, rationale: 'The publisher rated this exact claim false.', quotes: [{ passage_id: input.passages[0]!.id, quote: input.passages[0]!.text }], correction: null }) } }] });
    };
    const s: Settings = { ...settings, evidence: { ...offline, googleFactCheck: true, googleFactCheckApiKey: 'google-placeholder' }, llm: { ...settings.llm, provider: 'openai', apiKey: 'judge-placeholder' } };
    const r = await handleVerifyText({ text: answer }, s, { fetch, hasPermission: async () => true });
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.result.summary.contradicted).toBe(1);
    expect(calls[0]?.init?.headers).toMatchObject({ 'x-goog-api-key': 'google-placeholder' });
    expect(calls[1]?.init?.headers).toMatchObject({ authorization: 'Bearer judge-placeholder' });
    expect(JSON.stringify(calls[1])).not.toContain('google-placeholder');
    expect(JSON.stringify(calls[0])).not.toContain('judge-placeholder');
  });

  it('shows enabled sources in the popup', async () => {
    document.body.innerHTML = '<main id="app"></main>';
    const s = { ...settings, evidence: { ...offline, wikidata: true, europePmc: true, crossref: true, googleFactCheck: true, tavily: true, urls: true } };
    const api: PopupApi = { getSettings: async () => s, activeTab: async () => undefined, pageStatus: async () => undefined, checkLatest: async () => ({ ok: true }), getSelection: async () => '', verifyText: async () => ({ status: 'disabled' }), openOptions: () => {} };
    await mountPopup(document.getElementById('app')!, null, api);
    expect(document.body.textContent).toContain('Wikidata, Europe PMC, Crossref, Google Fact Check, Tavily, Trusted URLs');
  });
});
