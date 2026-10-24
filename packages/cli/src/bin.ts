import { readFileSync } from 'node:fs';
import type { FetchLike } from '@hallucination-firewall/core';
import { UsageError, main } from './cli.js';

main(process.argv.slice(2), {
  stdout: (s) => process.stdout.write(s),
  stdin: () => readFileSync(0, 'utf8'),
  env: process.env,
  fetch: ((url, init) => fetch(url, init as RequestInit)) as FetchLike,
}).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`hf-verify: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(err instanceof UsageError ? 64 : 1);
  },
);
