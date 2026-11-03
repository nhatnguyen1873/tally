import { defineConfig } from 'vitest/config'

// Kept apart from vite.config.ts so unit tests run in plain Node,
// without starting the Workers runtime.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'shared/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts', 'src/sync/**/*.ts', 'shared/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/domain/testing.ts', 'src/sync/fake-relay.ts'],
      reporter: ['text-summary', 'text', 'html'],
      thresholds: { lines: 95, functions: 95, branches: 95, statements: 95 },
    },
  },
})
