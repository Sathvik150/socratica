import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockLLM, runVerification } from '@socratica/core';
import { chatgptAdapter } from '../adapters/chatgpt.js';
import { AnswerOverlay } from '../overlay.js';
import { MessageWatcher, type ReadyMessage } from '../watcher.js';
import { loadFixture } from './fixtures.js';

afterEach(() => vi.useRealTimers());

// Fixtures captured from live chatgpt.com on 2026-10-24 (see fixtures/README.md).
describe('chatgpt adapter on HTML captured from live chatgpt.com', () => {
  it('finds the finished assistant turn, its markdown root, id and question', () => {
    loadFixture('chatgpt-live-finished.html');
    const msgs = chatgptAdapter.findAssistantMessages(document);
    expect(msgs).toHaveLength(1);
    const msg = msgs[0]!;
    expect(chatgptAdapter.getMessageId(msg, 0)).toMatch(/^msg-\d+$/);
    expect(chatgptAdapter.getContentElement(msg).hasAttribute('data-assistant-markdown-root')).toBe(true);
    expect(chatgptAdapter.getQuestionFor(msg, document)).toBe(
      'Write four sentences about the history of the Brooklyn Bridge, including when it opened and its main span length.',
    );
    expect(chatgptAdapter.isStreaming(msg, document)).toBe(false);
  });

  it('treats the mid-stream capture as streaming (no data-message-complete)', () => {
    loadFixture('chatgpt-live-streaming.html');
    const [msg] = chatgptAdapter.findAssistantMessages(document);
    expect(chatgptAdapter.isStreaming(msg!, document)).toBe(true);
  });

  it('detects the logged-in search-unit UI without counting attribution headings or nested content twice', () => {
    loadFixture('chatgpt-live-logged-in-finished.html');
    const messages = chatgptAdapter.findAssistantMessages(document);
    expect(messages).toHaveLength(1);
    const message = messages[0]!;
    expect(chatgptAdapter.getMessageId(message, 0)).toBe('assistant-1');
    expect(chatgptAdapter.getContentElement(message).getAttribute('data-markdown-text-style')).toBe('assistant-message');
    expect(chatgptAdapter.getQuestionFor(message, document)).toBe(
      'Write four sentences about the history of the Brooklyn Bridge, including when it opened and its main span length.',
    );
    expect(chatgptAdapter.isStreaming(message, document)).toBe(false);
    const stop = document.createElement('button');
    stop.setAttribute('aria-label', 'Stop generating');
    document.body.append(stop);
    expect(chatgptAdapter.isStreaming(message, document)).toBe(true);
  });

  it('waits for the logged-in ancestor completion state after initial generation, regenerate, and editing', async () => {
    vi.useFakeTimers();
    loadFixture('chatgpt-live-logged-in-finished.html');
    const message = chatgptAdapter.findAssistantMessages(document)[0]!;
    const turn = message.closest('[data-talvt-turn-state]')!;
    const content = chatgptAdapter.getContentElement(message);
    const ready: ReadyMessage[] = [];
    const watcher = new MessageWatcher(chatgptAdapter, document, { debounceMs: 50, onReady: (m) => ready.push(m) });
    // Non-complete states are simulated from the captured finished turn.
    turn.removeAttribute('data-talvt-turn-state');
    expect(chatgptAdapter.isStreaming(message, document)).toBe(true);
    turn.setAttribute('data-talvt-turn-state', 'streaming');
    watcher.start();
    try {
      for (const action of ['initial', 'regenerate', 'edit'] as const) {
        turn.setAttribute('data-talvt-turn-state', 'streaming');
        if (action === 'regenerate') content.querySelector('p')!.textContent = 'The Brooklyn Bridge opened in 1883.';
        if (action === 'edit') {
          document.querySelector('[data-user-message-bubble]')!.textContent = 'When did the Brooklyn Bridge open?';
          content.querySelector('p')!.textContent = 'The Brooklyn Bridge opened on May 24, 1883.';
        }
        const previousCount = ready.length;
        await vi.advanceTimersByTimeAsync(200);
        expect(ready).toHaveLength(previousCount);
        turn.setAttribute('data-talvt-turn-state', 'complete');
        await vi.advanceTimersByTimeAsync(25);
        expect(ready).toHaveLength(previousCount);
        await vi.advanceTimersByTimeAsync(100);
        expect(ready).toHaveLength(previousCount + 1);
        expect(ready.at(-1)!.text).not.toContain('ChatGPT said:');
      }
      expect(ready.at(-1)!.question).toBe('When did the Brooklyn Bridge open?');
    } finally {
      watcher.stop();
    }
  });

  it('checks only after the completion attribute appears, including regenerate and prompt edits', async () => {
    vi.useFakeTimers();
    loadFixture('chatgpt-live-streaming.html');
    const message = chatgptAdapter.findAssistantMessages(document)[0]!;
    const content = chatgptAdapter.getContentElement(message);
    const question = document.querySelector('[data-user-message-copy]')!;
    const ready: ReadyMessage[] = [];
    const watcher = new MessageWatcher(chatgptAdapter, document, { debounceMs: 50, onReady: (m) => ready.push(m) });
    watcher.start();
    try {
      await vi.advanceTimersByTimeAsync(200);
      expect(ready).toHaveLength(0);

      // No text or child-list mutation accompanies this completion signal.
      message.setAttribute('data-message-complete', '');
      await vi.advanceTimersByTimeAsync(25);
      expect(ready).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(50);
      expect(ready).toHaveLength(1);

      for (const action of ['regenerate', 'edit'] as const) {
        message.removeAttribute('data-message-complete');
        if (action === 'edit') question.textContent = 'When did the Brooklyn Bridge open?';
        content.querySelector('p')!.textContent = action === 'regenerate'
          ? 'The Brooklyn Bridge opened in 1883.'
          : 'The Brooklyn Bridge opened on May 24, 1883.';
        const previousCount = ready.length;
        // A pause longer than the debounce must not check a partial answer.
        await vi.advanceTimersByTimeAsync(200);
        expect(ready).toHaveLength(previousCount);
        message.setAttribute('data-message-complete', '');
        await vi.advanceTimersByTimeAsync(100);
        expect(ready).toHaveLength(previousCount + 1);
        expect(ready.at(-1)!.text).toContain(content.querySelector('p')!.textContent);
      }
      expect(ready.at(-1)!.question).toBe('When did the Brooklyn Bridge open?');
      await vi.advanceTimersByTimeAsync(200);
      expect(ready).toHaveLength(3);
    } finally {
      watcher.stop();
    }
  });

  it('reports the finished answer through the watcher and extracts checkable claims', async () => {
    vi.useFakeTimers();
    loadFixture('chatgpt-live-finished.html');
    const ready: ReadyMessage[] = [];
    const watcher = new MessageWatcher(chatgptAdapter, document, { debounceMs: 50, onReady: (m) => ready.push(m) });
    watcher.start();
    await vi.advanceTimersByTimeAsync(100);
    watcher.stop();
    vi.useRealTimers();
    expect(ready).toHaveLength(1);
    const m = ready[0]!;
    expect(m.text).not.toContain('ChatGPT said');
    const result = await runVerification({
      answer: m.text,
      documents: [{ title: 'Brooklyn Bridge (test doc)', text: 'The Brooklyn Bridge opened on May 24, 1883.' }],
      llm: new MockLLM(),
    });
    expect(result.claims.map((c) => c.text)).toContain('The bridge officially opened on May 24, 1883, connecting Manhattan and Brooklyn across the East River.');
    const overlay = new AnswerOverlay({ content: m.content });
    overlay.render(result, m.text);
    expect(overlay.host.previousElementSibling).toBe(m.content);
  });
});
