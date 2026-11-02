// The walkthrough from SPEC.md section 3, on one device: switching who the
// device acts as stands in for each friend's phone until sync arrives.
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
  await page.reload()
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
