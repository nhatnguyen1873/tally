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

/**
 * For each card list holding links: the radii of its rows' corners, next to the
 * card's inner radius (its radius less its border).
 */
async function rowCorners(page: Page) {
  // A string, so this file needs no DOM types.
  return page.evaluate<{ inner: number; rows: number[][] }[]>(`
    [...document.querySelectorAll('main ul, main ol')]
      .filter((list) => list.querySelector(':scope > li > a'))
      .map((list) => {
        const card = getComputedStyle(list)
        return {
          inner: parseFloat(card.borderTopLeftRadius) - parseFloat(card.borderTopWidth),
          rows: [...list.querySelectorAll(':scope > li > a')].map((row) => {
            const style = getComputedStyle(row)
            return [
              style.borderTopLeftRadius,
              style.borderTopRightRadius,
              style.borderBottomLeftRadius,
              style.borderBottomRightRadius,
            ].map(parseFloat)
          }),
        }
      })
  `)
}

test('a row’s hover background stays inside its card’s rounded corners', async ({ page }) => {
  await createTrip(page)
  await addExpense(page, { amount: '1200000', title: 'Dinner', category: 'Food & drink' })
  await addExpense(page, { amount: '160000', title: 'Taxi', category: 'Transport' })
  const expenses = await rowCorners(page)
  await page.goto('/')
  await expect(page.getByRole('link', { name: /Đà Lạt trip/ })).toBeVisible()
  const home = await rowCorners(page)

  for (const [name, lists] of [
    ['Expenses', expenses],
    ['Home', home],
  ] as const) {
    expect(lists.length, `${name} has a list`).toBeGreaterThan(0)
    for (const { inner, rows } of lists) {
      expect(inner, `${name}: the card is rounded`).toBeGreaterThan(0)
      rows.forEach(([topLeft, topRight, bottomLeft, bottomRight], index) => {
        const top = index === 0 ? inner : 0
        const bottom = index === rows.length - 1 ? inner : 0
        expect([topLeft, topRight, bottomLeft, bottomRight], `${name}: row ${index + 1}`).toEqual([
          top,
          top,
          bottom,
          bottom,
        ])
      })
    }
  }
  // Two expenses on the same day: one card, rounded only at its two ends.
  expect(expenses.some(({ rows }) => rows.length === 2)).toBe(true)
})

test('a settings button stays beside its field when an error shows', async ({ page }) => {
  await createTrip(page)
  await page.getByRole('link', { name: 'Group settings' }).click()
  const middle = async (locator: Locator) => {
    const found = await locator.boundingBox()
    if (!found) throw new Error(`Not on screen: ${locator.toString()}`)
    return found.y + found.height / 2
  }
  const forms = [
    {
      field: page.getByLabel('Add a person'),
      button: page.getByRole('button', { name: 'Add', exact: true }),
      error: 'Enter a name.',
      showError: () => page.getByRole('button', { name: 'Add', exact: true }).click(),
    },
    {
      field: page.getByLabel('Group name'),
      button: page.getByRole('button', { name: 'Save', exact: true }),
      error: 'Give the group a name.',
      showError: () => page.getByLabel('Group name').fill(''),
    },
  ]
  for (const { field, button, error, showError } of forms) {
    expect(Math.abs((await middle(button)) - (await middle(field)))).toBeLessThanOrEqual(1)
    await showError()
    await expect(page.getByText(error)).toBeVisible()
    expect(Math.abs((await middle(button)) - (await middle(field)))).toBeLessThanOrEqual(1)
  }
})
