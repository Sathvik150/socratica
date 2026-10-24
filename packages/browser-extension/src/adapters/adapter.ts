/**
 * A chat-site adapter isolates every site-specific DOM assumption. Core never
 * sees any of this; it only receives plain question/answer text.
 */
export type PlatformId = 'chatgpt' | 'claude' | 'gemini';

export interface ChatAdapter {
  readonly platform: PlatformId;
  /** Whether this adapter handles the given page URL. */
  matches(url: URL): boolean;
  /** All assistant message elements currently in the document, in order. */
  findAssistantMessages(root: ParentNode): HTMLElement[];
  /** Stable id for a message (falls back to its position). */
  getMessageId(message: HTMLElement, index: number): string;
  /** The element that contains the rendered answer text (highlights are computed inside it). */
  getContentElement(message: HTMLElement): HTMLElement;
  /** The user prompt that produced this answer, if it can be found. */
  getQuestionFor(message: HTMLElement, root: ParentNode): string | undefined;
  /** True while the answer is still being generated. */
  isStreaming(message: HTMLElement, root: ParentNode): boolean;
}

export class NotImplementedAdapterError extends Error {
  constructor(platform: PlatformId) {
    super(`The ${platform} adapter is not implemented yet. Only ChatGPT is supported in this version.`);
    this.name = 'NotImplementedAdapterError';
  }
}
