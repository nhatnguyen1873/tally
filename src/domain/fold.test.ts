import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { foldOps, type GroupState } from './fold.ts'
import type { EntityKind, Op } from './ops.ts'
import { Device, GROUP_ID, id, VND } from './testing.ts'
import { stableStringify } from './util.ts'

const MINH = id('minh')
const AN = id('an')
const LINH = id('linh')
const BAO = id('bao')
const MEMBERS = [MINH, AN, LINH, BAO]
const DINNER = id('dinner')
const EVERYONE = { mode: 'equal', among: MEMBERS }

function setup(device: Device): Op[] {
  return [
    device.op(MINH, 'group', GROUP_ID, { name: 'Đà Lạt trip', currency: VND }),
    device.op(MINH, 'member', MINH, { name: 'Minh' }),
    device.op(MINH, 'member', AN, { name: 'An' }),
    device.op(MINH, 'member', LINH, { name: 'Linh' }),
    device.op(MINH, 'member', BAO, { name: 'Bảo' }),
  ]
}

function dinner(device: Device): Op {
  return device.op(MINH, 'expense', DINNER, {
    title: 'Dinner',
    money: { amount: 1_200_000, paidBy: MINH, split: EVERYONE },
    date: '2026-11-02',
    category: 'food',
  })
}

/** Minh's phone sets up the trip and logs dinner; the others have synced since. */
function trip() {
  const minh = new Device('minh')
  const base = [...setup(minh), dinner(minh)]
  const an = new Device('an', minh.now)
  const linh = new Device('linh', minh.now)
  an.receive(base)
  linh.receive(base)
  return { base, minh, an, linh }
}

/** Everything that must match across devices, as one comparable string. */
function snapshot(state: GroupState): string {
  return stableStringify({
    group: state.group,
    members: [...state.members],
    expenses: [...state.expenses],
    payments: [...state.payments],
    activity: state.activity,
    rejected: state.rejected,
    latestHlc: state.latestHlc,
  })
}

