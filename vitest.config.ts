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
      exclude: ['src/**/*.test.ts', 'src/content.ts', 'src/popup.ts'],
      lines: 50,
      functions: 50,
      branches: 50,
      statements: 50,
    },
  },
});
