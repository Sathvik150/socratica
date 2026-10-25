import { readFileSync } from 'node:fs';
import { UsageError, main } from './cli.js';
import { networkFetch } from './network.js';

main(process.argv.slice(2), {
  stdout: (s) => process.stdout.write(s),
  stdin: () => readFileSync(0, 'utf8'),
  env: process.env,
  fetch: networkFetch(process.env),
}).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`socratica: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(err instanceof UsageError ? 64 : 1);
  },
);
