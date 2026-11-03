import { expect, type Locator, type Page, test } from '@playwright/test'

import { addExpense, createTrip, tab } from './helpers.ts'

/** Scrolls to the very end and measures where the content stops and the fixed bars begin. */
async function endOfScreen(page: Page) {
  // Strings, so this file needs no DOM types.
  await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)')
  const scrolls = await page.evaluate<boolean>(
    'document.documentElement.scrollHeight > window.innerHeight',
  )
  const box = async (locator: Locator) => {
    const found = await locator.boundingBox()
    if (!found) throw new Error(`Not on screen: ${locator.toString()}`)
    return found
  }
  const content = await box(page.locator('main > :last-child'))
  const tabs = await box(page.getByRole('navigation', { name: 'Group sections' }))
  const add = page.getByRole('link', { name: 'Add expense' })
  return {
    scrolls,
    contentBottom: content.y + content.height,
    tabsTop: tabs.y,
    addTop: (await add.count()) > 0 ? (await box(add)).y : null,
  }
}

test('the end of each group screen scrolls clear of the tabs and the add button', async ({
  page,
}) => {
  await createTrip(page)
  await addExpense(page, { amount: '1200000', title: 'Dinner', category: 'Food & drink' })
  await addExpense(page, { amount: '160000', title: 'Taxi', category: 'Transport' })
  // Short enough that every tab scrolls.
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 390, height: 420 })

  for (const name of ['Expenses', 'Balances', 'Activity'] as const) {
    await tab(page, name).click()
    await expect(page.getByRole('heading', { level: 1, name })).toBeAttached()
    const end = await endOfScreen(page)
    expect(end.scrolls, `${name} scrolls`).toBe(true)
    // At least 1rem of space above the tabs.
    expect(end.tabsTop - end.contentBottom, `${name}: space above the tabs`).toBeGreaterThanOrEqual(
      16,
    )
    if (name === 'Expenses') {
      expect(end.addTop, 'the add button is on Expenses').not.toBeNull()
      expect(
        (end.addTop ?? 0) - end.contentBottom,
        'Expenses: space above the add button',
      ).toBeGreaterThanOrEqual(16)
    }
  }
})
