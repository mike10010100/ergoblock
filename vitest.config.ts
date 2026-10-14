import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      'webextension-polyfill': path.resolve(__dirname, './vitest.polyfill-mock.ts'),
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/content.ts',
        'src/content.tsx',
        'src/popup.ts',
        'src/popup.tsx',
        'src/options.ts',
        'src/options.tsx',
        'src/manager.ts',
        'src/manager.tsx',
        'src/post-context.ts',
        'src/browser.ts',
        'src/components/**',
        'src/hooks/**',
        'src/signals/**',
      ],
      thresholds: {
        lines: 30,
        functions: 35,
        branches: 30,
        statements: 30,
      },
    },
  },
});