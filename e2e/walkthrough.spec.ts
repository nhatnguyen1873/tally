// The walkthrough from SPEC.md section 3 on one device, switching who the
// device acts as, plus the CSV export. e2e/sync.spec.ts runs it across phones.
import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

import { actAs, addExpense, createTrip, tab } from './helpers.ts'

test('the Đà Lạt trip ends with the transfers the spec promises', async ({ page }) => {
  await createTrip(page)

  // Dinner, 1,200,000₫, paid by Minh, split equally.
  await addExpense(page, { amount: '1200000', title: 'Dinner', category: 'Food & drink' })
  const dinner = page.getByRole('link', { name: /Dinner/ })
  await expect(dinner).toContainText('You paid ₫1,200,000')
  await expect(dinner).toContainText('you lent ₫900,000')

  // Bảo logs the taxi with a missing zero.
  await actAs(page, 'Bảo')
  await addExpense(page, { amount: '16000', title: 'Taxi', category: 'Transport' })
  await expect(page.getByRole('link', { name: /Taxi/ })).toContainText('you lent ₫12,000')

  // An fixes the typo; the activity feed shows the change.
  await actAs(page, 'An')
  await page.getByRole('link', { name: /Taxi/ }).click()
  await page.getByLabel('Amount', { exact: true }).fill('160000')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await tab(page, 'Activity').click()
  await expect(page.getByText('You changed Taxi')).toBeVisible()
  await expect(page.getByText('Amount: ₫16,000 → ₫160,000')).toBeVisible()

  // Settle up: three transfers, all to Minh.
  await tab(page, 'Balances').click()
  const transfers = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: 'Mark as paid' }) })
  await expect(transfers).toHaveCount(3)
  await expect(transfers.nth(0)).toContainText('You pay Minh')
  await expect(transfers.nth(0)).toContainText('₫340,000')
  await expect(transfers.nth(1)).toContainText('Linh pays Minh')
  await expect(transfers.nth(1)).toContainText('₫340,000')
  await expect(transfers.nth(2)).toContainText('Bảo pays Minh')
  await expect(transfers.nth(2)).toContainText('₫180,000')

  // An pays and marks it; Undo brings the suggestion back, then mark it again.
  await transfers.nth(0).getByRole('button', { name: 'Mark as paid' }).click()
  await expect(page.getByRole('status').getByText('Payment recorded')).toBeVisible()
  await expect(transfers).toHaveCount(2)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(transfers).toHaveCount(3)
  await transfers.nth(0).getByRole('button', { name: 'Mark as paid' }).click()
  await expect(transfers).toHaveCount(2)
  await expect(page.getByText('An (you)').locator('..')).toContainText('settled up')
  // What An paid counts the payment, so it matches An's share.
  await expect(page.getByText('An (you)').locator('..')).toContainText(
    'Paid ₫340,000 · Share ₫340,000',
  )

  // Everything is still there after a reload: it's saved on the device.
  await page.reload()
  await expect(transfers).toHaveCount(2)

  // The CSV export has every expense and payment, readable by Excel.
  await page.getByRole('link', { name: 'Group settings' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ])
  // WebKit hands back the name decomposed (NFD); compare it composed.
  expect(download.suggestedFilename().normalize('NFC')).toMatch(
    /^Đà-Lạt-trip-\d{4}-\d{2}-\d{2}\.csv$/,
  )
  const csv = await readFile(await download.path(), 'utf8')
  expect(csv.startsWith('﻿Date,Type,Description')).toBe(true)
  expect(csv).toContain(
    ',Expense,Dinner,Food & drink,1200000,VND,Minh,,300000,300000,300000,300000',
  )
  expect(csv).toContain(',Expense,Taxi,Transport,160000,VND,Bảo,,40000,40000,40000,40000')
  expect(csv).toContain(',Payment,,,340000,VND,An,Minh,')
})

