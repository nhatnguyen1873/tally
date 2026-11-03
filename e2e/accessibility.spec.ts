import { expect, type Page, test } from '@playwright/test'

import { addExpense, createTrip, expectNoAxeViolations, tab } from './helpers.ts'

/** Visits every screen, running axe on each. */
async function checkEveryScreen(page: Page) {
  const check = (screen: string) => expectNoAxeViolations(page, screen)
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'New group' })).toBeVisible()
  await check('home, empty')
  await createTrip(page)
  await addExpense(page, { amount: '1200000', title: 'Dinner', category: 'Food & drink' })
  await check('expenses')
  await page.getByRole('link', { name: /Dinner/ }).click()
  await expect(page.getByRole('heading', { name: 'Edit expense' })).toBeVisible()
  await check('expense form')
  await page.getByRole('radio', { name: 'Exact amounts' }).check()
  await check('expense form, exact amounts')
  await page.getByRole('link', { name: 'Back' }).click()
  await tab(page, 'Balances').click()
  await expect(page.getByText('Settle up')).toBeVisible()
  await check('balances')
  await page.getByRole('link', { name: 'Record a payment' }).click()
  await check('payment form')
  await page.getByRole('link', { name: 'Back' }).click()
  await tab(page, 'Activity').click()
  await check('activity')
  await page.getByRole('link', { name: 'Group settings' }).click()
  await check('settings')
  await page.goto('/')
  await check('home, with a group')
  await page.goto('/new')
  await check('new group')
  await page.goto('/about')
  await expect(page.getByRole('heading', { name: 'About Tally' })).toBeVisible()
  await check('about')
  await page.goto('/nowhere')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await check('not found')
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`every screen passes axe at WCAG 2.2 AA (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await checkEveryScreen(page)
  })
}

test('every screen passes axe in Vietnamese', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tally:prefs', JSON.stringify({ language: 'vi' }))
  })
  await page.goto('/')
  await expectNoAxeViolations(page, 'home in Vietnamese')
  await page.getByRole('link', { name: 'Tạo nhóm' }).click()
  await expectNoAxeViolations(page, 'new group in Vietnamese')
  await page.goto('/about')
  await expect(page.getByRole('heading', { name: 'Giới thiệu Tally' })).toBeVisible()
  await expectNoAxeViolations(page, 'about in Vietnamese')
})

test('moves focus to each new screen’s heading', async ({ page }) => {
  await createTrip(page)
  await tab(page, 'Balances').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Balances' })).toBeFocused()
})

test.describe('keyboard only', () => {
  // WebKit only tabs to links with Option held; Chromium covers keyboard flow.
  test.skip(({ browserName }) => browserName === 'webkit')

  test('creates a group and adds an expense without a pointer', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'New group' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'New group' })).toBeFocused()

    // Each screen puts focus on its heading, so the first Tab reaches the first field.
    await page.keyboard.press('Tab')
    await page.keyboard.type('Flat')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.type('Minh')
    await page.keyboard.press('Tab')
    await page.keyboard.type('An')
    await page.keyboard.press('Enter')
    const invite = page.getByRole('dialog', { name: 'Invite people' })
    await expect(invite).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(invite).toBeHidden()
    await expect(page.getByText('You’re settled up')).toBeVisible()

    await page.getByRole('link', { name: 'Add expense' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Add expense' })).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.type('250')
    await page.keyboard.press('Tab')
    await page.keyboard.type('Internet')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('link', { name: /Internet/ })).toContainText('you lent $125.00')
  })

  test('opens and closes the share sheet, returning focus', async ({ page }) => {
    await createTrip(page)
    const share = page.getByRole('button', { name: 'Invite people' })
    await share.focus()
    await page.keyboard.press('Enter')
    const sheet = page.getByRole('dialog', { name: 'Invite people' })
    await expect(sheet).toBeVisible()
    // Focus moves into the sheet, and stays there.
    await expect(sheet.getByRole('button', { name: 'Close' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await expect(share).toBeFocused()
  })
})

test('nothing scrolls sideways at 200% zoom', async ({ page }) => {
  // Zooming to 200% halves the width the page lays out in.
  const { width, height } = page.viewportSize() ?? { width: 390, height: 844 }
  const overflow = async (screen: string) => {
    const wide = await page.evaluate<number>(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    )
    expect(wide, `${screen} is wider than the screen`).toBeLessThanOrEqual(0)
  }
  await createTrip(page)
  await addExpense(page, { amount: '1200000', title: 'Dinner', category: 'Food & drink' })
  await page.setViewportSize({ width: Math.round(width / 2), height: Math.round(height / 2) })
  await overflow('expenses')
  await page.getByRole('link', { name: /Dinner/ }).click()
  await expect(page.getByRole('heading', { name: 'Edit expense' })).toBeAttached()
  await overflow('expense form')
  await page.getByRole('link', { name: 'Back' }).click()
  await tab(page, 'Balances').click()
  await overflow('balances')
  await tab(page, 'Activity').click()
  await overflow('activity')
  await page.getByRole('button', { name: 'Invite people' }).click()
  await expect(page.getByRole('img', { name: 'QR code of the invite link' })).toBeVisible()
  await overflow('share sheet')
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('link', { name: 'Group settings' }).click()
  await overflow('settings')
  for (const path of ['/', '/new', '/about']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeAttached()
    await overflow(path)
  }
})
