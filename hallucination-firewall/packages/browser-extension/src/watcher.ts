import { hashString } from '@hallucination-firewall/core';
import type { ChatAdapter } from './adapters/adapter.js';
import { extractText } from './textMap.js';

export interface ReadyMessage {
  id: string;
  element: HTMLElement;
  content: HTMLElement;
  text: string;
  question?: string;
  hash: string;
}

export interface WatcherOptions {
  /** Quiet period after the last DOM change before a message counts as finished. */
  debounceMs?: number;
  onReady(message: ReadyMessage): void;
}

/**
 * Watches the page for assistant messages and reports each one once it has
 * finished streaming (no streaming indicator + no DOM changes for the
 * debounce period). A message is reported again if its text changes later,
 * which covers regenerate and edit.
 */
export class MessageWatcher {
  readonly #adapter: ChatAdapter;
  readonly #root: Document;
  readonly #opts: Required<WatcherOptions>;
  readonly #reported = new Map<string, string>();
  #observer: MutationObserver | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(adapter: ChatAdapter, root: Document, opts: WatcherOptions) {
    this.#adapter = adapter;
    this.#root = root;
    this.#opts = { debounceMs: 1500, ...opts };
  }

  start(): void {
    this.#observer = new MutationObserver((mutations) => {
      if (mutations.every((m) => isOwnUi(m.target))) return;
      this.#schedule();
    });
    this.#observer.observe(this.#root.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-message-id'] });
    this.#schedule();
  }

  stop(): void {
    this.#observer?.disconnect();
    if (this.#timer) clearTimeout(this.#timer);
  }

  /** Forget a message so it is reported again on the next check (manual re-check). */
  forget(id: string): void {
    this.#reported.delete(id);
  }

  #schedule(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.check(), this.#opts.debounceMs);
  }

  /** Run one detection pass now. Public for tests. */
  check(): void {
    const messages = this.#adapter.findAssistantMessages(this.#root);
    messages.forEach((element, index) => {
      if (this.#adapter.isStreaming(element, this.#root)) return;
      const content = this.#adapter.getContentElement(element);
      // Untrimmed, so claim spans map 1:1 onto the DOM text map.
      const text = extractText(content).text;
      if (!text.trim()) return;
      const id = this.#adapter.getMessageId(element, index);
      const hash = hashString(text);
      if (this.#reported.get(id) === hash) return;
      this.#reported.set(id, hash);
      const question = this.#adapter.getQuestionFor(element, this.#root);
      this.#opts.onReady({ id, element, content, text, hash, ...(question ? { question } : {}) });
    });
  }
}

function isOwnUi(node: Node): boolean {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return !!el?.closest('[data-hf-ui]');
}
