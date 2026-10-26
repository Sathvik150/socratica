import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '@socratica/core';
import { chatgptAdapter } from '../adapters/chatgpt.js';
import { browserFetch, LIVE_MAX_CHARS, liveProviders, setupLiveCheck } from '../liveCheck.js';

const ORIGIN = 'https://socratica.example';
const TEXT = "Researchers at Harvard University have also concluded that the Earth's atmospheric oxygen concentration has increased to 35%, eliminating the need for supplemental oxygen at high altitudes.";

function sources() {
  const calls: Array<{ url: string; body: string | undefined }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, body: init?.body });
    const data = url === `${ORIGIN}/api/search`
      ? { organic: [{ title: 'Atmosphere of Earth', link: 'https://en.wikipedia.org/wiki/Atmosphere_of_Earth', snippet: 'dry air contains 78.08% nitrogen, 20.95% oxygen, varies significantly from around 10 ppm.' }] }
      : {};
    return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data), headers: { get: () => null } };
  };
  return { fetch, calls };
}

/** The live-check section exactly as the site serves it. */
function loadTrySection() {
  const html = readFileSync(join(process.cwd(), 'static/demo.html'), 'utf8');
  const section = document.importNode(new DOMParser().parseFromString(html, 'text/html').getElementById('try')!, true);
  section.hidden = false;
  document.body.replaceChildren(section);
}

describe("the live check on Socratica's site", () => {
  it('drops the User-Agent header a page may not set, and keeps Api-User-Agent', async () => {
    const seen: RequestInit[] = [];
    const f = browserFetch((async (_url: string, init?: RequestInit) => { seen.push(init!); return new Response('{}'); }) as typeof fetch);
    await f('https://en.wikipedia.org/w/api.php', { headers: { 'user-agent': 'Socratica', 'api-user-agent': 'Socratica' } });
    expect(seen[0]!.headers).toEqual({ 'api-user-agent': 'Socratica' });
  });

  it("searches through the relay at the page's own address, plus Wikipedia, Wikidata and DuckDuckGo", () => {
    expect(liveProviders(ORIGIN, sources().fetch).map((p) => p.id)).toEqual(['socratica', 'wikipedia', 'wikidata', 'duckduckgo']);
  });

  it('checks pasted text, annotates it in place, and sends only short searches', async () => {
    loadTrySection();
    const s = sources();
    setupLiveCheck(document, ORIGIN, s.fetch);
    const input = document.getElementById('try-text') as HTMLTextAreaElement;
    expect(input.maxLength).toBe(LIVE_MAX_CHARS);
    input.value = TEXT;
    (document.getElementById('try-form') as HTMLFormElement).requestSubmit();

    const bar = () => document.querySelector('[data-socratica-ui="summary"]')?.shadowRoot?.querySelector('.bar .row');
    await vi.waitFor(() => expect(bar()?.getAttribute('aria-label')).toBe('1 checked, 0 supported, 1 contradicted, 0 unverifiable'), { timeout: 5000 });
    expect(document.getElementById('try-output')!.hidden).toBe(false);
    expect(document.getElementById('try-answer')!.textContent).toBe(TEXT);

    // The example's watcher looks for chat answers; the live output must not look like one, or it
    // would be checked a second time with the example's mock judge.
    expect(chatgptAdapter.findAssistantMessages(document)).toHaveLength(0);
    expect(document.querySelectorAll('[data-socratica-ui="summary"]')).toHaveLength(1);

    // The relay at the page's own address got a short search, never the pasted text.
    const relay = s.calls.filter((c) => c.url === `${ORIGIN}/api/search`);
    expect(relay.length).toBeGreaterThan(0);
    for (const c of relay) expect(JSON.parse(c.body!).q.length).toBeLessThan(60);
    expect(s.calls.some((c) => c.url.includes(encodeURIComponent('Harvard University have also concluded')))).toBe(false);
  });
});
