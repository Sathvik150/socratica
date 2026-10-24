import { describe, expect, it, vi } from 'vitest';
import { MockLLM, runVerification } from '@hallucination-firewall/core';
import { chatgptAdapter } from '../adapters/chatgpt.js';
import { AnswerOverlay } from '../overlay.js';
import { MessageWatcher, type ReadyMessage } from '../watcher.js';
import { loadFixture } from './fixtures.js';

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
