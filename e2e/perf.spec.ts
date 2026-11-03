// The long-list audit (SPEC.md section 10): 2,000 expenses with the CPU slowed
// 4×, as a stand-in for a low-end Android phone. Timings vary too much on
// shared CI machines to gate on, so this runs on demand: `pnpm perf`.
import { expect, test } from '@playwright/test'

import { createTrip } from './helpers.ts'

const COUNT = 2000

test.skip(!process.env.PERF, 'run with `pnpm perf`')

/** Writes `count` expenses straight into this phone's storage, as if synced. */
const SEED = `(async (count) => {
  const db = await new Promise((resolve, reject) => {
    const open = indexedDB.open('tally')
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
  const read = (store, key) => new Promise((resolve) => {
    const request = db.transaction(store).objectStore(store)[key === undefined ? 'getAll' : 'get'](key)
    request.onsuccess = () => resolve(request.result)
  })
  const [record] = await read('groups')
  const ops = await read('ops')
  const members = ops.filter((r) => r.op.entity === 'member').map((r) => r.op.key)
  const wall = Date.now()
  const tx = db.transaction(['groups', 'ops'], 'readwrite')
  let hlc = ''
  for (let i = 0; i < count; i++) {
    hlc = String(wall + i).padStart(15, '0') + ':000000:' + record.actor
    const id = 'perf' + String(i).padStart(12, '0')
    const day = String(1 + (i % 28)).padStart(2, '0')
    const month = String(1 + Math.floor(i / 200) % 12).padStart(2, '0')
    tx.objectStore('ops').put({ groupId: record.id, id, synced: true, op: {
      v: 1, id, hlc, actor: record.actor, by: record.me, entity: 'expense', key: 'exp' + id,
      set: {
        title: 'Item ' + i,
        money: { amount: 10000 + i, paidBy: members[i % members.length], split: { mode: 'equal', among: members } },
        date: '2026-' + month + '-' + day,
        category: ['food', 'transport', 'groceries', 'other'][i % 4],
      },
    } })
  }
  tx.objectStore('groups').put({ ...record, clock: hlc })
  await new Promise((resolve) => { tx.oncomplete = resolve })
})`

test('2,000 expenses stay smooth with the CPU slowed 4×', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android', 'CPU throttling needs Chromium')
  test.setTimeout(180_000)
  await createTrip(page)
  await page.evaluate(`${SEED}(${COUNT})`)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

  // Opening the group: from navigation until every row is in the page, and
  // how long the main thread was blocked doing it (long tasks over 50 ms, as
  // the browser reports them). Rows are counted with a plain selector: role
  // locators compute every row's style, which would undo content-visibility.
  await page.addInitScript(`
    window.blocked = 0
    new PerformanceObserver((list) => {
      for (const task of list.getEntries()) window.blocked += task.duration - 50
    }).observe({ type: 'longtask', buffered: true })
    // Each key press, from the press until the next paint (the Event Timing API).
    window.keys = []
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'keydown' || entry.name === 'keypress') window.keys.push(entry.duration)
      }
    }).observe({ type: 'event', durationThreshold: 16, buffered: true })
  `)
  const rows = page.locator('main li a[href*="/e/"]')
  const opened = Date.now()
  await page.reload()
  await expect(rows).toHaveCount(COUNT, { timeout: 60_000 })
  const openMs = Date.now() - opened
  await page.waitForTimeout(1500)
  const openBlockedMs = Math.round(await page.evaluate<number>('window.blocked'))

  // Scrolling through: frame times while scrolling 3 seconds.
  const frames = await page.evaluate<number[]>(`new Promise((resolve) => {
    const times = []
    let last = performance.now()
    const end = last + 3000
    const step = (now) => {
      times.push(now - last)
      last = now
      window.scrollBy(0, 120)
      if (now < end) requestAnimationFrame(step)
      else resolve(times)
    }
    requestAnimationFrame(step)
  })`)
  const sorted = [...frames].sort((a, b) => a - b)
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
  const long = frames.filter((ms) => ms > 50).length

  // Searching, typed one key at a time: the slowest key until its paint, and
  // until the one match is on screen.
  await page.evaluate('window.scrollTo(0, 0); window.keys = []')
  const typed = Date.now()
  await page.getByRole('searchbox').pressSequentially('Item 1999', { delay: 100 })
  await expect(rows).toHaveCount(1)
  const searchMs = Date.now() - typed
  const slowestKeyMs = Math.round(Math.max(0, ...(await page.evaluate<number[]>('window.keys'))))

  // One change: adding an expense while all 2,000 are listed.
  await page.getByRole('searchbox').fill('')
  await expect(rows).toHaveCount(COUNT)
  const changed = Date.now()
  await page.getByRole('link', { name: 'Add expense' }).click()
  await page.getByLabel('Amount', { exact: true }).fill('50000')
  await page.getByLabel('What was it for?').fill('Coffee')
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByRole('link', { name: /Coffee/ })).toBeVisible()
  const addMs = Date.now() - changed

  const report = {
    expenses: COUNT,
    openMs,
    openBlockedMs,
    scrollFrames: frames.length,
    scrollP95Ms: Math.round(p95),
    framesOver50ms: long,
    searchMs,
    slowestKeyMs,
    addExpenseMs: addMs,
  }
  console.log(JSON.stringify(report))
  testInfo.annotations.push({ type: 'perf', description: JSON.stringify(report) })
})
