import { afterEach, describe, expect, it, vi } from 'vitest';
import { type FetchLike, parseVerifierPrompt } from '@socratica/core';
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

/** Every check queries the web search engine (Firecrawl by default); these fakes answer it with no results. */
const isWebSearch = (url: string) => url.startsWith('https://api.firecrawl.dev/');
const noWebResults = () => response({ success: true, data: { web: [] } });
/** Permissions for the default web engine plus whatever a test allows. */
const allow = (...origins: string[]) => async (origin: string) => origin === HOST_PERMISSIONS.firecrawl || origins.includes(origin);

describe('source settings and consent migration', () => {
  it('migrates old stored settings without losing keys or treating old consent as valid', async () => {
    vi.stubGlobal('chrome', { storage: { local: { get: async () => ({ 'socratica-settings': { consent: { granted: true, version: 1 }, evidence: { wikipedia: false, webSearch: true, webSearchApiKey: 'old-placeholder', tavily: true, tavilyApiKey: 'gone' } } }) } } });
    const s = await loadSettings();
    expect(s.evidence).toMatchObject({ wikipedia: false, wikidata: true, europePmc: true, urls: false, trustedUrls: [], googleFactCheck: false });
    // The old optional Brave toggle becomes the required engine, keeping its key; Tavily is gone.
    expect(s.evidence.web).toEqual({ engine: 'brave', firecrawlApiKey: '', serperApiKey: '', braveApiKey: 'old-placeholder' });
    expect(s.evidence).not.toHaveProperty('tavily');
    expect(s.evidence).not.toHaveProperty('webSearchApiKey');
    expect(hasValidConsent(s)).toBe(false);
  });

  it('reads settings saved under the pre-Socratica storage key, defaulting web search to Firecrawl', async () => {
    vi.stubGlobal('chrome', { storage: { local: { get: async () => ({ 'hf-settings': { autoCheck: false, evidence: { wikidata: false } } }) } } });
    const s = await loadSettings();
    expect(s.autoCheck).toBe(false);
    expect(s.evidence.wikidata).toBe(false);
    expect(s.evidence.web.engine).toBe('firecrawl');
  });

  it('declares all API permissions but only requests enabled exact origins, including pasted URL sites', () => {
    const s = { ...settings, evidence: { ...offline, wikidata: true, europePmc: true, worldBank: true, govUk: true, googleFactCheck: true, urls: true, trustedUrls: ['https://trusted.org/a', 'https://trusted.org/b'] } };
    const origins = requiredOrigins(s);
    // The web search engine is always first: it is required.
    expect(origins).toEqual([HOST_PERMISSIONS.firecrawl, HOST_PERMISSIONS.wikidata, HOST_PERMISSIONS.europePmc, HOST_PERMISSIONS.worldBank, HOST_PERMISSIONS.govUk, HOST_PERMISSIONS.googleFactCheck, 'https://trusted.org/*']);
    expect(requiredOrigins({ ...s, evidence: { ...s.evidence, web: { ...s.evidence.web, engine: 'serper' } } })[0]).toBe(HOST_PERMISSIONS.serper);
    expect(origins).not.toContain('https://*/*');
    for (const origin of Object.values(HOST_PERMISSIONS)) expect(manifest.optional_host_permissions).toContain(origin);
    expect(manifest.optional_host_permissions).toContain('https://*/*');
  });

  it('does not send any queries or URL requests with stale consent, even when all sources are enabled', async () => {
    const fetch = vi.fn<FetchLike>();
    const s = { ...settings, consent: { granted: true, version: 1 }, evidence: { ...DEFAULT_SETTINGS.evidence, googleFactCheck: true, googleFactCheckApiKey: 'test', urls: true, trustedUrls: ['https://trusted.org/a'] } };
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
    for (const id of ['ev-wikidata', 'ev-europe-pmc', 'ev-world-bank', 'ev-gov-uk', 'ev-fact-check', 'ev-urls']) set(id, true);
    set('ev-fact-check-key', 'google-placeholder');
    document.querySelector<HTMLInputElement>('#web-serper')!.click();
    set('web-key', 'serper-placeholder');
    set('ev-trusted-urls', 'https://trusted.org/a#fragment\nhttps://trusted.org/b');
    document.querySelector<HTMLButtonElement>('#save')!.click();
    await flush();
    expect(state.saved().evidence).toMatchObject({ wikidata: true, europePmc: true, googleFactCheck: true, googleFactCheckApiKey: 'google-placeholder', urls: true, trustedUrls: ['https://trusted.org/a', 'https://trusted.org/b'] });
    expect(state.saved().evidence).toMatchObject({ worldBank: true, govUk: true });
    expect(state.saved().evidence.web).toMatchObject({ engine: 'serper', serperApiKey: 'serper-placeholder' });
    expect(state.requested[0]?.[0]).toBe(HOST_PERMISSIONS.serper);
    expect(state.requested[0]).toContain('https://trusted.org/*');
    expect(state.requested[0]).not.toContain(HOST_PERMISSIONS.firecrawl);
    expect(state.requested[0]).not.toContain('https://*/*');
    expect((document.getElementById('ev-fact-check-key') as HTMLInputElement).type).toBe('password');
    expect((document.getElementById('web-key') as HTMLInputElement).type).toBe('password');
  });

  it('rejects unsafe URLs before saving or requesting permissions', async () => {
    const state = await mount(); set('ev-urls', true); set('ev-trusted-urls', 'https://127.0.0.1/private');
    document.querySelector<HTMLButtonElement>('#save')!.click(); await flush();
    expect(state.saved().evidence.urls).toBe(false);
    expect(state.requested).toEqual([]);
    expect(document.getElementById('status')!.textContent).toContain('public HTTPS');
  });

  it('defaults to keyless Firecrawl and refuses to save an engine that needs a missing key', async () => {
    const state = await mount();
    expect(document.querySelector<HTMLInputElement>('#web-firecrawl')!.checked).toBe(true);
    expect(document.getElementById('web-search')!.textContent).toContain('Required');
    document.querySelector<HTMLInputElement>('#web-brave')!.click();
    document.querySelector<HTMLButtonElement>('#save')!.click(); await flush();
    expect(state.saved().evidence.web.engine).toBe('firecrawl');
    expect(state.requested).toEqual([]);
    expect(document.getElementById('status')!.textContent).toContain('Brave Search needs an API key');
  });

  it('remembers a key per engine while switching between them', async () => {
    const state = await mount();
    document.querySelector<HTMLInputElement>('#web-serper')!.click(); set('web-key', 'serper-placeholder');
    document.querySelector<HTMLInputElement>('#web-brave')!.click();
    expect((document.getElementById('web-key') as HTMLInputElement).value).toBe('');
    set('web-key', 'brave-placeholder');
    document.querySelector<HTMLInputElement>('#web-serper')!.click();
    expect((document.getElementById('web-key') as HTMLInputElement).value).toBe('serper-placeholder');
    expect(document.querySelector('.choice.selected')!.getAttribute('data-engine')).toBe('serper');
    document.querySelector<HTMLButtonElement>('#save')!.click(); await flush();
    expect(state.saved().evidence.web).toEqual({ engine: 'serper', firecrawlApiKey: '', serperApiKey: 'serper-placeholder', braveApiKey: 'brave-placeholder' });
  });

  it('describes every destination and saves preferences without permissions before consent', async () => {
    const state = await mount(false);
    for (const name of ['Wikipedia', 'Wikidata', 'Europe PMC', 'Google Fact Check', 'Firecrawl', 'Serper', 'Brave']) expect(document.getElementById('consent')!.textContent).toContain(name);
    set('ev-world-bank', true);
    document.querySelector<HTMLButtonElement>('#save')!.click(); await flush();
    expect(state.saved().evidence.worldBank).toBe(true);
    expect(state.requested).toEqual([]);
  });
});

