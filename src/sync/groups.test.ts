import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { balances } from '../domain/balances.ts'
import { hlcDecode } from '../domain/hlc.ts'
import { makeOp } from '../domain/ops.ts'
import { closeDatabase, loadOps, saveOps } from './db.ts'
import {
  createGroup,
  getSummaries,
  groupStore,
  GroupStore,
  listGroups,
  onGroupChange,
  removeGroup,
  subscribeSummaries,
} from './groups.ts'

const VND = { code: 'VND', digits: 0 }

beforeEach(async () => {
  await closeDatabase()
  globalThis.indexedDB = new IDBFactory()
})

afterEach(() => {
  vi.useRealTimers()
})

async function trip() {
  const id = await createGroup({
    name: 'Đà Lạt trip',
    currency: VND,
    myName: 'Minh',
    others: ['An', 'Linh', 'Bảo'],
  })
  const store = await groupStore(id)
  if (!store) throw new Error('group missing')
  return { id, store }
}

function memberIdOf(store: GroupStore, name: string): string {
  const member = [...store.getSnapshot().state.members.values()].find((m) => m.name === name)
  if (!member) throw new Error(`${name} missing`)
  return member.id
}

async function addDinner(store: GroupStore) {
  const { state, record } = store.getSnapshot()
  const everyone = [...state.members.keys()]
  return store.write([
    {
      entity: 'expense',
      key: 'dinner0000000000',
      set: {
        title: 'Dinner',
        money: { amount: 1_200_000, paidBy: record.me, split: { mode: 'equal', among: everyone } },
        date: '2026-11-02',
        category: 'food',
      },
    },
  ])
}

describe('createGroup', () => {
  it('creates the group, its members and this device’s identity', async () => {
    const { id, store } = await trip()
    const { state, record } = store.getSnapshot()

    expect(state.group).toEqual({ name: 'Đà Lạt trip', currency: VND })
    expect([...state.members.values()].map((m) => m.name)).toEqual(['Minh', 'An', 'Linh', 'Bảo'])
    expect(record.me).toBe(memberIdOf(store, 'Minh'))
    expect(record.id).toBe(id)
    expect(id).toHaveLength(22)
    expect(record.secret).toHaveLength(43)
    expect(record.readUpTo).toBe(state.latestHlc)
    expect(state.rejected).toEqual([])
  })
})

describe('storage', () => {
  it('asks the browser to keep Tally’s data when the first group is created', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('navigator', { storage: { persist } })
    try {
      await trip()
    } finally {
      vi.unstubAllGlobals()
    }
    expect(persist).toHaveBeenCalledOnce()
  })
})

describe('GroupStore', () => {
  it('saves changes before showing them, and keeps them after a reload', async () => {
    const { id, store } = await trip()
    const listener = vi.fn()
    store.subscribe(listener)
    const [op] = await addDinner(store)

    expect(listener).toHaveBeenCalledOnce()
    expect(store.getSnapshot().state.expenses.get('dinner0000000000')?.amount).toBe(1_200_000)
    expect((await loadOps(id)).map((saved) => saved.id)).toContain(op?.id)

    const fresh = await GroupStore.load(id)
    expect(fresh?.getSnapshot().state.expenses.get('dinner0000000000')?.title).toBe('Dinner')
  })

  it('keeps its clock moving forward, even when the phone’s clock goes backwards', async () => {
    const { store } = await trip()
    const before = store.getSnapshot().state.latestHlc ?? ''
    vi.useFakeTimers({ now: Date.now() - 3_600_000, toFake: ['Date'] })
    const [op] = await addDinner(store)

    expect((op?.hlc ?? '') > before).toBe(true)
    expect(store.getSnapshot().record.clock).toBe(op?.hlc)
    expect(hlcDecode(op?.hlc ?? '')?.node).toBe(store.getSnapshot().record.actor)
  })

  it('writes after every operation it holds, including other devices’ ones from the future', async () => {
    const { id, store } = await trip()
    const { record, state } = store.getSnapshot()
    // Another phone, its clock an hour ahead, renamed the group; this device has
    // received that but hasn't written anything itself yet.
    const ahead = { wall: Date.now() + 3_600_000, count: 0, node: 'other-phone-00000' }
    const rename = makeOp(ahead, record.me ?? '', 'group', id, { name: 'Đà Lạt 2026' })
    await saveOps({ ...record, clock: null }, [rename])

    const reopened = await GroupStore.load(id)
    if (!reopened) throw new Error('group missing')
    expect(reopened.getSnapshot().state.group?.name).toBe('Đà Lạt 2026')
    const [op] = await addDinner(reopened)
    expect((op?.hlc ?? '') > rename.hlc).toBe(true)
    expect(state.latestHlc && (op?.hlc ?? '') > state.latestHlc).toBe(true)
  })

  it('refuses to write before this device has chosen who it is', async () => {
    const { store } = await trip()
    await store.update({ me: null })
    await expect(addDinner(store)).rejects.toThrow('Choose who you are')
  })

  it('saves who this device is', async () => {
    const { id, store } = await trip()
    const an = memberIdOf(store, 'An')
    await store.update({ me: an })
    expect((await GroupStore.load(id))?.getSnapshot().record.me).toBe(an)
  })

  it('stops notifying a listener once it unsubscribes', async () => {
    const { store } = await trip()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    unsubscribe()
    await addDinner(store)
    expect(listener).not.toHaveBeenCalled()
  })

  it('shares one store per group', async () => {
    const { id } = await trip()
    expect(await groupStore(id)).toBe(await groupStore(id))
    expect(await groupStore('missing-group-0000000')).toBeNull()
  })
})

