import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    testTimeout: 30000,
    onConsoleLog(log) {
      // Suppress Vite CJS Node API deprecation warning noise in CI
      if (log.includes("The CJS build of Vite's Node API is deprecated")) return false;
      return true;
    },
  },
});