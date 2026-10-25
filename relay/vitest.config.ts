import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    setupFiles: [fileURLToPath(new URL('../tests/no-network.ts', import.meta.url))],
  },
});