describe('foldOps', () => {
  it('builds the group, its members and expenses', () => {
    const { base } = trip()
    const state = foldOps(GROUP_ID, base)

    expect(state.group).toEqual({ name: 'Đà Lạt trip', currency: VND })
    expect([...state.members.values()].map((member) => member.name)).toEqual([
      'Minh',
      'An',
      'Linh',
      'Bảo',
    ])
    expect(state.expenses.get(DINNER)).toMatchObject({
      title: 'Dinner',
      amount: 1_200_000,
      paidBy: MINH,
      split: EVERYONE,
      date: '2026-11-02',
      category: 'food',
      deleted: false,
      createdBy: MINH,
    })
    expect(state.rejected).toEqual([])
    expect(state.latestHlc).toBe(base.at(-1)?.hlc)
  })

  it('records who changed what, and skips writes that change nothing', () => {
    const { base, an } = trip()
    const rename = an.op(AN, 'expense', DINNER, { title: 'Dinner at Tháp Bay' })
    const again = an.op(AN, 'expense', DINNER, { title: 'Dinner at Tháp Bay' })
    const state = foldOps(GROUP_ID, [...base, rename, again])

    expect(state.activity.map((entry) => entry.kind)).toEqual([
      ...Array<string>(6).fill('created'),
      'updated',
    ])
    expect(state.activity.at(-1)).toMatchObject({
      opId: rename.id,
      by: AN,
      entity: 'expense',
      key: DINNER,
      kind: 'updated',
      changes: [{ field: 'title', before: 'Dinner', after: 'Dinner at Tháp Bay' }],
    })
    expect(state.expenses.get(DINNER)?.updatedAt).toBe(rename.hlc)
  })

  it('lets the latest write win for each field, in any arrival order', () => {
    const { base, an, linh } = trip()
    const fromAn = an.op(AN, 'expense', DINNER, { title: 'Dinner (An)', date: '2026-11-01' }, 1000)
    const fromLinh = linh.op(LINH, 'expense', DINNER, { title: 'Dinner (Linh)' }, 5000)

    for (const ops of [
      [...base, fromAn, fromLinh],
      [fromLinh, fromAn, ...base],
    ]) {
      // Linh wrote the title last; only An touched the date, so An's date stays.
      expect(foldOps(GROUP_ID, ops).expenses.get(DINNER)).toMatchObject({
        title: 'Dinner (Linh)',
        date: '2026-11-01',
      })
    }
  })

  it('changes amount, payer and split together, so concurrent edits never mix', () => {
    const { base, an, linh } = trip()
    const anMoney = {
      amount: 1_000_000,
      paidBy: AN,
      split: { mode: 'exact', amounts: { [MINH]: 400_000, [AN]: 600_000 } },
    }
    const linhMoney = {
      amount: 1_200_000,
      paidBy: MINH,
      split: { mode: 'shares', shares: { [MINH]: 2, [LINH]: 1 } },
    }
    const fromAn = an.op(AN, 'expense', DINNER, { money: anMoney }, 1000)
    const fromLinh = linh.op(LINH, 'expense', DINNER, { money: linhMoney }, 5000)

    const expense = foldOps(GROUP_ID, [...base, fromLinh, fromAn]).expenses.get(DINNER)
    expect(expense).toMatchObject({ amount: 1_200_000, paidBy: MINH, split: linhMoney.split })
  })

  it('keeps a deleted expense deleted when someone edits it at the same time', () => {
    const { base, an, linh } = trip()
    const remove = an.op(AN, 'expense', DINNER, { deleted: true }, 1000)
    const retitle = linh.op(LINH, 'expense', DINNER, { title: 'Dinner!' }, 5000)
    const state = foldOps(GROUP_ID, [...base, retitle, remove])

    expect(state.expenses.get(DINNER)).toMatchObject({ deleted: true, title: 'Dinner!' })
    expect(state.activity.slice(-2).map((entry) => [entry.kind, entry.by])).toEqual([
      ['deleted', AN],
      ['updated', LINH],
    ])
  })

  it('restores deleted expenses', () => {
    const { base, an } = trip()
    const remove = an.op(AN, 'expense', DINNER, { deleted: true })
    const restore = an.op(AN, 'expense', DINNER, { deleted: false, title: 'Dinner (back)' })
    const state = foldOps(GROUP_ID, [...base, remove, restore])

    expect(state.expenses.get(DINNER)).toMatchObject({ deleted: false, title: 'Dinner (back)' })
    expect(state.activity.at(-1)).toMatchObject({
      kind: 'restored',
      changes: [{ field: 'title', before: 'Dinner', after: 'Dinner (back)' }],
    })
  })

  it('counts a repeated operation once', () => {
    const { base } = trip()
    expect(snapshot(foldOps(GROUP_ID, [...base, ...base]))).toBe(snapshot(foldOps(GROUP_ID, base)))
  })

  it('rejects operations that break the rules, and applies the rest', () => {
    const { base, an } = trip()
    const stranger = id('stranger')
    const cases: [Op, string][] = [
      [an.op(AN, 'group', id('other-group'), { name: 'Elsewhere' }), 'wrong-group'],
      [an.op(AN, 'group', GROUP_ID, { name: '' }), 'invalid-name'],
      [an.op(AN, 'group', GROUP_ID, { currency: { code: 'VND', digits: 9 } }), 'invalid-currency'],
      [an.op(AN, 'member', AN, { name: ' An ' }), 'invalid-name'],
      [an.op(AN, 'member', AN, { deleted: 'yes' }), 'invalid-deleted'],
      [an.op(AN, 'expense', DINNER, { title: 'x'.repeat(81) }), 'invalid-title'],
      [
        an.op(AN, 'expense', DINNER, {
          money: { amount: 100, paidBy: AN, split: { mode: 'exact', amounts: { [AN]: 99 } } },
        }),
        'invalid-money',
      ],
      [
        an.op(AN, 'expense', DINNER, {
          money: { amount: 100, paidBy: AN, split: { mode: 'equal', among: [AN, stranger] } },
        }),
        'unknown-member',
      ],
      [an.op(AN, 'expense', DINNER, { date: '2026-02-30' }), 'invalid-date'],
      [an.op(AN, 'expense', DINNER, { category: 'travel' }), 'invalid-category'],
      [an.op(AN, 'expense', DINNER, { deleted: 1 }), 'invalid-deleted'],
      [
        an.op(AN, 'payment', id('pay'), { money: { amount: 5, from: AN, to: AN } }),
        'invalid-money',
      ],
      [
        an.op(AN, 'payment', id('pay'), { money: { amount: 5, from: AN, to: stranger } }),
        'unknown-member',
      ],
      [an.op(AN, 'payment', id('pay'), { date: 'soon' }), 'invalid-date'],
      [an.op(AN, 'payment', id('pay'), { deleted: null }), 'invalid-deleted'],
    ]
    const state = foldOps(GROUP_ID, [...base, ...cases.map(([op]) => op)])

    expect(state.rejected).toEqual(cases.map(([op, reason]) => ({ opId: op.id, reason })))
    expect(snapshot({ ...state, rejected: [], latestHlc: null })).toBe(
      snapshot({ ...foldOps(GROUP_ID, base), latestHlc: null }),
    )
  })

  it('reports malformed operations', () => {
    const { base } = trip()
    const state = foldOps(GROUP_ID, [...base, { id: 'not-an-op' }, 'garbage'])
    expect(state.rejected).toEqual([
      { opId: '', reason: 'malformed' },
      { opId: 'not-an-op', reason: 'malformed' },
    ])
  })

  it('lets the currency change only until money is recorded', () => {
    const minh = new Device('minh')
    const usd = { code: 'USD', digits: 2 }
    const early = [...setup(minh), minh.op(MINH, 'group', GROUP_ID, { currency: usd })]
    expect(foldOps(GROUP_ID, early).group?.currency).toEqual(usd)

    const meal = dinner(minh)
    const late = minh.op(MINH, 'group', GROUP_ID, { currency: VND })
    const state = foldOps(GROUP_ID, [...early, meal, late])
    expect(state.group?.currency).toEqual(usd)
    expect(state.rejected).toEqual([{ opId: late.id, reason: 'currency-locked' }])
  })

  it('allows at most 50 members, while existing ones can still change', () => {
    const minh = new Device('minh')
    const base = setup(minh)
    const extra = Array.from({ length: 46 }, (_, i) =>
      minh.op(MINH, 'member', id(`m${i}`), { name: `Friend ${i}` }),
    )
    const oneTooMany = minh.op(MINH, 'member', id('late'), { name: 'Late' })
    const rename = minh.op(MINH, 'member', AN, { name: 'An Nguyễn' })
    const state = foldOps(GROUP_ID, [...base, ...extra, oneTooMany, rename])

    expect(state.members.size).toBe(50)
    expect(state.members.get(AN)?.name).toBe('An Nguyễn')
    expect(state.rejected).toEqual([{ opId: oneTooMany.id, reason: 'too-many-members' }])
  })

  it('waits for every required field before showing an entity', () => {
    const minh = new Device('minh')
    const base = setup(minh)
    const titleOnly = minh.op(MINH, 'expense', DINNER, { title: 'Dinner' })
    expect(foldOps(GROUP_ID, [...base, titleOnly]).expenses.has(DINNER)).toBe(false)

    const rest = minh.op(AN, 'expense', DINNER, {
      money: { amount: 100, paidBy: AN, split: { mode: 'equal', among: [AN] } },
      date: '2026-11-02',
      category: 'other',
    })
    const state = foldOps(GROUP_ID, [...base, titleOnly, rest])
    expect(state.expenses.get(DINNER)).toMatchObject({ title: 'Dinner', createdBy: AN })
    expect(state.activity.at(-1)).toMatchObject({ kind: 'created', opId: rest.id })
  })

  it('shows no group until its name and currency arrive', () => {
    const minh = new Device('minh')
    const state = foldOps(GROUP_ID, [minh.op(MINH, 'group', GROUP_ID, { name: 'Trip' })])
    expect(state.group).toBeNull()
    expect(foldOps(GROUP_ID, []).latestHlc).toBeNull()
  })

  it('keeps a removed member who is still involved after concurrent offline edits', () => {
    const { base, an, linh } = trip()
    const removeBao = an.op(AN, 'member', BAO, { deleted: true })
    const coffee = linh.op(LINH, 'expense', id('coffee'), {
      title: 'Cà phê',
      money: { amount: 90_000, paidBy: LINH, split: { mode: 'equal', among: [LINH, BAO] } },
      date: '2026-11-02',
      category: 'food',
    })
    const state = foldOps(GROUP_ID, [...base, removeBao, coffee])

    expect(state.members.get(BAO)?.deleted).toBe(true)
    expect(state.expenses.get(id('coffee'))?.split).toEqual({ mode: 'equal', among: [LINH, BAO] })
  })

  it('arrives at the same state from every delivery order', () => {
    const orders = fc.array(step, { maxLength: 30 }).chain((steps) => {
      const ops = simulate(steps)
      return fc.tuple(
        fc.constant(ops),
        fc.shuffledSubarray(ops, { minLength: ops.length, maxLength: ops.length }),
      )
    })

    fc.assert(
      fc.property(orders, ([ops, shuffled]) => {
        expect(snapshot(foldOps(GROUP_ID, shuffled))).toBe(snapshot(foldOps(GROUP_ID, ops)))
      }),
      { numRuns: 200 },
    )
  })
})

