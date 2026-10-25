import { describe, expect, it } from 'vitest';
import { MockLLM, runVerification } from '@hallucination-firewall/core';
import { mountPopup, type PopupApi } from '../popupView.js';
import { CONSENT_VERSION, DEFAULT_SETTINGS, type Settings } from '../settings.js';

const consented: Settings = { ...DEFAULT_SETTINGS, consent: { granted: true, version: CONSENT_VERSION } };
const flush = () => new Promise((r) => setTimeout(r, 0));

function api(over: Partial<PopupApi> = {}, settings: Settings = consented) {
  const calls: string[] = [];
  const a: PopupApi = {
    getSettings: async () => settings,
    activeTab: async () => ({ id: 7, url: 'https://chatgpt.com/c/abc' }),
    pageStatus: async () => ({ platform: 'chatgpt', answers: 2, state: 'idle', lastSummary: '3 checked, 2 supported, 1 contradicted, 0 unverifiable' }),
    checkLatest: async () => (calls.push('check-latest'), { ok: true }),
    getSelection: async () => 'The Zentha Bridge opened in 1987.',
    verifyText: async (text) => ({
      status: 'ok',
      warnings: [],
      result: await runVerification({ answer: text, documents: [{ title: 'Zentha', url: 'https://example.org/z', text: 'The Zentha Bridge opened in 1991.' }], llm: new MockLLM() }),
    }),
    openOptions: () => void calls.push('options'),
    ...over,
  };
  return { a, calls };
}

async function mount(a: PopupApi) {
  document.body.innerHTML = '<span id="pill"></span><main id="app"></main>';
  await mountPopup(document.getElementById('app')!, document.getElementById('pill'), a);
}

describe('toolbar popup', () => {
  it('without consent: says it is off and links to the privacy notice', async () => {
    const { a, calls } = api({}, DEFAULT_SETTINGS);
    await mount(a);
    expect(document.getElementById('pill')!.textContent).toBe('Off');
    expect(document.body.textContent).toContain('Nothing has been sent anywhere');
    document.querySelector<HTMLButtonElement>('#review-consent')!.click();
    expect(calls).toEqual(['options']);
  });

  it('on ChatGPT: shows detected answers and the last result, and can re-check the latest answer', async () => {
    const { a, calls } = api();
    await mount(a);
    expect(document.querySelector('#answer-count')!.textContent).toBe('2 ChatGPT answers detected.');
    expect(document.body.textContent).toContain('Last check: 3 checked, 2 supported, 1 contradicted');
    expect(document.querySelector('#judge-warning')).not.toBeNull(); // default heuristic judge is flagged as limited
    document.querySelector<HTMLButtonElement>('#check-latest')!.click();
    await flush();
    expect(calls).toContain('check-latest');
  });

  it('when ChatGPT answers are not detected: suggests checking selected text', async () => {
    const { a } = api({ pageStatus: async () => ({ platform: 'chatgpt', answers: 0, state: 'idle' }) });
    await mount(a);
    expect(document.querySelector<HTMLButtonElement>('#check-latest')!.disabled).toBe(true);
    expect(document.body.textContent).toContain('Check selected text');
  });

  it('asks for a reload when the content script is missing', async () => {
    const { a } = api({ pageStatus: async () => undefined });
    await mount(a);
    expect(document.body.textContent).toContain('Reload the ChatGPT tab');
  });

  it('checks selected text on any site and shows verdicts with quotes, links and corrections', async () => {
    const { a } = api({ activeTab: async () => ({ id: 3, url: 'https://news.example.com/story' }) });
    await mount(a);
    expect(document.body.textContent).toContain('On any page, you can select text');
    document.querySelector<HTMLButtonElement>('#check-selection')!.click();
    await flush();
    await flush();
    const out = document.querySelector('#selection-output')!;
    expect(out.textContent).toContain('1 contradicted');
    expect(out.querySelector('.correction')!.textContent).toBe('Correction: The Zentha Bridge opened in 1991.');
    expect(out.querySelector('a')!.getAttribute('href')).toBe('https://example.org/z');
  });

  it('a local judge is not flagged as limited', async () => {
    const { a } = api({}, { ...consented, llm: { provider: 'local', model: 'qwen2.5:7b', apiKey: '', baseUrl: 'http://localhost:11434/v1' } });
    await mount(a);
    expect(document.querySelector('#judge-warning')).toBeNull();
    expect(document.body.textContent).toContain('qwen2.5:7b on http://localhost:11434/v1');
  });
});
