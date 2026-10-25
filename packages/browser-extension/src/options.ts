import { mountOptions } from './optionsView.js';
import { loadSettings, saveSettings } from './settings.js';

void mountOptions(document.getElementById('app')!, {
  load: loadSettings,
  save: saveSettings,
  requestPermissions: async (origins) => (origins.length === 0 ? true : chrome.permissions.request({ origins })),
  testJudge: () => chrome.runtime.sendMessage({ type: 'hf/test-judge' }),
});