// Random activity on three phones, for the convergence test. Indices pick
// members and earlier expenses; `sync` makes a phone catch up on everything.
type Action =
  | { type: 'expense'; payer: number; amount: number; among: number[] }
  | { type: 'retitle'; target: number; title: string }
  | { type: 'reprice'; target: number; amount: number }
  | { type: 'delete'; target: number; deleted: boolean }
  | { type: 'pay'; from: number; offset: number; amount: number }
  | { type: 'rename'; member: number; name: string }
  | { type: 'sync' }

interface Step {
  device: number
  ms: number
  action: Action
}

const index = fc.integer({ min: 0, max: 3 })
const amount = fc.integer({ min: 1, max: 10_000_000 })
const action: fc.Arbitrary<Action> = fc.oneof(
  fc.record({
    type: fc.constant('expense' as const),
    payer: index,
    amount,
    among: fc.subarray([0, 1, 2, 3], { minLength: 1 }),
  }),
  fc.record({
    type: fc.constant('retitle' as const),
    target: fc.nat(),
    title: fc.constantFrom('Dinner', 'Taxi', 'Phở', 'Cà phê'),
  }),
  fc.record({ type: fc.constant('reprice' as const), target: fc.nat(), amount }),
  fc.record({ type: fc.constant('delete' as const), target: fc.nat(), deleted: fc.boolean() }),
  fc.record({
    type: fc.constant('pay' as const),
    from: index,
    offset: fc.integer({ min: 1, max: 3 }),
    amount,
  }),
  fc.record({
    type: fc.constant('rename' as const),
    member: index,
    name: fc.constantFrom('Minh', 'An', 'Linh', 'Bảo', 'Bé'),
  }),
  fc.record({ type: fc.constant('sync' as const) }),
)
const step: fc.Arbitrary<Step> = fc.record({
  device: fc.integer({ min: 0, max: 2 }),
  ms: fc.integer({ min: 0, max: 5000 }),
  action,
})

