import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@hallucination-firewall/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) },
  },
  test: {
    setupFiles: [fileURLToPath(new URL('../../tests/no-network.ts', import.meta.url))],
  },
});
