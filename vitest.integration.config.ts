import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/test/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // No jsdom — integration tests run in Node against real CLI
    environment: 'node',
    // No Tauri mocks
    setupFiles: [],
  },
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, 'src/lib'),
    },
  },
});
