import { trustedUrl } from '@hallucination-firewall/core';
import type { PlatformId } from './adapters/adapter.js';

/** Bump when the consent text changes materially; users must consent again. */
export const CONSENT_VERSION = 2;

export type LLMChoice = 'heuristic' | 'openai' | 'anthropic' | 'local';

/** Topic-specific starting points; the original institution is cited, not a search engine. */
export const TRUSTED_SOURCE_PRESETS = [
  { id: 'general', label: 'All topics — general web, check original sources', domains: [] },
  { id: 'space', label: 'Space — NASA and ESA', domains: ['nasa.gov', 'esa.int'] },
  { id: 'health', label: 'Health — WHO, NIH and CDC', domains: ['who.int', 'nih.gov', 'cdc.gov'] },
  { id: 'earth', label: 'Earth and climate — NOAA and USGS', domains: ['noaa.gov', 'usgs.gov'] },
  { id: 'statistics', label: 'Statistics — World Bank, OECD and European Commission', domains: ['worldbank.org', 'oecd.org', 'ec.europa.eu'] },
] as const;

export interface Settings {
  consent: { granted: boolean; version: number; grantedAt?: string };
  /** Master switch in the popup header. Off: nothing is read, highlighted or sent anywhere. */
  enabled: boolean;
  platforms: Record<PlatformId, boolean>;
  autoCheck: boolean;
  /** `baseUrl` is only used by `local` (an OpenAI-compatible server such as Ollama or LM Studio). */
  llm: { provider: LLMChoice; model: string; apiKey: string; baseUrl: string };
  evidence: {
    wikipedia: boolean; wikidata: boolean; europePmc: boolean; worldBank: boolean; govUk: boolean;
    googleFactCheck: boolean; googleFactCheckApiKey: string;
    tavily: boolean; tavilyApiKey: string; tavilyDomains: string[];
    urls: boolean; trustedUrls: string[];
    webSearch: boolean; webSearchApiKey: string;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  consent: { granted: false, version: CONSENT_VERSION },
  enabled: true,
  platforms: { chatgpt: true, claude: false, gemini: false },
  autoCheck: true,
  llm: { provider: 'heuristic', model: '', apiKey: '', baseUrl: 'http://localhost:11434/v1' },
  evidence: {
    wikipedia: true, wikidata: true, europePmc: true, worldBank: false, govUk: false,
    googleFactCheck: false, googleFactCheckApiKey: '', tavily: false, tavilyApiKey: '',
    tavilyDomains: [],
    urls: false, trustedUrls: [], webSearch: false, webSearchApiKey: '',
  },
};

export const DEFAULT_MODELS: Record<Exclude<LLMChoice, 'heuristic'>, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-opus-5-5',
  local: 'qwen2.5:7b',
};

/** Host permission each network-using component needs (requested at runtime, never at install). */
export const HOST_PERMISSIONS = {
  wikipedia: 'https://en.wikipedia.org/*',
  wikidata: 'https://www.wikidata.org/*',
  europePmc: 'https://www.ebi.ac.uk/*',
  worldBank: 'https://api.worldbank.org/*',
  govUk: 'https://www.gov.uk/*',
  googleFactCheck: 'https://factchecktools.googleapis.com/*',
  tavily: 'https://api.tavily.com/*',
  openai: 'https://api.openai.com/*',
  anthropic: 'https://api.anthropic.com/*',
  webSearch: 'https://api.search.brave.com/*',
} as const;

/** Host-permission pattern for a local OpenAI-compatible server, e.g. http://localhost:11434/v1 -> http://localhost/* */
export function localOrigin(baseUrl: string): string | undefined {
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return undefined;
  }
}

export function hasValidConsent(s: Settings): boolean {
  return s.consent.granted && s.consent.version === CONSENT_VERSION;
}

/** Origins the current settings would contact. Empty means fully offline. */
export function requiredOrigins(s: Settings): string[] {
  const out: string[] = [];
  if (s.evidence.wikipedia) out.push(HOST_PERMISSIONS.wikipedia);
  for (const source of ['wikidata', 'europePmc', 'worldBank', 'govUk', 'googleFactCheck', 'tavily'] as const) {
    if (s.evidence[source]) out.push(HOST_PERMISSIONS[source]);
  }
  if (s.evidence.urls) for (const url of s.evidence.trustedUrls) out.push(trustedUrl(url).origin);
  if (s.evidence.webSearch) out.push(HOST_PERMISSIONS.webSearch);
  if (s.llm.provider === 'openai') out.push(HOST_PERMISSIONS.openai);
  if (s.llm.provider === 'anthropic') out.push(HOST_PERMISSIONS.anthropic);
  if (s.llm.provider === 'local') {
    const origin = localOrigin(s.llm.baseUrl);
    if (origin) out.push(origin);
  }
  return [...new Set(out)];
}

const KEY = 'hf-settings';

function merge(stored: Partial<Settings> | undefined): Settings {
  const s = stored ?? {};
  return {
    consent: { ...DEFAULT_SETTINGS.consent, ...s.consent },
    enabled: s.enabled ?? DEFAULT_SETTINGS.enabled,
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
