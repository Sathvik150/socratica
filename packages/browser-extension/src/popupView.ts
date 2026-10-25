import type { ClaimVerdict } from '@hallucination-firewall/core';
import type { PageStatus, VerifyResponse } from './messages.js';
import { DEFAULT_MODELS, hasValidConsent, type Settings } from './settings.js';

/** Everything the popup needs from the browser, injected so the view can be tested without chrome.*. */
export interface PopupApi {
  getSettings(): Promise<Settings>;
  activeTab(): Promise<{ id?: number; url?: string } | undefined>;
  /** Undefined when no content script answers (not chatgpt.com, or the page was open before install). */
  pageStatus(tabId: number): Promise<PageStatus | undefined>;
  checkLatest(tabId: number): Promise<{ ok: boolean; message?: string }>;
  getSelection(tabId: number): Promise<string>;
  verifyText(text: string): Promise<VerifyResponse>;
  openOptions(): void;
}

const LABEL: Record<ClaimVerdict['verdict'], string> = { supported: 'Supported', contradicted: 'Contradicted', unverifiable: 'Unverifiable' };

function h<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, props: Record<string, unknown> = {}, ...children: Array<Node | string>): HTMLElementTagNameMap[K] {
  const node = Object.assign(doc.createElement(tag), props) as HTMLElementTagNameMap[K];
  node.append(...children);
  return node;
}

