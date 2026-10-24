import type { ChatAdapter } from './adapter.js';
import { extractText } from '../textMap.js';

/**
 * ChatGPT adapter.
 *
 * EVERY SELECTOR BELOW IS AN UNVERIFIED ASSUMPTION about chatgpt.com's DOM,
 * tested only against the hand-written fixtures in `fixtures/`. The site can
 * change at any time; when it does, this is the only file that should need
 * updating.
 */
export const CHATGPT_SELECTORS = {
  /** Hypothesis: assistant turns carry this attribute. */
  assistantMessage: '[data-message-author-role="assistant"]',
  userMessage: '[data-message-author-role="user"]',
  /** Hypothesis: the rendered markdown lives in a `.markdown` container. */
  content: '.markdown',
  messageIdAttr: 'data-message-id',
  /** Hypotheses for "still generating": a class on the content, or a stop button on the page. */
  streamingClass: 'result-streaming',
  stopButton: '[data-testid="stop-button"], button[aria-label="Stop streaming"], button[aria-label="Stop generating"]',
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
    return message.getAttribute(CHATGPT_SELECTORS.messageIdAttr) ?? `chatgpt-msg-${index}`;
  },

  getContentElement(message) {
    return message.querySelector<HTMLElement>(CHATGPT_SELECTORS.content) ?? message;
  },

  getQuestionFor(message, root) {
    let question: HTMLElement | undefined;
    for (const user of Array.from(root.querySelectorAll<HTMLElement>(CHATGPT_SELECTORS.userMessage))) {
      if (user.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING) question = user;
    }
    const text = question ? extractText(question).text.trim() : '';
    return text || undefined;
  },

  isStreaming(message, root) {
    if (this.getContentElement(message).classList.contains(CHATGPT_SELECTORS.streamingClass)) return true;
    if (message.querySelector(`.${CHATGPT_SELECTORS.streamingClass}`)) return true;
    // A visible stop button means *something* is generating; assume it is the last answer.
    const all = this.findAssistantMessages(root);
    return all[all.length - 1] === message && root.querySelector(CHATGPT_SELECTORS.stopButton) !== null;
  },
};
