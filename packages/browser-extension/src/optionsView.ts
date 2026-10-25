import { WEB_SEARCH_ENGINES, trustedUrl, type WebSearchEngine } from '@socratica/core';
import type { TestJudgeResponse } from './messages.js';
import { DEFAULT_MODELS, HOST_PERMISSIONS, CONSENT_VERSION, WEB_KEY_FIELD, hasValidConsent, localOrigin, requiredOrigins, webSearchKey, type LLMChoice, type Settings } from './settings.js';
import { icon } from './ui/icons.js';

export interface OptionsApi {
  load(): Promise<Settings>;
  save(s: Settings): Promise<void>;
  /** Must be called from a user gesture (chrome.permissions.request). */
  requestPermissions(origins: string[]): Promise<boolean>;
  /** Sends one tiny request to the saved judge (background service worker). */
  testJudge?(): Promise<TestJudgeResponse>;
}

const h = <K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, props: Record<string, unknown> = {}, ...children: Array<Node | string>): HTMLElementTagNameMap[K] => {
  const node = Object.assign(doc.createElement(tag), props) as HTMLElementTagNameMap[K];
  node.append(...children);
  return node;
};

/** How each web search engine is described in settings. */
const ENGINE_COPY: Record<WebSearchEngine, { title: string; detail: string; keyLabel: string; keyLink: string }> = {
  socratica: {
    title: 'Socratica search (recommended)',
    detail: 'Google results through Socratica’s own search relay. Free, with no key or sign-up. If the relay is busy, checks carry on with DuckDuckGo answers, Wikipedia and Wikidata.',
    keyLabel: '',
    keyLink: '',
  },
  firecrawl: {
    title: 'Firecrawl',
    detail: 'Free, no key needed. Where Firecrawl’s free tier doesn’t search (VPNs, proxies, IPv6 and some school or office networks, or after its daily limit), checks carry on with DuckDuckGo answers, Wikipedia and Wikidata. An optional free Firecrawl key adds full web results there.',
    keyLabel: 'Firecrawl API key (optional)',
    keyLink: 'Optional: get a free Firecrawl key for full web results on any network',
  },
  serper: {
    title: 'Google results via Serper',
    detail: 'Google’s web results. Needs a free Serper key (2,500 searches, no card) from serper.dev.',
    keyLabel: 'Serper API key',
    keyLink: 'Get a free Serper key',
  },
  brave: {
    title: 'Brave Search',
    detail: 'Brave’s independent web index. Needs your Brave Search API key.',
    keyLabel: 'Brave Search API key',
    keyLink: 'Get a Brave Search API key',
  },
};

function card(doc: Document, id: string, title: string, ...children: Array<Node | string>): HTMLElement {
  return h(doc, 'section', { className: 'card', id }, h(doc, 'h2', {}, title), ...children);
}

