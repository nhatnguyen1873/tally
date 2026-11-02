import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

for (const colorScheme of ['light', 'dark'] as const) {
  test(`shows the placeholder with no accessibility violations (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1, name: 'Tally' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Follow along on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/nhatnguyen1873/tally',
    )
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze()
    expect(violations).toEqual([])
  })
}

test.describe('before JavaScript runs', () => {
  test.use({ javaScriptEnabled: false })

  test('already shows the first screen, prerendered at build time', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Tally' })).toBeVisible()
  })
})

test('hydrates the prerendered screen without errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Tally' })).toBeVisible()
  expect(errors).toEqual([])
})

test('reaches the link by keyboard', async ({ page, browserName }) => {
  await page.goto('/')
  // Safari moves between links with Option+Tab; plain Tab only visits form controls.
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab')
  await expect(page.getByRole('link', { name: 'Follow along on GitHub' })).toBeFocused()
})

test('sends the security headers', async ({ request }) => {
  const headers = (await request.get('/')).headers()
  expect(headers['content-security-policy']).toContain("default-src 'self'")
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['referrer-policy']).toBe('no-referrer')
  expect(headers['x-content-type-options']).toBe('nosniff')
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
