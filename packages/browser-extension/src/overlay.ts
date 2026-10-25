/**
 * In-page UI. Everything visual lives inside Shadow DOM hosts marked
 * `data-hf-ui`, so page styles cannot leak in, ours cannot leak out, and the
 * watcher ignores our own mutations. The page's own DOM, which the chat app's
 * framework owns, is never rewritten.
 *
 * Highlights use the CSS Custom Highlight API where available: the browser
 * styles the claim text itself, so highlights move with the text while
 * scrolling (no repositioning, no jitter, no extra DOM). Older engines fall
 * back to positioned boxes that are redrawn on scroll.
 *
 * All dynamic text is inserted with textContent. Evidence comes from the web
 * and is never interpreted as HTML.
 */
import type { ClaimVerdict, VerifyOutput } from '@hallucination-firewall/core';
import { extractText, rangeForSpan, type TextMap } from './textMap.js';
import { HIGHLIGHT_CSS, OVERLAY_CSS, friendlyWarning, icon, pageIsDark, type IconName } from './ui/theme.js';

const VERDICT_LABEL: Record<ClaimVerdict['verdict'], string> = {
  supported: 'Supported',
  contradicted: 'Contradicted',
  unverifiable: 'Unverifiable',
};
const VERDICT_ICON: Record<ClaimVerdict['verdict'], IconName> = { supported: 'check', contradicted: 'cross', unverifiable: 'question' };
type Flagged = Exclude<ClaimVerdict['verdict'], 'supported'>;

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

