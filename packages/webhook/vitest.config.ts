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
    environment: 'node',
    onConsoleLog(log, type) {
      // Suppress noisy, expected stderr logs from negative-path tests
      if (type === 'stderr') {
        const suppressPatterns = [
          'Invalid webhook signature',
          'Webhook processing failed',
          'Manual trigger failed',
          'Error checking translation trigger conditions',
        ];
        if (suppressPatterns.some((p) => log.includes(p))) return false;
      }
      return true;
    },
  },
});