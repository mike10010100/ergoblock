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
      thresholds: {
        lines: 15, // Starting low to pass current state, will increase later
        functions: 10,
        branches: 30,
        statements: 15,
      }
    },
  },
});