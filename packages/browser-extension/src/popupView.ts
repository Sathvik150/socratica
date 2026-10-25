import { WEB_SEARCH_ENGINES, type ClaimVerdict } from '@socratica/core';
import type { PageStatus, VerifyResponse } from './messages.js';
import { DEFAULT_MODELS, WEB_KEY_FIELD, hasValidConsent, type Settings } from './settings.js';
import { friendlyWarning, icon, type IconName } from './ui/theme.js';

/** Everything the popup needs from the browser, injected so the view can be tested without chrome.*. */
export interface PopupApi {
  getSettings(): Promise<Settings>;
  activeTab(): Promise<{ id?: number; url?: string } | undefined>;
  /** Undefined when no content script answers (not chatgpt.com, or the page was open before install). */
  pageStatus(tabId: number): Promise<PageStatus | undefined>;
  checkLatest(tabId: number): Promise<{ ok: boolean; message?: string }>;
  getSelection(tabId: number): Promise<string>;
  verifyText(text: string): Promise<VerifyResponse>;
  /** The master on/off switch (saved to settings; open ChatGPT tabs react immediately). */
  setEnabled(on: boolean): Promise<void>;
  openOptions(): void;
}

type Verdict = ClaimVerdict['verdict'];
const LABEL: Record<Verdict, string> = { supported: 'Supported', contradicted: 'Contradicted', unverifiable: 'Unverifiable' };
const MEANING: Record<Verdict, string> = {
  supported: 'A source states this claim.',
  contradicted: 'A source states something different.',
  unverifiable: 'Not enough evidence to confirm or refute it.',
};
const VERDICT_ICON: Record<Verdict, IconName> = { supported: 'check', contradicted: 'cross', unverifiable: 'question' };
const TABS = [['verify', 'Verify'], ['sources', 'Sources'], ['insights', 'Insights']] as const;
type Tab = (typeof TABS)[number][0];

function h<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, props: Record<string, unknown> = {}, ...children: Array<Node | string>): HTMLElementTagNameMap[K] {
  const node = Object.assign(doc.createElement(tag), props) as HTMLElementTagNameMap[K];
  node.append(...children);
  return node;
}

function judgeLabel(s: Settings): { text: string; limited: boolean } {
  const p = s.llm.provider;
  if (p === 'heuristic') return { text: 'Offline heuristic (matches names, numbers and wording; misses paraphrases)', limited: true };
  const model = s.llm.model || DEFAULT_MODELS[p];
  return { text: p === 'local' ? `${model} on ${s.llm.baseUrl}` : `${model} (${p})`, limited: false };
}

function isChatGpt(url: string | undefined): boolean {
  try {
    const host = new URL(url ?? '').hostname;
    return host === 'chatgpt.com' || host.endsWith('.chatgpt.com');
  } catch {
    return false;
  }
}

