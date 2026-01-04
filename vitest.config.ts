import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      all: true,
      include: ['src/**/*.ts'],
      // Exclude test files and DOM-heavy UI files that directly access DOM elements on import
      // These files are difficult to test in isolation without a full browser environment
      exclude: ['src/**/*.test.ts', 'src/content.ts', 'src/popup.ts', 'src/options.ts'],
      // Target 95% coverage for the testable files (storage.ts, background.ts, types.ts)
      thresholds: {
        lines: 95,
        functions: 90,
        branches: 75,
        statements: 95,
      },
    },
  },
});
