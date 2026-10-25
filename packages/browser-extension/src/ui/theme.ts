/**
 * Shared look for the in-page overlay (Shadow DOM). The CSS is written with Tailwind in
 * styles/overlay.css (tokens from DESIGN.md) and compiled into overlay.generated.ts by
 * `pnpm build:css`. The overlay follows the host page's theme (ChatGPT light/dark).
 */
import OVERLAY_CSS from './overlay.generated.js';

export { OVERLAY_CSS };

/**
 * Page-level stylesheet for native text highlights. Applied through
 * `adoptedStyleSheets`, which page CSP rules for inline <style> do not block.
 * Colours are the verdict colours from DESIGN.md.
 */
export const HIGHLIGHT_CSS = `
::highlight(hf-contradicted) { background-color: rgba(235, 87, 87, .18); text-decoration: underline wavy #e5484d; text-decoration-thickness: 1.5px; text-underline-offset: 3px; }
::highlight(hf-unverifiable) { text-decoration: underline dashed rgba(242, 153, 74, .95); text-decoration-thickness: 1.5px; text-underline-offset: 3px; }
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
  const slow = /^([\w-]+): [\w-]+ did not answer within (\d+) seconds\.?$/i.exec(warning);
  if (slow) return `${SOURCE_NAMES[slow[1]!] ?? slow[1]} was too slow (no answer within ${slow[2]}s), so results were shown without it.`;
  return warning;
}

const SOURCE_NAMES: Record<string, string> = {
  wikipedia: 'Wikipedia', wikidata: 'Wikidata', 'europe-pmc': 'Europe PMC', 'world-bank': 'World Bank', 'gov-uk': 'GOV.UK',
  'google-fact-check': 'Google Fact Check', tavily: 'Tavily', urls: 'Trusted URLs', 'web-search': 'Brave Search',
};

export const OFFLINE_JUDGE_PREFIX = 'Using the offline heuristic judge';

/**
 * Group raw warnings for display: one plain-language note per source (a busy
 * source otherwise repeats once per claim), and pull out the offline-judge
 * notice so it can be shown as a quiet label rather than as a result.
 */
export function summarizeWarnings(warnings: string[]): { notes: string[]; offlineJudge: string | undefined } {
  const bySource = new Map<string, string>();
  let offlineJudge: string | undefined;
  for (const w of warnings) {
    if (w.startsWith(OFFLINE_JUDGE_PREFIX)) {
      offlineJudge = w;
      continue;
    }
    const source = /^([\w-]+): /.exec(w)?.[1] ?? w;
    if (!bySource.has(source)) bySource.set(source, friendlyWarning(w));
  }
  return { notes: [...bySource.values()], offlineJudge };
}
