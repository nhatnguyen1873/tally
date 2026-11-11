import { type Browser, expect, type Page, test, type TestInfo } from '@playwright/test'

import { addExpense, createTrip, expectNoAxeViolations, phone, tab } from './helpers.ts'

/** What each screen is called, in each language: enough to know it's there. */
const COPY = {
  en: {
    newGroup: 'New group',
    findCurrency: 'Find a currency',
    about: 'About Tally',
    notFound: 'Page not found',
    expenses: 'Expenses',
    editExpense: 'Edit expense',
    exact: 'Exact amounts',
    balances: 'Balances',
    addPayment: 'Record a payment',
    activity: 'Activity',
    settings: 'Group settings',
    share: 'Invite people',
    qr: 'QR code of the invite link',
    close: 'Close',
    join: 'Join with a link',
    joinTitle: 'Join a group',
    who: 'Who are you?',
    joinGroup: 'Join the group',
    missingKey: 'This link is missing its key',
    notUploaded: 'This group isn’t ready yet',
  },
  vi: {
    newGroup: 'Tạo nhóm',
    findCurrency: 'Tìm loại tiền',
    about: 'Giới thiệu Tally',
    notFound: 'Không tìm thấy trang',
    expenses: 'Khoản chi',
    editExpense: 'Sửa khoản chi',
    exact: 'Số tiền cụ thể',
    balances: 'Công nợ',
    addPayment: 'Ghi nhận khoản trả',
    activity: 'Lịch sử',
    settings: 'Cài đặt nhóm',
    share: 'Mời mọi người',
    qr: 'Mã QR của link mời',
    close: 'Đóng',
    join: 'Tham gia bằng link',
    joinTitle: 'Tham gia nhóm',
    who: 'Bạn là ai?',
    joinGroup: 'Tham gia nhóm',
    missingKey: 'Link này bị thiếu mã khóa',
    notUploaded: 'Nhóm này chưa sẵn sàng',
  },
} as const

type Language = keyof typeof COPY

/** Every page load after this one is in `language`. */
async function speak(page: Page, language: Language) {
  await page.addInitScript(
    `localStorage.setItem('tally:prefs', JSON.stringify({ language: '${language}' }))`,
  )
}

/**
 * Runs axe on every screen in one language and theme. The group is made in
 * English (the helpers find things by their English names), then each screen
 * is opened by its address in `language`.
 */
