import { describe, expect, it } from 'vitest';
import { mountOptions, type OptionsApi } from '../optionsView.js';
import { DEFAULT_SETTINGS, hasValidConsent, type Settings } from '../settings.js';

function api(initial: Settings = DEFAULT_SETTINGS) {
  const state = { settings: structuredClone(initial), requested: [] as string[][] };
  const a: OptionsApi = {
    load: async () => structuredClone(state.settings),
    save: async (s) => void (state.settings = structuredClone(s)),
    requestPermissions: async (o) => (state.requested.push(o), true),
  };
  return { state, a };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('options page', () => {
  it('starts without consent and cannot accept until the box is ticked', async () => {
    const { state, a } = api();
    document.body.innerHTML = '<main id="app"></main>';
    await mountOptions(document.getElementById('app')!, a);
    const accept = document.querySelector<HTMLButtonElement>('#accept')!;
    expect(accept.disabled).toBe(true);
    expect(hasValidConsent(state.settings)).toBe(false);

    const box = document.querySelector<HTMLInputElement>('#consent-check')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(accept.disabled).toBe(false);
    accept.click();
    await flush();
    expect(hasValidConsent(state.settings)).toBe(true);
    expect(state.requested[0]).toEqual(['https://en.wikipedia.org/*']);
    expect(document.querySelector('#withdraw')).not.toBeNull();
  });

  it('does not request site permissions when saving without consent', async () => {
    const { state, a } = api();
    document.body.innerHTML = '<main id="app"></main>';
    await mountOptions(document.getElementById('app')!, a);
    document.querySelector<HTMLSelectElement>('#llm-provider')!.value = 'openai';
    document.querySelector<HTMLInputElement>('#llm-key')!.value = 'placeholder-key';
    document.querySelector<HTMLButtonElement>('#save')!.click();
    await flush();
    expect(state.requested).toEqual([]);
    expect(state.settings.llm).toEqual({ provider: 'openai', model: '', apiKey: 'placeholder-key', baseUrl: 'http://localhost:11434/v1' });
  });

  it('local judge: requests localhost permission on save and rejects non-local URLs', async () => {
    const { state, a } = api({ ...DEFAULT_SETTINGS, consent: { granted: true, version: 1 } });
    document.body.innerHTML = '<main id="app"></main>';
    await mountOptions(document.getElementById('app')!, a);
    const select = document.querySelector<HTMLSelectElement>('#llm-provider')!;
    select.value = 'local';
    select.dispatchEvent(new Event('change'));
    expect(document.querySelector<HTMLElement>('#llm-base-url-row')!.hidden).toBe(false);
    expect(document.querySelector('#llm-hint')!.textContent).toContain('OLLAMA_ORIGINS');

    document.querySelector<HTMLInputElement>('#llm-base-url')!.value = 'http://192.168.1.5:11434/v1';
    document.querySelector<HTMLButtonElement>('#save')!.click();
    await flush();
    expect(document.querySelector('#status')!.textContent).toMatch(/localhost/);
    expect(state.settings.llm.provider).toBe('heuristic'); // not saved

    document.querySelector<HTMLInputElement>('#llm-base-url')!.value = 'http://localhost:11434/v1';
    document.querySelector<HTMLInputElement>('#llm-model')!.value = 'qwen2.5:7b';
    document.querySelector<HTMLButtonElement>('#save')!.click();
    await flush();
    expect(state.settings.llm).toMatchObject({ provider: 'local', model: 'qwen2.5:7b', baseUrl: 'http://localhost:11434/v1' });
    expect(state.requested.at(-1)).toContain('http://localhost/*');
  });

  it('withdrawing consent turns checking off again', async () => {
    const { state, a } = api({ ...DEFAULT_SETTINGS, consent: { granted: true, version: 1 } });
    document.body.innerHTML = '<main id="app"></main>';
    await mountOptions(document.getElementById('app')!, a);
    document.querySelector<HTMLButtonElement>('#withdraw')!.click();
    await flush();
    expect(hasValidConsent(state.settings)).toBe(false);
  });
});
