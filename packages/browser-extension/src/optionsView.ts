import type { TestJudgeResponse } from './messages.js';
import { DEFAULT_MODELS, HOST_PERMISSIONS, CONSENT_VERSION, hasValidConsent, localOrigin, requiredOrigins, type LLMChoice, type Settings } from './settings.js';

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

/** Renders the options + consent page into `root`. Kept free of chrome.* so it can be tested. */
export async function mountOptions(root: HTMLElement, api: OptionsApi): Promise<void> {
  const doc = root.ownerDocument;
  let settings = await api.load();

  const render = () => {
    root.replaceChildren();
    const consented = hasValidConsent(settings);
    root.append(
      h(doc, 'h1', {}, 'Hallucination Firewall'),
      h(doc, 'p', { className: 'muted' }, 'Review Mode: after a ChatGPT answer finishes, its factual claims are checked against retrieved evidence and annotated in place. It cannot stop an answer from being shown.'),
    );

    // ---- Consent (mandatory) ----
    const consent = h(doc, 'section', { className: `consent${consented ? ' granted' : ''}`, id: 'consent' });
    consent.append(
      h(doc, 'h2', {}, consented ? 'Privacy notice — accepted' : 'Before anything is checked: privacy notice'),
      h(doc, 'p', {}, 'Nothing is sent anywhere until you accept this notice. When you accept, for each ChatGPT answer that is checked:'),
      h(
        doc,
        'ul',
        {},
        h(doc, 'li', {}, 'Short search queries built from the answer’s individual claims are sent to the evidence sources you enable (Wikipedia, and optionally Brave Search with your own key).'),
        h(doc, 'li', {}, 'If you choose OpenAI or Anthropic as the judge, each claim, its surrounding sentence, your question, and the retrieved passages are sent to that provider using your own API key, under that provider’s terms.'),
        h(doc, 'li', {}, 'With the offline judge and no evidence sources enabled, nothing leaves your browser (but every claim will be unverifiable).'),
        h(doc, 'li', {}, 'API keys are stored only in this browser (chrome.storage.local). There is no Hallucination Firewall server, account, telemetry or analytics.'),
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
        if (!granted) status('Consent saved, but some site permissions were declined; those sources will be skipped.');
      });
      consent.append(h(doc, 'label', { className: 'inline' }, box, 'I have read this and agree to send claim text as described.'), accept);
    }
    root.append(consent);

    // ---- Settings ----
    const form = h(doc, 'fieldset', { id: 'settings' });
    const platforms = h(doc, 'section', {}, h(doc, 'h2', {}, 'Platforms'));
    const chatgpt = h(doc, 'input', { type: 'checkbox', id: 'platform-chatgpt', checked: settings.platforms.chatgpt });
    platforms.append(
      h(doc, 'label', { className: 'inline' }, chatgpt, 'ChatGPT (chatgpt.com)'),
      h(doc, 'label', { className: 'inline' }, h(doc, 'input', { type: 'checkbox', disabled: true }), 'Claude — not supported yet'),
      h(doc, 'label', { className: 'inline' }, h(doc, 'input', { type: 'checkbox', disabled: true }), 'Gemini — not supported yet'),
    );
    const auto = h(doc, 'input', { type: 'checkbox', id: 'auto-check', checked: settings.autoCheck });
    const behaviour = h(doc, 'section', {}, h(doc, 'h2', {}, 'Behaviour'), h(doc, 'label', { className: 'inline' }, auto, 'Automatically check each answer when it finishes (otherwise click “Check this answer”).'));

    const llmSelect = h(doc, 'select', { id: 'llm-provider' });
    for (const [value, label] of [
      ['heuristic', 'Offline heuristic judge (no key, no network; simple sentences only)'],
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
      heuristic: 'No model, no network. It only recognises very literal matches, so most real answers come out "unverifiable". Pick a model for real checks.',
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
      testOut.textContent = r.ok ? `✔ ${r.judge} answered in ${r.ms} ms.` : `✘ ${r.judge}: ${r.message}`;
    });
    const llm = h(
      doc,
      'section',
      {},
      h(doc, 'h2', {}, 'Judge (LLM)'),
      h(doc, 'label', {}, 'Provider', llmSelect),
      hint,
      baseUrlRow,
      h(doc, 'label', {}, 'Model', model),
      h(doc, 'label', {}, 'API key', key),
      h(doc, 'div', {}, testBtn, testOut),
    );

    const wiki = h(doc, 'input', { type: 'checkbox', id: 'ev-wikipedia', checked: settings.evidence.wikipedia });
    const web = h(doc, 'input', { type: 'checkbox', id: 'ev-web', checked: settings.evidence.webSearch });
    const webKey = h(doc, 'input', { type: 'password', id: 'ev-web-key', value: settings.evidence.webSearchApiKey, autocomplete: 'off', placeholder: 'Brave Search API key' });
    const evidence = h(
      doc,
      'section',
      {},
      h(doc, 'h2', {}, 'Evidence sources'),
      h(doc, 'label', { className: 'inline' }, wiki, `Wikipedia (${HOST_PERMISSIONS.wikipedia.replace('/*', '')})`),
      h(doc, 'label', { className: 'inline' }, web, 'Web search via Brave Search API (your key)'),
      webKey,
    );

    const save = h(doc, 'button', { id: 'save', type: 'button', className: 'primary' }, 'Save');
    const statusEl = h(doc, 'span', { className: 'status muted', id: 'status' });
    form.append(platforms, behaviour, llm, evidence, h(doc, 'div', {}, save, statusEl));
    root.append(form);

    save.addEventListener('click', async () => {
      const next: Settings = {
        ...settings,
        platforms: { ...settings.platforms, chatgpt: chatgpt.checked },
        autoCheck: auto.checked,
        llm: { provider: llmSelect.value as LLMChoice, model: model.value.trim(), apiKey: key.value.trim(), baseUrl: baseUrl.value.trim() || 'http://localhost:11434/v1' },
        evidence: { wikipedia: wiki.checked, webSearch: web.checked, webSearchApiKey: webKey.value.trim() },
      };
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
      status(granted ? 'Saved.' : 'Saved, but some site permissions were declined; those sources will be skipped.');
    });
  };

  const status = (text: string) => {
    const s = root.querySelector('#status');
    if (s) s.textContent = text;
  };

  render();
}
