import type { FetchLike } from '../../types.js';

declare const setTimeout: (fn: () => void, ms: number) => unknown;
declare const clearTimeout: (timer: unknown) => void;
declare const AbortController: { new(): { signal: unknown; abort(): void } };

/** Shared bounded, short-lived request cache and per-source cooldown. No response bodies or keys in errors. */
export class EvidenceHttp {
  readonly #cache = new Map<string, { expires: number; value: Promise<unknown> }>();
  #retryAt = 0;
  #retryStatus = 429;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(readonly name: string, readonly fetch: FetchLike, readonly retryShort429 = false) {}

  #cooldownError(): Error {
    const seconds = Math.max(1, Math.ceil((this.#retryAt - Date.now()) / 1000));
    return new Error(`${this.name} is temporarily unavailable (HTTP ${this.#retryStatus}); try again in ${seconds} seconds.`);
  }

  json(url: string, init?: Parameters<FetchLike>[1]): Promise<unknown> {
    const key = url + (init?.body ?? '');
    const cached = this.#cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    const value = this.request(url, async (res) => {
      const data = await res.json();
      if (record(data).error) throw new Error('API-level error');
      return data;
    }, init);
    this.#cache.set(key, { expires: Date.now() + 300_000, value });
    if (this.#cache.size > 100) this.#cache.delete(this.#cache.keys().next().value!);
    void value.catch(() => { if (this.#cache.get(key)?.value === value) this.#cache.delete(key); });
    return value;
  }

  request<T>(url: string, read: (res: Awaited<ReturnType<FetchLike>>) => Promise<T>, init?: Parameters<FetchLike>[1]): Promise<T> {
    const work = this.#queue.then(async () => {
      if (Date.now() < this.#retryAt) throw this.#cooldownError();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        for (let attempt = 0; ; attempt++) {
          let res;
          try { res = await this.fetch(url, { redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', ...init, signal: controller.signal }); }
          catch { throw new Error(`${this.name} request failed or timed out.`); }
          if (res.status === 429 || res.status === 503) {
            const retry = res.headers?.get('retry-after')?.trim();
            const delay = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry && /^[A-Za-z]{3},?\s/.test(retry) ? Date.parse(retry) - Date.now() : NaN;
            const wait = Number.isFinite(delay) ? Math.max(500, delay) : 30_000;
            this.#retryStatus = res.status;
            this.#retryAt = Date.now() + wait;
            if (this.retryShort429 && res.status === 429 && attempt === 0 && wait <= 5000) {
              await new Promise<void>((resolve) => setTimeout(resolve, wait));
              continue;
            }
            throw this.#cooldownError();
          }
          if (!res.ok) throw new Error(`${this.name} request failed with HTTP ${res.status}.`);
          try { return await read(res); }
          catch { throw new Error(`${this.name} returned an invalid or unsupported response.`); }
        }
      } finally { clearTimeout(timer); }
    });
    this.#queue = work.catch(() => undefined);
    return work;
  }
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
export function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
export function count(value: number | undefined, fallback = 5): number {
  if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 20)) throw new Error('Evidence result count must be an integer from 1 to 20.');
  return value ?? fallback;
}
