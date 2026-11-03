import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// Relay tests run inside the Workers runtime, against the real Durable Object
// and its SQLite storage, using the same wrangler.jsonc as production.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
    include: ['worker/test/**/*.test.ts'],
  },
})
