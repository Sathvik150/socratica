/**
 * In-page UI. Everything visual lives inside Shadow DOM hosts marked
 * `data-hf-ui`, so page styles cannot leak in, ours cannot leak out, and the
 * watcher ignores our own mutations. Highlights are drawn as positioned boxes
 * over the answer text (computed from DOM Ranges), so the page's own DOM,
 * which the chat app's framework owns, is never rewritten.
 *
 * All dynamic text is inserted with textContent. Evidence comes from the web
 * and is never interpreted as HTML.
 */
import type { ClaimVerdict, VerifyOutput } from '@hallucination-firewall/core';
import { extractText, rangeForSpan, type TextMap } from './textMap.js';

const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
.bar { margin: 8px 0 4px; padding: 8px 10px; border-radius: 8px; border: 1px solid #d0d7de; background: #f6f8fa; color: #1f2328; font-size: 13px; line-height: 1.4; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.brand { font-weight: 600; margin-right: 4px; }
.chip { padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.chip.supported { background: #dafbe1; color: #116329; }
.chip.contradicted { background: #ffebe9; color: #a40e26; }
.chip.unverifiable { background: #fff8c5; color: #7d4e00; }
.chip.checked { background: #e7ecf0; color: #1f2328; }
button { font: inherit; font-size: 12px; cursor: pointer; border: 1px solid #d0d7de; background: #fff; color: #1f2328; border-radius: 6px; padding: 2px 8px; }
button:hover { background: #f3f4f6; }
.spacer { flex: 1; }
.status { color: #57606a; }
.warn { color: #7d4e00; margin-top: 4px; font-size: 12px; }
ul.details { list-style: none; margin: 8px 0 0; padding: 0; }
ul.details li { display: flex; gap: 6px; align-items: baseline; padding: 3px 0; border-top: 1px solid #eaeef2; }
ul.details li button.claim { border: none; background: none; text-align: left; padding: 0; color: #0969da; font-size: 12px; }
.mark { position: absolute; pointer-events: auto; cursor: pointer; border-radius: 2px; }
.mark.contradicted { background: rgba(255, 80, 80, 0.22); border-bottom: 2px solid #cf222e; }
.mark.unverifiable { border-bottom: 2px dashed #bf8700; }
.panel { position: fixed; z-index: 2; pointer-events: auto; width: min(420px, calc(100vw - 24px)); max-height: 60vh; overflow: auto; background: #fff; color: #1f2328; border: 1px solid #d0d7de; border-radius: 10px; box-shadow: 0 8px 24px rgba(140,149,159,.35); padding: 12px 14px; font-size: 13px; line-height: 1.45; }
.panel h3 { margin: 0 0 6px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
.panel .claim { font-style: italic; margin: 4px 0 8px; }
.panel .label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #57606a; margin: 10px 0 4px; }
.panel blockquote { margin: 0 0 6px; padding: 6px 10px; border-left: 3px solid #d0d7de; background: #f6f8fa; }
.panel .source { display: block; font-size: 12px; margin-top: 4px; }
.panel a { color: #0969da; }
.panel .correction { padding: 6px 10px; background: #dafbe1; border-radius: 6px; }
.panel .close { position: absolute; top: 8px; right: 8px; }
`;

const VERDICT_LABEL: Record<ClaimVerdict['verdict'], string> = {
  supported: 'Supported',
  contradicted: 'Contradicted',
  unverifiable: 'Unverifiable',
};

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** One shared, page-wide layer for highlight boxes and the evidence panel. */
class HighlightLayer {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
  readonly marks: HTMLElement;
  panel: HTMLElement | undefined;

  constructor(readonly doc: Document) {
    this.host = doc.createElement('div');
    this.host.setAttribute('data-hf-ui', 'layer');
    Object.assign(this.host.style, { position: 'absolute', top: '0', left: '0', width: '0', height: '0', zIndex: '2147483646', pointerEvents: 'none' });
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.appendChild(el(doc, 'style', undefined, STYLES));
    this.marks = el(doc, 'div');
    this.root.appendChild(this.marks);
    doc.body.appendChild(this.host);
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closePanel();
    });
  }

  closePanel(): void {
    this.panel?.remove();
    this.panel = undefined;
  }
}

const layers = new WeakMap<Document, HighlightLayer>();
function layerFor(doc: Document): HighlightLayer {
  let layer = layers.get(doc);
  if (!layer || !layer.host.isConnected) {
    layer = new HighlightLayer(doc);
    layers.set(doc, layer);
  }
  return layer;
}

export interface AnswerOverlayOptions {
  /** Element after which the summary bar is inserted (the answer's content element). */
  content: HTMLElement;
  /** Re-run verification for this answer. */
  onRecheck?: () => void;
  /** Open the extension options (consent, keys). */
  onOpenOptions?: () => void;
}

export class AnswerOverlay {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
  readonly #doc: Document;
  readonly #opts: AnswerOverlayOptions;
  readonly #bar: HTMLElement;
  #result: VerifyOutput | undefined;
  #map: TextMap | undefined;
  #markEls: HTMLElement[] = [];
  #frame = 0;
  readonly #onViewportChange = () => this.#scheduleReposition();

  constructor(opts: AnswerOverlayOptions) {
    this.#opts = opts;
    this.#doc = opts.content.ownerDocument;
    this.host = this.#doc.createElement('div');
    this.host.setAttribute('data-hf-ui', 'summary');
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.appendChild(el(this.#doc, 'style', undefined, STYLES));
    this.#bar = el(this.#doc, 'div', 'bar');
    this.root.appendChild(this.#bar);
    opts.content.after(this.host);
    this.#doc.defaultView?.addEventListener('scroll', this.#onViewportChange, { capture: true, passive: true });
    this.#doc.defaultView?.addEventListener('resize', this.#onViewportChange, { passive: true });
  }

  get content(): HTMLElement {
    return this.#opts.content;
  }

  /** Re-attach the bar if the page re-rendered and dropped it. */
  ensureAttached(): void {
    if (!this.host.isConnected && this.#opts.content.isConnected) this.#opts.content.after(this.host);
  }

  showStatus(text: string, action?: { label: string; run: () => void }): void {
    this.#clearMarks();
    this.#bar.replaceChildren();
    const row = el(this.#doc, 'div', 'row');
    row.append(el(this.#doc, 'span', 'brand', 'Hallucination Firewall'), el(this.#doc, 'span', 'status', text));
    if (action) {
      const btn = el(this.#doc, 'button', undefined, action.label);
      btn.addEventListener('click', action.run);
      row.append(el(this.#doc, 'span', 'spacer'), btn);
    }
    this.#bar.append(row);
  }

  showConsentRequired(): void {
    this.showStatus('Off until you review and accept the privacy notice. Nothing has been sent anywhere.', this.#opts.onOpenOptions ? { label: 'Open settings', run: this.#opts.onOpenOptions } : undefined);
  }

  /** Render a verification result. `answerText` must be the exact text the spans refer to. */
  render(result: VerifyOutput, answerText: string, warnings: string[] = []): void {
    this.#result = result;
    const map = extractText(this.#opts.content);
    // Only draw highlights if the DOM text still matches what was verified.
    this.#map = map.text === answerText ? map : undefined;
    this.#renderBar(warnings);
    this.#drawMarks();
  }

  #renderBar(warnings: string[]): void {
    const result = this.#result!;
    const s = result.summary;
    this.#bar.replaceChildren();
    const row = el(this.#doc, 'div', 'row');
    row.append(
      el(this.#doc, 'span', 'brand', 'Hallucination Firewall'),
      el(this.#doc, 'span', 'chip checked', `${s.checked} checked`),
      el(this.#doc, 'span', 'chip supported', `${s.supported} supported`),
      el(this.#doc, 'span', 'chip contradicted', `${s.contradicted} contradicted`),
      el(this.#doc, 'span', 'chip unverifiable', `${s.unverifiable} unverifiable`),
      el(this.#doc, 'span', 'spacer'),
    );
    row.setAttribute('aria-label', s.text);
    const details = el(this.#doc, 'ul', 'details');
    details.hidden = s.contradicted === 0;
    const toggle = el(this.#doc, 'button', undefined, details.hidden ? 'Details' : 'Hide details');
    toggle.addEventListener('click', () => {
      details.hidden = !details.hidden;
      toggle.textContent = details.hidden ? 'Details' : 'Hide details';
    });
    row.append(toggle);
    if (this.#opts.onRecheck) {
      const again = el(this.#doc, 'button', undefined, 'Re-check');
      again.addEventListener('click', this.#opts.onRecheck);
      row.append(again);
    }
    this.#bar.append(row);

    for (const v of result.verdicts) {
      const li = el(this.#doc, 'li');
      li.dataset.claimId = v.claimId;
      const btn = el(this.#doc, 'button', 'claim', v.claim);
      btn.addEventListener('click', () => this.openPanel(v.claimId));
      li.append(el(this.#doc, 'span', `chip ${v.verdict}`, VERDICT_LABEL[v.verdict]), btn);
      details.append(li);
    }
    if (s.checked === 0) details.append(el(this.#doc, 'li', undefined, 'No checkable factual claims were found in this answer.'));
    this.#bar.append(details);
    for (const w of warnings) this.#bar.append(el(this.#doc, 'div', 'warn', w));
  }

  #clearMarks(): void {
    for (const m of this.#markEls) m.remove();
    this.#markEls = [];
  }

  #drawMarks(): void {
    this.#clearMarks();
    const result = this.#result;
    const map = this.#map;
    if (!result || !map) return;
    if (!this.#opts.content.isConnected) return this.destroy();
    const layer = layerFor(this.#doc);
    const win = this.#doc.defaultView;
    const sx = win?.scrollX ?? 0;
    const sy = win?.scrollY ?? 0;
    for (const v of result.verdicts) {
      if (v.verdict === 'supported') continue; // only flagged claims are highlighted inline
      const claim = result.claims.find((c) => c.id === v.claimId);
      if (!claim) continue;
      const range = rangeForSpan(map, claim.span.start, claim.span.end, this.#doc);
      if (!range || typeof range.getClientRects !== 'function') continue; // e.g. non-layout DOMs
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width === 0 || rect.height === 0) continue;
        const mark = el(this.#doc, 'div', `mark ${v.verdict}`);
        mark.title = `${VERDICT_LABEL[v.verdict]}: click for evidence`;
        Object.assign(mark.style, { left: `${rect.left + sx}px`, top: `${rect.top + sy}px`, width: `${rect.width}px`, height: `${rect.height}px` });
        mark.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openPanel(v.claimId, { x: rect.left, y: rect.bottom });
        });
        layer.marks.append(mark);
        this.#markEls.push(mark);
      }
    }
  }

  #scheduleReposition(): void {
    if (this.#frame || !this.#result) return;
    const raf = this.#doc.defaultView?.requestAnimationFrame ?? ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number);
    this.#frame = raf(() => {
      this.#frame = 0;
      this.#drawMarks();
    });
  }

  /** Open the evidence panel for a claim. Returns the panel element. */
  openPanel(claimId: string, at?: { x: number; y: number }): HTMLElement | undefined {
    const result = this.#result;
    const v = result?.verdicts.find((x) => x.claimId === claimId);
    if (!result || !v) return undefined;
    const layer = layerFor(this.#doc);
    layer.closePanel();
    const doc = this.#doc;
    const panel = el(doc, 'div', 'panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', `Evidence for claim: ${v.claim}`);
    panel.dataset.claimId = claimId;

    const close = el(doc, 'button', 'close', '×');
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => layer.closePanel());
    const h = el(doc, 'h3');
    h.append(el(doc, 'span', `chip ${v.verdict}`, VERDICT_LABEL[v.verdict]), el(doc, 'span', undefined, `confidence ${Math.round(v.confidence * 100)}%`));
    panel.append(close, h, el(doc, 'div', 'claim', `“${v.claim}”`));
    panel.append(el(doc, 'div', 'label', 'Reason'), el(doc, 'div', 'reason', v.rationale));

    if (v.correction) {
      panel.append(el(doc, 'div', 'label', 'Suggested correction'), el(doc, 'div', 'correction', v.correction));
    }
    if (v.quotes.length) {
      panel.append(el(doc, 'div', 'label', 'Evidence'));
      for (const q of v.quotes) {
        const block = el(doc, 'blockquote');
        block.append(el(doc, 'div', 'quote', q.quote));
        const href = safeHref(q.source.url);
        const sourceTitle = `${q.source.title} (${q.source.providerId})`;
        if (href) {
          const a = el(doc, 'a', 'source', sourceTitle);
          a.href = href;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          block.append(a);
        } else {
          block.append(el(doc, 'span', 'source', sourceTitle));
        }
        panel.append(block);
      }
    } else if (v.downgradeReason === 'no-evidence') {
      panel.append(el(doc, 'div', 'label', 'Evidence'), el(doc, 'div', undefined, 'No relevant passages were found in the enabled sources.'));
    }

    const vw = doc.defaultView?.innerWidth ?? 800;
    const vh = doc.defaultView?.innerHeight ?? 600;
    const x = Math.max(12, Math.min((at?.x ?? vw / 2 - 210), vw - 432));
    const y = at ? (at.y + 8 > vh * 0.6 ? Math.max(12, at.y - 8 - Math.min(vh * 0.6, 360)) : at.y + 8) : 80;
    Object.assign(panel.style, { left: `${x}px`, top: `${y}px` });
    layer.root.append(panel);
    layer.panel = panel;
    close.focus();
    return panel;
  }

  destroy(): void {
    this.#clearMarks();
    this.host.remove();
    this.#doc.defaultView?.removeEventListener('scroll', this.#onViewportChange, { capture: true });
    this.#doc.defaultView?.removeEventListener('resize', this.#onViewportChange);
  }
}
