import type { PlatformId } from './adapters/adapter.js';

/** Bump when the consent text changes materially; users must consent again. */
export const CONSENT_VERSION = 1;

export type LLMChoice = 'heuristic' | 'openai' | 'anthropic';

export interface Settings {
  consent: { granted: boolean; version: number; grantedAt?: string };
  platforms: Record<PlatformId, boolean>;
  autoCheck: boolean;
  llm: { provider: LLMChoice; model: string; apiKey: string };
  evidence: { wikipedia: boolean; webSearch: boolean; webSearchApiKey: string };
}

export const DEFAULT_SETTINGS: Settings = {
  consent: { granted: false, version: CONSENT_VERSION },
  platforms: { chatgpt: true, claude: false, gemini: false },
  autoCheck: true,
  llm: { provider: 'heuristic', model: '', apiKey: '' },
  evidence: { wikipedia: true, webSearch: false, webSearchApiKey: '' },
};

export const DEFAULT_MODELS: Record<Exclude<LLMChoice, 'heuristic'>, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-opus-5-5',
};

/** Host permission each network-using component needs (requested at runtime, never at install). */
export const HOST_PERMISSIONS = {
  wikipedia: 'https://en.wikipedia.org/*',
  openai: 'https://api.openai.com/*',
  anthropic: 'https://api.anthropic.com/*',
  webSearch: 'https://api.search.brave.com/*',
} as const;

export function hasValidConsent(s: Settings): boolean {
  return s.consent.granted && s.consent.version === CONSENT_VERSION;
}

/** Origins the current settings would contact. Empty means fully offline. */
export function requiredOrigins(s: Settings): string[] {
  const out: string[] = [];
  if (s.evidence.wikipedia) out.push(HOST_PERMISSIONS.wikipedia);
  if (s.evidence.webSearch) out.push(HOST_PERMISSIONS.webSearch);
  if (s.llm.provider === 'openai') out.push(HOST_PERMISSIONS.openai);
  if (s.llm.provider === 'anthropic') out.push(HOST_PERMISSIONS.anthropic);
  return out;
}

const KEY = 'hf-settings';

function merge(stored: Partial<Settings> | undefined): Settings {
  const s = stored ?? {};
  return {
    consent: { ...DEFAULT_SETTINGS.consent, ...s.consent },
    platforms: { ...DEFAULT_SETTINGS.platforms, ...s.platforms },
    autoCheck: s.autoCheck ?? DEFAULT_SETTINGS.autoCheck,
    llm: { ...DEFAULT_SETTINGS.llm, ...s.llm },
    evidence: { ...DEFAULT_SETTINGS.evidence, ...s.evidence },
  };
}

/** Settings (including the user's API keys) live only in chrome.storage.local, never sync. */
export async function loadSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get(KEY);
  return merge(raw[KEY] as Partial<Settings> | undefined);
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: s });
}