function judgeLabel(s: Settings): { text: string; limited: boolean } {
  const p = s.llm.provider;
  if (p === 'heuristic') return { text: 'Offline heuristic (very literal: most real claims come out unverifiable)', limited: true };
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

/** Render a verification response (all text via textContent; evidence is untrusted). */
export function renderResult(doc: Document, res: VerifyResponse): HTMLElement {
  const box = h(doc, 'div', { id: 'result' });
  if (res.status === 'consent-required') {
    box.append(h(doc, 'p', { className: 'warn' }, 'Accept the privacy notice in Settings first. Nothing was sent.'));
    return box;
  }
  if (res.status !== 'ok') {
    box.append(h(doc, 'p', { className: 'err' }, res.status === 'error' ? res.message : 'Checking is disabled.'));
    return box;
  }
  const s = res.result.summary;
  box.append(
    h(
      doc,
      'div',
      { className: 'row' },
      h(doc, 'span', { className: 'chip checked' }, `${s.checked} checked`),
      h(doc, 'span', { className: 'chip supported' }, `${s.supported} supported`),
      h(doc, 'span', { className: 'chip contradicted' }, `${s.contradicted} contradicted`),
      h(doc, 'span', { className: 'chip unverifiable' }, `${s.unverifiable} unverifiable`),
    ),
  );
  if (s.checked === 0) box.append(h(doc, 'p', { className: 'muted' }, 'No checkable factual claims found in the selection.'));
  const order = { contradicted: 0, unverifiable: 1, supported: 2 } as const;
  const list = h(doc, 'ol', { className: 'claims' });
  for (const v of [...res.result.verdicts].sort((a, b) => order[a.verdict] - order[b.verdict])) {
    const li = h(doc, 'li', {}, h(doc, 'span', { className: `chip ${v.verdict}` }, LABEL[v.verdict]), ' ', h(doc, 'span', {}, v.claim));
    if (v.rationale) li.append(h(doc, 'div', { className: 'muted' }, v.rationale));
    for (const q of v.quotes) {
      const quote = h(doc, 'blockquote', {}, h(doc, 'div', {}, q.quote));
      const href = safeHref(q.source.url);
      quote.append(href ? h(doc, 'a', { href, target: '_blank', rel: 'noopener noreferrer' }, q.source.title) : h(doc, 'span', { className: 'muted' }, q.source.title));
      li.append(quote);
    }
    if (v.correction) li.append(h(doc, 'div', { className: 'correction' }, `Correction: ${v.correction}`));
    list.append(li);
  }
  box.append(list);
  for (const w of res.warnings) box.append(h(doc, 'p', { className: 'warn' }, w));
  return box;
}

export async function mountPopup(root: HTMLElement, pill: HTMLElement | null, api: PopupApi): Promise<void> {
  const doc = root.ownerDocument;
  const settings = await api.getSettings();
  const consent = hasValidConsent(settings);
  root.replaceChildren();
  if (pill) {
    pill.textContent = consent ? 'On' : 'Off';
    pill.className = `pill ${consent ? 'on' : 'off'}`;
  }

  const settingsBtn = h(doc, 'button', { type: 'button', id: 'open-settings' }, 'Settings');
  settingsBtn.addEventListener('click', () => api.openOptions());

  if (!consent) {
    const accept = h(doc, 'button', { type: 'button', className: 'primary', id: 'review-consent' }, 'Review privacy notice');
    accept.addEventListener('click', () => api.openOptions());
    root.append(
      h(doc, 'section', {}, h(doc, 'p', { className: 'warn' }, 'Checking is off until you accept the privacy notice. Nothing has been sent anywhere.'), accept),
    );
    return;
  }

  const judge = judgeLabel(settings);
  const evidence = [
    settings.evidence.wikipedia && 'Wikipedia', settings.evidence.wikidata && 'Wikidata',
    settings.evidence.europePmc && 'Europe PMC', settings.evidence.crossref && 'Crossref',
    settings.evidence.worldBank && 'World Bank', settings.evidence.govUk && 'GOV.UK',
    settings.evidence.googleFactCheck && 'Google Fact Check', settings.evidence.tavily && 'Tavily',
    settings.evidence.urls && 'Trusted URLs', settings.evidence.webSearch && 'Brave web search',
  ].filter(Boolean).join(', ') || 'none';
  const setup = h(doc, 'section', {}, h(doc, 'h2', {}, 'Setup'), h(doc, 'p', {}, h(doc, 'b', {}, 'Judge: '), judge.text), h(doc, 'p', {}, h(doc, 'b', {}, 'Evidence: '), evidence));
  if (judge.limited) setup.append(h(doc, 'p', { className: 'warn', id: 'judge-warning' }, 'For real checks, choose a model in Settings: a local one (Ollama / LM Studio) or your OpenAI / Anthropic key.'));
  root.append(setup);

  const tab = await api.activeTab();
  const pageSection = h(doc, 'section', { id: 'page' }, h(doc, 'h2', {}, 'This page'));
  root.append(pageSection);
  if (tab?.id !== undefined && isChatGpt(tab.url)) {
    const st = await api.pageStatus(tab.id);
    if (!st) {
      pageSection.append(h(doc, 'p', { className: 'warn' }, 'The page was opened before the extension was installed or updated. Reload the ChatGPT tab.'));
    } else {
      pageSection.append(
        h(doc, 'p', { id: 'answer-count' }, st.answers === 0 ? 'No ChatGPT answers detected on this page yet.' : `${st.answers} ChatGPT answer${st.answers === 1 ? '' : 's'} detected.`),
      );
      if (st.state === 'checking') pageSection.append(h(doc, 'p', { className: 'muted' }, 'Checking the latest answer…'));
      if (st.lastSummary) pageSection.append(h(doc, 'p', {}, h(doc, 'b', {}, 'Last check: '), st.lastSummary));
      if (st.lastError) pageSection.append(h(doc, 'p', { className: 'err' }, st.lastError));
      const tabId = tab.id;
      const check = h(doc, 'button', { type: 'button', className: 'primary', id: 'check-latest', disabled: st.answers === 0 }, 'Check latest answer');
      const out = h(doc, 'span', { className: 'muted', id: 'check-latest-result' });
      check.addEventListener('click', async () => {
        const r = await api.checkLatest(tabId);
        out.textContent = r.ok ? 'Checking… results appear under the answer.' : (r.message ?? 'Could not start a check.');
      });
      pageSection.append(h(doc, 'div', { className: 'row' }, check, out));
      if (st.answers === 0) {
        pageSection.append(h(doc, 'p', { className: 'muted' }, 'If you can see an answer, ChatGPT may have changed its page layout. Select the answer text and use “Check selected text” below.'));
      }
    }
  } else {
    pageSection.append(h(doc, 'p', { className: 'muted' }, 'Answers are checked automatically on chatgpt.com. On any page, you can select text and check it here.'));
  }

  const selSection = h(doc, 'section', { id: 'selection' }, h(doc, 'h2', {}, 'Check selected text'));
  const selBtn = h(doc, 'button', { type: 'button', id: 'check-selection' }, 'Check selected text');
  const selOut = h(doc, 'div', { id: 'selection-output' });
  selBtn.addEventListener('click', async () => {
    selOut.replaceChildren(h(doc, 'p', { className: 'muted' }, 'Checking…'));
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
  selSection.append(h(doc, 'p', { className: 'muted' }, 'Highlight text on any page, then click:'), selBtn, selOut);
  root.append(selSection);
  root.append(h(doc, 'div', { className: 'row' }, settingsBtn));
}
