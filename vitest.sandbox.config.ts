import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/sandbox/**/*.test.ts'],
    testTimeout: 180_000,
  },
});
