import { trustedUrl, type WebSearchEngine } from '@socratica/core';
import type { PlatformId } from './adapters/adapter.js';

/** Bump when the consent text changes materially; users must consent again. */
export const CONSENT_VERSION = 5;

export type LLMChoice = 'heuristic' | 'openai' | 'anthropic' | 'local';

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
    urls: boolean; trustedUrls: string[];
    /** Web search is required: every check uses the chosen engine. Socratica search and Firecrawl need no key (DuckDuckGo backs them up). */
    web: { engine: WebSearchEngine; firecrawlApiKey: string; serperApiKey: string; braveApiKey: string };
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
    googleFactCheck: false, googleFactCheckApiKey: '',
    urls: false, trustedUrls: [],
    web: { engine: 'socratica', firecrawlApiKey: '', serperApiKey: '', braveApiKey: '' },
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
  openai: 'https://api.openai.com/*',
  anthropic: 'https://api.anthropic.com/*',
  firecrawl: 'https://api.firecrawl.dev/*',
  serper: 'https://google.serper.dev/*',
  brave: 'https://api.search.brave.com/*',
  duckduckgo: 'https://api.duckduckgo.com/*',
  socratica: 'https://socratica-search.vercel.app/*',
} as const;

/** The key field for each web search engine: none for Socratica search, optional for Firecrawl. */
export const WEB_KEY_FIELD: Record<WebSearchEngine, 'firecrawlApiKey' | 'serperApiKey' | 'braveApiKey' | undefined> = {
  socratica: undefined, firecrawl: 'firecrawlApiKey', serper: 'serperApiKey', brave: 'braveApiKey',
};

/** The key saved for the chosen engine ('' when it has none). */
export function webSearchKey(s: Settings): string {
  const field = WEB_KEY_FIELD[s.evidence.web.engine];
  return field ? s.evidence.web[field].trim() : '';
}

/**
 * The keyless engines are backed up by DuckDuckGo's keyless answers: Socratica search can be busy or
 * out of credits, and Firecrawl's free tier turns some networks away (VPNs, proxies, IPv6) and has a
 * daily cap. Nobody has to add a key.
 */
export function usesKeylessBackup(s: Settings): boolean {
  const { engine, firecrawlApiKey } = s.evidence.web;
  return engine === 'socratica' || (engine === 'firecrawl' && !firecrawlApiKey.trim());
}

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

/** Origins the current settings would contact. Always includes the web search engine. */
export function requiredOrigins(s: Settings): string[] {
  const out: string[] = [HOST_PERMISSIONS[s.evidence.web.engine]];
  if (usesKeylessBackup(s)) out.push(HOST_PERMISSIONS.duckduckgo);
  if (s.evidence.wikipedia) out.push(HOST_PERMISSIONS.wikipedia);
  for (const source of ['wikidata', 'europePmc', 'worldBank', 'govUk', 'googleFactCheck'] as const) {
    if (s.evidence[source]) out.push(HOST_PERMISSIONS[source]);
  }
  if (s.evidence.urls) for (const url of s.evidence.trustedUrls) out.push(trustedUrl(url).origin);
  if (s.llm.provider === 'openai') out.push(HOST_PERMISSIONS.openai);
  if (s.llm.provider === 'anthropic') out.push(HOST_PERMISSIONS.anthropic);
  if (s.llm.provider === 'local') {
    const origin = localOrigin(s.llm.baseUrl);
    if (origin) out.push(origin);
  }
  return [...new Set(out)];
}

const KEY = 'socratica-settings';
/** Where settings were stored before the rename to Socratica; read once, then replaced on save. */
const LEGACY_KEY = 'hf-settings';

function merge(stored: Partial<Settings> | undefined): Settings {
  const s = stored ?? {};
  const evidence = mergeEvidence(s.evidence);
  // Before 0.3 keyless Firecrawl was the default; those settings move to Socratica search, which replaced it.
  if ((s.consent?.version ?? 0) < 5 && evidence.web.engine === 'firecrawl' && !evidence.web.firecrawlApiKey.trim()) {
    evidence.web = { ...evidence.web, engine: 'socratica' };
  }
  return {
    consent: { ...DEFAULT_SETTINGS.consent, ...s.consent },
    enabled: s.enabled ?? DEFAULT_SETTINGS.enabled,
    platforms: { ...DEFAULT_SETTINGS.platforms, ...s.platforms },
    autoCheck: s.autoCheck ?? DEFAULT_SETTINGS.autoCheck,
    llm: { ...DEFAULT_SETTINGS.llm, ...s.llm },
    evidence,
  };
}

/** Settings saved before 0.2 had an optional Brave toggle and a Tavily source instead of a required engine. */
type LegacyEvidence = Partial<Settings['evidence']> & { webSearch?: boolean; webSearchApiKey?: string };

function mergeEvidence(stored: LegacyEvidence | undefined): Settings['evidence'] {
  const d = DEFAULT_SETTINGS.evidence;
  const e = stored ?? {};
  const legacyBraveKey = e.webSearch && e.webSearchApiKey ? e.webSearchApiKey : '';
  const web = e.web ?? { ...d.web, ...(legacyBraveKey ? { engine: 'brave' as const, braveApiKey: legacyBraveKey } : {}) };
  return {
    wikipedia: e.wikipedia ?? d.wikipedia, wikidata: e.wikidata ?? d.wikidata, europePmc: e.europePmc ?? d.europePmc,
    worldBank: e.worldBank ?? d.worldBank, govUk: e.govUk ?? d.govUk,
    googleFactCheck: e.googleFactCheck ?? d.googleFactCheck, googleFactCheckApiKey: e.googleFactCheckApiKey ?? d.googleFactCheckApiKey,
    urls: e.urls ?? d.urls, trustedUrls: e.trustedUrls ?? d.trustedUrls,
    web: { ...d.web, ...web },
  };
}

/** Settings (including the user's API keys) live only in chrome.storage.local, never sync. */
export async function loadSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get([KEY, LEGACY_KEY]);
  return merge((raw[KEY] ?? raw[LEGACY_KEY]) as Partial<Settings> | undefined);
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: s });
  await chrome.storage.local.remove(LEGACY_KEY);
}
