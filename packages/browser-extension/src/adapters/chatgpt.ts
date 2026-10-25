import type { ChatAdapter } from './adapter.js';
import { extractText } from '../textMap.js';

/**
 * ChatGPT adapter.
 *
 * Selectors are ASSUMPTIONS about chatgpt.com's DOM and will break when the
 * site changes; this is the only file that should need updating.
 *
 * Three DOM variants are supported:
 *  - Logged-in search-unit UI: inspected live on 2026-10-24; captured in
 *    fixtures/chatgpt-live-logged-in-finished.html. Completion is on an ancestor.
 *  - "transcript" UI: verified against live chatgpt.com (logged-out web UI) on
 *    2026-10-24; captured in fixtures/chatgpt-live-*.html.
 *  - "legacy" UI (`data-message-author-role`, `.markdown`, `.result-streaming`):
 *    widely documented for earlier ChatGPT versions; NOT seen live in our test
 *    and only covered by hand-written fixtures. Logged-in UIs may still use it.
 */
export const CHATGPT_SELECTORS = {
  assistantMessage: '[data-message-role="assistant"], [data-message-author-role="assistant"], [data-chatgpt-search-unit-key$=":assistant"]',
  userMessage: '[data-message-role="user"], [data-message-author-role="user"], [data-chatgpt-search-unit-key$=":user"]',
  userText: '[data-user-message-copy], [data-user-message-bubble]',
  /** Rendered answer container. */
  content: '[data-assistant-markdown-root], .markdown, [data-markdown-text-style="assistant-message"]',
  turnStateAttr: 'data-talvt-turn-state',
  messageIdAttr: 'data-message-id',
  /** Transcript UI: present on the turn once generation has finished (verified live). */
  completeAttr: 'data-message-complete',
  /** Legacy UI: class on the content while streaming. */
  streamingClass: 'result-streaming',
  /** "Stop generating" was verified live; the others are legacy hypotheses. */
  stopButton: 'button[aria-label="Stop generating"], [data-testid="stop-button"], button[aria-label="Stop streaming"]',
} as const;

export const chatgptAdapter: ChatAdapter = {
  platform: 'chatgpt',

  matches(url) {
    return url.hostname === 'chatgpt.com' || url.hostname.endsWith('.chatgpt.com');
  },

  findAssistantMessages(root) {
    return Array.from(root.querySelectorAll<HTMLElement>(CHATGPT_SELECTORS.assistantMessage));
  },

  getMessageId(message, index) {
    return message.getAttribute(CHATGPT_SELECTORS.messageIdAttr)
      ?? message.querySelector('[data-chatgpt-selection-message-id]')?.getAttribute('data-chatgpt-selection-message-id')
      ?? (message.id || `chatgpt-msg-${index}`);
  },

  getContentElement(message) {
    return message.querySelector<HTMLElement>(CHATGPT_SELECTORS.content) ?? message;
  },

  getQuestionFor(message, root) {
    let question: HTMLElement | undefined;
    for (const user of Array.from(root.querySelectorAll<HTMLElement>(CHATGPT_SELECTORS.userMessage))) {
      if (user.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING) question = user;
    }
    const source = question?.querySelector<HTMLElement>(CHATGPT_SELECTORS.userText) ?? question;
    const text = source ? extractText(source).text.trim() : '';
    return text || undefined;
  },

  isStreaming(message, root) {
    // Logged-in UI: user and assistant blocks share a turn-level completion marker.
    if (message.hasAttribute('data-chatgpt-search-unit-key')
      && message.closest(`[${CHATGPT_SELECTORS.turnStateAttr}]`)?.getAttribute(CHATGPT_SELECTORS.turnStateAttr) !== 'complete') return true;
    // Transcript UI: the turn is unfinished until it carries data-message-complete.
    if (message.hasAttribute('data-message-role') && !message.hasAttribute(CHATGPT_SELECTORS.completeAttr)) return true;
    if (this.getContentElement(message).classList.contains(CHATGPT_SELECTORS.streamingClass)) return true;
    if (message.querySelector(`.${CHATGPT_SELECTORS.streamingClass}`)) return true;
    // A visible stop button means *something* is generating; assume it is the last answer.
    const all = this.findAssistantMessages(root);
    return all[all.length - 1] === message && root.querySelector(CHATGPT_SELECTORS.stopButton) !== null;
  },
};
