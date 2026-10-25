import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatgptAdapter } from '../adapters/chatgpt.js';
import { claudeAdapter } from '../adapters/claude.js';
import { geminiAdapter } from '../adapters/gemini.js';
import { adapterFor } from '../adapters/index.js';
import { MessageWatcher, type ReadyMessage } from '../watcher.js';
import { extractText, rangeForSpan } from '../textMap.js';
import { loadFixture } from './fixtures.js';

afterEach(() => vi.useRealTimers());

describe('chatgpt adapter on the finished-answer fixture', () => {
  it('finds the assistant message, its content, id and question', () => {
    loadFixture('chatgpt-finished.html');
    const [msg, ...rest] = chatgptAdapter.findAssistantMessages(document);
    expect(rest).toHaveLength(0);
    expect(chatgptAdapter.getMessageId(msg!, 0)).toBe('asst-1');
    expect(chatgptAdapter.getContentElement(msg!).classList.contains('markdown')).toBe(true);
    expect(chatgptAdapter.getQuestionFor(msg!, document)).toBe('Tell me about the Orrin Library.');
    expect(chatgptAdapter.isStreaming(msg!, document)).toBe(false);
  });

  it('extracts readable text, skipping code blocks and buttons', () => {
    loadFixture('chatgpt-finished.html');
    const content = chatgptAdapter.getContentElement(chatgptAdapter.findAssistantMessages(document)[0]!);
    const { text } = extractText(content);
    expect(text).toContain('The Orrin Library is a public library in Velmora.');
    expect(text).toContain('It was founded by Dalia Moss in 1910.');
    expect(text).not.toContain('1777');
    expect(text).not.toContain('Copy');
  });

  it('maps character spans back to DOM ranges across inline markup', () => {
    loadFixture('chatgpt-finished.html');
    const content = chatgptAdapter.getContentElement(chatgptAdapter.findAssistantMessages(document)[0]!);
    const map = extractText(content);
    const target = 'The Orrin Library is a public library in Velmora.';
    const start = map.text.indexOf(target);
    const range = rangeForSpan(map, start, start + target.length)!;
    expect(range.toString()).toBe(target);
  });
});

describe('chatgpt adapter on the streaming fixture', () => {
  it('reports the message as streaming', () => {
    loadFixture('chatgpt-streaming.html');
    const [msg] = chatgptAdapter.findAssistantMessages(document);
    expect(chatgptAdapter.isStreaming(msg!, document)).toBe(true);
  });

  it('detects streaming from the stop button alone', () => {
    loadFixture('chatgpt-streaming.html');
    document.querySelector('.result-streaming')!.classList.remove('result-streaming');
    const [msg] = chatgptAdapter.findAssistantMessages(document);
    expect(chatgptAdapter.isStreaming(msg!, document)).toBe(true);
  });
});

describe('MessageWatcher', () => {
  it('waits for streaming to finish, then reports once; re-reports when the text changes', async () => {
    vi.useFakeTimers();
    loadFixture('chatgpt-streaming.html');
    const ready: ReadyMessage[] = [];
    const watcher = new MessageWatcher(chatgptAdapter, document, { debounceMs: 100, onReady: (m) => ready.push(m) });
    watcher.start();

    await vi.advanceTimersByTimeAsync(500);
    expect(ready).toHaveLength(0); // still streaming

    // Streaming finishes: text completes, indicator class and stop button go away.
    const content = document.querySelector('.markdown')!;
    content.querySelector('p')!.textContent = 'The Zentha Bridge opened in 1987.';
    content.classList.remove('result-streaming');
    document.querySelector('[data-testid="stop-button"]')!.remove();
    await vi.advanceTimersByTimeAsync(50);
    expect(ready).toHaveLength(0); // debounce not elapsed
    await vi.advanceTimersByTimeAsync(100);
    expect(ready).toHaveLength(1);
    expect(ready[0]!.text).toContain('The Zentha Bridge opened in 1987.');
    expect(ready[0]!.question).toBe('When did the Zentha Bridge open?');

    // Unrelated mutation with identical text: not reported again.
    document.body.appendChild(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(200);
    expect(ready).toHaveLength(1);

    // Regenerate / edit: new text, same message id -> reported again.
    content.querySelector('p')!.textContent = 'The Zentha Bridge opened in 1991.';
    await vi.advanceTimersByTimeAsync(200);
    expect(ready).toHaveLength(2);
    watcher.stop();
  });

  it('ignores mutations inside its own UI', async () => {
    vi.useFakeTimers();
    loadFixture('chatgpt-finished.html');
    const ready: ReadyMessage[] = [];
    const watcher = new MessageWatcher(chatgptAdapter, document, { debounceMs: 50, onReady: (m) => ready.push(m) });
    watcher.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(ready).toHaveLength(1);
    const ui = document.createElement('div');
    ui.setAttribute('data-socratica-ui', '');
    chatgptAdapter.getContentElement(chatgptAdapter.findAssistantMessages(document)[0]!).appendChild(ui);
    ui.textContent = 'summary bar text';
    await vi.advanceTimersByTimeAsync(100);
    expect(ready).toHaveLength(1);
    watcher.stop();
  });

  it('checks a turn within 150 ms when ChatGPT marks it complete, instead of waiting out the quiet period', async () => {
    vi.useFakeTimers();
    loadFixture('chatgpt-finished.html');
    const ready: ReadyMessage[] = [];
    const watcher = new MessageWatcher(chatgptAdapter, document, { debounceMs: 2_000, onReady: (m) => ready.push(m) });
    watcher.start();
    await vi.advanceTimersByTimeAsync(10);
    document.querySelector('[data-message-author-role="assistant"]')!.setAttribute('data-message-complete', 'true');
    await vi.advanceTimersByTimeAsync(200);
    expect(ready).toHaveLength(1);
    watcher.stop();
  });
});

describe('adapter registry and stubs', () => {
  it('selects ChatGPT only on chatgpt.com', () => {
    expect(adapterFor(new URL('https://chatgpt.com/c/abc'))?.platform).toBe('chatgpt');
    expect(adapterFor(new URL('https://example.com/'))).toBeUndefined();
  });
  it('claude and gemini stubs throw "not implemented"', () => {
    expect(() => claudeAdapter.findAssistantMessages(document)).toThrow(/not implemented/);
    expect(() => geminiAdapter.matches(new URL('https://gemini.google.com'))).toThrow(/not implemented/);
  });
});
