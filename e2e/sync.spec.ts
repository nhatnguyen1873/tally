// The walkthrough from SPEC.md section 3 on separate phones: each one its own
// browser context with its own storage, meeting only at the relay.
import { expect, type Page, test } from '@playwright/test'

import {
  addExpense,
  createTrip,
  expectNoAxeViolations,
  joinAs,
  phone,
  readyOffline,
  tab,
} from './helpers.ts'

const transfersOn = (page: Page) =>
  page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Mark as paid' }) })

test('the Đà Lạt trip on four phones, one of them offline for a while', async ({
  page: minh,
  browser,
}, testInfo) => {
  const invite = await createTrip(minh)
  const an = await phone(browser, testInfo)
  const linh = await phone(browser, testInfo)
  const bao = await phone(browser, testInfo)
  await joinAs(an.page, invite, 'An')
  await joinAs(linh.page, invite, 'Linh')
  await joinAs(bao.page, invite, 'Bảo')

  // Minh logs dinner; every phone shows its own part, without a refresh.
  await addExpense(minh, { amount: '1200000', title: 'Dinner', category: 'Food & drink' })
  await expect(minh.getByRole('link', { name: /Dinner/ })).toContainText('you lent ₫900,000')
  await expect(an.page.getByRole('link', { name: /Dinner/ })).toContainText('you borrowed ₫300,000')
  await expect(linh.page.getByRole('link', { name: /Dinner/ })).toContainText(
    'you borrowed ₫300,000',
  )

  // Bảo, offline on the bus, logs the taxi with a missing zero.
  await bao.context.setOffline(true)
  await expect(bao.page.getByRole('button', { name: 'Offline' })).toBeVisible()
  await addExpense(bao.page, { amount: '16000', title: 'Taxi', category: 'Transport' })
  await expect(bao.page.getByRole('button', { name: 'Offline · 1 change waiting' })).toBeVisible()
  await expect(minh.getByRole('link', { name: /Taxi/ })).toHaveCount(0)

  // Back online, the taxi reaches everyone.
  await bao.context.setOffline(false)
  await expect(minh.getByRole('link', { name: /Taxi/ })).toContainText('Bảo paid ₫16,000')
  await expect(bao.page.getByRole('button', { name: 'Synced' })).toBeVisible()

  // An fixes the typo; Minh's activity feed shows who changed what.
  await an.page.getByRole('link', { name: /Taxi/ }).click()
  await an.page.getByLabel('Amount', { exact: true }).fill('160000')
  await an.page.getByRole('button', { name: 'Save changes' }).click()
  await tab(minh, 'Activity').click()
  await expect(minh.getByText('An changed Taxi')).toBeVisible()
  await expect(minh.getByText('Amount: ₫16,000 → ₫160,000')).toBeVisible()

  // Settle up suggests the same three transfers everywhere.
  await tab(minh, 'Balances').click()
  const minhTransfers = transfersOn(minh)
  await expect(minhTransfers).toHaveCount(3)
  await expect(minhTransfers.nth(0)).toContainText('An pays you')
  await expect(minhTransfers.nth(0)).toContainText('₫340,000')
  await expect(minhTransfers.nth(1)).toContainText('Linh pays you')
  await expect(minhTransfers.nth(2)).toContainText('Bảo pays you')
  await expect(minhTransfers.nth(2)).toContainText('₫180,000')

  // An pays and marks it on An's phone; Minh's balances follow.
  await tab(an.page, 'Balances').click()
  const anTransfers = transfersOn(an.page)
  await expect(anTransfers.nth(0)).toContainText('You pay Minh')
  await anTransfers.nth(0).getByRole('button', { name: 'Mark as paid' }).click()
  await expect(minhTransfers).toHaveCount(2)
  await expect(minh.getByText('An', { exact: true }).locator('..')).toContainText('settled up')

  for (const other of [an, linh, bao]) await other.context.close()
})

test('a deletion on one phone can be restored from another’s activity', async ({
  page: minh,
  browser,
}, testInfo) => {
  const invite = await createTrip(minh)
  const an = await phone(browser, testInfo)
  await joinAs(an.page, invite, 'An')
  await addExpense(minh, { amount: '1200000', title: 'Dinner', category: 'Food & drink' })
  await expect(an.page.getByRole('link', { name: /Dinner/ })).toBeVisible()

  await minh.getByRole('link', { name: /Dinner/ }).click()
  await minh.getByRole('button', { name: 'Delete' }).click()
  await expect(an.page.getByRole('link', { name: /Dinner/ })).toHaveCount(0)

  await tab(an.page, 'Activity').click()
  await expect(an.page.getByText('Minh deleted Dinner')).toBeVisible()
  await an.page.getByRole('button', { name: 'Restore' }).first().click()
  await tab(minh, 'Expenses').click()
  await expect(minh.getByRole('link', { name: /Dinner/ })).toBeVisible()
  await an.context.close()
})

