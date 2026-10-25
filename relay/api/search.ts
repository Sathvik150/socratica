/**
 * Socratica search relay: a Vercel Function that searches the web for Socratica users who have no
 * search key of their own. It forwards a short, claim-derived query to Serper (Google results) with
 * the project's key, which lives only in the SERPER_API_KEY environment variable.
 *
 * It never logs or stores queries. The caller's network address is used only to rate-limit, held in
 * memory for the life of the function instance. Identical queries are answered from a short in-memory
 * cache to save search credits. No CORS headers are sent, so web pages can't call it from a browser;
 * the Socratica extension (with host permission) and the CLI can.
 */

export interface RelayDeps {
  fetch: typeof fetch;
  /** SERPER_API_KEY. */
  apiKey: string | undefined;
  now: () => number;
}

/** Searches allowed per network address: a burst per minute and a total per day. */
export const LIMITS = { perMinute: 30, perDay: 400 } as const;
const QUERY_MAX = 200;
const CACHE_MS = 10 * 60_000;
const UPSTREAM_TIMEOUT_MS = 8_000;

type Window = { start: number; count: number };
type Usage = { minute: Window; day: Window };

/** One relay instance's state: rate-limit counters and cached answers, all in memory. */
export function createRelay(deps: RelayDeps) {
  const usage = new Map<string, Usage>();
  const cache = new Map<string, { expires: number; body: string }>();

  function limited(client: string): number | undefined {
    const now = deps.now();
    const u = usage.get(client) ?? { minute: { start: now, count: 0 }, day: { start: now, count: 0 } };
    if (now - u.minute.start >= 60_000) u.minute = { start: now, count: 0 };
    if (now - u.day.start >= 86_400_000) u.day = { start: now, count: 0 };
    if (u.day.count >= LIMITS.perDay) return Math.ceil((u.day.start + 86_400_000 - now) / 1000);
    if (u.minute.count >= LIMITS.perMinute) return Math.ceil((u.minute.start + 60_000 - now) / 1000);
    u.minute.count++;
    u.day.count++;
    usage.set(client, u);
    // Forget idle callers so the map stays small.
    if (usage.size > 10_000) for (const [k, v] of usage) if (now - v.day.start >= 86_400_000) usage.delete(k);
    return undefined;
  }

  return async function handle(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405, { allow: 'POST' });
    if (!deps.apiKey) return json({ error: 'Search is not configured on this relay.' }, 503);

    let q: string;
    try {
      const body = (await request.json()) as { q?: unknown };
      q = typeof body.q === 'string' ? body.q.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
    } catch {
      return json({ error: 'Send JSON: {"q": "search terms"}.' }, 400);
    }
    if (q.length < 2 || q.length > QUERY_MAX) return json({ error: `The query must be 2 to ${QUERY_MAX} characters.` }, 400);

    const key = q.toLowerCase();
    const hit = cache.get(key);
    if (hit && hit.expires > deps.now()) return new Response(hit.body, { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

    const client = (request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown').trim();
    const wait = limited(client);
    if (wait !== undefined) return json({ error: 'Too many searches from this network; try again later.' }, 429, { 'retry-after': String(wait) });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    let res: Response;
    try {
      res = await deps.fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': deps.apiKey },
        body: JSON.stringify({ q, num: 5 }),
        signal: controller.signal,
      });
    } catch {
      return json({ error: 'The search service did not respond.' }, 504);
    } finally {
      clearTimeout(timer);
    }
    // Serper is prepaid: 400/401/403 mean the project key is wrong or out of credits. Callers fall back.
    if (res.status === 429) return json({ error: 'The search service is busy; try again shortly.' }, 429, { 'retry-after': '30' });
    if (!res.ok) return json({ error: 'Shared search is unavailable right now.' }, 503);

    let upstream: Record<string, unknown>;
    try { upstream = (await res.json()) as Record<string, unknown>; } catch { return json({ error: 'The search service sent an invalid answer.' }, 502); }
    const body = JSON.stringify(pick(upstream));
    cache.set(key, { expires: deps.now() + CACHE_MS, body });
    if (cache.size > 2_000) cache.delete(cache.keys().next().value!);
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  };
}

/** Only the parts Socratica reads, in Serper's own shape: the answer box, knowledge panel and results. */
function pick(data: Record<string, unknown>) {
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const rec = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const box = rec(data.answerBox);
  const panel = rec(data.knowledgeGraph);
  return {
    ...(str(box.link) ? { answerBox: { title: str(box.title), link: str(box.link), snippet: str(box.snippet), answer: str(box.answer) } } : {}),
    ...(str(panel.descriptionLink) ? { knowledgeGraph: { title: str(panel.title), description: str(panel.description), descriptionLink: str(panel.descriptionLink) } } : {}),
    organic: (Array.isArray(data.organic) ? data.organic : []).slice(0, 5).map(rec).map((r) => ({ title: str(r.title), link: str(r.link), snippet: str(r.snippet) })),
  };
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
}

// One relay per function instance: Vercel reuses warm instances, so limits and the cache carry over between requests.
let relay: ReturnType<typeof createRelay> | undefined;

export function POST(request: Request): Promise<Response> {
  relay ??= createRelay({ fetch: (...a) => fetch(...a), apiKey: process.env.SERPER_API_KEY, now: Date.now });
  return relay(request);
}
