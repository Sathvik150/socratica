/**
 * Shared look for the in-page overlay (Shadow DOM). The CSS lives in styles/overlay.css and is
 * compiled by `pnpm build:css` (Tailwind CLI) into overlay.generated.ts, with the same Socratica
 * tokens as the extension pages (see DESIGN.md). The overlay follows the host page's theme
 * (ChatGPT light/dark), not just the OS setting.
 */
import OVERLAY_CSS from './overlay.generated.js';

export { OVERLAY_CSS };

/**
 * Page-level stylesheet for native text highlights. Applied through
 * `adoptedStyleSheets`, which page CSP rules for inline <style> do not block.
 */
export const HIGHLIGHT_CSS = `
::highlight(socratica-contradicted) { background-color: rgba(192, 80, 63, .16); text-decoration: underline wavy #b4483a; text-decoration-thickness: 1.5px; text-underline-offset: 3px; }
::highlight(socratica-unverifiable) { text-decoration: underline dashed rgba(178, 132, 46, .95); text-decoration-thickness: 1.5px; text-underline-offset: 3px; }
`;

/** The bundled display serif (Garogier by Rogier van Dalen, GPL-2.0-or-later; see static/fonts). */
export const SERIF_FAMILY = 'Socratica Garogier';

/**
 * Make the bundled serif available to the overlay inside the host page. Built from bytes rather
 * than a url(), so the page's CSP font rules don't apply; on any failure the overlay simply uses
 * the fallback serif stack.
 */
export async function loadSerifFont(doc: Document, url: string, fetchFn: typeof fetch = fetch): Promise<void> {
  try {
    const FontFaceCtor = doc.defaultView?.FontFace;
    if (!FontFaceCtor || !doc.fonts || Array.from(doc.fonts).some((f) => f.family.replace(/["']/g, '') === SERIF_FAMILY)) return;
    const face = new FontFaceCtor(SERIF_FAMILY, await (await fetchFn(url)).arrayBuffer());
    doc.fonts.add(await face.load());
  } catch {
    // Fallback fonts are fine.
  }
}

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

export { icon, type IconName } from './icons.js';

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
  if (failed?.[2] === '402') return `${failed[1]} has used up its free allowance for now (HTTP 402). Add a free API key in Settings for more, or try again tomorrow.`;
  if (failed) return `${failed[1]} could not be reached (HTTP ${failed[2]}). Other enabled sources were still used.`;
  const timeout = /^[\w-]+: (.+?) request failed or timed out\.?$/i.exec(warning);
  if (timeout) return `${timeout[1]} did not respond in time. Other enabled sources were still used.`;
  const slow = /^([\w-]+): [\w-]+ did not answer within (\d+) seconds\.?$/i.exec(warning);
  if (slow) return `${SOURCE_NAMES[slow[1]!] ?? slow[1]} was too slow (no answer within ${slow[2]}s), so results were shown without it.`;
  return warning;
}

const SOURCE_NAMES: Record<string, string> = {
  wikipedia: 'Wikipedia', wikidata: 'Wikidata', 'europe-pmc': 'Europe PMC', 'world-bank': 'World Bank', 'gov-uk': 'GOV.UK',
  'google-fact-check': 'Google Fact Check', urls: 'Trusted URLs',
  firecrawl: 'Firecrawl', serper: 'Google (via Serper)', brave: 'Brave Search',
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
