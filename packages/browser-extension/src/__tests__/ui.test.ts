import { afterEach, describe, expect, it } from 'vitest';
import { MockLLM, runVerification } from '@hallucination-firewall/core';
import { AnswerOverlay, supportsNativeHighlights } from '../overlay.js';
import { friendlyWarning, pageIsDark, summarizeWarnings } from '../ui/theme.js';
import { extractText } from '../textMap.js';

describe('friendlyWarning', () => {
  it('explains rate limits in plain language and keeps the retry time', () => {
    expect(friendlyWarning('wikipedia: Wikipedia is temporarily unavailable (HTTP 429); try again in 29 seconds.')).toBe(
      'Wikipedia is rate-limiting requests right now (try again in 29s). Other enabled sources were still used.',
    );
  });
  it('handles other temporary outages, HTTP failures and timeouts', () => {
    expect(friendlyWarning('wikidata: Wikidata is temporarily unavailable (HTTP 503); try again in 10 seconds.')).toContain('temporarily unavailable (HTTP 503');
    expect(friendlyWarning('gov-uk: GOV.UK request failed with HTTP 500.')).toBe('GOV.UK could not be reached (HTTP 500). Other enabled sources were still used.');
    expect(friendlyWarning('europe-pmc: Europe PMC request failed or timed out.')).toBe('Europe PMC did not respond in time. Other enabled sources were still used.');
  });
  it('leaves other messages unchanged', () => {
    expect(friendlyWarning('Wikipedia is enabled but its permission was not granted.')).toBe('Wikipedia is enabled but its permission was not granted.');
  });
});

describe('pageIsDark', () => {
  afterEach(() => document.documentElement.classList.remove('dark', 'light'));
  it('follows ChatGPT-style html.dark / html.light classes', () => {
    document.documentElement.classList.add('dark');
    expect(pageIsDark(document)).toBe(true);
    document.documentElement.classList.replace('dark', 'light');
    expect(pageIsDark(document)).toBe(false);
  });
});

describe('native text highlights (CSS Custom Highlight API)', () => {
  const win = window as unknown as { CSS?: { highlights?: Map<string, { ranges: Range[] }> }; Highlight?: unknown };
  const original = { CSS: win.CSS, Highlight: win.Highlight };
  afterEach(() => Object.assign(win, original));

  it('registers flagged claims as named highlights without adding DOM, and clears them on destroy', async () => {
    const registry = new Map<string, { ranges: Range[] }>();
    win.CSS = { ...(win.CSS ?? {}), highlights: registry };
    win.Highlight = class { ranges: Range[]; constructor(...r: Range[]) { this.ranges = r; } };
    expect(supportsNativeHighlights(document)).toBe(true);

    document.body.innerHTML = '<div class="markdown"><p>The Pell Tower is 190 meters tall. It has a rooftop garden designed by Ilsa Varn.</p></div>';
    const content = document.querySelector<HTMLElement>('.markdown')!;
    const text = extractText(content).text; // what the watcher hands to the overlay
    const result = await runVerification({
      answer: text,
      documents: [{ title: 'Pell Tower', text: 'The Pell Tower is 212 meters tall.' }],
      llm: new MockLLM(),
    });
    const overlay = new AnswerOverlay({ content });
    overlay.render(result, text);

    expect(registry.get('hf-contradicted')?.ranges.map((r) => r.toString())).toEqual(['The Pell Tower is 190 meters tall.']);
    expect(registry.get('hf-unverifiable')?.ranges.map((r) => r.toString())).toEqual(['It has a rooftop garden designed by Ilsa Varn.']);
    expect(document.querySelector('[data-hf-ui="layer"]')).toBeNull(); // no positioned boxes were created
    expect(content.querySelector('[data-hf-ui]')).toBeNull(); // the page's own DOM is untouched

    overlay.destroy();
    expect(registry.has('hf-contradicted')).toBe(false);
    expect(registry.has('hf-unverifiable')).toBe(false);
  });

  it('shows rate-limit warnings as plain-language notes', async () => {
    document.body.innerHTML = '<div class="markdown"><p>The Pell Tower is 190 meters tall.</p></div>';
    const content = document.querySelector<HTMLElement>('.markdown')!;
    const result = await runVerification({ answer: content.textContent!, llm: new MockLLM() });
    const overlay = new AnswerOverlay({ content });
    overlay.render(result, content.textContent!, [
      'wikipedia: Wikipedia is temporarily unavailable (HTTP 429); try again in 29 seconds.',
      'wikipedia: Wikipedia is temporarily unavailable (HTTP 429); try again in 29 seconds.',
    ]);
    const notes = [...overlay.root.querySelectorAll('.note')].map((n) => n.textContent);
    expect(notes).toEqual(['Wikipedia is rate-limiting requests right now (try again in 29s). Other enabled sources were still used.']);
  });
});

