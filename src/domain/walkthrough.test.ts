// The walkthrough from SPEC.md section 3, played out on four simulated phones.
import { describe, expect, it } from 'vitest'

import { balances, expenseEffect } from './balances.ts'
import { foldOps, type GroupState } from './fold.ts'
import type { Op } from './ops.ts'
import { settleUp } from './settle.ts'
import { Device, GROUP_ID, id, VND } from './testing.ts'

const MINH = id('minh')
const AN = id('an')
const LINH = id('linh')
const BAO = id('bao')
const TAXI = id('taxi')
const EVERYONE = { mode: 'equal', among: [MINH, AN, LINH, BAO] }

function suggestions(state: GroupState) {
  return settleUp([...balances(state)].map(([member, balance]) => [member, balance.net]))
}

describe('the Đà Lạt trip', () => {
  it('ends with the transfers the spec promises, on every phone', () => {
    const phones = {
      minh: new Device('minh'),
      an: new Device('an'),
      linh: new Device('linh'),
      bao: new Device('bao'),
    }
    const log: Op[] = []
    const share = (...ops: Op[]) => {
      log.push(...ops)
      for (const phone of Object.values(phones)) phone.receive(ops)
    }

    // 1–3. Minh creates the group, adds everyone and shares the link.
    share(
      phones.minh.op(MINH, 'group', GROUP_ID, { name: 'Đà Lạt trip', currency: VND }),
      phones.minh.op(MINH, 'member', MINH, { name: 'Minh' }),
      phones.minh.op(MINH, 'member', AN, { name: 'An' }),
      phones.minh.op(MINH, 'member', LINH, { name: 'Linh' }),
      phones.minh.op(MINH, 'member', BAO, { name: 'Bảo' }),
    )

    // 4. Dinner, 1,200,000₫, paid by Minh, split equally.
    share(
      phones.minh.op(MINH, 'expense', id('dinner'), {
        title: 'Dinner',
        money: { amount: 1_200_000, paidBy: MINH, split: EVERYONE },
        date: '2026-11-02',
        category: 'food',
      }),
    )
    const dinner = foldOps(GROUP_ID, log).expenses.get(id('dinner'))
    if (!dinner) throw new Error('dinner missing')
    expect(expenseEffect(dinner, AN).net).toBe(-300_000) // "You borrowed 300,000₫"
    expect(expenseEffect(dinner, MINH).net).toBe(900_000) // "You lent 900,000₫"

    // 5. Bảo, offline on the bus, logs the taxi with a missing zero.
    const taxi = phones.bao.op(BAO, 'expense', TAXI, {
      title: 'Taxi',
      money: { amount: 16_000, paidBy: BAO, split: EVERYONE },
      date: '2026-11-02',
      category: 'transport',
    })
    share(taxi) // Bảo's phone reconnects.

    // 6. An fixes the typo.
    share(
      phones.an.op(AN, 'expense', TAXI, {
        money: { amount: 160_000, paidBy: BAO, split: EVERYONE },
      }),
    )
    const state = foldOps(GROUP_ID, log)
    const fix = state.activity.at(-1)
    expect(fix).toMatchObject({ by: AN, key: TAXI, kind: 'updated' })
    expect(fix?.changes).toEqual([
      {
        field: 'money',
        before: { amount: 16_000, paidBy: BAO, split: EVERYONE },
        after: { amount: 160_000, paidBy: BAO, split: EVERYONE },
      },
    ])

    // 7. Settle up: three transfers, all to Minh.
    expect(suggestions(state)).toEqual([
      { from: AN, to: MINH, amount: 340_000 },
      { from: LINH, to: MINH, amount: 340_000 },
      { from: BAO, to: MINH, amount: 180_000 },
    ])

    // An pays and taps "Mark as paid".
    share(
      phones.an.op(AN, 'payment', id('an-pays-minh'), {
        money: { amount: 340_000, from: AN, to: MINH },
        date: '2026-11-03',
      }),
    )
    const after = foldOps(GROUP_ID, log)
    expect(balances(after).get(AN)?.net).toBe(0)
    expect(suggestions(after)).toEqual([
      { from: LINH, to: MINH, amount: 340_000 },
      { from: BAO, to: MINH, amount: 180_000 },
    ])

    // Every phone, receiving the log in its own order, agrees.
    const reversed = foldOps(GROUP_ID, [...log].reverse())
    expect([...reversed.expenses]).toEqual([...after.expenses])
    expect(reversed.activity).toEqual(after.activity)
  })
})
