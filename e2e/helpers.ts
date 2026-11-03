import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

export async function expectNoAxeViolations(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze()
  const summary = violations.map((violation) => ({
    id: violation.id,
    nodes: violation.nodes.map((node) => node.target.join(' ')),
  }))
  expect(summary, `axe on ${screen}`).toEqual([])
}

/** Creates the walkthrough's group as Minh, and waits for its screen. */
export async function createTrip(page: Page) {
  await page.goto('/')
  await page.getByRole('link', { name: 'New group' }).click()
  await page.getByLabel('Group name').fill('Đà Lạt trip')
  await page.getByLabel('Currency').selectOption('VND')
  await page.getByLabel('Your name').fill('Minh')
  await page.getByLabel('Person 1', { exact: true }).fill('An')
  for (const [index, name] of ['Linh', 'Bảo'].entries()) {
    await page.getByRole('button', { name: 'Add another person' }).click()
    await page.getByLabel(`Person ${index + 2}`, { exact: true }).fill(name)
  }
  await page.getByRole('button', { name: 'Create group' }).click()
  // The invite opens first, ready to send.
  const invite = page.getByRole('dialog', { name: 'Invite people' })
  await expect(invite).toBeVisible()
  await invite.getByRole('button', { name: 'Close' }).click()
  await expect(invite).toBeHidden()
  await expect(page.getByText('You’re settled up')).toBeVisible()
}

export async function addExpense(
  page: Page,
  { amount, title, category }: { amount: string; title: string; category: string },
) {
  await page.getByRole('link', { name: 'Add expense' }).click()
  await page.getByLabel('Amount', { exact: true }).fill(amount)
  await page.getByLabel('What was it for?').fill(title)
  await page.getByLabel('Category').selectOption({ label: category })
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible()
}

/** Switches who this device acts as, then returns to the expenses tab. */
export async function actAs(page: Page, name: string) {
  await page.getByRole('link', { name: 'Group settings' }).click()
  await page.getByLabel('On this device, you are').selectOption({ label: name })
  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page.getByRole('link', { name: 'Add expense' })).toBeVisible()
}

export function tab(page: Page, name: 'Expenses' | 'Balances' | 'Activity') {
  return page.getByRole('navigation', { name: 'Group sections' }).getByRole('link', { name })
}
