/**
 * MV3 service worker. All network calls happen here, never in the content script.
 * Nothing in this file logs request bodies, conversation text or keys.
 */
import type { FetchLike } from '@hallucination-firewall/core';
import type { Request, StateResponse } from './messages.js';
import { hasValidConsent, loadSettings } from './settings.js';
import { handleVerify } from './verifyService.js';

const deps = {
  fetch: ((url, init) => fetch(url, init as RequestInit)) as FetchLike,
  hasPermission: (origin: string) => chrome.permissions.contains({ origins: [origin] }),
};

chrome.runtime.onMessage.addListener((msg: Request, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  void (async () => {
    const settings = await loadSettings();
    switch (msg.type) {
      case 'hf/get-state': {
        const state: StateResponse = {
          platformEnabled: settings.platforms[msg.platform],
          autoCheck: settings.autoCheck,
          consentGranted: hasValidConsent(settings),
        };
        sendResponse(state);
        return;
      }
      case 'hf/verify':
        sendResponse(await handleVerify(msg, settings, deps));
        return;
      case 'hf/open-options':
        await chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
        return;
    }
  })();
  return true; // async response
});

chrome.action.onClicked.addListener(() => void chrome.runtime.openOptionsPage());

chrome.runtime.onInstalled.addListener((details) => {
  // Show the consent screen on first install. No network calls happen until it is accepted.
  if (details.reason === 'install') void chrome.runtime.openOptionsPage();
});
