/**
 * Offline demo: runs the real core pipeline with MockLLM and supplied
 * documents against a ChatGPT-like page, then renders the real overlay.
 * No chrome.* APIs and no network.
 */
import { MockLLM, runVerification } from '@hallucination-firewall/core';
import { chatgptAdapter } from './adapters/chatgpt.js';
import { DEMO_DOCUMENTS } from './demoData.js';
import { AnswerOverlay } from './overlay.js';
import { MessageWatcher } from './watcher.js';

const evidenceList = document.getElementById('evidence');
for (const d of DEMO_DOCUMENTS) {
  const li = document.createElement('li');
  li.textContent = `${d.title}: ${d.text}`;
  evidenceList?.append(li);
}

const watcher = new MessageWatcher(chatgptAdapter, document, {
  debounceMs: 300,
  async onReady(m) {
    const overlay = new AnswerOverlay({ content: m.content, onRecheck: () => location.reload() });
    overlay.showStatus('Checking claims against evidence…');
    const result = await runVerification({
      answer: m.text,
      ...(m.question ? { question: m.question } : {}),
      documents: DEMO_DOCUMENTS,
      llm: new MockLLM(),
    });
    overlay.render(result, m.text, ['Demo mode: MockLLM judge, supplied documents only, no network.']);
    document.body.dataset.hfDemo = result.summary.text;
  },
});
watcher.start();