test('splits by exact amounts, shares and percentages', async ({ page }) => {
  await createTrip(page)
  await page.getByRole('link', { name: 'Add expense' }).click()
  await page.getByLabel('Amount', { exact: true }).fill('100000')
  await page.getByLabel('What was it for?').fill('Hotel')

  await page.getByRole('radio', { name: 'Exact amounts' }).check()
  await page.getByLabel('Amount for Minh (you)').fill('60000')
  await page.getByLabel('Amount for An').fill('30000')
  await expect(page.getByText('₫10,000 left to assign')).toBeVisible()
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByText('The amounts must add up to ₫100,000.')).toBeVisible()
  await page.getByLabel('Amount for Linh').fill('10000')
  await expect(page.getByText('Adds up')).toBeVisible()

  await page.getByRole('radio', { name: 'Percentages' }).check()
  await page.getByLabel('Percentage for Minh (you)').fill('50')
  await page.getByLabel('Percentage for An').fill('50')
  await page.getByLabel('Percentage for Linh').fill('')
  await page.getByLabel('Percentage for Bảo').fill('')
  await expect(page.getByText('Adds up')).toBeVisible()

  await page.getByRole('radio', { name: 'Shares' }).check()
  await page.getByLabel('Shares for Minh (you)').fill('2')
  await page.getByLabel('Shares for Linh').fill('0')
  await page.getByLabel('Shares for Bảo').fill('0')
  await page.getByRole('button', { name: 'Save expense' }).click()

  const hotel = page.getByRole('link', { name: /Hotel/ })
  await expect(hotel).toContainText('you lent ₫33,333')
  await tab(page, 'Balances').click()
  await expect(page.getByText('An', { exact: true }).locator('..')).toContainText('owes ₫33,333')
})

test('takes part amounts and percentages below one, typed key by key', async ({ page }) => {
  await createTrip(page)
  await page.getByRole('link', { name: 'Add expense' }).click()
  await page.getByLabel('Amount', { exact: true }).fill('100000')
  await page.getByRole('radio', { name: 'Percentages' }).check()
  const an = page.getByLabel('Percentage for An')
  await an.fill('')
  // "0" and "0." mean no percentage yet; the field must keep them as typed.
  await an.pressSequentially('0.5')
  await expect(an).toHaveValue('0.5')
  await page.getByRole('radio', { name: 'Exact amounts' }).check()
  const linh = page.getByLabel('Amount for Linh')
  await linh.pressSequentially('0')
  await expect(linh).toHaveValue('0')
})

test('refuses a date outside 1900 to 2999 instead of losing the expense', async ({ page }) => {
  await createTrip(page)
  await page.getByRole('link', { name: 'Add expense' }).click()
  await page.getByLabel('Amount', { exact: true }).fill('100000')
  await page.getByLabel('What was it for?').fill('Old receipt')
  await page.getByLabel('Date').fill('0026-11-11')
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByText('Choose a date from 1900 to 2999.')).toBeVisible()
  await expect(page.getByLabel('Date')).toBeFocused()
  await page.getByLabel('Date').fill('2026-11-11')
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByRole('link', { name: /Old receipt/ })).toBeVisible()
})

test('keeps the filters open while clearing the last one', async ({ page }) => {
  await createTrip(page)
  await addExpense(page, { amount: '160000', title: 'Taxi', category: 'Transport' })
  await page.getByText('Filters').click()
  const category = page.getByLabel('Category')
  await category.selectOption({ label: 'Transport' })
  await category.selectOption({ label: 'Any category' })
  await expect(category).toBeVisible()
})

