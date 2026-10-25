/**
 * Shared look for the in-page overlay (Shadow DOM). Same tokens as static/theme.css.
 * The overlay follows the host page's theme (ChatGPT light/dark), not just the OS setting.
 */
export const OVERLAY_CSS = `
:host {
  all: initial;
  --hf-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --hf-surface: #ffffff; --hf-surface-2: #f4f5f9; --hf-fg: #0f172a; --hf-muted: #5b6475; --hf-border: #e4e6ef;
  --hf-brand-1: #6366f1; --hf-brand-2: #a855f7; --hf-brand: linear-gradient(135deg, var(--hf-brand-1), var(--hf-brand-2));
  --hf-ok: #047857;  --hf-ok-bg: #ecfdf5;  --hf-ok-border: #a7f3d0;
  --hf-bad: #be123c; --hf-bad-bg: #fff1f2; --hf-bad-border: #fecdd3;
  --hf-unk: #92400e; --hf-unk-bg: #fffbeb; --hf-unk-border: #fde68a;
  --hf-shadow: 0 1px 2px rgba(15, 23, 42, .05), 0 16px 40px -20px rgba(15, 23, 42, .35);
  --hf-ease: cubic-bezier(.2, .8, .2, 1);
}
:host([data-theme="dark"]) {
  --hf-surface: #171a24; --hf-surface-2: #1e2230; --hf-fg: #e7e9f1; --hf-muted: #9aa3b5; --hf-border: #2a3042;
  --hf-ok: #34d399;  --hf-ok-bg: rgba(16, 185, 129, .13); --hf-ok-border: rgba(52, 211, 153, .32);
  --hf-bad: #fb7185; --hf-bad-bg: rgba(244, 63, 94, .13);  --hf-bad-border: rgba(251, 113, 133, .32);
  --hf-unk: #fbbf24; --hf-unk-bg: rgba(245, 158, 11, .12); --hf-unk-border: rgba(251, 191, 36, .28);
  --hf-shadow: 0 1px 2px rgba(0, 0, 0, .35), 0 18px 44px -18px rgba(0, 0, 0, .8);
}
* { box-sizing: border-box; font-family: var(--hf-font); }
[hidden] { display: none !important; }
svg { flex: none; }

/* ---------- Summary bar ---------- */
.bar {
  position: relative; margin: 10px 0 6px; padding: 10px 12px; border-radius: 14px; font-size: 13px; line-height: 1.45;
  background: var(--hf-surface); color: var(--hf-fg); border: 1px solid var(--hf-border); box-shadow: var(--hf-shadow);
  animation: hf-rise .28s var(--hf-ease) both;
}
.bar.busy::before {
  content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1px; pointer-events: none;
  background: conic-gradient(from var(--hf-angle, 0deg), transparent 0 70%, var(--hf-brand-1), var(--hf-brand-2), transparent);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
  animation: hf-spin 2.4s linear infinite;
}
.head { display: flex; align-items: center; gap: 8px; }
.brand { display: inline-flex; align-items: center; gap: 7px; font-weight: 650; letter-spacing: -.01em; }
.logo { width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; background: var(--hf-brand); color: #fff; box-shadow: 0 4px 10px -4px rgba(99, 102, 241, .8); }
.spacer { flex: 1; }
.status { color: var(--hf-muted); }
.skeleton { border-radius: 999px; background: linear-gradient(90deg, var(--hf-surface-2) 25%, var(--hf-border) 50%, var(--hf-surface-2) 75%); background-size: 200% 100%; animation: hf-shimmer 1.2s linear infinite; }
.skeleton.meter-ph { height: 6px; margin: 10px 0 8px; }
.skeleton-row { display: flex; gap: 6px; }
.skeleton.chip-ph { width: 92px; height: 22px; }
.meter { display: flex; gap: 2px; height: 6px; margin: 10px 0 8px; border-radius: 999px; overflow: hidden; background: var(--hf-surface-2); }
.meter i { display: block; height: 100%; transform-origin: left; animation: hf-grow .5s var(--hf-ease) both; }
.meter .supported { background: var(--hf-ok); } .meter .contradicted { background: var(--hf-bad); } .meter .unverifiable { background: var(--hf-unk); }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; border: 1px solid transparent; }
.chip.supported { background: var(--hf-ok-bg); color: var(--hf-ok); border-color: var(--hf-ok-border); }
.chip.contradicted { background: var(--hf-bad-bg); color: var(--hf-bad); border-color: var(--hf-bad-border); }
.chip.unverifiable { background: var(--hf-unk-bg); color: var(--hf-unk); border-color: var(--hf-unk-border); }
.chip.checked { background: transparent; color: var(--hf-muted); font-weight: 500; padding-left: 2px; }
button {
  display: inline-flex; align-items: center; gap: 5px; font: inherit; font-size: 12px; font-weight: 550; cursor: pointer;
  border: 1px solid var(--hf-border); background: var(--hf-surface); color: var(--hf-fg); border-radius: 9px; padding: 4px 9px;
  transition: border-color .15s, background .15s, transform .12s var(--hf-ease);
}
button:hover { border-color: var(--hf-brand-1); background: var(--hf-surface-2); }
button:active { transform: translateY(1px); }
button:focus-visible { outline: 2px solid var(--hf-brand-1); outline-offset: 2px; }
button.ghost { border-color: transparent; background: transparent; }
button.ghost:hover { background: var(--hf-surface-2); border-color: var(--hf-border); }
ul.details { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 2px; }
ul.details li { display: flex; gap: 8px; align-items: baseline; padding: 6px 4px; border-top: 1px solid var(--hf-border); }
ul.details li button.claim { border: none; background: none; text-align: left; padding: 0; color: var(--hf-fg); font-size: 12.5px; font-weight: 450; text-decoration: underline; text-decoration-color: var(--hf-border); text-underline-offset: 3px; }
ul.details li button.claim:hover { text-decoration-color: var(--hf-brand-1); background: none; }
.note { display: flex; gap: 6px; align-items: flex-start; margin-top: 8px; padding: 6px 9px; border-radius: 9px; font-size: 12px; background: var(--hf-unk-bg); color: var(--hf-fg); border: 1px solid var(--hf-unk-border); }
.note svg { color: var(--hf-unk); margin-top: 1px; }

/* ---------- Fallback highlight boxes (browsers without the CSS Custom Highlight API) ---------- */
.mark { position: absolute; left: 0; top: 0; will-change: transform; pointer-events: auto; cursor: pointer; border-radius: 3px; }
.mark.contradicted { background: rgba(244, 63, 94, .16); box-shadow: inset 0 -2px 0 #e11d48; }
.mark.unverifiable { box-shadow: inset 0 -2px 0 rgba(245, 158, 11, .9); }

/* ---------- Evidence panel ---------- */
.panel {
  position: fixed; z-index: 2; pointer-events: auto; width: min(440px, calc(100vw - 24px)); max-height: min(70vh, 560px); overflow: auto;
  background: var(--hf-surface); color: var(--hf-fg); border: 1px solid var(--hf-border); border-radius: 16px; box-shadow: var(--hf-shadow), 0 0 0 1px rgba(99, 102, 241, .06);
  padding: 14px 16px 16px; font-size: 13px; line-height: 1.5; animation: hf-pop .16s var(--hf-ease) both; overscroll-behavior: contain;
}
.panel::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 3px; border-radius: 16px 16px 0 0; background: var(--accent, var(--hf-brand)); }
.panel.contradicted { --accent: var(--hf-bad); } .panel.supported { --accent: var(--hf-ok); } .panel.unverifiable { --accent: var(--hf-unk); }
.panel h3 { margin: 2px 0 8px; font-size: 13px; display: flex; align-items: center; gap: 10px; }
.conf { display: inline-flex; align-items: center; gap: 6px; color: var(--hf-muted); font-weight: 500; font-size: 12px; }
.conf .track { width: 64px; height: 5px; border-radius: 999px; background: var(--hf-surface-2); overflow: hidden; }
.conf .fill { display: block; height: 100%; border-radius: inherit; background: var(--accent, var(--hf-brand)); }
.panel .claim { font-size: 14px; font-weight: 550; margin: 4px 0 10px; letter-spacing: -.005em; }
.panel .label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--hf-muted); margin: 12px 0 5px; }
.panel blockquote { margin: 0 0 8px; padding: 9px 11px; border-radius: 0 10px 10px 0; border-left: 3px solid var(--accent, var(--hf-brand-1)); background: var(--hf-surface-2); }
.panel .quote { font-size: 13px; }
.panel .source { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; font-size: 11.5px; font-weight: 550; color: var(--hf-brand-1); text-decoration: none; }
.panel a.source:hover { text-decoration: underline; }
:host([data-theme="dark"]) .panel .source { color: #a5b4fc; }
.panel span.source { color: var(--hf-muted); }
.panel .correction { padding: 9px 11px; border-radius: 10px; background: var(--hf-ok-bg); border: 1px solid var(--hf-ok-border); font-weight: 550; }
.panel .close { position: absolute; top: 10px; right: 10px; width: 28px; height: 28px; padding: 0; justify-content: center; border-radius: 8px; }

@keyframes hf-rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes hf-pop { from { opacity: 0; transform: translateY(4px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes hf-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes hf-shimmer { to { background-position: -200% 0; } }
@property --hf-angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
@keyframes hf-spin { to { --hf-angle: 360deg; } }
@media (prefers-reduced-motion: reduce) { *, *::before { animation: none !important; transition: none !important; } }
`;