function simulate(steps: readonly Step[]): Op[] {
  const one = new Device('one')
  const devices = [one, new Device('two'), new Device('three')]
  const ops = setup(one)
  for (const device of devices) device.receive(ops)
  const expenses: string[] = []
  const member = (i: number) => MEMBERS[i % MEMBERS.length] ?? MINH
  const earlier = (n: number) => expenses[n % Math.max(expenses.length, 1)]

  steps.forEach(({ device: d, ms, action: a }, i) => {
    const device = devices[d] ?? one
    const by = member(d)
    const write = (entity: EntityKind, key: string | undefined, set: Record<string, unknown>) => {
      if (key) ops.push(device.op(by, entity, key, set, ms))
    }
    switch (a.type) {
      case 'sync':
        device.receive(ops)
        break
      case 'expense': {
        const key = id(`exp${i}`)
        expenses.push(key)
        write('expense', key, {
          title: 'Expense',
          money: {
            amount: a.amount,
            paidBy: member(a.payer),
            split: { mode: 'equal', among: a.among.map(member) },
          },
          date: '2026-11-02',
          category: 'other',
        })
        break
      }
      case 'retitle':
        write('expense', earlier(a.target), { title: a.title })
        break
      case 'reprice':
        write('expense', earlier(a.target), {
          money: { amount: a.amount, paidBy: by, split: { mode: 'equal', among: [by] } },
        })
        break
      case 'delete':
        write('expense', earlier(a.target), { deleted: a.deleted })
        break
      case 'pay':
        write('payment', id(`pay${i}`), {
          money: { amount: a.amount, from: member(a.from), to: member(a.from + a.offset) },
          date: '2026-11-02',
        })
        break
      case 'rename':
        write('member', member(a.member), { name: a.name })
        break
    }
  })
  return ops
}
