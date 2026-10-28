import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    hookTimeout: 120_000,
    testTimeout: 30_000,
    // One shared in-memory Mongo replica set across all test files.
    fileParallelism: false,
  },
});
