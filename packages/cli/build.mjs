// Bundles the CLI (core + zod included) into one dependency-free file: dist/socratica.mjs
import { build } from 'esbuild';
import { chmodSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
await build({
  entryPoints: ['src/bin.ts'],
  outfile: 'dist/socratica.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  minify: true,
  // Undici includes CommonJS modules that load Node builtins at runtime.
  banner: { js: '#!/usr/bin/env node\nimport { createRequire as __hfCreateRequire } from "node:module";\nconst require = __hfCreateRequire(import.meta.url);' },
  logLevel: 'info',
});
chmodSync('dist/socratica.mjs', 0o755);
