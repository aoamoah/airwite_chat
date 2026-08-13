import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Mirrors the `@/*` path alias from tsconfig.json, so tests can import
 * application modules the same way the application does.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
});