describe('background source integration', () => {
  it('skips every denied optional source and contacts only the web search engine', async () => {
    const fetch = vi.fn<FetchLike>(async () => noWebResults());
    const s = { ...settings, evidence: { ...DEFAULT_SETTINGS.evidence, googleFactCheck: true, googleFactCheckApiKey: 'google', urls: true, trustedUrls: ['https://trusted.org/a'] } };
    const r = await handleVerifyText({ text: answer }, s, { fetch, hasPermission: allow() });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.warnings.filter((w) => w.includes('permission'))).toHaveLength(5);
    expect(fetch).toHaveBeenCalled();
    for (const [url] of fetch.mock.calls) expect(isWebSearch(url)).toBe(true);
  });

  it('stops with an error, and sends nothing, when web search cannot run', async () => {
    const fetch = vi.fn<FetchLike>();
    const denied = await handleVerifyText({ text: answer }, { ...settings, evidence: DEFAULT_SETTINGS.evidence }, { fetch, hasPermission: async () => false });
    expect(denied).toMatchObject({ status: 'error' });
    if (denied.status === 'error') expect(denied.message).toContain('permission to contact Firecrawl');
    const keyless = { ...settings, evidence: { ...offline, web: { ...offline.web, engine: 'serper' as const } } };
    const noKey = await handleVerifyText({ text: answer }, keyless, { fetch, hasPermission: async () => true });
    expect(noKey).toMatchObject({ status: 'error' });
    if (noKey.status === 'error') expect(noKey.message).toContain('Web search is required');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('warns about missing API keys without making keyed-provider calls', async () => {
    const fetch = vi.fn<FetchLike>(async () => noWebResults());
    const s = { ...settings, evidence: { ...offline, googleFactCheck: true } };
    const r = await handleVerifyText({ text: answer }, s, { fetch, hasPermission: async () => true });
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.warnings.join(' ')).toContain('Google Fact Check is enabled but no API key');
    for (const [url] of fetch.mock.calls) expect(isWebSearch(url)).toBe(true);
  });

  it('uses Europe PMC when Wikipedia is rate-limited and retains caches/cooldowns across checks', async () => {
    const calls: string[] = [];
    const fetch: FetchLike = async (url) => {
      if (isWebSearch(url)) return noWebResults();
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
    const fetch: FetchLike = async (url) => { if (isWebSearch(url)) return noWebResults(); calls.push(url); return url.includes('/missing') ? response('', 404) : response('The Eiffel Tower opened in 1889.', 200, 'text/plain'); };
    const s = { ...settings, evidence: { ...offline, urls: true, trustedUrls: ['https://trusted.org/tower', 'https://trusted.org/missing', 'https://denied.org/a'] } };
    const r = await handleVerifyText({ text: answer }, s, { fetch, hasPermission: allow('https://trusted.org/*') });
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
      if (isWebSearch(url)) return noWebResults();
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
    const s = { ...settings, evidence: { ...offline, wikidata: true, europePmc: true, googleFactCheck: true, urls: true } };
    const api: PopupApi = { getSettings: async () => s, activeTab: async () => undefined, pageStatus: async () => undefined, checkLatest: async () => ({ ok: true }), getSelection: async () => '', verifyText: async () => ({ status: 'disabled' }), openOptions: () => {} };
    await mountPopup(document.getElementById('app')!, null, api);
    expect(document.getElementById('evidence-summary')!.textContent).toBe('Also searching: Wikidata, Europe PMC, Google Fact Check, Trusted URLs.');
    expect(document.getElementById('web-source')!.textContent).toContain('Firecrawl');
    expect(document.getElementById('web-source')!.textContent).toContain('no key needed');
  });
});
