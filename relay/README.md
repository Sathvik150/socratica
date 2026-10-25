# Socratica search relay

A single Vercel Function (`api/search.ts`) that lets every Socratica user search the web with no key of
their own. Socratica sends it a short search query built from one claim; it asks
[Serper](https://serper.dev) (Google results) with the project's key and returns the answer box,
knowledge panel and top five results. It is the default engine ("Socratica search") in the extension
and the `--web socratica` engine in the CLI.

## What it keeps

- **Queries:** none. It does not log or store them. An identical query asked again within 10 minutes is
  answered from memory to save search credits; the cache lives only in the running function instance.
- **Network addresses:** used only to rate-limit, counted in memory for at most a day, never written anywhere.
- **The Serper key:** only in the `SERPER_API_KEY` environment variable on Vercel. Never in this repository,
  in the extension, or in responses.

No CORS headers are sent, so ordinary web pages can't call the relay from a browser. The extension (which
has host permission) and the CLI can.

## Limits

- 30 searches per minute and 400 per day per network address (`LIMITS` in `api/search.ts`). Over the
  limit the relay answers HTTP 429 with `Retry-After`, and Socratica falls back to DuckDuckGo, Wikipedia
  and Wikidata for that check.
- Serper is prepaid: the free sign-up includes 2,500 searches, then you buy credits. When the credits run
  out the relay answers HTTP 503 and Socratica falls back the same way, so there is no surprise bill.
- Queries are 2 to 200 characters. Serper gets 8 seconds to answer.

## Deploy (Vercel)

1. In Vercel, **Add New → Project**, import the `Sathvik150/CAC26` GitHub repository.
2. Name the project **`socratica-search`**. The extension expects
   `https://socratica-search.vercel.app/api/search`; another name needs `SOCRATICA_RELAY_URL` in
   `packages/core/src/providers/evidence/webSearch.ts` and the matching host permission in the extension's
   `manifest.json` and `settings.ts` changed to match.
3. Set **Root Directory** to `relay` and **Framework Preset** to **Other**. Leave the build and install
   commands empty.
4. Under **Environment Variables**, add `SERPER_API_KEY` (from serper.dev → API Key) for Production.
   Add it there, never in the repository or in chat.
5. Deploy. Pushes to `main` that touch `relay/` redeploy it.
6. Optional: in **Firewall**, add a rate-limit rule for `/api/search` (for example 60 requests per minute per
   IP). It is enforced across all function instances, unlike the in-memory limits.

Check it:

```bash
curl -s -X POST https://socratica-search.vercel.app/api/search \
  -H 'content-type: application/json' -d '{"q":"james webb space telescope launch"}'
```

## Develop

`pnpm --filter @socratica/relay test` runs the tests with a fake Serper; they make no network calls.
