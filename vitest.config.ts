import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts', 'src/qr/**/*.ts', 'src/render/**/*.ts'],
      reporter: ['text', 'json-summary'],
    },
  },
});