/** Renders the options + consent page into `root`. Kept free of chrome.* so it can be tested. */
export async function mountOptions(root: HTMLElement, api: OptionsApi): Promise<void> {
  const doc = root.ownerDocument;
  let settings = await api.load();

  const render = () => {
    root.replaceChildren();
    root.removeAttribute('aria-busy');
    const consented = hasValidConsent(settings);
    const mark = h(doc, 'span', { className: 'mark' }, icon(doc, 'laurel', 44));
    root.append(
      h(
        doc,
        'header',
        { className: 'page-head' },
        mark,
        h(doc, 'p', { className: 'eyebrow' }, 'Settings'),
        h(doc, 'h1', {}, 'Socratica'),
        h(doc, 'p', { className: 'lede' }, 'Review Mode: after a ChatGPT answer finishes, its factual claims are checked against evidence from the web and annotated in place. It cannot stop an answer from being shown.'),
      ),
    );

    // ---- Consent (mandatory) ----
    const consent = h(doc, 'section', { className: `card consent${consented ? ' granted' : ''}`, id: 'consent' });
    consent.append(
      h(doc, 'h2', {}, consented ? 'Privacy notice — accepted' : 'Before anything is checked: privacy notice'),
      h(doc, 'p', {}, 'Nothing is sent anywhere until you accept this notice. When you accept, for each ChatGPT answer that is checked:'),
      h(
        doc,
        'ul',
        {},
        h(doc, 'li', {}, 'Short search queries built from individual claims are sent to the web search engine you choose. Web search is required, so every check uses it. The default, Socratica search, sends them to Socratica’s own relay (hosted on Vercel), which passes them to Google results via Serper. The relay keeps no record of them and uses your network address only to limit how many searches it runs. The alternatives are Firecrawl, and Google results via Serper or Brave Search with your own key.'),
        h(doc, 'li', {}, 'With Socratica search or keyless Firecrawl, DuckDuckGo also receives the name of what each claim is about, as a backup.'),
        h(doc, 'li', {}, 'The other sources you enable also receive claim-based queries: Wikipedia, Wikidata (entity names), Europe PMC, GOV.UK, World Bank (country, indicator and year requests) and Google Fact Check (your key).'),
        h(doc, 'li', {}, 'If you enable trusted URLs, their pages are fetched without cookies or credentials. Those sites receive the URL request, not your claim text. Only the HTTPS sites you enter are requested; redirects are refused.'),
        h(doc, 'li', {}, 'If you choose OpenAI or Anthropic as the judge, each claim, its surrounding sentence, your question, and the retrieved passages are sent to that provider using your own API key, under that provider’s terms.'),
        h(doc, 'li', {}, 'To send nothing at all, switch Socratica off from its toolbar popup. API keys are stored only in this browser (chrome.storage.local). There is no Socratica server, account, telemetry or analytics.'),
      ),
    );
    if (consented) {
      const withdraw = h(doc, 'button', { id: 'withdraw', type: 'button' }, 'Withdraw consent');
      withdraw.addEventListener('click', async () => {
        settings = { ...settings, consent: { granted: false, version: CONSENT_VERSION } };
        await api.save(settings);
        render();
      });
      consent.append(h(doc, 'p', { className: 'muted' }, `Accepted ${settings.consent.grantedAt ?? ''}`.trim()), withdraw);
    } else {
      const box = h(doc, 'input', { type: 'checkbox', id: 'consent-check' });
      const accept = h(doc, 'button', { id: 'accept', type: 'button', className: 'primary', disabled: true }, 'Accept and enable checking');
      box.addEventListener('change', () => (accept.disabled = !box.checked));
      accept.addEventListener('click', async () => {
        const granted = await api.requestPermissions(requiredOrigins(settings));
        settings = { ...settings, consent: { granted: true, version: CONSENT_VERSION, grantedAt: new Date().toISOString() } };
        await api.save(settings);
        render();
        if (!granted) status('Consent saved, but some site permissions were declined. Web search is required, so press Save and allow it.');
      });
      consent.append(h(doc, 'label', { className: 'inline' }, box, 'I have read this and agree to send claim text as described.'), accept);
    }
    root.append(consent);

    // ---- Settings ----
    const form = h(doc, 'fieldset', { id: 'settings' });

    // Web search: required, exactly one engine.
    const webKeys = { ...settings.evidence.web };
    let engine: WebSearchEngine = settings.evidence.web.engine;
    const webKey = h(doc, 'input', { type: 'password', id: 'web-key', autocomplete: 'off' });
    const webKeyLabel = h(doc, 'span', {});
    const webKeyLink = h(doc, 'a', { id: 'web-key-link', target: '_blank', rel: 'noopener noreferrer' });
    const webKeyRow = h(doc, 'label', { id: 'web-key-row' }, webKeyLabel, webKey);
    const webKeyHelp = h(doc, 'p', { className: 'muted hint' }, webKeyLink);
    const choices = h(doc, 'div', { className: 'choices' });
    choices.setAttribute('role', 'radiogroup');
    choices.setAttribute('aria-label', 'Web search engine');
    // Keep what was typed for the engine being left; Socratica search has no key.
    const keepKey = () => {
      const field = WEB_KEY_FIELD[engine];
      if (field) webKeys[field] = webKey.value.trim();
    };
    const syncWebKey = () => {
      const field = WEB_KEY_FIELD[engine];
      webKeyRow.hidden = webKeyHelp.hidden = !field;
      webKey.value = field ? webKeys[field] : '';
      webKey.placeholder = WEB_SEARCH_ENGINES[engine].keyRequired ? 'paste your key' : 'not needed on most networks';
      webKeyLabel.textContent = ENGINE_COPY[engine].keyLabel;
      webKeyLink.href = WEB_SEARCH_ENGINES[engine].signup;
      webKeyLink.textContent = ENGINE_COPY[engine].keyLink;
      for (const c of choices.querySelectorAll('.choice')) c.classList.toggle('selected', (c as HTMLElement).dataset.engine === engine);
    };
    for (const id of Object.keys(WEB_SEARCH_ENGINES) as WebSearchEngine[]) {
      const radio = h(doc, 'input', { type: 'radio', name: 'web-engine', id: `web-${id}`, value: id, checked: engine === id });
      radio.addEventListener('change', () => {
        keepKey();
        engine = id;
        syncWebKey();
      });
      const label = h(doc, 'label', { className: 'choice', htmlFor: `web-${id}` }, radio, h(doc, 'span', {}, h(doc, 'b', {}, ENGINE_COPY[id].title), h(doc, 'small', {}, ENGINE_COPY[id].detail)));
      label.dataset.engine = id;
      choices.append(label);
    }
    const webSection = card(
      doc,
      'web-search',
      'Web search',
      h(doc, 'p', { className: 'muted' }, 'Every check searches the web, so claims about the real world have something to be checked against. Pick one engine.'),
      choices,
      webKeyRow,
      webKeyHelp,
    );
    webSection.querySelector('h2')!.append(h(doc, 'span', { className: 'badge' }, 'Required'));
    syncWebKey();

    const llmSelect = h(doc, 'select', { id: 'llm-provider' });
    for (const [value, label] of [
      ['heuristic', 'Offline heuristic judge (no key, no model; names, numbers and wording)'],
      ['openai', 'OpenAI (your API key)'],
      ['anthropic', 'Anthropic (your API key)'],
      ['local', 'Local model: Ollama, LM Studio, llama.cpp… (runs on your computer)'],
    ] as const) llmSelect.append(h(doc, 'option', { value, selected: settings.llm.provider === value }, label));
    const model = h(doc, 'input', { type: 'text', id: 'llm-model', value: settings.llm.model, placeholder: 'default model' });
    const key = h(doc, 'input', { type: 'password', id: 'llm-key', value: settings.llm.apiKey, autocomplete: 'off', placeholder: 'paste your own key' });
    const baseUrl = h(doc, 'input', { type: 'text', id: 'llm-base-url', value: settings.llm.baseUrl, placeholder: 'http://localhost:11434/v1' });
    const baseUrlRow = h(doc, 'label', { id: 'llm-base-url-row' }, 'Server URL (OpenAI-compatible)', baseUrl);
    const hint = h(doc, 'p', { className: 'muted', id: 'llm-hint' });
    const HINTS: Record<LLMChoice, string> = {
      heuristic: 'No model and no extra network calls. It compares names, numbers and wording with the evidence, so paraphrased claims often stay "unverifiable". Pick a model for more thorough checks.',
      openai: 'Uses your OpenAI API key. Claims and retrieved passages are sent to OpenAI.',
      anthropic: 'Uses your Anthropic API key. Claims and retrieved passages are sent to Anthropic.',
      local:
        'Runs on your own computer; nothing goes to a model provider. Ollama: run `ollama pull qwen2.5:7b`, then start it with OLLAMA_ORIGINS="chrome-extension://*" ollama serve. LM Studio: load a model, start the server and turn on "Enable CORS". 7B-class models or larger recommended. Only localhost / 127.0.0.1 servers are allowed.',
    };
    const syncLlm = () => {
      const p = llmSelect.value as LLMChoice;
      model.disabled = p === 'heuristic';
      key.disabled = p === 'heuristic';
      key.placeholder = p === 'local' ? 'usually not needed' : 'paste your own key';
      baseUrlRow.hidden = p !== 'local';
      model.placeholder = p === 'heuristic' ? 'not used' : `default: ${DEFAULT_MODELS[p]}`;
      hint.textContent = HINTS[p];
    };
    llmSelect.addEventListener('change', syncLlm);
    syncLlm();
    const testBtn = h(doc, 'button', { id: 'test-judge', type: 'button' }, 'Test connection');
    const testOut = h(doc, 'span', { className: 'status muted', id: 'test-result' });
    testBtn.addEventListener('click', async () => {
      if (!api.testJudge) return;
      testOut.textContent = 'Testing… (uses the last saved settings)';
      const r = await api.testJudge();
      testOut.textContent = r.ok ? `Connected: ${r.judge} answered in ${r.ms} ms.` : `Could not connect to ${r.judge}: ${r.message}`;
    });
    const llm = card(
      doc,
      'judge',
      'Judge',
      h(doc, 'label', {}, 'Provider', llmSelect),
      hint,
      baseUrlRow,
      h(doc, 'label', {}, 'Model', model),
      h(doc, 'label', {}, 'API key', key),
      h(doc, 'div', { className: 'row' }, testBtn, testOut),
    );

    const wiki = h(doc, 'input', { type: 'checkbox', id: 'ev-wikipedia', checked: settings.evidence.wikipedia });
    const wikidata = h(doc, 'input', { type: 'checkbox', id: 'ev-wikidata', checked: settings.evidence.wikidata });
    const europePmc = h(doc, 'input', { type: 'checkbox', id: 'ev-europe-pmc', checked: settings.evidence.europePmc });
    const worldBank = h(doc, 'input', { type: 'checkbox', id: 'ev-world-bank', checked: settings.evidence.worldBank });
    const govUk = h(doc, 'input', { type: 'checkbox', id: 'ev-gov-uk', checked: settings.evidence.govUk });
    const factCheck = h(doc, 'input', { type: 'checkbox', id: 'ev-fact-check', checked: settings.evidence.googleFactCheck });
    const factCheckKey = h(doc, 'input', { type: 'password', id: 'ev-fact-check-key', value: settings.evidence.googleFactCheckApiKey, autocomplete: 'off', placeholder: 'Google Fact Check API key' });
    const urls = h(doc, 'input', { type: 'checkbox', id: 'ev-urls', checked: settings.evidence.urls });
    const trustedUrls = h(doc, 'textarea', { id: 'ev-trusted-urls', value: settings.evidence.trustedUrls.join('\n'), rows: 4, placeholder: 'https://trusted-site.org/article\nOne public HTTPS URL per line (up to 10)' });
    const evidence = card(
      doc,
      'sources',
      'More evidence sources',
      h(doc, 'p', { className: 'muted' }, 'Optional, alongside web search. The key-free sources add encyclopedic and specialist coverage; trusted URLs check against a specific primary source. Missing evidence always stays unverifiable.'),
      h(doc, 'label', { className: 'inline' }, wiki, `Wikipedia (${HOST_PERMISSIONS.wikipedia.replace('/*', '')})`),
      h(doc, 'label', { className: 'inline' }, wikidata, 'Wikidata — structured dates, numbers, people and places (no key)'),
      h(doc, 'label', { className: 'inline' }, europePmc, 'Europe PMC — biomedical abstracts (no key)'),
      h(doc, 'label', { className: 'inline' }, worldBank, 'World Bank — country statistics with dates and units (no key; choose a model to interpret values)'),
      h(doc, 'label', { className: 'inline' }, govUk, 'GOV.UK — official UK government guidance (no key)'),
      h(doc, 'label', { className: 'inline' }, factCheck, 'Google Fact Check — publisher reviews (your key; choose a model to interpret ratings)'),
      factCheckKey,
      h(doc, 'label', { className: 'inline' }, urls, 'Trusted URLs — check against pages you choose'),
      h(doc, 'label', {}, 'Source URLs (one per line)', trustedUrls),
      h(doc, 'p', { className: 'muted' }, 'Wikidata can share Wikimedia rate limits. No source guarantees coverage; failures stay visible and the other sources continue.'),
    );

    const chatgpt = h(doc, 'input', { type: 'checkbox', id: 'platform-chatgpt', checked: settings.platforms.chatgpt });
    const auto = h(doc, 'input', { type: 'checkbox', id: 'auto-check', checked: settings.autoCheck });
    const general = card(
      doc,
      'general',
      'Platforms and behaviour',
      h(doc, 'label', { className: 'inline' }, chatgpt, 'ChatGPT (chatgpt.com)'),
      h(doc, 'label', { className: 'inline' }, h(doc, 'input', { type: 'checkbox', disabled: true }), 'Claude — not supported yet'),
      h(doc, 'label', { className: 'inline' }, h(doc, 'input', { type: 'checkbox', disabled: true }), 'Gemini — not supported yet'),
      h(doc, 'label', { className: 'inline' }, auto, 'Automatically check each answer when it finishes (otherwise click “Check this answer”).'),
    );

    const save = h(doc, 'button', { id: 'save', type: 'button', className: 'primary' }, 'Save');
    const statusEl = h(doc, 'span', { className: 'status muted', id: 'status' });
    statusEl.setAttribute('role', 'status');
    form.append(webSection, llm, evidence, general, h(doc, 'div', { className: 'actions' }, save, statusEl));
    root.append(form);

    save.addEventListener('click', async () => {
      keepKey();
      const next: Settings = {
        ...settings,
        platforms: { ...settings.platforms, chatgpt: chatgpt.checked },
        autoCheck: auto.checked,
        llm: { provider: llmSelect.value as LLMChoice, model: model.value.trim(), apiKey: key.value.trim(), baseUrl: baseUrl.value.trim() || 'http://localhost:11434/v1' },
        evidence: {
          wikipedia: wiki.checked, wikidata: wikidata.checked, europePmc: europePmc.checked, worldBank: worldBank.checked, govUk: govUk.checked,
          googleFactCheck: factCheck.checked, googleFactCheckApiKey: factCheckKey.value.trim(),
          urls: urls.checked, trustedUrls: trustedUrls.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
          web: { ...webKeys, engine },
        },
      };
      // Web search is required, so an engine that can't run is not saved.
      if (WEB_SEARCH_ENGINES[engine].keyRequired && !webSearchKey(next)) {
        status(`${ENGINE_COPY[engine].title} needs an API key (free sign-up at ${WEB_SEARCH_ENGINES[engine].signup}). Or choose Socratica search, which needs none.`);
        webKey.focus();
        return;
      }
      if (next.evidence.urls) {
        try {
          if (!next.evidence.trustedUrls.length || next.evidence.trustedUrls.length > 10) throw new Error('Enter between 1 and 10 trusted URLs.');
          next.evidence.trustedUrls = [...new Set(next.evidence.trustedUrls.map((url) => trustedUrl(url).url))];
        } catch (err) { status(err instanceof Error ? err.message : 'Invalid trusted URL.'); return; }
      }
      if (next.llm.provider === 'local') {
        const origin = localOrigin(next.llm.baseUrl);
        if (!origin || !/^http:\/\/(localhost|127\.0\.0\.1)\/\*$/.test(origin)) {
          status('The local server URL must be on localhost or 127.0.0.1, e.g. http://localhost:11434/v1');
          return;
        }
      }
      // Only ask for site access once the user has consented to sending data at all.
      const granted = hasValidConsent(next) ? await api.requestPermissions(requiredOrigins(next)) : true;
      settings = next;
      await api.save(settings);
      status(granted ? 'Saved.' : 'Saved, but some site permissions were declined. Web search is required, so checks will stop until it is allowed.');
    });
  };

  const status = (text: string) => {
    const s = root.querySelector('#status');
    if (s) s.textContent = text;
  };

  render();
}