/**
 * Page-level stylesheet for native text highlights. Applied through
 * `adoptedStyleSheets`, which page CSP rules for inline <style> do not block.
 */
export const HIGHLIGHT_CSS = `
::highlight(hf-contradicted) { background-color: rgba(244, 63, 94, .18); text-decoration: underline wavy #e11d48; text-decoration-thickness: 1.5px; text-underline-offset: 3px; }
::highlight(hf-unverifiable) { text-decoration: underline dashed rgba(217, 119, 6, .95); text-decoration-thickness: 1.5px; text-underline-offset: 3px; }
`;

/** True when the host page currently renders dark (ChatGPT uses `html.dark` and/or `color-scheme`). */
export function pageIsDark(doc: Document): boolean {
  const html = doc.documentElement;
  if (html.classList.contains('dark')) return true;
  if (html.classList.contains('light')) return false;
  const win = doc.defaultView;
  const scheme = win?.getComputedStyle(html).colorScheme ?? '';
  if (scheme.trim() === 'dark') return true;
  const bg = luminance(win?.getComputedStyle(doc.body).backgroundColor ?? '');
  if (bg !== undefined) return bg < 0.4;
  return win?.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function luminance(color: string): number | undefined {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(color);
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return undefined; // transparent: unknown
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => Number(v) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const ICONS = {
  shield: 'M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3zm-1.2 13.2-3.5-3.5 1.4-1.4 2.1 2.1 4.6-4.6 1.4 1.4-6 6z',
  check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z',
  cross: 'M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3 1.4 1.4z',
  question: 'M11 18h2v-2h-2v2zm1-16a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm0-14a4 4 0 0 0-4 4h2a2 2 0 1 1 4 0c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5a4 4 0 0 0-4-4z',
  refresh: 'M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  chevron: 'M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z',
  external: 'M14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3h-7zM19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7z',
  alert: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
} as const;
export type IconName = keyof typeof ICONS;

/** Inline SVG icon built with DOM APIs (no innerHTML). */
export function icon(doc: Document, name: IconName, size = 14): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'currentColor');
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

/**
 * Turn provider warnings into short, plain-language notes. Rate limits (HTTP 429)
 * are the common case: say which source is busy, for how long, and that the
 * other sources were still used.
 */
export function friendlyWarning(warning: string): string {
  const busy = /^[\w-]+: (.+?) is temporarily unavailable \(HTTP (\d+)\); try again in (\d+) seconds?\.?$/i.exec(warning);
  if (busy) {
    const [, source, status, secs] = busy;
    return status === '429'
      ? `${source} is rate-limiting requests right now (try again in ${secs}s). Other enabled sources were still used.`
      : `${source} is temporarily unavailable (HTTP ${status}; try again in ${secs}s). Other enabled sources were still used.`;
  }
  const failed = /^[\w-]+: (.+?) request failed with HTTP (\d+)\.?$/i.exec(warning);
  if (failed) return `${failed[1]} could not be reached (HTTP ${failed[2]}). Other enabled sources were still used.`;
  const timeout = /^[\w-]+: (.+?) request failed or timed out\.?$/i.exec(warning);
  if (timeout) return `${timeout[1]} did not respond in time. Other enabled sources were still used.`;
  return warning;
}
