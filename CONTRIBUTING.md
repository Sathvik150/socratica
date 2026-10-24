# Contributing

Thanks for helping. This project cares more about **trustworthy verdicts** than about features, so a
few rules are stricter than usual.

## Setup

```bash
corepack enable        # provides pnpm 10
pnpm install
pnpm build
pnpm test              # no network, no API key needed
```

Requirements: Node.js 20+ (see `.nvmrc`). Python 3 is optional and only used by the skill's validator parity test.

## Project rules

1. **`packages/core` stays platform-agnostic.** No DOM, no `chrome.*`, no references to a specific chatbot.
   A test enforces this.
2. **Missing evidence is `unverifiable`, never `contradicted`.** Any change to verification logic needs a test
   that proves this still holds.
3. **Quotes are verbatim.** Don't loosen the substring check without discussing it in an issue first.
4. **Tests never touch the network.** Inject a fake `FetchLike`. `tests/no-network.ts` makes real `fetch` throw.
5. **Never fabricate benchmark numbers.** Docs may only quote numbers that `pnpm bench` printed. Say whether
   a change was made after looking at benchmark errors.
6. **ChatGPT selectors live only in `packages/browser-extension/src/adapters/chatgpt.ts`.** Changes there
   should come with an updated or new fixture in `packages/browser-extension/fixtures/`.
7. **No secrets.** No keys, `.env` files or real conversation text in commits, issues or fixtures.

## Useful commands

| Command | What it does |
|---|---|
| `pnpm build` | Builds every package, the extension (`packages/browser-extension/dist`) and the CLI |
| `pnpm test` | Runs all Vitest suites |
| `pnpm bench` | Runs the labeled benchmark offline |
| `pnpm package` | Writes the release zips to `release/` |
| `pnpm typecheck` | Type-checks every package |

## Pull requests

Keep PRs focused, describe how you tested, and fill in the PR checklist.
