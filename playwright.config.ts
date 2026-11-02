import { defineConfig, devices } from '@playwright/test'

const PORT = 4175
const CI = Boolean(process.env.CI)

// Runs against the production build (`pnpm build` first), served by the
// Workers runtime exactly as Cloudflare will serve it.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 15'] } },
  ],
  webServer: {
    command: `pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !CI,
  },
})
