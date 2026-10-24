import { NotImplementedAdapterError, type ChatAdapter } from './adapter.js';

/** Stub: Gemini is not supported in this version. Every method throws. */
const notImplemented = (): never => {
  throw new NotImplementedAdapterError('gemini');
};

export const geminiAdapter: ChatAdapter = {
  platform: 'gemini',
  matches: notImplemented,
  findAssistantMessages: notImplemented,
  getMessageId: notImplemented,
  getContentElement: notImplemented,
  getQuestionFor: notImplemented,
  isStreaming: notImplemented,
};
