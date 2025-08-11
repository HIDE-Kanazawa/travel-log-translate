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
    onConsoleLog(log, type) {
      // Suppress noisy, expected error-path logs in CI while keeping unexpected logs visible
      if (type === 'stderr') {
        const suppressPatterns = [
          'DeepL request failed',
          'Persistent API Error',
          'Invalid document structure',
          'Failed to delete translation',
        ];
        if (suppressPatterns.some((p) => log.includes(p))) return false;
      }
      return true;
    },
  },
});