describe('listGroups', () => {
  it('summarizes each group with this device’s balance, most recently opened first', async () => {
    const first = await trip()
    await addDinner(first.store)
    const second = await trip()
    await second.store.update({ openedAt: Date.now() + 1000 })

    const list = await listGroups()
    expect(list.map((summary) => summary.id)).toEqual([second.id, first.id])
    expect(list[1]).toMatchObject({ name: 'Đà Lạt trip', people: 4, myNet: 900_000 })
    expect(list[1]?.myNet).toBe(
      balances(first.store.getSnapshot().state).get(memberIdOf(first.store, 'Minh'))?.net,
    )
  })

  it('tells subscribers when groups change', async () => {
    const changed = new Promise<void>((resolve) => {
      const stop = subscribeSummaries(() => {
        if (getSummaries()?.length === 1) {
          stop()
          resolve()
        }
      })
    })
    await trip()
    await changed
    expect(getSummaries()?.[0]?.name).toBe('Đà Lạt trip')
  })
})

describe('listGroups, before everything has arrived', () => {
  it('shows no balance until this device chooses who it is', async () => {
    const { store } = await trip()
    await store.update({ me: null })
    expect((await listGroups())[0]?.myNet).toBeNull()
  })

  it('leaves out a group whose name and currency haven’t arrived yet', async () => {
    const { store } = await trip()
    await saveOps({ ...store.getSnapshot().record, id: 'not-downloaded-yet-000' }, [])
    expect((await listGroups()).map((summary) => summary.id)).toEqual([
      store.getSnapshot().record.id,
    ])
  })
})

describe('removeGroup', () => {
  it('deletes one group and everything in it, leaving the others', async () => {
    const keep = await trip()
    const remove = await trip()
    await addDinner(remove.store)
    await removeGroup(remove.id)

    expect(await GroupStore.load(remove.id)).toBeNull()
    expect(await loadOps(remove.id)).toEqual([])
    expect((await loadOps(keep.id)).length).toBeGreaterThan(0)
    expect((await listGroups()).map((summary) => summary.id)).toEqual([keep.id])
  })
})

describe('another tab', () => {
  it('sees changes made in this one', async () => {
    const { id, store } = await trip()
    // A second copy of the module is a second tab: its own stores, the same database.
    vi.resetModules()
    const otherTab = await import('./groups.ts')
    const theirs = await otherTab.groupStore(id)
    if (!theirs) throw new Error('other tab can’t see the group')

    const updated = new Promise<void>((resolve) => theirs.subscribe(resolve))
    await addDinner(store)
    await updated
    expect(theirs.getSnapshot().state.expenses.get('dinner0000000000')?.amount).toBe(1_200_000)
  })

  it('keeps working when this one removes the group', async () => {
    const { id } = await trip()
    vi.resetModules()
    const otherTab = await import('./groups.ts')
    const theirs = await otherTab.groupStore(id)
    const before = theirs?.getSnapshot()
    await removeGroup(id)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(theirs?.getSnapshot().removed).toBe(true)
    expect(theirs?.getSnapshot().state).toBe(before?.state)
    expect(await otherTab.groupStore(id)).toBeNull()
  })

  it('notices a group that arrives after it looked for it', async () => {
    vi.resetModules()
    const otherTab = await import('./groups.ts')
    const id = 'arrives-later-00000000'
    expect(await otherTab.groupStore(id)).toBeNull()

    // This tab receives the group (as joining will in milestone 3) and opens it.
    const actor = 'this-device-00000'
    const me = 'member-minh-00000'
    const at = (count: number) => ({ wall: Date.now(), count, node: actor })
    const ops = [
      makeOp(at(0), me, 'group', id, { name: 'Flat', currency: VND }),
      makeOp(at(1), me, 'member', me, { name: 'Minh' }),
    ]
    const record = {
      id,
      secret: 's'.repeat(43),
      actor,
      me,
      clock: ops[1]?.hlc ?? null,
      addedAt: Date.now(),
      openedAt: Date.now(),
      readUpTo: null,
      cursor: 0,
      epoch: null,
    }
    await saveOps(record, ops)
    await (await groupStore(id))?.update({ openedAt: Date.now() })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect((await otherTab.groupStore(id))?.getSnapshot().state.group?.name).toBe('Flat')
  })

  it('ignores messages it doesn’t understand', async () => {
    const changes: string[] = []
    const stop = onGroupChange(({ groupId }) => changes.push(groupId))
    const sender = new BroadcastChannel('tally')
    for (const message of ['hello', null, { groupId: 42 }, { other: 'x' }]) {
      sender.postMessage(message)
    }
    sender.postMessage({ groupId: 'from-another-tab-0000' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    sender.close()
    stop()
    expect(changes).toEqual(['from-another-tab-0000'])
  })

  it('reports where a change came from', async () => {
    const changes: boolean[] = []
    const stop = onGroupChange(({ local }) => changes.push(local))
    await trip()
    stop()
    expect(changes).toEqual([true])
  })
})
