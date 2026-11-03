// The service worker (SPEC.md section 7): after the first visit the whole app
// works with no network, and a new version waits until it's asked to take over.
import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

import { addExpense, createTrip, readyOffline, tab } from './helpers.ts'

test('works with no network once it has loaded', async ({ page, context }) => {
  await createTrip(page)
  await addExpense(page, { amount: '1200000', title: 'Dinner', category: 'Food & drink' })
  await readyOffline(page)
  const group = new URL(page.url()).pathname
  await context.setOffline(true)

  // Reloading, and opening an address cold, both come from the cache.
  await page.reload()
  await expect(page.getByRole('link', { name: /Dinner/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Offline' })).toBeVisible()
  await page.goto(`${group}/activity`)
  await expect(page.getByText('You added Dinner')).toBeVisible()
  await tab(page, 'Balances').click()
  await expect(page.getByRole('button', { name: 'Mark as paid' }).first()).toBeVisible()

  // So do the parts that load on demand: the QR code and the CSV export.
  await page.getByRole('button', { name: 'Invite people' }).click()
  await expect(page.getByRole('img', { name: 'QR code of the invite link' })).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('link', { name: 'Group settings' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ])
  expect(await readFile(await download.path(), 'utf8')).toContain(',Expense,Dinner,')

  await page.goto('/')
  await expect(page.getByRole('link', { name: /Đà Lạt trip/ })).toBeVisible()
  await context.setOffline(false)
})

test('a new version waits until Reload is tapped', async ({ page, context }, testInfo) => {
  // Playwright routes a service worker's script only in Chromium.
  test.skip(testInfo.project.name !== 'android', 'needs routing of service worker scripts')
  // The first install gets a changed worker; asking for an update then
  // fetches the real one, which differs, as after a deploy. (Only the first
  // fetch goes through the route.)
  await context.route('**/sw.js', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, body: `${await response.text()}\n// an older version` })
  })
  await page.goto('/')
  await readyOffline(page)
  await page.evaluate('navigator.serviceWorker.getRegistration().then((r) => r.update())')

  const prompt = page.getByRole('status').getByText('New version ready')
  await expect(prompt).toBeVisible()
  // It waits: nothing reloads until asked.
  await page.waitForTimeout(500)
  await expect(prompt).toBeVisible()

  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: 'Reload' }).click(),
  ])
  await expect(page.getByRole('link', { name: 'New group' })).toBeVisible()
  await expect(prompt).toBeHidden()
  expect(
    await page.evaluate<boolean>(
      'navigator.serviceWorker.getRegistration().then((r) => r.waiting === null)',
    ),
  ).toBe(true)
})
