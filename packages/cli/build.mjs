// Bundles the CLI (core + zod included) into one dependency-free file: dist/hf-verify.mjs
import { build } from 'esbuild';
import { chmodSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
await build({
  entryPoints: ['src/bin.ts'],
  outfile: 'dist/hf-verify.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
});
chmodSync('dist/hf-verify.mjs', 0o755);
