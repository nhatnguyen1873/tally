// Installing (SPEC.md section 7): Android's prompt, iOS's Share → Add to
// Home Screen, and the hint inside apps' built-in browsers.
import { expect, test } from '@playwright/test'

import { expectNoAxeViolations } from './helpers.ts'

test('on an iPhone, Home explains how to add Tally to the home screen', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'the steps are for iOS')
  await page.goto('/')
  const hint = page.getByRole('region', { name: 'Install Tally' })
  await expect(hint).toContainText('Tap Share, then Add to Home Screen.')
  await expectNoAxeViolations(page, 'Home with the install hint')

  await hint.getByRole('button', { name: 'Dismiss' }).click()
  await expect(hint).toBeHidden()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your groups' })).toBeVisible()
  await expect(hint).toBeHidden()
})

test('on Android, Install opens the browser’s own prompt', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android', 'Chrome on Android offers the prompt')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your groups' })).toBeVisible()
  // No prompt offered yet, so nothing to show.
  await expect(page.getByRole('region', { name: 'Install Tally' })).toBeHidden()

  // Chrome offers it: stand in for its event.
  await page.evaluate(`(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true })
    event.prompt = () => { window.prompted = true; return Promise.resolve() }
    window.dispatchEvent(event)
  })()`)
  const hint = page.getByRole('region', { name: 'Install Tally' })
  await expect(hint).toContainText('like an app, even offline')
  await hint.getByRole('button', { name: 'Install' }).click()
  expect(await page.evaluate<boolean>('window.prompted === true')).toBe(true)
  // A prompt can be shown once.
  await expect(hint).toBeHidden()
})

test.describe('inside an app’s built-in browser', () => {
  test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Zalo android/12' })

  test('suggests opening the page in the browser instead', async ({ page }) => {
    await page.goto('/')
    const hint = page.getByRole('status').getByText('can’t install it')
    await expect(hint).toBeVisible()
    await expect(page.getByRole('region', { name: 'Install Tally' })).toBeHidden()
    await page.getByRole('status').getByRole('button', { name: 'Dismiss' }).click()
    await expect(hint).toBeHidden()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Your groups' })).toBeVisible()
    await expect(hint).toBeHidden()
  })
})