function hostOf(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : undefined;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* Native highlights (CSS Custom Highlight API)                        */
/* ------------------------------------------------------------------ */

interface HighlightEntry {
  range: Range;
  claimId: string;
  verdict: Flagged;
  overlay: AnswerOverlay;
}

type HighlightCtor = new (...ranges: Range[]) => unknown;
interface HighlightWindow {
  CSS?: { highlights?: Map<string, unknown> };
  Highlight?: HighlightCtor;
  CSSStyleSheet?: typeof CSSStyleSheet;
}

/** Whether this document's engine supports `CSS.highlights` + `new Highlight()`. */
export function supportsNativeHighlights(doc: Document): boolean {
  const win = doc.defaultView as unknown as HighlightWindow | null;
  return !!win?.CSS?.highlights && typeof win.Highlight === 'function';
}

/** One registry per document: owns the named highlights, their stylesheet, and click/hover hit-testing. */
class NativeHighlights {
  readonly #doc: Document;
  readonly #win: HighlightWindow;
  #entries: HighlightEntry[] = [];
  #hoverFrame = 0;
  #hovering = false;

  constructor(doc: Document) {
    this.#doc = doc;
    this.#win = doc.defaultView as unknown as HighlightWindow;
    this.#installStyles();
    // Capture phase: chat apps often stop propagation on their own message elements.
    doc.addEventListener('click', this.#onClick, true);
    doc.addEventListener('mousemove', this.#onMove, { passive: true });
  }

  #installStyles(): void {
    const doc = this.#doc;
    try {
      // Constructed stylesheets are not subject to the page's CSP rules for inline <style>.
      const sheet = new (this.#win.CSSStyleSheet ?? CSSStyleSheet)();
      sheet.replaceSync(HIGHLIGHT_CSS);
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    } catch {
      const style = el(doc, 'style', undefined, HIGHLIGHT_CSS);
      style.setAttribute('data-hf-ui', 'highlights');
      doc.head.append(style);
    }
  }

  set(overlay: AnswerOverlay, entries: Array<Omit<HighlightEntry, 'overlay'>>): void {
    this.#entries = this.#entries.filter((e) => e.overlay !== overlay).concat(entries.map((e) => ({ ...e, overlay })));
    this.#sync();
  }

  clear(overlay: AnswerOverlay): void {
    if (!this.#entries.some((e) => e.overlay === overlay)) return;
    this.#entries = this.#entries.filter((e) => e.overlay !== overlay);
    this.#sync();
  }

  #sync(): void {
    const registry = this.#win.CSS!.highlights!;
    const Highlight = this.#win.Highlight!;
    for (const verdict of ['contradicted', 'unverifiable'] as const) {
      const ranges = this.#entries.filter((e) => e.verdict === verdict).map((e) => e.range);
      if (ranges.length) registry.set(`hf-${verdict}`, new Highlight(...ranges));
      else registry.delete(`hf-${verdict}`);
    }
  }

  #hit(x: number, y: number): HighlightEntry | undefined {
    for (const entry of this.#entries) {
      if (entry.range.collapsed) continue;
      for (const r of Array.from(entry.range.getClientRects())) {
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return entry;
      }
    }
    return undefined;
  }

  readonly #onClick = (e: MouseEvent): void => {
    if (!this.#entries.length || e.button !== 0) return;
    if (this.#doc.getSelection()?.toString()) return; // the user is selecting text, not clicking a claim
    const hit = this.#hit(e.clientX, e.clientY);
    if (!hit) return;
    const r = Array.from(hit.range.getClientRects()).find((rect) => e.clientY >= rect.top && e.clientY <= rect.bottom);
    hit.overlay.openPanel(hit.claimId, { x: r?.left ?? e.clientX, y: r?.bottom ?? e.clientY });
  };

  readonly #onMove = (e: MouseEvent): void => {
    if (!this.#entries.length || this.#hoverFrame) return;
    const x = e.clientX;
    const y = e.clientY;
    this.#hoverFrame = (this.#doc.defaultView ?? window).requestAnimationFrame(() => {
      this.#hoverFrame = 0;
      const over = !!this.#hit(x, y);
      if (over === this.#hovering) return;
      this.#hovering = over;
      this.#doc.documentElement.style.cursor = over ? 'pointer' : '';
    });
  };
}

const nativeRegistries = new WeakMap<Document, NativeHighlights>();
function nativeFor(doc: Document): NativeHighlights {
  let reg = nativeRegistries.get(doc);
  if (!reg) nativeRegistries.set(doc, (reg = new NativeHighlights(doc)));
  return reg;
}

/* ------------------------------------------------------------------ */
/* Shared layer: evidence panel + fallback boxes                       */
/* ------------------------------------------------------------------ */

/** One shared, page-wide layer for the evidence panel and (fallback) highlight boxes. */
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
    this.root.appendChild(el(doc, 'style', undefined, OVERLAY_CSS));
    this.marks = el(doc, 'div');
    this.root.appendChild(this.marks);
    doc.body.appendChild(this.host);
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closePanel();
    });
    // Close the panel when clicking anywhere outside it (clicks inside the shadow root retarget to the host).
    doc.addEventListener('pointerdown', (e) => {
      if (this.panel && !e.composedPath().includes(this.panel)) this.closePanel();
    });
  }

  closePanel(): void {
    this.panel?.remove();
    this.panel = undefined;
  }
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Collapse the many rects a Range reports (one per text node and inline
 * element; live ChatGPT splits text into lots of small spans) into one box
 * per visual line. Used by the fallback renderer.
 */
