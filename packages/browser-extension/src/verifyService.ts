import {
  AnthropicProvider,
  BraveSearchEvidenceProvider,
  HeuristicLLM,
  OpenAIProvider,
  WikipediaEvidenceProvider,
  runVerification,
  type EvidenceProvider,
  type FetchLike,
  type LLMProvider,
} from '@hallucination-firewall/core';
import type { PlatformId } from './adapters/adapter.js';
import type { VerifyResponse } from './messages.js';
import { DEFAULT_MODELS, HOST_PERMISSIONS, hasValidConsent, type Settings } from './settings.js';

// One Wikipedia provider per fetch function, so its article cache survives across answers
// and the extension sends Wikimedia fewer requests.
const wikipediaProviders = new WeakMap<FetchLike, WikipediaEvidenceProvider>();
function wikipediaFor(fetch: FetchLike): WikipediaEvidenceProvider {
  let p = wikipediaProviders.get(fetch);
  if (!p) wikipediaProviders.set(fetch, (p = new WikipediaEvidenceProvider({ fetch })));
  return p;
}

export interface ServiceDeps {
  fetch: FetchLike;
  /** Whether the extension currently holds a host permission (chrome.permissions.contains). */
  hasPermission(origin: string): Promise<boolean>;
}

/**
 * The only place that decides whether conversation-derived text may leave the
 * browser. Without valid consent it returns before constructing any provider.
 */
export async function handleVerify(
  req: { platform: PlatformId; answer: string; question?: string },
  settings: Settings,
  deps: ServiceDeps,
): Promise<VerifyResponse> {
  if (!settings.platforms[req.platform]) return { status: 'disabled' };
  if (!hasValidConsent(settings)) return { status: 'consent-required' };

  const warnings: string[] = [];
  let llm: LLMProvider;
  const { provider, apiKey, model } = settings.llm;
  if (provider === 'heuristic') {
    llm = new HeuristicLLM();
  } else {
    if (!apiKey) return { status: 'error', message: `No ${provider} API key is set. Add one in the extension options.` };
    if (!(await deps.hasPermission(HOST_PERMISSIONS[provider]))) {
      return { status: 'error', message: `Permission to contact ${provider} has not been granted. Re-save the options page.` };
    }
    const m = model || DEFAULT_MODELS[provider];
    llm = provider === 'openai' ? new OpenAIProvider({ apiKey, model: m, fetch: deps.fetch }) : new AnthropicProvider({ apiKey, model: m, fetch: deps.fetch });
  }

  const providers: EvidenceProvider[] = [];
  if (settings.evidence.wikipedia) {
    if (await deps.hasPermission(HOST_PERMISSIONS.wikipedia)) providers.push(wikipediaFor(deps.fetch));
    else warnings.push('Wikipedia is enabled but its permission was not granted.');
  }
  if (settings.evidence.webSearch) {
    if (!settings.evidence.webSearchApiKey) warnings.push('Web search is enabled but no API key is set.');
    else if (!(await deps.hasPermission(HOST_PERMISSIONS.webSearch))) warnings.push('Web search is enabled but its permission was not granted.');
    else providers.push(new BraveSearchEvidenceProvider({ apiKey: settings.evidence.webSearchApiKey, fetch: deps.fetch }));
  }
  if (providers.length === 0) warnings.push('No evidence source is active, so every claim will be unverifiable.');

  try {
    const result = await runVerification({
      answer: req.answer,
      llm,
      providers,
      ...(req.question ? { question: req.question } : {}),
    });
    for (const e of result.errors) warnings.push(`${e.providerId}: ${e.message}`);
    return { status: 'ok', result, warnings: [...new Set(warnings)] };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Verification failed.' };
  }
}
