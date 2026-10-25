import type { VerifyOutput } from '@socratica/core';
import type { PlatformId } from './adapters/adapter.js';

/** Messages handled by the background service worker. */
export type Request =
  | { type: 'socratica/get-state'; platform: PlatformId }
  | { type: 'socratica/verify'; platform: PlatformId; answer: string; question?: string }
  /** Text the user selected on any page and asked to check from the popup. */
  | { type: 'socratica/verify-text'; text: string }
  /** Options page "Test connection" for the configured judge. */
  | { type: 'socratica/test-judge' }
  | { type: 'socratica/open-options' };

/** Messages the popup sends to the ChatGPT content script. */
export type TabRequest = { type: 'socratica/page-status' } | { type: 'socratica/check-latest' };

export interface PageStatus {
  platform: PlatformId;
  /** Assistant answers the adapter can see on the page right now. */
  answers: number;
  /** Summary of the most recent finished check, if any. */
  lastSummary?: string;
  /** Verdict counts of that check, for the popup's Insights tab. */
  lastCounts?: { checked: number; supported: number; contradicted: number; unverifiable: number };
  /** What the content script is doing now. */
  state: 'idle' | 'checking' | 'consent-required' | 'disabled' | 'error';
  lastError?: string;
}

export type TestJudgeResponse = { ok: true; judge: string; ms: number } | { ok: false; judge: string; message: string };

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
