import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@socratica/core': fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url)) },
  },
  test: {
    setupFiles: [fileURLToPath(new URL('../tests/no-network.ts', import.meta.url))],
  },
});