test('searches, filters, deletes and restores', async ({ page }) => {
  await createTrip(page)
  await addExpense(page, { amount: '90000', title: 'Phở Thìn', category: 'Food & drink' })
  await addExpense(page, { amount: '160000', title: 'Taxi', category: 'Transport' })

  await page.getByRole('searchbox', { name: 'Search expenses' }).fill('pho')
  await expect(page.getByRole('link', { name: /Phở Thìn/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Taxi/ })).toHaveCount(0)
  await expect(page.getByText('1 match · ₫90,000 spent')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search expenses' }).fill('')

  await page.getByText('Filters').click()
  await page.getByLabel('Category').selectOption({ label: 'Transport' })
  await expect(page.getByRole('link', { name: /Phở Thìn/ })).toHaveCount(0)

  // Back undoes each filter step: the category, then clearing the search.
  await page.goBack()
  await expect(page).not.toHaveURL(/\?/)
  await expect(page.getByRole('link', { name: /Phở Thìn/ })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\?q=pho$/)
  await expect(page.getByRole('searchbox', { name: 'Search expenses' })).toHaveValue('pho')
  await page.goForward()
  await expect(page).not.toHaveURL(/\?/)
  await page.goForward()
  await expect(page).toHaveURL(/\?c=transport$/)
  await page.reload()
  await expect(page.getByRole('link', { name: /Taxi/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Phở Thìn/ })).toHaveCount(0)

  // Opening an item and coming back, by saving or by the back link, keeps them.
  await page.getByRole('link', { name: /Taxi/ }).click()
  await page.getByLabel('Amount', { exact: true }).fill('170000')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('link', { name: /Taxi.*170,000/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Phở Thìn/ })).toHaveCount(0)
  await expect(page).toHaveURL(/\?c=transport$/)
  await page.getByRole('link', { name: /Taxi/ }).click()
  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page.getByRole('link', { name: /Taxi/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Phở Thìn/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear filters' }).click()

  await page.getByRole('link', { name: /Taxi/ }).click()
  await page.getByRole('button', { name: 'Delete expense' }).click()
  await expect(page.getByRole('status').getByText('Expense deleted')).toBeVisible()
  await expect(page.getByRole('link', { name: /Taxi/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('link', { name: /Taxi/ })).toBeVisible()

  await page.getByRole('link', { name: /Taxi/ }).click()
  await page.getByRole('button', { name: 'Delete expense' }).click()
  await tab(page, 'Activity').click()
  await page.getByRole('button', { name: 'Restore' }).click()
  await tab(page, 'Expenses').click()
  await expect(page.getByRole('link', { name: /Taxi/ })).toBeVisible()
})

test('speaks Vietnamese, with Vietnamese number formats', async ({ page }) => {
  await createTrip(page)
  await addExpense(page, { amount: '1200000', title: 'Dinner', category: 'Food & drink' })
  await page.getByRole('link', { name: 'Group settings' }).click()
  await page.getByLabel('Language').selectOption('vi')
  await page.getByRole('link', { name: 'Quay lại' }).click()

  await expect(page.locator('html')).toHaveAttribute('lang', 'vi')
  const dinner = page.getByRole('link', { name: /Dinner/ })
  await expect(dinner).toContainText('Bạn đã trả 1.200.000')
  await expect(dinner).toContainText('bạn cho mượn 900.000')
  await expect(page.getByRole('navigation', { name: 'Các mục của nhóm' })).toContainText('Công nợ')
})

test('people can be added, renamed and removed', async ({ page }) => {
  await createTrip(page)
  await page.getByRole('link', { name: 'Group settings' }).click()

  await page.getByLabel('Add a person').fill('Hoa')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByLabel('Name for Hoa')).toBeVisible()

  await page.getByLabel('Name for Linh').fill('Linh Trần')
  await page.getByLabel('Name for Linh').press('Enter')
  await expect(page.getByLabel('Name for Linh Trần')).toBeVisible()

  await page.getByLabel('Name for An').fill('Bảo')
  await expect(page.getByText('Someone in the group already has that name.')).toBeVisible()
  await page.getByLabel('Name for An').fill('An')

  await page.getByRole('button', { name: 'Remove Hoa' }).click()
  await expect(page.getByRole('button', { name: 'Bring back Hoa' })).toBeVisible()
})

test('shows a rename made elsewhere, rather than saving the old name back', async ({ page }) => {
  await createTrip(page)
  await page.getByRole('link', { name: 'Group settings' }).click()
  // Another tab stands in for another device: both reach this one the same way.
  const other = await page.context().newPage()
  await other.goto(page.url())
  await other.getByLabel('Name for An').fill('Anh')
  await other.getByLabel('Name for An').press('Enter')
  await other.getByLabel('Group name').fill('Đà Lạt 2026')
  await other.getByLabel('Group name').press('Enter')

  await expect(page.getByLabel('Name for Anh')).toHaveValue('Anh')
  await expect(page.getByLabel('Group name')).toHaveValue('Đà Lạt 2026')
  // Nothing to save: the field holds what's stored.
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
})

test('settles up with someone removed who still owes', async ({ page }) => {
  await createTrip(page)
  await addExpense(page, { amount: '160000', title: 'Taxi', category: 'Transport' })
  await page.getByRole('link', { name: /Taxi/ }).click()
  await page.getByRole('button', { name: 'Delete expense' }).click()
  await page.getByRole('link', { name: 'Group settings' }).click()
  await page.getByRole('button', { name: 'Remove Bảo' }).click()
  await page.getByRole('link', { name: 'Back' }).click()
  await tab(page, 'Activity').click()
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Taxi' })
    .getByRole('button', { name: 'Restore' })
    .click()

  await tab(page, 'Balances').click()
  await expect(page.getByText('Bảo pays you')).toBeVisible()
  await page
    .getByRole('link', { name: /Other amount/ })
    .last()
    .click()
  await expect(page.getByLabel('Who paid')).toHaveValue(/.+/)
  expect(await page.getByLabel('Who paid').locator('option:checked').textContent()).toContain('Bảo')
  await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('40,000')
})

test('finds a currency by name or code', async ({ page }) => {
  await page.goto('/new')
  const currency = page.getByLabel('Currency', { exact: true })
  const search = page.getByLabel('Find a currency')
  await expect(currency).toHaveValue('USD')

  await search.fill('baht')
  await expect(page.getByText('1 currency matches')).toBeVisible()
  // The chosen currency stays listed, so the list still shows it.
  await expect(currency.locator('option')).toHaveText(['USD · US Dollar', 'THB · Thai Baht'])
  await expect(currency).toHaveValue('USD')
  // Enter searches; it doesn't submit the form.
  await search.press('Enter')
  await expect(page.getByText('Give the group a name.')).toHaveCount(0)
  await currency.selectOption('THB')

  await search.fill('zzz')
  await expect(page.getByText('No currency matches “zzz”.')).toBeVisible()
  await expect(currency).toHaveValue('THB')
  await search.fill('')

  await page.getByLabel('Group name').fill('Bangkok')
  await page.getByLabel('Your name').fill('Minh')
  await page.getByLabel('Person 1', { exact: true }).fill('An')
  await page.getByRole('button', { name: 'Create group' }).click()
  await page
    .getByRole('dialog', { name: 'Invite people' })
    .getByRole('button', { name: 'Close' })
    .click()
  await page.getByRole('link', { name: 'Group settings' }).click()
  await expect(page.getByLabel('Currency', { exact: true })).toHaveValue('THB')
})

test('keeps at least two people', async ({ page }) => {
  await page.goto('/new')
  await page.getByLabel('Group name').fill('Flat')
  await page.getByLabel('Your name').fill('Minh')
  await page.getByLabel('Person 1', { exact: true }).fill('An')
  await page.getByRole('button', { name: 'Create group' }).click()
  await page
    .getByRole('dialog', { name: 'Invite people' })
    .getByRole('button', { name: 'Close' })
    .click()
  await page.getByRole('link', { name: 'Group settings' }).click()

  await expect(page.getByRole('button', { name: 'Remove An' })).toHaveCount(0)
  await expect(page.getByText('A group needs at least 2 people.')).toBeVisible()

  // With a third person, either of the others can go, but not both.
  await page.getByLabel('Add a person').fill('Linh')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Remove An' }).click()
  await expect(page.getByRole('button', { name: 'Bring back An' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove Linh' })).toHaveCount(0)
})

test('stops at 50 people, and says so', async ({ page }) => {
  await page.goto('/new')
  await page.getByLabel('Group name').fill('Big party')
  await page.getByLabel('Your name').fill('Minh')
  for (let number = 1; number <= 49; number++) {
    if (number > 1) await page.getByRole('button', { name: 'Add another person' }).click()
    await page.getByLabel(`Person ${number}`, { exact: true }).fill(`Guest ${number}`)
  }
  await expect(page.getByRole('button', { name: 'Add another person' })).toHaveCount(0)
  await expect(page.getByText('A group can have at most 50 people.')).toBeVisible()
  await page.getByRole('button', { name: 'Create group' }).click()
  await page
    .getByRole('dialog', { name: 'Invite people' })
    .getByRole('button', { name: 'Close' })
    .click()

  await page.getByRole('link', { name: 'Group settings' }).click()
  await page.getByLabel('Add a person').fill('Hoa')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('A group can have at most 50 people.')).toBeVisible()
  await expect(page.getByLabel('Name for Hoa')).toHaveCount(0)

  // Removing someone makes room.
  await page.getByRole('button', { name: 'Remove Guest 49' }).click()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByLabel('Name for Hoa')).toBeVisible()
  await page.getByRole('button', { name: 'Bring back Guest 49' }).click()
  await expect(
    page.getByRole('status').getByText('A group can have at most 50 people.'),
  ).toBeVisible()
})
