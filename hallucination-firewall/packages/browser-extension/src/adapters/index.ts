import type { ChatAdapter } from './adapter.js';
import { chatgptAdapter } from './chatgpt.js';

/** Only implemented adapters are registered. Claude and Gemini are stubs and intentionally absent. */
export const ADAPTERS: ChatAdapter[] = [chatgptAdapter];

export function adapterFor(url: URL): ChatAdapter | undefined {
  return ADAPTERS.find((a) => a.matches(url));
}
