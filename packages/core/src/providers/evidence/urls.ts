import type { Claim, EvidenceProvider, FetchLike, Passage, RetrieveOptions } from '../../types.js';
import { DocumentEvidenceProvider } from './documents.js';
import { EvidenceHttp } from './http.js';

declare const URL: { new(value: string): { protocol: string; hostname: string; username: string; password: string; port: string; hash: string; href: string; origin: string } };
declare const TextEncoder: { new(): { encode(value: string): Uint8Array } };
declare const TextDecoder: { new(): { decode(value?: Uint8Array, options?: { stream: boolean }): string } };

const MAX_PAGE_BYTES = 1_000_000;

/** Explicit public HTTPS URLs only. Redirects are rejected, so another host cannot inherit permission. */
export function trustedUrl(value: string): { url: string; origin: string } {
  let u;
  try { u = new URL(value); } catch { throw new Error('Trusted sources must be public HTTPS URLs.'); }
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') ||
      host.length > 253 || !host.split('.').every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)) || !host.includes('.') || /^\d+(?:\.\d+){3}$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|example|home\.arpa)$/.test(host)) {
    throw new Error('Trusted sources must be public HTTPS URLs without credentials or custom ports.');
  }
  u.hash = '';
  return { url: u.href, origin: `${u.origin}/*` };
}

export function trustedDomains(domains: string[]): string[] {
  if (domains.length > 20) throw new Error('Supply at most 20 trusted search domains.');
  return [...new Set(domains.map((d) => {
    const domain = d.trim().toLowerCase().replace(/\.$/, '');
    if (!/^[a-z0-9.-]+$/.test(domain)) throw new Error('Trusted domains must be public hostnames without a scheme or path.');
    trustedUrl(`https://${domain}/`);
    return domain;
  }))];
}

/** HTML is converted to readable text without interpreting or executing markup. */
export function htmlText(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template|svg|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity: string) => {
      if (entity[0] === '#') {
        const n = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
      }
      return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[entity.toLowerCase()] ?? '';
    }).replace(/[ \t\r]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
}

/** Prefer the page's declared content landmark over global menus and related stories. */
function pageContent(html: string): string {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main\s*>/i.exec(html)?.[1];
  if (main) return main;
  const articles = [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi)];
  return articles.length === 1 ? articles[0]![1]! : html;
}

export interface UrlEvidenceOptions { fetch: FetchLike; urls: string[] }

async function pageText(res: Awaited<ReturnType<FetchLike>>): Promise<string> {
  if (Number(res.headers?.get('content-length')) > MAX_PAGE_BYTES) throw new Error('Source too large');
  if (!res.body) {
    const raw = await res.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_PAGE_BYTES) throw new Error('Source too large');
    return raw;
  }
  const reader = res.body.getReader(), decoder = new TextDecoder();
  let bytes = 0, result = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    bytes += value.byteLength;
    if (bytes > MAX_PAGE_BYTES) { await reader.cancel(); throw new Error('Source too large'); }
    result += decoder.decode(value, { stream: true });
  }
  return result + decoder.decode();
}

export class UrlEvidenceProvider implements EvidenceProvider {
  readonly id = 'urls';
  readonly #http: EvidenceHttp;
  readonly #urls: string[];
  #documents?: { expires: number; value: Promise<DocumentEvidenceProvider> };

  constructor(opts: UrlEvidenceOptions) {
    if (!opts.urls.length || opts.urls.length > 10) throw new Error('Supply between 1 and 10 trusted URLs.');
    this.#urls = [...new Set(opts.urls.map((u) => trustedUrl(u).url))];
    this.#http = new EvidenceHttp('Trusted URL', opts.fetch);
  }

  async retrieve(claim: Claim, options: RetrieveOptions): Promise<Array<Omit<Passage, 'id'>>> {
    if (!this.#documents || this.#documents.expires <= Date.now()) {
      const value = this.#load();
      this.#documents = { expires: Date.now() + 300_000, value };
      void value.catch(() => { if (this.#documents?.value === value) this.#documents = undefined; });
    }
    const provider = await this.#documents.value;
    return (await provider.retrieve(claim, options)).map((p) => ({ ...p, source: { ...p.source, providerId: this.id } }));
  }

  async #load(): Promise<DocumentEvidenceProvider> {
    const documents = [];
    for (const url of this.#urls) {
      const body = await this.#http.request(url, async (res) => {
        const type = res.headers?.get('content-type')?.split(';')[0]?.trim().toLowerCase();
        if (!type || !['text/html', 'text/plain', 'text/markdown', 'application/xhtml+xml'].includes(type)) throw new Error('Unsupported content type');
        const raw = await pageText(res);
        return type.includes('html') ? htmlText(pageContent(raw)) : raw;
      }, { redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { accept: 'text/html, text/plain, text/markdown' } });
      documents.push({ title: url, url, text: body });
    }
    return new DocumentEvidenceProvider(documents);
  }
}
