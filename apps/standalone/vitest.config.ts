import { defineConfig } from 'vitest/config';

// Unit tests for the pure server-side libs (guardrail, etc.). Node environment;
// tests use relative imports so no path-alias resolution is needed.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
