import type { VerifyOutput } from '@hallucination-firewall/core';
import type { PlatformId } from './adapters/adapter.js';

export type Request =
  | { type: 'hf/get-state'; platform: PlatformId }
  | { type: 'hf/verify'; platform: PlatformId; answer: string; question?: string }
  | { type: 'hf/open-options' };

export interface StateResponse {
  platformEnabled: boolean;
  autoCheck: boolean;
  consentGranted: boolean;
}

export type VerifyResponse =
  | { status: 'ok'; result: VerifyOutput; warnings: string[] }
  | { status: 'consent-required' }
  | { status: 'disabled' }
  | { status: 'error'; message: string };
