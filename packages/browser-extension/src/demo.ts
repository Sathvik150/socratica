/**
 * Offline demo: runs the real core pipeline with MockLLM and supplied
 * documents against a ChatGPT-like page, then renders the real overlay.
 * No chrome.* APIs and no network.
 *
 * Served over https as Socratica's site, the page also shows the live check
 * (see liveCheck.ts) and the downloads, which only exist there.
 */
import { MockLLM, runVerification } from '@socratica/core';
import { chatgptAdapter } from './adapters/chatgpt.js';
import { DEMO_DOCUMENTS } from './demoData.js';
import { browserFetch, setupLiveCheck } from './liveCheck.js';
import { AnswerOverlay } from './overlay.js';
import { MessageWatcher } from './watcher.js';

declare const __SOCRATICA_VERSION__: string;

if (location.protocol === 'https:') {
  for (const el of document.querySelectorAll<HTMLElement>('[data-online]')) el.hidden = false;
  for (const el of document.querySelectorAll<HTMLElement>('[data-offline]')) el.hidden = true;
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-download]')) {
    const file = `socratica-${a.dataset.download}-v${__SOCRATICA_VERSION__}.zip`;
    a.href = `downloads/${file}`;
    a.download = file;
  }
  for (const el of document.querySelectorAll('[data-version]')) el.textContent = `v${__SOCRATICA_VERSION__}`;
  setupLiveCheck(document, location.origin, browserFetch());
}

const evidenceList = document.getElementById('evidence');
for (const d of DEMO_DOCUMENTS) {
  const li = document.createElement('li');
  li.textContent = `${d.title}: ${d.text}`;
  evidenceList?.append(li);
}

// Show the "checking" bar before first paint (same height as the result), so the page doesn't shift.
const overlays = new Map<HTMLElement, AnswerOverlay>();
for (const message of chatgptAdapter.findAssistantMessages(document)) {
  const content = chatgptAdapter.getContentElement(message);
  const overlay = new AnswerOverlay({ content, onRecheck: () => location.reload() });
  overlay.showStatus('Checking claims against evidence…');
  overlays.set(content, overlay);
}

const watcher = new MessageWatcher(chatgptAdapter, document, {
  debounceMs: 50,
  async onReady(m) {
    const overlay = overlays.get(m.content) ?? new AnswerOverlay({ content: m.content, onRecheck: () => location.reload() });
    if (!overlays.has(m.content)) overlay.showStatus('Checking claims against evidence…');
    const result = await runVerification({
      answer: m.text,
      ...(m.question ? { question: m.question } : {}),
      documents: DEMO_DOCUMENTS,
      llm: new MockLLM(),
    });
    overlay.render(result, m.text);
    document.body.dataset.socraticaDemo = result.summary.text;
  },
});
watcher.start();
