import { expect, type Route, test } from '@playwright/test'

test.describe('before JavaScript runs', () => {
  test.use({ javaScriptEnabled: false })

  test('already shows the home screen, prerendered at build time', async ({ page, request }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'New group' })).toBeVisible()
    // Browsers differ on showing <noscript> when tests switch scripts off; check it's served.
    expect(await (await request.get('/')).text()).toContain('Tally needs JavaScript to run.')
  })
})

// Only the inline boot script runs: it picks which prerendered first screen shows.
test.describe('before the app loads', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/assets/*.js', (route) => route.abort())
  })

  test('applies the saved theme and language', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tally:prefs', JSON.stringify({ theme: 'dark', language: 'vi' }))
    })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi')
    await expect(page.getByRole('link', { name: 'Tạo nhóm' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'New group' })).toBeHidden()
  })

  test.describe('on a Vietnamese phone', () => {
    test.use({ locale: 'vi-VN' })

    test('follows the phone’s language when none is saved', async ({ page }) => {
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('lang', 'vi')
      await expect(page.getByRole('link', { name: 'Tạo nhóm' })).toBeVisible()
    })
  })

  test('shows the loading frame for any other address', async ({ page }) => {
    await page.goto('/g/group-dalat-trip-00000')
    await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByRole('link', { name: 'New group' })).toBeHidden()
  })
})

// WebKit checks its own built-in <select> styling against the page's CSP and
// reports it; the selects render correctly. Chromium still catches our own violations.
const WEBKIT_SELECT_NOISE =
  "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline'"

test('starts without errors, including CSP violations', async ({ page, browserName }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    if (browserName === 'webkit' && message.text().startsWith(WEBKIT_SELECT_NOISE)) return
    errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'New group' })).toBeVisible()
  expect(errors).toEqual([])
})

test('keeps focus on the prerendered screen when the app takes over', async ({ page }) => {
  // Hold the app's code until the prerendered link has focus.
  const held: Route[] = []
  let released = false
  await page.route('**/assets/*.js', async (route) => {
    if (released) await route.continue()
    else held.push(route)
  })
  // The page's load event would wait for the held scripts.
  await page.goto('/', { waitUntil: 'commit' })
  const newGroup = page.getByRole('link', { name: 'New group' })
  await newGroup.focus()
  released = true
  await Promise.all(held.map((route) => route.continue()))
  // Only the app shows the group list.
  await expect(page.getByRole('heading', { name: 'Your groups' })).toBeVisible()
  await expect(newGroup).toBeFocused()
})

test('starts in the saved theme and language', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tally:prefs', JSON.stringify({ theme: 'dark', language: 'vi' }))
  })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi')
  await expect(page.getByRole('link', { name: 'Tạo nhóm' })).toBeVisible()
})

test('sends the security headers, allowing only the boot script inline', async ({ request }) => {
  const headers = (await request.get('/')).headers()
  const csp = headers['content-security-policy'] ?? ''
  expect(csp).toContain("default-src 'self'")
  expect(csp).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+';/)
  expect(csp).toContain("frame-ancestors 'none'")
  expect(headers['referrer-policy']).toBe('no-referrer')
  expect(headers['x-content-type-options']).toBe('nosniff')
})

test('can be installed: a manifest whose icons all load', async ({ page, request }) => {
  await page.goto('/')
  expect(await page.locator('link[rel="manifest"]').getAttribute('href')).toBe(
    '/manifest.webmanifest',
  )
  const response = await request.get('/manifest.webmanifest')
  expect(response.headers()['content-type']).toContain('application/manifest+json')
  const manifest = (await response.json()) as {
    display: string
    start_url: string
    icons: { src: string; sizes: string; purpose: string }[]
  }
  expect(manifest).toMatchObject({ display: 'standalone', start_url: '/' })
  expect(manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual(
    expect.arrayContaining(['192x192 any', '512x512 any', '192x192 maskable', '512x512 maskable']),
  )
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
  for (const src of [...manifest.icons.map((icon) => icon.src), apple ?? '']) {
    const icon = await request.get(src)
    expect(icon.status(), src).toBe(200)
    expect(icon.headers()['content-type'], src).toMatch(/^image\//)
  }
})

test('serves group links through the app, marked noindex', async ({ request }) => {
  const response = await request.get('/g/group-dalat-trip-00000')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('text/html')
  expect(response.headers()['x-robots-tag']).toBe('noindex')
})

test('answers the health check and nothing else under /api', async ({ request }) => {
  expect(await (await request.get('/api/health')).json()).toEqual({ ok: true })
  expect((await request.get('/api/unknown')).status()).toBe(404)
})

test('shows a page for addresses that don’t exist', async ({ page }) => {
  await page.goto('/nowhere')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await page.goto('/g/not-on-this-device-0000')
  await expect(page.getByRole('heading', { name: 'This group isn’t on this device' })).toBeVisible()
})
