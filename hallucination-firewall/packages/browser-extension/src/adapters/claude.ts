import { NotImplementedAdapterError, type ChatAdapter } from './adapter.js';

/** Stub: Claude is not supported in this version. Every method throws. */
const notImplemented = (): never => {
  throw new NotImplementedAdapterError('claude');
};

export const claudeAdapter: ChatAdapter = {
  platform: 'claude',
  matches: notImplemented,
  findAssistantMessages: notImplemented,
  getMessageId: notImplemented,
  getContentElement: notImplemented,
  getQuestionFor: notImplemented,
  isStreaming: notImplemented,
};