export function mergeLineRects(rects: Box[]): Box[] {
  const lines: Box[] = [];
  for (const r of rects.filter((x) => x.right - x.left > 0 && x.bottom - x.top > 0).sort((a, b) => a.top - b.top || a.left - b.left)) {
    const line = lines.find((l) => Math.min(l.bottom, r.bottom) - Math.max(l.top, r.top) > 0.5 * Math.min(l.bottom - l.top, r.bottom - r.top));
    if (line) {
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
    } else {
      lines.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
  }
  return lines;
}

const layers = new WeakMap<Document, HighlightLayer>();
function layerFor(doc: Document): HighlightLayer {
  let layer = layers.get(doc);
  if (!layer || !layer.host.isConnected) {
    layer = new HighlightLayer(doc);
    layers.set(doc, layer);
  }
  layer.host.dataset.theme = pageIsDark(doc) ? 'dark' : 'light';
  return layer;
}

/* ------------------------------------------------------------------ */
/* Per-answer overlay                                                  */
/* ------------------------------------------------------------------ */

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
  readonly #native: boolean;
  #result: VerifyOutput | undefined;
  #map: TextMap | undefined;
  #markEls: HTMLElement[] = [];
  #frame = 0;
  #listening = false;
  readonly #onViewportChange = () => this.#scheduleReposition();

  constructor(opts: AnswerOverlayOptions) {
    this.#opts = opts;
    this.#doc = opts.content.ownerDocument;
    this.#native = supportsNativeHighlights(this.#doc);
    this.host = this.#doc.createElement('div');
    this.host.setAttribute('data-hf-ui', 'summary');
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.appendChild(el(this.#doc, 'style', undefined, OVERLAY_CSS));
    this.#bar = el(this.#doc, 'div', 'bar');
    this.root.appendChild(this.#bar);
    opts.content.after(this.host);
    this.#applyTheme();
  }

  get content(): HTMLElement {
    return this.#opts.content;
  }

  /** Re-attach the bar if the page re-rendered and dropped it. */
  ensureAttached(): void {
    if (!this.host.isConnected && this.#opts.content.isConnected) this.#opts.content.after(this.host);
  }

  #applyTheme(): void {
    this.host.dataset.theme = pageIsDark(this.#doc) ? 'dark' : 'light';
  }

  #head(...extra: Node[]): HTMLElement {
    const doc = this.#doc;
    const head = el(doc, 'div', 'head');
    const logo = el(doc, 'span', 'logo');
    logo.append(icon(doc, 'shield', 13));
    const brand = el(doc, 'span', 'brand');
    brand.append(logo, 'Hallucination Firewall');
    head.append(brand, ...extra);
    return head;
  }

  #button(label: string, iconName: IconName | undefined, run: () => void, className?: string): HTMLButtonElement {
    const btn = el(this.#doc, 'button', className);
    btn.type = 'button';
    if (iconName) btn.append(icon(this.#doc, iconName, 13));
    btn.append(label);
    btn.addEventListener('click', run);
    return btn;
  }

  showStatus(text: string, action?: { label: string; run: () => void }): void {
    this.#clearHighlights();
    this.#applyTheme();
    const busy = /checking/i.test(text) && !action;
    this.#bar.className = busy ? 'bar busy' : 'bar';
    this.#bar.replaceChildren();
    const extra: Node[] = [el(this.#doc, 'span', 'status', text), el(this.#doc, 'span', 'spacer')];
    if (action) extra.push(this.#button(action.label, undefined, action.run));
    this.#bar.append(this.#head(...extra));
    if (busy) {
      // Same height as the finished bar (meter + chip row), so results replace it without shifting the page.
      const row = el(this.#doc, 'div', 'skeleton-row');
      for (let i = 0; i < 3; i++) row.append(el(this.#doc, 'span', 'skeleton chip-ph'));
      this.#bar.append(el(this.#doc, 'div', 'skeleton meter-ph'), row);
    }
  }

  showConsentRequired(): void {
    this.showStatus(
      'Off until you review and accept the privacy notice. Nothing has been sent anywhere.',
      this.#opts.onOpenOptions ? { label: 'Open settings', run: this.#opts.onOpenOptions } : undefined,
    );
  }

  /** Render a verification result. `answerText` must be the exact text the spans refer to. */
  render(result: VerifyOutput, answerText: string, warnings: string[] = []): void {
    this.#result = result;
    this.#applyTheme();
    const map = extractText(this.#opts.content);
    // Only draw highlights if the DOM text still matches what was verified.
    this.#map = map.text === answerText ? map : undefined;
    this.#renderBar(warnings);
    this.#drawHighlights();
  }

  #renderBar(warnings: string[]): void {
    const doc = this.#doc;
    const result = this.#result!;
    const s = result.summary;
    this.#bar.className = 'bar';
    this.#bar.replaceChildren();

    const details = el(doc, 'ul', 'details');
    details.hidden = true;
    const toggle = this.#button(details.hidden ? 'Details' : 'Hide details', 'chevron', () => {
      details.hidden = !details.hidden;
      toggle.lastChild!.textContent = details.hidden ? 'Details' : 'Hide details';
      toggle.setAttribute('aria-expanded', String(!details.hidden));
    }, 'ghost');
    toggle.setAttribute('aria-expanded', String(!details.hidden));
    const buttons: Node[] = [el(doc, 'span', 'spacer'), toggle];
    if (this.#opts.onRecheck) buttons.push(this.#button('Re-check', 'refresh', this.#opts.onRecheck, 'ghost'));
    this.#bar.append(this.#head(...buttons));

    // Proportional verdict meter.
    if (s.checked > 0) {
      const meter = el(doc, 'div', 'meter');
      meter.setAttribute('aria-hidden', 'true');
      for (const v of ['supported', 'contradicted', 'unverifiable'] as const) {
        if (!s[v]) continue;
        const seg = el(doc, 'i', v);
        seg.style.flex = String(s[v]);
        meter.append(seg);
      }
      this.#bar.append(meter);
    }

    const row = el(doc, 'div', 'row');
    row.setAttribute('aria-label', s.text);
    for (const v of ['supported', 'contradicted', 'unverifiable'] as const) {
      const chip = el(doc, 'span', `chip ${v}`);
      chip.append(icon(doc, VERDICT_ICON[v], 11), `${s[v]} ${v}`);
      row.append(chip);
    }
    row.append(el(doc, 'span', 'chip checked', `${s.checked} checked`));
    this.#bar.append(row);

    for (const v of result.verdicts) {
      const li = el(doc, 'li');
      li.dataset.claimId = v.claimId;
      const btn = el(doc, 'button', 'claim', v.claim);
      btn.type = 'button';
      btn.addEventListener('click', () => this.openPanel(v.claimId));
      const chip = el(doc, 'span', `chip ${v.verdict}`);
      chip.append(icon(doc, VERDICT_ICON[v.verdict], 11), VERDICT_LABEL[v.verdict]);
      li.append(chip, btn);
      details.append(li);
    }
    if (s.checked === 0) details.append(el(doc, 'li', undefined, 'No checkable factual claims were found in this answer.'));
    this.#bar.append(details);

    for (const w of [...new Set(warnings.map(friendlyWarning))]) {
      const note = el(doc, 'div', 'note');
      note.append(icon(doc, 'alert', 13), el(doc, 'span', undefined, w));
      this.#bar.append(note);
    }
  }

  /** Flagged claims and their live DOM ranges. */
  #flaggedRanges(): Array<{ claimId: string; verdict: Flagged; range: Range }> {
    const result = this.#result;
    const map = this.#map;
    if (!result || !map) return [];
    const out: Array<{ claimId: string; verdict: Flagged; range: Range }> = [];
    for (const v of result.verdicts) {
      if (v.verdict === 'supported') continue; // only flagged claims are highlighted inline
      const claim = result.claims.find((c) => c.id === v.claimId);
      if (!claim) continue;
      const range = rangeForSpan(map, claim.span.start, claim.span.end, this.#doc);
      if (range) out.push({ claimId: v.claimId, verdict: v.verdict, range });
    }
    return out;
  }

  #clearHighlights(): void {
    if (this.#native) nativeFor(this.#doc).clear(this);
    for (const m of this.#markEls) m.remove();
    this.#markEls = [];
  }

  #drawHighlights(): void {
    if (!this.#opts.content.isConnected) return this.destroy();
    if (this.#native) {
      // The browser keeps these attached to the text: nothing to recompute on scroll.
      nativeFor(this.#doc).set(this, this.#flaggedRanges());
      return;
    }
    this.#drawBoxes();
    if (!this.#listening) {
      this.#listening = true;
      this.#doc.defaultView?.addEventListener('scroll', this.#onViewportChange, { capture: true, passive: true });
      this.#doc.defaultView?.addEventListener('resize', this.#onViewportChange, { passive: true });
    }
  }

  /** Fallback: positioned boxes in the shared layer, reusing existing elements to avoid churn. */
  #drawBoxes(): void {
    const ranges = this.#flaggedRanges();
    if (!ranges.length && !this.#markEls.length) return;
    const layer = layerFor(this.#doc);
    const win = this.#doc.defaultView;
    const sx = win?.scrollX ?? 0;
    const sy = win?.scrollY ?? 0;
    let used = 0;
    for (const { claimId, verdict, range } of ranges) {
      if (typeof range.getClientRects !== 'function') continue; // e.g. non-layout DOMs
      for (const rect of mergeLineRects(Array.from(range.getClientRects()))) {
        let mark = this.#markEls[used];
        if (!mark) {
          mark = el(this.#doc, 'div');
          mark.addEventListener('click', (e) => {
            e.stopPropagation();
            const r = mark!.getBoundingClientRect();
            this.openPanel(mark!.dataset.claimId!, { x: r.left, y: r.bottom });
          });
          layer.marks.append(mark);
          this.#markEls.push(mark);
        }
        mark.className = `mark ${verdict}`;
        mark.dataset.claimId = claimId;
        mark.title = `${VERDICT_LABEL[verdict]}: click for evidence`;
        mark.style.transform = `translate(${rect.left + sx}px, ${rect.top + sy}px)`;
        mark.style.width = `${rect.right - rect.left}px`;
        mark.style.height = `${rect.bottom - rect.top}px`;
        used++;
      }
    }
    for (const extra of this.#markEls.splice(used)) extra.remove();
  }

  #scheduleReposition(): void {
    if (this.#frame || !this.#result) return;
    const raf = this.#doc.defaultView?.requestAnimationFrame ?? ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number);
    this.#frame = raf(() => {
      this.#frame = 0;
      if (!this.#opts.content.isConnected) return this.destroy();
      this.#drawBoxes();
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
    const panel = el(doc, 'div', `panel ${v.verdict}`);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', `Evidence for claim: ${v.claim}`);
    panel.dataset.claimId = claimId;

    const close = el(doc, 'button', 'close ghost');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.append(icon(doc, 'cross', 14));
    close.addEventListener('click', () => layer.closePanel());

    const h = el(doc, 'h3');
    const chip = el(doc, 'span', `chip ${v.verdict}`);
    chip.append(icon(doc, VERDICT_ICON[v.verdict], 11), VERDICT_LABEL[v.verdict]);
    const conf = el(doc, 'span', 'conf');
    const track = el(doc, 'span', 'track');
    const fill = el(doc, 'span', 'fill');
    fill.style.width = `${Math.round(v.confidence * 100)}%`;
    track.append(fill);
    conf.append(track, `confidence ${Math.round(v.confidence * 100)}%`);
    h.append(chip, conf);
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
          const a = el(doc, 'a', 'source');
          a.href = href;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.title = hostOf(href) ?? href;
          a.append(sourceTitle, icon(doc, 'external', 11));
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
    const x = Math.max(12, Math.min(at?.x ?? vw / 2 - 220, vw - 452));
    const y = at ? (at.y + 8 > vh * 0.55 ? Math.max(12, at.y - 8 - Math.min(vh * 0.7, 420)) : at.y + 8) : 80;
    Object.assign(panel.style, { left: `${x}px`, top: `${y}px` });
    layer.root.append(panel);
    layer.panel = panel;
    close.focus({ preventScroll: true });
    return panel;
  }

  destroy(): void {
    this.#clearHighlights();
    this.host.remove();
    if (this.#listening) {
      this.#doc.defaultView?.removeEventListener('scroll', this.#onViewportChange, { capture: true });
      this.#doc.defaultView?.removeEventListener('resize', this.#onViewportChange);
    }
  }
}
