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
  minify: true,
  // Undici includes CommonJS modules that load Node builtins at runtime.
  banner: { js: '#!/usr/bin/env node\nimport { createRequire as __hfCreateRequire } from "node:module";\nconst require = __hfCreateRequire(import.meta.url);' },
  logLevel: 'info',
});
chmodSync('dist/hf-verify.mjs', 0o755);