test.describe('joining', () => {
  test('as someone not on the list, who then shows on the other phones', async ({
    page: minh,
    browser,
  }, testInfo) => {
    const invite = await createTrip(minh)
    const thu = await phone(browser, testInfo)
    await thu.page.goto(invite)
    await expect(thu.page.getByRole('heading', { name: 'Who are you?' })).toBeVisible()
    // The key leaves the address bar once the group is on the phone.
    expect(new URL(thu.page.url()).hash).toBe('')
    await expectNoAxeViolations(thu.page, 'Who are you')

    await thu.page.getByRole('button', { name: 'Join the group' }).click()
    await expect(thu.page.getByText('Enter your name.')).toBeVisible()
    await thu.page.getByLabel('Your name').fill('Thư')
    await thu.page.getByRole('button', { name: 'Join the group' }).click()
    await expect(thu.page.getByRole('link', { name: 'Add expense' })).toBeVisible()

    await tab(minh, 'Activity').click()
    await expect(minh.getByText('Thư joined')).toBeVisible()
    await thu.context.close()
  })

  test('by pasting the link on the home screen', async ({ page: minh, browser }, testInfo) => {
    const invite = await createTrip(minh)
    const an = await phone(browser, testInfo)
    await an.page.goto('/')
    await an.page.getByRole('button', { name: 'Join with a link' }).click()
    await an.page.getByLabel('Invite link').fill('not a link')
    await an.page.getByRole('button', { name: 'Open group' }).click()
    await expect(an.page.getByText('That isn’t a whole Tally invite link.')).toBeVisible()
    await an.page.getByLabel('Invite link').fill(`Join us: http://example.test${invite} !`)
    await an.page.getByRole('button', { name: 'Open group' }).click()
    await expect(an.page.getByRole('heading', { name: 'Who are you?' })).toBeVisible()
    await an.context.close()
  })

  test('explains a link without its key, and a group nobody has uploaded', async ({ page }) => {
    await page.goto('/g/AAAAAAAAAAAAAAAAAAAAAA#cut-short')
    await expect(page.getByRole('heading', { name: 'This link is missing its key' })).toBeVisible()
    await page.goto(`/g/BBBBBBBBBBBBBBBBBBBBBB#${'C'.repeat(43)}`)
    await expect(page.getByRole('heading', { name: 'This group isn’t ready yet' })).toBeVisible()
    await expectNoAxeViolations(page, 'group not uploaded')
  })

  test('waits for a connection to open a group the first time', async ({
    page: minh,
    browser,
  }, testInfo) => {
    const invite = await createTrip(minh)
    const an = await phone(browser, testInfo)
    await an.page.goto('/')
    await readyOffline(an.page)
    await an.context.setOffline(true)
    await an.page.getByRole('button', { name: 'Join with a link' }).click()
    await an.page.getByLabel('Invite link').fill(`http://example.test${invite}`)
    await an.page.getByRole('button', { name: 'Open group' }).click()
    await expect(an.page.getByRole('heading', { name: 'You’re offline' })).toBeVisible()
    // Back online, it tries again by itself.
    await an.context.setOffline(false)
    await expect(an.page.getByRole('heading', { name: 'Who are you?' })).toBeVisible()
    await an.context.close()
  })
})

test('the share sheet still opens after going offline', async ({
  page: minh,
  browser,
}, testInfo) => {
  const invite = await createTrip(minh)
  // A phone that has never opened the share sheet, so hasn't needed its code.
  const an = await phone(browser, testInfo)
  await joinAs(an.page, invite, 'An')
  await readyOffline(an.page)
  await an.context.setOffline(true)
  await an.page.getByRole('button', { name: 'Invite people' }).click()
  await expect(an.page.getByRole('img', { name: 'QR code of the invite link' })).toBeVisible()
  await an.context.close()
})

test('the share sheet passes axe in both themes', async ({ page }) => {
  await createTrip(page)
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    await page.getByRole('button', { name: 'Invite people' }).click()
    await expect(page.getByRole('img', { name: 'QR code of the invite link' })).toBeVisible()
    await expectNoAxeViolations(page, `share sheet (${colorScheme})`)
    await page.getByRole('button', { name: 'Close' }).click()
  }
})
