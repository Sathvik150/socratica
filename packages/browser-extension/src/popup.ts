import type { PageStatus, Request, TabRequest, VerifyResponse } from './messages.js';
import { mountPopup } from './popupView.js';
import { loadSettings } from './settings.js';

const send = <T>(msg: Request) => chrome.runtime.sendMessage(msg) as Promise<T>;

void mountPopup(document.getElementById('app')!, document.getElementById('pill'), {
  getSettings: loadSettings,
  async activeTab() {
    // ?tabId=N lets the popup be opened in a normal tab for debugging.
    const forced = Number(new URLSearchParams(location.search).get('tabId'));
    if (forced) return chrome.tabs.get(forced);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  },
  async pageStatus(tabId) {
    try {
      return (await chrome.tabs.sendMessage(tabId, { type: 'hf/page-status' } satisfies TabRequest)) as PageStatus;
    } catch {
      return undefined; // no content script in this tab
    }
  },
  async checkLatest(tabId) {
    try {
      return (await chrome.tabs.sendMessage(tabId, { type: 'hf/check-latest' } satisfies TabRequest)) as { ok: boolean; message?: string };
    } catch {
      return { ok: false, message: 'Reload the ChatGPT tab and try again.' };
    }
  },
  async getSelection(tabId) {
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: () => window.getSelection()?.toString() ?? '' });
      return String(res?.result ?? '');
    } catch {
      throw new Error('This page does not allow extensions to read it (for example, browser or Web Store pages).');
    }
  },
  verifyText: (text) => send<VerifyResponse>({ type: 'hf/verify-text', text }),
  openOptions: () => void chrome.runtime.openOptionsPage(),
});