async function checkEveryScreen(
  page: Page,
  browser: Browser,
  testInfo: TestInfo,
  language: Language,
  colorScheme: 'light' | 'dark',
) {
  const copy = COPY[language]
  const check = (screen: string) =>
    expectNoAxeViolations(page, `${screen} (${language}, ${colorScheme})`)
  const heading = (name: string) => page.getByRole('heading', { level: 1, name, exact: true })
  await page.emulateMedia({ colorScheme })

  const invite = await createTrip(page)
  await addExpense(page, { amount: '1200000', title: 'Dinner', category: 'Food & drink' })
  const group = new URL(page.url()).pathname
  const expense = await page.getByRole('link', { name: /Dinner/ }).getAttribute('href')
  expect(expense).toMatch(/\/e\//)

  await speak(page, language)
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', language)
  await expect(page.getByRole('link', { name: /Đà Lạt trip/ })).toBeVisible()
  await check('home, with a group')
  await page.goto('/new')
  await expect(heading(copy.newGroup)).toBeAttached()
  await check('new group')
  await page.getByLabel(copy.findCurrency).fill('zzz')
  await check('new group, searching currencies')
  await page.goto('/about')
  await expect(heading(copy.about)).toBeAttached()
  await check('about')
  await page.goto('/nowhere')
  await expect(heading(copy.notFound)).toBeAttached()
  await check('not found')

  await page.goto(group)
  await expect(heading(copy.expenses)).toBeAttached()
  await expect(page.getByRole('link', { name: /Dinner/ })).toBeVisible()
  await check('expenses')
  await page.goto(expense ?? '')
  await expect(heading(copy.editExpense)).toBeAttached()
  await check('expense form')
  await page.getByRole('radio', { name: copy.exact }).check()
  await check('expense form, exact amounts')
  await page.goto(`${group}/balances`)
  await expect(heading(copy.balances)).toBeAttached()
  await check('balances')
  await page.goto(`${group}/pay/new`)
  await expect(heading(copy.addPayment)).toBeAttached()
  await check('payment form')
  await page.goto(`${group}/activity`)
  await expect(heading(copy.activity)).toBeAttached()
  await check('activity')
  await page.goto(`${group}/settings`)
  await expect(heading(copy.settings)).toBeAttached()
  await check('settings')
  await page.goto(group)
  await page.getByRole('button', { name: copy.share }).click()
  await expect(page.getByRole('img', { name: copy.qr })).toBeVisible()
  await check('share sheet')

  // Joining, on another phone that has never seen the group.
  const other = await phone(browser, testInfo, { colorScheme })
  const joining = other.page
  const checkJoining = (screen: string) =>
    expectNoAxeViolations(joining, `${screen} (${language}, ${colorScheme})`)
  await speak(joining, language)
  await joining.goto('/')
  await expect(joining.locator('html')).toHaveAttribute('lang', language)
  await checkJoining('home, empty')
  await joining.getByRole('button', { name: copy.join }).click()
  await expect(joining.getByRole('dialog', { name: copy.joinTitle })).toBeVisible()
  await checkJoining('join with a link')
  await joining.goto('/g/AAAAAAAAAAAAAAAAAAAAAA#cut-short')
  await expect(joining.getByRole('heading', { name: copy.missingKey })).toBeVisible()
  await checkJoining('link missing its key')
  await joining.goto(`/g/BBBBBBBBBBBBBBBBBBBBBB#${'C'.repeat(43)}`)
  await expect(joining.getByRole('heading', { name: copy.notUploaded })).toBeVisible()
  await checkJoining('group not uploaded')
  await joining.goto(invite)
  await expect(joining.getByRole('heading', { name: copy.who })).toBeVisible()
  await checkJoining('who are you')
  await joining.getByRole('button', { name: copy.joinGroup }).click()
  await expect(joining.locator('[aria-invalid="true"]')).toBeVisible()
  await checkJoining('who are you, without a name')
  await other.context.close()
}

for (const language of ['en', 'vi'] as const) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`every screen passes axe at WCAG 2.2 AA (${language}, ${colorScheme})`, async ({
      page,
      browser,
    }, testInfo) => {
      // The longest tests, twice as slow on WebKit: on a busy machine they
      // pass the 30 s default. Each step still waits at most 5 s.
      test.slow()
      await checkEveryScreen(page, browser, testInfo, language, colorScheme)
    })
  }
}

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
    // Past the currency search and the currency.
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Find a currency')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Currency', { exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Your name')).toBeFocused()
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

    // Its Close button returns focus too.
    await page.keyboard.press('Enter')
    await expect(sheet.getByRole('button', { name: 'Close' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(sheet).toBeHidden()
    await expect(share).toBeFocused()
  })
})

test('nothing scrolls sideways at 200% zoom', async ({ page, browser }, testInfo) => {
  // Zooming to 200% halves the width the page lays out in.
  const { width, height } = page.viewportSize() ?? { width: 390, height: 844 }
  const overflow = async (screen: string) => {
    const wide = await page.evaluate<number>(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    )
    expect(wide, `${screen} is wider than the screen`).toBeLessThanOrEqual(0)
  }
  const invite = await createTrip(page)
  await addExpense(page, { amount: '1200000', title: 'Dinner', category: 'Food & drink' })
  const group = new URL(page.url()).pathname
  const half = { width: Math.round(width / 2), height: Math.round(height / 2) }
  await page.setViewportSize(half)
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
  await page.goto(`${group}/pay/new`)
  await expect(page.getByRole('heading', { name: 'Record a payment' })).toBeAttached()
  await overflow('payment form')
  for (const path of ['/', '/new', '/about', '/nowhere', '/g/AAAAAAAAAAAAAAAAAAAAAA#cut-short']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeAttached()
    await overflow(path)
  }

  // Joining, on a phone that has never seen the group.
  const other = await phone(browser, testInfo, { viewport: half })
  await other.page.goto(invite)
  await expect(other.page.getByRole('heading', { name: 'Who are you?' })).toBeVisible()
  const wide = await other.page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  )
  expect(wide, 'Who are you is wider than the screen').toBeLessThanOrEqual(0)
  await other.context.close()
})
