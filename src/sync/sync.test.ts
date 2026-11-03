// Several phones syncing through a relay: each has its own IndexedDB and its
// own copy of the sync modules, and they meet only at the (fake) relay.
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { openDB } from 'idb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { randomId } from '../domain/ids.ts'
import { encryptOp } from './crypto.ts'
import { FakeRelay } from './fake-relay.ts'

const VND = { code: 'VND', digits: 0 }
const fast = () => 5

async function until(condition: () => boolean | Promise<boolean>, what = 'condition') {
  const deadline = Date.now() + 3000
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

const devices: { stop: () => void }[] = []

afterEach(() => {
  for (const device of devices.splice(0)) device.stop()
})

/** A phone: fresh modules and storage, on its own view of the relay's network. */
async function phone(relay: FakeRelay) {
  vi.resetModules()
  globalThis.indexedDB = new IDBFactory()
  const groups = await import('./groups.ts')
  const engine = await import('./engine.ts')
  const join = await import('./join.ts')
  const db = await import('./db.ts')
  const crypto = await import('./crypto.ts')
  await groups.listGroups() // Opens this phone's database.
  const network = relay.network()
  const syncs: InstanceType<typeof engine.GroupSync>[] = []
  const device = {
    groups,
    db,
    network,
    crypto,
    /** Starts syncing a group, as its screen does. */
    sync(groupId: string) {
      const sync = new engine.GroupSync(groupId, network, fast)
      syncs.push(sync)
      sync.start()
      return sync
    },
    join: (groupId: string, secret: string, timeout?: number) =>
      join.joinGroup(groupId, secret, network, timeout),
    async store(groupId: string) {
      const store = await groups.groupStore(groupId)
      if (!store) throw new Error('No such group on this phone')
      return store
    },
    async state(groupId: string) {
      return (await device.store(groupId)).getSnapshot().state
    },
    stop() {
      for (const sync of syncs) sync.stop()
    },
  }
  devices.push(device)
  return device
}

type Phone = Awaited<ReturnType<typeof phone>>

async function createTrip(device: Phone) {
  const id = await device.groups.createGroup({
    name: 'Đà Lạt trip',
    currency: VND,
    myName: 'Minh',
    others: ['An', 'Linh', 'Bảo'],
  })
  const store = await device.store(id)
  return { id, secret: store.getSnapshot().record.secret, store }
}

async function addExpense(device: Phone, groupId: string, title: string, amount = 160_000) {
  const store = await device.store(groupId)
  const { me } = store.getSnapshot().record
  const members = [...store.getSnapshot().state.members.keys()]
  if (!me) throw new Error('Pick a member first')
  await store.write([
    {
      entity: 'expense',
      key: randomId(),
      set: {
        title,
        money: { amount, paidBy: me, split: { mode: 'equal', among: members } },
        date: '2026-11-03',
        category: 'transport',
      },
    },
  ])
}

const titles = async (device: Phone, groupId: string) =>
  [...(await device.state(groupId)).expenses.values()].map((expense) => expense.title).sort()

describe('the first upload', () => {
  it('registers a new group and uploads everything in it', async () => {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const { id } = await createTrip(minh)
    const sync = minh.sync(id)
    await until(() => sync.getStatus().state === 'synced', 'synced')

    expect(relay.logs.get(id)?.ops).toHaveLength(5)
    expect(await minh.db.pendingOps(id)).toEqual([])
    const { record } = (await minh.store(id)).getSnapshot()
    expect(record.cursor).toBe(5)
    expect(record.epoch).toBe(relay.logs.get(id)?.epoch)
    expect(sync.getStatus()).toMatchObject({ state: 'synced', pending: 0 })
  })

  it('uploads a large group 100 operations at a time', async () => {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const { id } = await createTrip(minh)
    for (let i = 0; i < 25; i++) {
      const store = await minh.store(id)
      const members = [...store.getSnapshot().state.members.keys()]
      const me = store.getSnapshot().record.me ?? ''
      await store.write(
        Array.from({ length: 10 }, (_v, j) => ({
          entity: 'expense' as const,
          key: randomId(),
          set: {
            title: `Item ${i * 10 + j}`,
            money: { amount: 1000, paidBy: me, split: { mode: 'equal', among: members } },
            date: '2026-11-03',
            category: 'other',
          },
        })),
      )
    }
    const sync = minh.sync(id)
    await until(() => sync.getStatus().state === 'synced', 'synced')
    expect(relay.logs.get(id)?.ops).toHaveLength(255)
    expect(relay.pushes).toBe(3)
  })
})

describe('joining', () => {
  it('downloads the group, then waits for the phone to say who it is', async () => {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const { id, secret } = await createTrip(minh)
    const minhSync = minh.sync(id)
    await until(() => minhSync.getStatus().state === 'synced')

    const an = await phone(relay)
    expect(await an.join(id, secret)).toBe('joined')
    const { record, state } = (await an.store(id)).getSnapshot()
    expect(record.me).toBeNull()
    expect(record.epoch).toBe(relay.logs.get(id)?.epoch)
    expect(record.cursor).toBe(5)
    expect(record.readUpTo).toBe(state.latestHlc)
    expect(state.group?.name).toBe('Đà Lạt trip')
    expect([...state.members.values()].map((member) => member.name).sort()).toEqual([
      'An',
      'Bảo',
      'Linh',
      'Minh',
    ])
    expect(await an.db.pendingOps(id)).toEqual([])
  })

  it('explains a group nobody has uploaded, a bad link, being offline and no answer', async () => {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const { id, secret } = await createTrip(minh)
    const an = await phone(relay)
    expect(await an.join(id, secret)).toBe('not_found')

    const minhSync = minh.sync(id)
    await until(() => minhSync.getStatus().state === 'synced')
    expect(await an.join(id, randomId(32))).toBe('unauthorized')

    an.network.setOnline(false)
    expect(await an.join(id, secret)).toBe('offline')
    an.network.setOnline(true)

    relay.silent = true
    expect(await an.join(id, secret, 50)).toBe('unreachable')
    relay.silent = false
    relay.down = true
    expect(await an.join(id, secret)).toBe('unreachable')
    expect(await an.groups.groupStore(id)).toBeNull()
  })

  it('treats a log that doesn’t make a group as not uploaded', async () => {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const { id, secret } = await createTrip(minh)
    const keys = await minh.crypto.deriveKeys(secret)
    relay.logs.set(id, { token: keys.token, epoch: 'epoch-only-junk-00', ops: [] })
    const an = await phone(relay)
    expect(await an.join(id, secret)).toBe('not_found')
  })

  it('joins as someone new, who shows as having joined', async () => {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const { id, secret } = await createTrip(minh)
    const minhSync = minh.sync(id)
    await until(() => minhSync.getStatus().state === 'synced')

    const thu = await phone(relay)
    await thu.join(id, secret)
    await (await thu.store(id)).joinAs('Thư')
    const { record, state } = (await thu.store(id)).getSnapshot()
    expect(record.me && state.members.get(record.me)?.name).toBe('Thư')
    const joined = state.activity.at(-1)
    expect(joined).toMatchObject({ entity: 'member', key: record.me, by: record.me })
  })
})

describe('live sync', () => {
  async function tripOnTwoPhones() {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const trip = await createTrip(minh)
    const minhSync = minh.sync(trip.id)
    await until(() => minhSync.getStatus().state === 'synced')
    const an = await phone(relay)
    await an.join(trip.id, trip.secret)
    const anStore = await an.store(trip.id)
    const anMember = [...anStore.getSnapshot().state.members.values()].find((m) => m.name === 'An')
    await anStore.update({ me: anMember?.id ?? null })
    const anSync = an.sync(trip.id)
    await until(() => anSync.getStatus().state === 'synced')
    return { relay, minh, an, id: trip.id, minhSync, anSync }
  }

  it('shows each phone’s changes on the other without reconnecting', async () => {
    const { minh, an, id } = await tripOnTwoPhones()
    await addExpense(minh, id, 'Dinner')
    await until(async () => (await titles(an, id)).includes('Dinner'), 'Dinner on An’s phone')
    await addExpense(an, id, 'Taxi')
    await until(async () => (await titles(minh, id)).includes('Taxi'), 'Taxi on Minh’s phone')
    expect(await titles(minh, id)).toEqual(await titles(an, id))
  })

  it('queues changes made offline and sends them on reconnecting', async () => {
    const { minh, an, id, anSync } = await tripOnTwoPhones()
    an.network.setOnline(false)
    await until(() => anSync.getStatus().state === 'offline', 'offline')
    await addExpense(an, id, 'Taxi')
    await until(() => anSync.getStatus().pending === 1, 'one change waiting')
    expect(anSync.getStatus()).toMatchObject({ state: 'offline', pending: 1 })

    // Meanwhile Minh adds something An hasn't seen.
    await addExpense(minh, id, 'Dinner')
    an.network.setOnline(true)
    await until(() => anSync.getStatus().state === 'synced', 'An synced')
    await until(async () => (await titles(minh, id)).includes('Taxi'), 'Taxi reaches Minh')
    expect(await titles(an, id)).toEqual(['Dinner', 'Taxi'])
  })

  it('reconnects by itself when the connection drops while still online', async () => {
    const { minh, an, id, anSync } = await tripOnTwoPhones()
    an.network.dropConnections()
    await addExpense(minh, id, 'Dinner')
    await until(async () => (await titles(an, id)).includes('Dinner'), 'Dinner after reconnecting')
    await until(() => anSync.getStatus().state === 'synced', 'synced again')
  })

  it('catches up on what it missed while disconnected, from its cursor', async () => {
    const { relay, minh, an, id, anSync } = await tripOnTwoPhones()
    anSync.stop()
    await addExpense(minh, id, 'Dinner')
    await addExpense(minh, id, 'Hotel')
    await until(() => relay.logs.get(id)?.ops.length === 7, 'Minh’s uploads')
    an.sync(id)
    await until(async () => (await titles(an, id)).length === 2, 'An caught up')
    expect((await an.store(id)).getSnapshot().record.cursor).toBe(7)
  })

  it('waits out a rate limit, then carries on', async () => {
    const { relay, minh, an, id } = await tripOnTwoPhones()
    relay.limitNextPush = true
    await addExpense(minh, id, 'Dinner')
    await until(async () => (await titles(an, id)).includes('Dinner'), 'Dinner after the limit')
  })

  it('skips operations it can’t decrypt or that aren’t valid', async () => {
    const { relay, minh, an, id } = await tripOnTwoPhones()
    relay.inject(id, { id: randomId(), iv: 'A'.repeat(16), ciphertext: 'B'.repeat(40) })
    const strangerKeys = await an.crypto.deriveKeys(randomId(32))
    relay.inject(
      id,
      await encryptOp(strangerKeys, id, {
        v: 1,
        id: randomId(),
        hlc: '000000000000001-000000-dev-stranger-0000',
        actor: 'dev-stranger-0000',
        by: 'dev-stranger-0000',
        entity: 'expense',
        key: randomId(),
        set: { title: 'Fake' },
      }),
    )
    await addExpense(minh, id, 'Dinner')
    await until(async () => (await titles(an, id)).includes('Dinner'), 'Dinner after the junk')
    expect(await titles(an, id)).toEqual(['Dinner'])
    expect((await an.store(id)).getSnapshot().record.cursor).toBe(8)
  })

  it('learns how far the phone’s clock is off', async () => {
    const relay = new FakeRelay()
    relay.clockSkew = 10 * 60_000
    const minh = await phone(relay)
    const { id } = await createTrip(minh)
    const sync = minh.sync(id)
    await until(() => sync.getStatus().state === 'synced')
    expect(sync.getStatus().clockOffset).toBeGreaterThan(9 * 60_000)
  })
})

describe('when the relay starts over', () => {
  it('uploads the group again after the relay deleted it', async () => {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const { id } = await createTrip(minh)
    const sync = minh.sync(id)
    await until(() => sync.getStatus().state === 'synced')
    const oldEpoch = relay.logs.get(id)?.epoch
    relay.forget(id)
    await until(() => relay.logs.get(id)?.ops.length === 5, 're-upload')
    await until(() => sync.getStatus().state === 'synced')
    expect(relay.logs.get(id)?.epoch).not.toBe(oldEpoch)
    expect((await minh.store(id)).getSnapshot().record.epoch).toBe(relay.logs.get(id)?.epoch)
  })

  it('joins a new log another phone uploaded, adding what only it had', async () => {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const { id, secret } = await createTrip(minh)
    const minhSync = minh.sync(id)
    await until(() => minhSync.getStatus().state === 'synced')
    const an = await phone(relay)
    await an.join(id, secret)
    const anStore = await an.store(id)
    await anStore.update({ me: [...anStore.getSnapshot().state.members.keys()][1] ?? null })

    // An is away when the relay deletes the group, and writes something offline.
    an.network.setOnline(false)
    relay.forget(id)
    await until(() => relay.logs.get(id)?.ops.length === 5, 'Minh re-uploads')
    await addExpense(an, id, 'Taxi')
    // Minh adds more to the new log, so it runs past An's old cursor: what
    // arrives after the welcome for the old cursor must be dropped.
    await addExpense(minh, id, 'Dinner')
    await until(() => relay.logs.get(id)?.ops.length === 6, 'Dinner uploaded')

    an.network.setOnline(true)
    const anSync = an.sync(id)
    await until(() => anSync.getStatus().state === 'synced', 'An synced')
    expect(relay.logs.get(id)?.ops).toHaveLength(7)
    expect(await titles(an, id)).toEqual(['Dinner', 'Taxi'])
    expect((await an.store(id)).getSnapshot().record.cursor).toBe(7)
    expect((await an.store(id)).getSnapshot().record.epoch).toBe(relay.logs.get(id)?.epoch)
    await until(async () => (await titles(minh, id)).includes('Taxi'), 'Taxi reaches Minh')
  })
})

describe('status', () => {
  it('says the relay can’t be reached after repeated failures while online', async () => {
    const relay = new FakeRelay()
    relay.down = true
    const minh = await phone(relay)
    const { id } = await createTrip(minh)
    const sync = minh.sync(id)
    await until(() => sync.getStatus().state === 'unreachable', 'unreachable')
    expect(sync.getStatus().pending).toBe(5)
    relay.down = false
    await until(() => sync.getStatus().state === 'synced', 'recovers')
  })

  it('stops for good when the relay refuses this phone’s token', async () => {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const { id } = await createTrip(minh)
    relay.logs.set(id, { token: 'someone-else', epoch: 'epoch-squatter-000', ops: [] })
    const sync = minh.sync(id)
    await until(() => sync.getStatus().state === 'unreachable', 'refused')
    const attempts = relay.sockets.size
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(relay.sockets.size).toBe(attempts)
  })

  it('stops when the group is removed from the phone', async () => {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const { id } = await createTrip(minh)
    const sync = minh.sync(id)
    await until(() => sync.getStatus().state === 'synced')
    await minh.groups.removeGroup(id)
    const before = relay.sockets.size
    relay.forget(id)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(relay.sockets.size).toBe(before)
  })

  it('spaces out reconnects from 1 to 30 seconds, with jitter', async () => {
    const { backoff } = await import('./engine.ts')
    expect(backoff(1, () => 1)).toBe(1000)
    expect(backoff(1, () => 0)).toBe(1000)
    expect(backoff(3, () => 1)).toBe(4000)
    expect(backoff(3, () => 0)).toBe(2000)
    expect(backoff(10, () => 1)).toBe(30_000)
    expect(backoff(10, () => 0)).toBe(15_000)
  })
})

describe('the manager', () => {
  it('keeps the open group live, and lets others go once they’re caught up', async () => {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const { id } = await createTrip(minh)
    const manager = await import('./manager.ts')
    manager.setNetwork(minh.network, fast)

    const release = manager.holdSync(id)
    await until(() => manager.syncEngine(id).getStatus().state === 'synced', 'held and synced')
    const open = () => [...relay.sockets].filter((socket) => !socket.closed).length
    expect(open()).toBe(1)
    release()
    release() // Releasing twice is harmless.
    await until(() => open() === 0, 'disconnects once idle')

    const other = await createTrip(minh)
    manager.catchUp([other.id])
    await until(() => relay.logs.get(other.id)?.ops.length === 5, 'caught up in the background')
    await until(() => open() === 0, 'and disconnected')
    manager.stopSync(other.id)
  })
})

describe('upgrading from milestone 2', () => {
  it('marks existing groups and operations as never uploaded', async () => {
    vi.resetModules()
    globalThis.indexedDB = new IDBFactory()
    const id = randomId(16)
    const old = await openDB('tally', 1, {
      upgrade(db) {
        db.createObjectStore('groups', { keyPath: 'id' })
        db.createObjectStore('ops', { keyPath: ['groupId', 'id'] }).createIndex(
          'byGroup',
          'groupId',
        )
      },
    })
    await old.put('groups', { id, secret: randomId(32), actor: randomId(), me: null, clock: null })
    await old.put('ops', {
      groupId: id,
      id: 'op-0000000000001',
      op: { id: 'op-0000000000001', hlc: 'a' },
    })
    old.close()

    const db = await import('./db.ts')
    expect(await db.getGroupRecord(id)).toMatchObject({ cursor: 0, epoch: null })
    expect(await db.pendingOps(id)).toHaveLength(1)
  })
})

describe('the connection', () => {
  async function synced() {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const { id } = await createTrip(minh)
    const sync = minh.sync(id)
    await until(() => sync.getStatus().state === 'synced', 'synced')
    return { relay, minh, id, sync }
  }

  it('tells subscribers about status changes, until they unsubscribe', async () => {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const { id } = await createTrip(minh)
    const sync = minh.sync(id)
    sync.start() // Starting twice changes nothing.
    let calls = 0
    const stop = sync.subscribe(() => calls++)
    await until(() => sync.getStatus().state === 'synced', 'synced')
    expect(calls).toBeGreaterThan(0)
    stop()
    const seen = calls
    await addExpense(minh, id, 'Dinner')
    await until(() => relay.logs.get(id)?.ops.length === 6, 'uploaded')
    expect(calls).toBe(seen)
  })

  it('ignores other groups’ changes and anything the relay sends that isn’t valid', async () => {
    const { relay, minh, id, sync } = await synced()
    await createTrip(minh)
    relay.sendRaw(id, 'not json')
    relay.sendRaw(id, JSON.stringify({ type: 'welcome' }))
    await addExpense(minh, id, 'Dinner')
    await until(() => relay.logs.get(id)?.ops.length === 6, 'still syncing')
    await until(() => sync.getStatus().state === 'synced', 'synced')
  })

  it('reconnects at once when the phone comes back, without waiting out the backoff', async () => {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const { id } = await createTrip(minh)
    const { GroupSync } = await import('./engine.ts')
    const sync = new GroupSync(id, minh.network, () => 60_000)
    devices.push(sync)
    relay.down = true
    sync.start()
    await until(
      () => sync.getStatus().state === 'syncing' && relay.sockets.size === 1,
      'a failed try',
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    relay.down = false
    minh.network.setOnline(true) // As the 'online' event does.
    await until(() => sync.getStatus().state === 'synced', 'synced well before a minute')
    minh.network.setOnline(true) // Already connected: nothing to do.
    expect(relay.sockets.size).toBe(2)
  })

  it('stops uploading when the relay can’t take an operation or the group is full', async () => {
    for (const code of ['too_large', 'group_full'] as const) {
      const { relay, minh, id, sync } = await synced()
      relay.failNextPush = code
      await addExpense(minh, id, 'Dinner')
      await until(() => sync.getStatus().state === 'unreachable', code)
      expect(sync.getStatus().pending).toBe(1)
    }
  })

  it('retries later when a group has too many devices, or a message went wrong', async () => {
    for (const code of ['group_full', 'bad_request'] as const) {
      const relay = new FakeRelay()
      const minh = await phone(relay)
      const { id } = await createTrip(minh)
      relay.failNextHello = code
      const sync = minh.sync(id)
      await until(() => sync.getStatus().state === 'synced', `synced after ${code}`)
    }
  })

  it('waits a minute when rate limited without being told how long', async () => {
    const { relay, minh, id, sync } = await synced()
    relay.failNextPush = 'rate_limited'
    await addExpense(minh, id, 'Dinner')
    await until(() => relay.pushes === 2, 'the limited push')
    // No retry straight away: the change keeps waiting.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(relay.pushes).toBe(2)
    expect(sync.getStatus().pending).toBe(1)
  })
})

describe('joining, when things go wrong', () => {
  it('reports going offline during the download, and other relay errors', async () => {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const { id, secret } = await createTrip(minh)
    const sync = minh.sync(id)
    await until(() => sync.getStatus().state === 'synced')
    const an = await phone(relay)

    relay.silent = true
    const joining = an.join(id, secret)
    await new Promise((resolve) => setTimeout(resolve, 10))
    an.network.setOnline(false)
    expect(await joining).toBe('offline')
    an.network.setOnline(true)
    relay.silent = false

    relay.failNextHello = 'rate_limited'
    expect(await an.join(id, secret)).toBe('unreachable')

    // Junk from the relay is ignored; the download still completes.
    const download = an.join(id, secret)
    relay.sendRaw(id, 'junk')
    expect(await download).toBe('joined')
  })
})

describe('the manager, switching networks', () => {
  it('stops every engine when the network changes', async () => {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const { id } = await createTrip(minh)
    const manager = await import('./manager.ts')
    manager.setNetwork(minh.network, fast)
    manager.holdSync(id)
    await until(() => manager.syncEngine(id).getStatus().state === 'synced', 'synced')
    manager.setNetwork(relay.network(), fast)
    await until(() => [...relay.sockets].every((socket) => socket.closing), 'all closed')
    const release = manager.holdSync(id)
    manager.stopSync(id)
    release() // After stopping, releasing is harmless.
  })
})

describe('the browser network', () => {
  it('connects over wss on https, and wakes on online and on becoming visible', async () => {
    const { browserNetwork } = await import('./engine.ts')
    const urls: string[] = []
    const windowEvents = new EventTarget()
    const documentEvents = Object.assign(new EventTarget(), { visibilityState: 'hidden' })
    vi.stubGlobal('location', { protocol: 'https:', host: 'tally.test' })
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('window', windowEvents)
    vi.stubGlobal('document', documentEvents)
    vi.stubGlobal(
      'WebSocket',
      vi.fn(function (url: string) {
        urls.push(url)
      }),
    )
    try {
      browserNetwork.connect('group-dalat-trip-00000')
      vi.stubGlobal('location', { protocol: 'http:', host: 'localhost:5173' })
      browserNetwork.connect('group-dalat-trip-00000')
      expect(urls).toEqual([
        'wss://tally.test/api/g/group-dalat-trip-00000/ws',
        'ws://localhost:5173/api/g/group-dalat-trip-00000/ws',
      ])
      expect(browserNetwork.isOnline()).toBe(true)

      let wakes = 0
      const stop = browserNetwork.onWake(() => wakes++)
      windowEvents.dispatchEvent(new Event('online'))
      documentEvents.dispatchEvent(new Event('visibilitychange'))
      documentEvents.visibilityState = 'visible'
      documentEvents.dispatchEvent(new Event('visibilitychange'))
      expect(wakes).toBe(2)
      stop()
      windowEvents.dispatchEvent(new Event('online'))
      expect(wakes).toBe(2)

      let offline = 0
      const stopOffline = browserNetwork.onOffline(() => offline++)
      windowEvents.dispatchEvent(new Event('offline'))
      stopOffline()
      windowEvents.dispatchEvent(new Event('offline'))
      expect(offline).toBe(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('storage', () => {
  it('steps aside when a newer version of the app opens the database', async () => {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    await createTrip(minh)
    const newer = await openDB('tally', 3)
    expect(newer.version).toBe(3)
    newer.close()
  })

  it('marks only operations it has, once', async () => {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const { id, store } = await createTrip(minh)
    const [first] = await minh.db.pendingOps(id)
    const record = store.getSnapshot().record
    await minh.db.markSynced(record, [first?.id ?? '', 'not-an-op-000000'])
    await minh.db.markSynced(record, [first?.id ?? ''])
    expect(await minh.db.pendingOps(id)).toHaveLength(4)
  })

  it('takes operations it already has without counting them twice', async () => {
    const relay = new FakeRelay()
    const minh = await phone(relay)
    const { id, store } = await createTrip(minh)
    const ops = await minh.db.loadOps(id)
    await store.receive(ops, 5)
    expect(store.getSnapshot().state.members.size).toBe(4)
    expect(store.getSnapshot().record.cursor).toBe(5)
    expect(await minh.db.pendingOps(id)).toEqual([])
  })
})