describe('summarizeWarnings', () => {
  it('keeps one note per source and separates the offline-judge notice', () => {
    const out = summarizeWarnings([
      'Using the offline heuristic judge: verdicts come from matching.',
      'wikipedia: Wikipedia is temporarily unavailable (HTTP 429); try again in 29 seconds.',
      'wikipedia: Wikipedia is temporarily unavailable (HTTP 429); try again in 12 seconds.',
      'wikidata: wikidata did not answer within 10 seconds.',
    ]);
    expect(out.offlineJudge).toMatch(/^Using the offline heuristic judge/);
    expect(out.notes).toEqual([
      'Wikipedia is rate-limiting requests right now (try again in 29s). Other enabled sources were still used.',
      'Wikidata was too slow (no answer within 10s), so results were shown without it.',
    ]);
  });
});

describe('summary bar details toggle', () => {
  const judgeNote = 'Using the offline heuristic judge: verdicts come from matching.';
  async function setup(warnings: string[] = []) {
    document.body.innerHTML = '<div class="markdown"><p>The Pell Tower is 190 meters tall.</p></div>';
    const content = document.querySelector<HTMLElement>('.markdown')!;
    const text = extractText(content).text; // what the watcher hands to the overlay
    const result = await runVerification({ answer: text, documents: [{ title: 'P', text: 'The Pell Tower is 212 meters tall.' }], llm: new MockLLM() });
    const overlay = new AnswerOverlay({ content, onRecheck: () => {} });
    overlay.render(result, text, warnings);
    return overlay;
  }

  it('starts collapsed (no layout jump under the answer) and the stylesheet honours [hidden]', async () => {
    const overlay = await setup();
    const more = overlay.root.querySelector<HTMLElement>('.more')!;
    expect(more.hidden).toBe(true);
    expect(more.querySelector('ul.details li')).not.toBeNull();
    expect(overlay.root.querySelector('style')!.textContent).toContain('[hidden]{display:none!important}');
    const toggle = overlay.root.querySelector<HTMLButtonElement>('button.more-toggle')!;
    toggle.click();
    expect(more.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('Hide details');
  });

  it('puts the details toggle below the results, with the offline-judge notice inside it', async () => {
    const overlay = await setup([judgeNote, 'wikipedia: Wikipedia request failed with HTTP 500.']);
    const bar = overlay.root.querySelector('.bar')!;
    const order = Array.from(bar.children).map((c) => c.className);
    expect(order.indexOf('row')).toBeLessThan(order.indexOf('ghost more-toggle'));
    expect(overlay.root.querySelector('.head')!.textContent).not.toContain('Details');
    // Only a quiet label is visible up front; the explanation is behind the toggle.
    expect(overlay.root.querySelector('.row .tag')!.textContent).toBe('Offline judge');
    expect(overlay.root.querySelector('button.more-toggle')!.textContent).toBe('Show details · 2 notes');
    const notes = Array.from(overlay.root.querySelectorAll('.more .note')).map((n) => n.textContent);
    expect(notes).toEqual([judgeNote, 'Wikipedia could not be reached (HTTP 500). Other enabled sources were still used.']);
    expect(overlay.root.querySelector('.bar > .note')).toBeNull();
  });

  it('keeps the evidence panel attached to the claim text while the page scrolls', async () => {
    const overlay = await setup();
    let top = 300;
    const proto = Range.prototype as unknown as { getClientRects?: () => DOMRect[] };
    const original = proto.getClientRects;
    proto.getClientRects = () => [{ left: 40, right: 300, top, bottom: top + 20, width: 260, height: 20, x: 40, y: top } as DOMRect];
    try {
      const claimId = overlay.root.querySelector<HTMLElement>('ul.details li')!.dataset.claimId!;
      const panel = overlay.openPanel(claimId, { x: 40, y: 320 })!;
      expect(panel.style.top).toBe('328px');
      top = 100; // the user scrolled the conversation up by 200px
      window.dispatchEvent(new Event('scroll'));
      await new Promise((r) => setTimeout(r, 40));
      expect(panel.style.top).toBe('128px');
      expect(panel.style.left).toBe('40px');
    } finally {
      if (original) proto.getClientRects = original;
      else delete proto.getClientRects;
    }
  });
});
