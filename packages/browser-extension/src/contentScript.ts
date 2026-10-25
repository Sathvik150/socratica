/**
 * Content script (chatgpt.com only). Reads finished answers, asks the
 * background worker to verify them, and renders results. It never makes
 * network requests itself.
 */
import { adapterFor } from './adapters/index.js';
import type { PageStatus, Request, StateResponse, TabRequest, VerifyResponse } from './messages.js';
import { AnswerOverlay } from './overlay.js';
import { MessageWatcher, type ReadyMessage } from './watcher.js';

function send<T>(msg: Request): Promise<T> {
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}

async function main(): Promise<void> {
  const adapter = adapterFor(new URL(location.href));
  if (!adapter) return;
  const state = await send<StateResponse>({ type: 'hf/get-state', platform: adapter.platform });
  if (!state.platformEnabled) return;

  const overlays = new Map<string, AnswerOverlay>();
  const latest = new Map<string, string>();
  const current = new Map<string, ReadyMessage>();
  /** Answers the user explicitly asked to check from the popup. */
  const force = new Set<string>();
  const openOptions = () => void send({ type: 'hf/open-options' });
  // What the popup shows for this tab.
  const status: Omit<PageStatus, 'answers' | 'platform'> = { state: state.consentGranted ? 'idle' : 'consent-required' };

  const verify = async (m: ReadyMessage, overlay: AnswerOverlay) => {
    overlay.showStatus('Checking claims against evidence…');
    status.state = 'checking';
    const res = await send<VerifyResponse>({
      type: 'hf/verify',
      platform: adapter.platform,
      answer: m.text,
      ...(m.question ? { question: m.question } : {}),
    });
    if (latest.get(m.id) !== m.hash) return; // answer changed while we were checking; a newer run will render
    status.state = res.status === 'ok' ? 'idle' : res.status;
    delete status.lastError;
    switch (res.status) {
      case 'ok':
        overlay.render(res.result, m.text, res.warnings);
        status.lastSummary = res.result.summary.text;
        break;
      case 'consent-required':
        overlay.showConsentRequired();
        break;
      case 'disabled':
        overlay.destroy();
        break;
      case 'error':
        status.lastError = res.message;
        overlay.showStatus(`Could not check this answer: ${res.message}`, { label: 'Retry', run: () => void verify(m, overlay) });
        break;
    }
  };

  const watcher = new MessageWatcher(adapter, document, {
    onReady(m) {
      latest.set(m.id, m.hash);
      current.set(m.id, m);
      let overlay = overlays.get(m.id);
      if (overlay && overlay.content !== m.content) {
        overlay.destroy(); // the page re-rendered this answer into a new element
        overlay = undefined;
      }
      if (!overlay) {
        overlay = new AnswerOverlay({
          content: m.content,
          onRecheck: () => void verify(current.get(m.id)!, overlays.get(m.id)!),
          onOpenOptions: openOptions,
        });
        overlays.set(m.id, overlay);
      } else {
        overlay.ensureAttached();
      }
      if (!state.consentGranted) return overlay.showConsentRequired();
      if (!state.autoCheck && !force.delete(m.id)) return overlay.showStatus('Auto-check is off.', { label: 'Check this answer', run: () => void verify(m, overlay!) });
      void verify(m, overlay);
    },
  });
  watcher.start();

  // Requests from the toolbar popup.
  chrome.runtime.onMessage.addListener((msg: TabRequest, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (msg.type === 'hf/page-status') {
      const answers = adapter.findAssistantMessages(document).length;
      sendResponse({ platform: adapter.platform, answers, ...status } satisfies PageStatus);
      return false;
    }
    if (msg.type === 'hf/check-latest') {
      // Re-check only the newest answer, even if auto-check is off.
      const all = adapter.findAssistantMessages(document);
      const last = all[all.length - 1];
      if (!last) {
        sendResponse({ ok: false, message: 'No ChatGPT answer found on this page.' });
        return false;
      }
      const id = adapter.getMessageId(last, all.length - 1);
      force.add(id);
      watcher.forget(id);
      watcher.check();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  // Consent or settings may change in the options page; pick that up without a reload.
  chrome.storage.onChanged.addListener(async (_changes, area) => {
    if (area !== 'local') return;
    const next = await send<StateResponse>({ type: 'hf/get-state', platform: adapter.platform });
    const consentNowGranted = next.consentGranted && !state.consentGranted;
    Object.assign(state, next);
    if (!state.consentGranted) status.state = 'consent-required';
    else if (status.state === 'consent-required') status.state = 'idle';
    if (consentNowGranted) {
      for (const id of overlays.keys()) watcher.forget(id);
      watcher.check();
    }
  });
}

void main();
