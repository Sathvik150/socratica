import { describe, expect, it, vi } from 'vitest';
import { MockLLM, runVerification } from '@hallucination-firewall/core';
import { chatgptAdapter } from '../adapters/chatgpt.js';
import { DEMO_DOCUMENTS } from '../demoData.js';
import { AnswerOverlay } from '../overlay.js';
import { MessageWatcher, type ReadyMessage } from '../watcher.js';
import { loadFixture } from './fixtures.js';

describe('end to end on the saved ChatGPT fixture (MockLLM + supplied documents)', () => {
  it('shows 1 contradicted claim with evidence, a source link and a correction', async () => {
    vi.useFakeTimers();
    loadFixture('chatgpt-finished.html');
    const ready: ReadyMessage[] = [];
    const watcher = new MessageWatcher(chatgptAdapter, document, { debounceMs: 50, onReady: (m) => ready.push(m) });
    watcher.start();
    await vi.advanceTimersByTimeAsync(100);
    watcher.stop();
    vi.useRealTimers();
    const m = ready[0]!;

    const result = await runVerification({ answer: m.text, question: m.question!, documents: DEMO_DOCUMENTS, llm: new MockLLM() });
    const overlay = new AnswerOverlay({ content: m.content });
    overlay.render(result, m.text);

    // Summary bar under the answer, inside a shadow root.
    expect(overlay.host.getAttribute('data-hf-ui')).toBe('summary');
    expect(overlay.host.previousElementSibling).toBe(m.content);
    const bar = overlay.root.querySelector('.bar')!;
    expect(bar.querySelector('.row')!.getAttribute('aria-label')).toBe('3 checked, 2 supported, 1 contradicted, 0 unverifiable');
    expect(bar.textContent).toContain('1 contradicted');

    // Code-block text and the opinion were not checked.
    expect(result.claims.map((c) => c.text)).not.toContain('The Orrin Library opened in 1777.');

    // Open the contradicted claim from the details list (what a click on the highlight does).
    const item = Array.from(overlay.root.querySelectorAll<HTMLLIElement>('ul.details li')).find((li) => li.textContent!.includes('Contradicted'))!;
    item.querySelector<HTMLButtonElement>('button.claim')!.click();
    const layerHost = document.querySelector('[data-hf-ui="layer"]') as HTMLElement;
    const panel = layerHost.shadowRoot!.querySelector('.panel')!;
    expect(panel.textContent).toContain('It was founded by Dalia Moss in 1910.');
    expect(panel.querySelector('.correction')!.textContent).toBe('It was founded by Dalia Moss in 1902.');
    const quote = panel.querySelector('blockquote .quote')!.textContent!;
    expect(DEMO_DOCUMENTS[0]!.text).toContain(quote);
    const link = panel.querySelector<HTMLAnchorElement>('a.source')!;
    expect(link.href).toBe('https://example.org/velmora/orrin-library');
    expect(link.rel).toBe('noopener noreferrer');

    // The page's own answer DOM was not modified.
    expect(m.content.querySelector('[data-hf-ui]')).toBeNull();
  });

  it('renders evidence text as text, never as HTML', async () => {
    document.body.innerHTML = '<div data-message-author-role="assistant"><div class="markdown"><p>The Pell Tower is 190 meters tall.</p></div></div>';
    const content = document.querySelector<HTMLElement>('.markdown')!;
    const text = content.textContent!;
    const result = await runVerification({
      answer: text,
      documents: [{ title: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)', text: 'The Pell Tower is 212 meters tall. <b>bold</b>' }],
      llm: new MockLLM(),
    });
    const overlay = new AnswerOverlay({ content });
    overlay.render(result, text);
    const panel = overlay.openPanel(result.verdicts[0]!.claimId)!;
    expect(panel.querySelector('img')).toBeNull();
    expect(panel.querySelector('a')).toBeNull(); // javascript: URL is not linked
    expect(panel.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