function safeHref(url: string | undefined): string | undefined {
  try {
    const u = new URL(url ?? '');
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

function hostOf(url: string | undefined): string {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}

/** Reference works and public institutions get a columns icon; everything else a page. */
export function sourceIcon(providerId: string): IconName {
  return ['wikipedia', 'wikidata', 'europe-pmc', 'world-bank', 'gov-uk'].includes(providerId) ? 'columns' : 'document';
}

/** A titled card, as used across the popup. */
function card(doc: Document, title: string | undefined, props: Record<string, unknown> = {}, ...children: Array<Node | string>): HTMLElement {
  return h(doc, 'section', { className: 'card', ...props }, ...(title ? [h(doc, 'h2', {}, title)] : []), ...children);
}

/** Placeholder with the shape of a result (chip row, then claim cards) while a check runs. */
export function resultSkeleton(doc: Document): HTMLElement {
  const box = h(doc, 'div', { id: 'result-skeleton' });
  box.setAttribute('role', 'status');
  box.setAttribute('aria-label', 'Checking the selected text…');
  box.setAttribute('aria-busy', 'true');
  const row = h(doc, 'div', { className: 'row' });
  for (let i = 0; i < 4; i++) row.append(h(doc, 'span', { className: 'sk-chip' }));
  box.append(row);
  for (const widths of [['w-11/12', 'w-3/5'], ['w-4/5', 'w-1/2']]) {
    box.append(h(doc, 'div', { className: 'sk-card' }, ...widths.map((w) => h(doc, 'span', { className: `sk-line ${w}` }))));
  }
  return box;
}

/** The verdict heading used in results: a coloured seal, the verdict, and what it means. */
export function verdictHead(doc: Document, verdict: Verdict): HTMLElement {
  const seal = h(doc, 'span', { className: `seal ${verdict}` }, icon(doc, VERDICT_ICON[verdict], 14));
  return h(doc, 'div', { className: 'verdict-head' }, seal, h(doc, 'div', {}, h(doc, 'b', {}, LABEL[verdict]), h(doc, 'small', {}, MEANING[verdict])));
}

/** Render a verification response (all text via textContent; evidence is untrusted). */
export function renderResult(doc: Document, res: VerifyResponse): HTMLElement {
  const box = h(doc, 'div', { id: 'result' });
  if (res.status === 'consent-required') {
    box.append(h(doc, 'p', { className: 'warn' }, 'Accept the privacy notice in Settings first. Nothing was sent.'));
    return box;
  }
  if (res.status !== 'ok') {
    box.append(h(doc, 'p', { className: 'err' }, res.status === 'error' ? res.message : 'Checking is switched off.'));
    return box;
  }
  const s = res.result.summary;
  box.append(
    h(
      doc,
      'div',
      { className: 'row' },
      h(doc, 'span', { className: 'chip supported' }, `${s.supported} supported`),
      h(doc, 'span', { className: 'chip contradicted' }, `${s.contradicted} contradicted`),
      h(doc, 'span', { className: 'chip unverifiable' }, `${s.unverifiable} unverifiable`),
      h(doc, 'span', { className: 'chip checked' }, `${s.checked} checked`),
    ),
  );
  if (s.checked === 0) box.append(h(doc, 'p', { className: 'muted' }, 'No checkable factual claims found in the selection.'));
  const order = { contradicted: 0, unverifiable: 1, supported: 2 } as const;
  const list = h(doc, 'ol', { className: 'claims' });
  for (const v of [...res.result.verdicts].sort((a, b) => order[a.verdict] - order[b.verdict])) {
    const li = h(doc, 'li', { className: `verdict ${v.verdict}` }, verdictHead(doc, v.verdict), h(doc, 'p', { className: 'claim' }, `“${v.claim}”`));
    if (v.rationale) li.append(h(doc, 'p', { className: 'reason' }, v.rationale));
    if (v.correction) li.append(h(doc, 'div', { className: 'correction' }, `Correction: ${v.correction}`));
    for (const q of v.quotes) {
      const href = safeHref(q.source.url);
      const meta = h(doc, 'span', { className: 'source-meta' }, h(doc, 'b', {}, q.source.title), h(doc, 'small', {}, hostOf(href) || q.source.providerId));
      const head = href
        ? h(doc, 'a', { className: 'source', href, target: '_blank', rel: 'noopener noreferrer' }, icon(doc, sourceIcon(q.source.providerId), 18), meta, icon(doc, 'external', 13))
        : h(doc, 'span', { className: 'source' }, icon(doc, sourceIcon(q.source.providerId), 18), meta);
      li.append(h(doc, 'div', { className: 'evidence' }, head, h(doc, 'blockquote', {}, q.quote)));
    }
    list.append(li);
  }
  box.append(list);
  for (const w of [...new Set(res.warnings.map(friendlyWarning))]) box.append(h(doc, 'p', { className: 'warn' }, w));
  return box;
}

/** Remembered across re-renders (switching on/off keeps you on the same tab). */
const activeTab = new WeakMap<HTMLElement, Tab>();

/**
 * `power` is the header's on/off switch (a `<button role="switch">`). Without
 * consent it stays off and leads to the privacy notice instead.
 */
export async function mountPopup(root: HTMLElement, power: HTMLButtonElement | null, api: PopupApi): Promise<void> {
  const doc = root.ownerDocument;
  const settings = await api.getSettings();
  const consent = hasValidConsent(settings);
  const on = consent && settings.enabled;
  root.replaceChildren();
  root.removeAttribute('aria-busy');
  if (power) {
    power.setAttribute('role', 'switch');
    power.setAttribute('aria-checked', String(on));
    power.setAttribute('aria-label', on ? 'Checking is on. Turn off' : 'Checking is off. Turn on');
    power.title = on ? 'Turn checking off' : 'Turn checking on';
    power.querySelector('.switch-label')?.replaceChildren(on ? 'On' : 'Off');
    power.onclick = async () => {
      if (!consent) return api.openOptions();
      power.disabled = true;
      try {
        await api.setEnabled(!settings.enabled);
        await mountPopup(root, power, api);
      } finally {
        power.disabled = false;
      }
    };
  }
  const settingsBtn = h(doc, 'button', { type: 'button', id: 'open-settings' }, 'Open settings');
  settingsBtn.addEventListener('click', () => api.openOptions());

  if (!consent) {
    const accept = h(doc, 'button', { type: 'button', className: 'primary', id: 'review-consent' }, 'Review privacy notice');
    accept.addEventListener('click', () => api.openOptions());
    root.append(
      card(doc, 'Welcome to Socratica', { id: 'welcome' },
        h(doc, 'p', {}, 'Socratica checks AI answers against evidence from the web and marks each claim supported, contradicted or unverifiable, with the source quote behind it.'),
        h(doc, 'p', { className: 'muted' }, 'Checking is off until you accept the privacy notice. Nothing has been sent anywhere.'),
        accept),
    );
    return;
  }
  if (!settings.enabled) {
    root.append(
      card(doc, 'Checking is off', { id: 'paused' },
        h(doc, 'p', { className: 'muted' }, 'Nothing is read, highlighted or sent anywhere. Use the switch above to turn it back on.')),
      h(doc, 'div', { className: 'row end' }, settingsBtn),
    );
    return;
  }

  // ---- Tabs ----
  const current = activeTab.get(root) ?? 'verify';
  const tablist = h(doc, 'div', { className: 'tabs' });
  tablist.setAttribute('role', 'tablist');
  const panels = {} as Record<Tab, HTMLElement>;
  const select = (tab: Tab) => {
    activeTab.set(root, tab);
    for (const [id] of TABS) {
      const selected = id === tab;
      panels[id].hidden = !selected;
      const btn = tablist.querySelector<HTMLButtonElement>(`#tab-${id}`)!;
      btn.setAttribute('aria-selected', String(selected));
      btn.tabIndex = selected ? 0 : -1;
    }
  };
  for (const [id, label] of TABS) {
    const btn = h(doc, 'button', { type: 'button', id: `tab-${id}`, className: 'tab' }, label);
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', `panel-${id}`);
    btn.addEventListener('click', () => select(id));
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = TABS.findIndex(([t]) => t === id);
      const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]![0];
      select(next);
      tablist.querySelector<HTMLButtonElement>(`#tab-${next}`)!.focus();
    });
    tablist.append(btn);
    const panel = h(doc, 'div', { id: `panel-${id}`, className: 'panel' });
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tab-${id}`);
    panels[id] = panel;
  }
  root.append(tablist, panels.verify, panels.sources, panels.insights);

  // ---- Verify ----
  const tab = await api.activeTab();
  const page = card(doc, 'This page', { id: 'page' });
  let status: PageStatus | undefined;
  if (tab?.id !== undefined && isChatGpt(tab.url)) {
    status = await api.pageStatus(tab.id);
    if (!status) {
      page.append(h(doc, 'p', { className: 'warn' }, 'The page was opened before the extension was installed or updated. Reload the ChatGPT tab.'));
    } else {
      page.append(h(doc, 'p', { id: 'answer-count' }, status.answers === 0 ? 'No ChatGPT answers detected on this page yet.' : `${status.answers} ChatGPT answer${status.answers === 1 ? '' : 's'} detected.`));
      if (status.state === 'checking') page.append(h(doc, 'p', { className: 'muted' }, 'Checking the latest answer…'));
      if (status.lastSummary) page.append(h(doc, 'p', {}, h(doc, 'b', {}, 'Last check: '), status.lastSummary));
      if (status.lastError) page.append(h(doc, 'p', { className: 'err' }, status.lastError));
      const tabId = tab.id;
      const check = h(doc, 'button', { type: 'button', className: 'primary', id: 'check-latest', disabled: status.answers === 0 }, 'Check latest answer', icon(doc, 'arrowRight', 14));
      const out = h(doc, 'span', { className: 'muted', id: 'check-latest-result' });
      check.addEventListener('click', async () => {
        const r = await api.checkLatest(tabId);
        out.textContent = r.ok ? 'Checking… results appear under the answer.' : (r.message ?? 'Could not start a check.');
      });
      page.append(h(doc, 'div', { className: 'row' }, check, out));
      if (status.answers === 0) {
        page.append(h(doc, 'p', { className: 'muted' }, 'If you can see an answer, ChatGPT may have changed its page layout. Select the answer text and use “Check selected text” below.'));
      }
    }
  } else {
    page.append(h(doc, 'p', { className: 'muted' }, 'Answers are checked automatically on chatgpt.com. On any page, you can select text and check it here.'));
  }
  const selBtn = h(doc, 'button', { type: 'button', id: 'check-selection' }, 'Check selected text');
  const selOut = h(doc, 'div', { id: 'selection-output' });
  selBtn.addEventListener('click', async () => {
    selOut.replaceChildren(resultSkeleton(doc));
    selBtn.disabled = true;
    try {
      if (tab?.id === undefined) throw new Error('No active tab.');
      const text = await api.getSelection(tab.id);
      if (!text.trim()) throw new Error('Select some text on the page first, then open this popup again.');
      selOut.replaceChildren(renderResult(doc, await api.verifyText(text)));
    } catch (err) {
      selOut.replaceChildren(h(doc, 'p', { className: 'err' }, err instanceof Error ? err.message : String(err)));
    } finally {
      selBtn.disabled = false;
    }
  });
  panels.verify.append(page, card(doc, 'Check selected text', { id: 'selection' }, h(doc, 'p', { className: 'muted' }, 'Highlight text on any page, then:'), selBtn, selOut));

  // ---- Sources ----
  const web = settings.evidence.web;
  const engine = WEB_SEARCH_ENGINES[web.engine];
  const hasKey = !!web[WEB_KEY_FIELD[web.engine]].trim();
  const webReady = !engine.keyRequired || hasKey;
  const webCard = card(doc, undefined, { id: 'web-source' },
    h(doc, 'div', { className: 'card-title' }, h(doc, 'h2', {}, 'Web search'), h(doc, 'span', { className: 'badge' }, 'Required')),
    h(doc, 'p', { className: 'source-line' }, icon(doc, 'document', 18), h(doc, 'span', {}, h(doc, 'b', {}, engine.name), h(doc, 'small', { className: webReady ? 'ok' : 'bad' }, webReady ? (hasKey ? 'Ready, with your key' : 'Ready, no key needed') : 'Needs an API key: open Settings'))),
  );
  const others: Array<[boolean, string]> = [
    [settings.evidence.wikipedia, 'Wikipedia'], [settings.evidence.wikidata, 'Wikidata'], [settings.evidence.europePmc, 'Europe PMC'],
    [settings.evidence.worldBank, 'World Bank'], [settings.evidence.govUk, 'GOV.UK'], [settings.evidence.googleFactCheck, 'Google Fact Check'],
    [settings.evidence.urls, 'Trusted URLs'],
  ];
  const enabled = others.filter(([e]) => e).map(([, name]) => name);
  const list = h(doc, 'ul', { className: 'source-list' });
  for (const [isOn, name] of others) list.append(h(doc, 'li', { className: isOn ? 'on' : 'off' }, icon(doc, isOn ? 'check' : 'cross', 13), name));
  const othersCard = card(doc, 'More sources', { id: 'evidence-sources' }, h(doc, 'p', { className: 'muted', id: 'evidence-summary' }, enabled.length ? `Also searching: ${enabled.join(', ')}.` : 'Web search only.'), list);
  const judge = judgeLabel(settings);
  const judgeCard = card(doc, 'Judge', { id: 'judge' }, h(doc, 'p', {}, judge.text));
  if (judge.limited) judgeCard.append(h(doc, 'p', { className: 'warn', id: 'judge-warning' }, 'For more thorough checks, choose a model in Settings: a local one (Ollama / LM Studio) or your OpenAI / Anthropic key.'));
  panels.sources.append(webCard, othersCard, judgeCard, h(doc, 'div', { className: 'row end' }, settingsBtn));

  // ---- Insights ----
  const counts = status?.lastCounts;
  const insight = card(doc, 'Last check on this page', { id: 'insight' });
  if (counts && counts.checked > 0) {
    const meter = h(doc, 'div', { className: 'meter' });
    meter.setAttribute('aria-hidden', 'true');
    for (const v of ['supported', 'contradicted', 'unverifiable'] as const) {
      if (!counts[v]) continue;
      const seg = h(doc, 'i', { className: v });
      seg.style.flex = String(counts[v]);
      meter.append(seg);
    }
    const legend = h(doc, 'ul', { className: 'legend' });
    for (const v of ['supported', 'contradicted', 'unverifiable'] as const) legend.append(h(doc, 'li', { className: v }, h(doc, 'b', {}, String(counts[v])), ` ${v}`));
    insight.append(h(doc, 'p', { className: 'stat' }, h(doc, 'b', {}, String(counts.checked)), ` claim${counts.checked === 1 ? '' : 's'} checked`), meter, legend);
  } else {
    insight.append(h(doc, 'p', { className: 'muted' }, 'No checks on this page yet. Results appear here after an answer is checked.'));
  }
  const guide = card(doc, 'Reading a verdict', { id: 'guide' });
  for (const v of ['supported', 'contradicted', 'unverifiable'] as const) guide.append(verdictHead(doc, v));
  const quote = h(doc, 'figure', { className: 'quote' }, h(doc, 'blockquote', {}, 'The unexamined answer is not worth trusting.'), h(doc, 'figcaption', {}, 'After Socrates'));
  panels.insights.append(insight, guide, quote);

  select(current);
}
