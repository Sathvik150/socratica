# ChatGPT DOM fixtures

These are **hand-written approximations** of chatgpt.com's markup, built around
the selector hypotheses in `src/adapters/chatgpt.ts`
(`[data-message-author-role="assistant"]`, `.markdown`, `.result-streaming`,
a stop button). They are not captured from the live site, and the live site
may differ or change at any time. If you can save real page HTML (with any
personal content removed), add it here and extend the adapter tests.
