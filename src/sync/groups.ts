import { balances } from '../domain/balances.ts'
import { foldOps, type GroupState } from '../domain/fold.ts'
import { type Hlc, hlcDecode, hlcEncode, hlcReceive, hlcTick } from '../domain/hlc.ts'
import { randomId } from '../domain/ids.ts'
import type { Currency } from '../domain/money.ts'
import { type EntityKind, makeOp, type Op } from '../domain/ops.ts'
import {
  deleteGroup,
  getGroupRecord,
  type GroupRecord,
  listGroupRecords,
  loadOps,
  putGroupRecord,
  saveOps,
} from './db.ts'

// --- Change notifications --------------------------------------------------
// Listeners in this tab hear about every change; other tabs hear through a
// BroadcastChannel and re-read from IndexedDB.

interface GroupChange {
  readonly groupId: string
  /** False when another tab made the change, so this tab's data is stale. */
  readonly local: boolean
}

const changeListeners = new Set<(change: GroupChange) => void>()
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('tally')
// Node's BroadcastChannel would otherwise keep a test process running.
;(channel as { unref?: () => void } | null)?.unref?.()

function announce(groupId: string, local = true) {
  for (const listener of changeListeners) listener({ groupId, local })
  if (local) channel?.postMessage({ groupId })
}

channel?.addEventListener('message', (event: MessageEvent<unknown>) => {
  const { data } = event
  if (typeof data === 'object' && data !== null && 'groupId' in data) {
    if (typeof data.groupId === 'string') announce(data.groupId, false)
  }
})

export function onGroupChange(listener: (change: GroupChange) => void): () => void {
  changeListeners.add(listener)
  return () => {
    changeListeners.delete(listener)
  }
}

// --- One group ---------------------------------------------------------------

export interface Change {
  readonly entity: EntityKind
  readonly key: string
  readonly set: Readonly<Record<string, unknown>>
}

export interface GroupView {
  readonly record: GroupRecord
  readonly state: GroupState
  /** Another tab removed the group from this device. */
  readonly removed?: boolean
}

/** One group on this device: its operation log folded into state React can subscribe to. */
export class GroupStore {
  private record: GroupRecord
  private ops: Op[]
  private view: GroupView
  private clock: Hlc | undefined
  private readonly listeners = new Set<() => void>()

  private constructor(record: GroupRecord, ops: Op[]) {
    this.record = record
    this.ops = ops
    this.view = { record, state: foldOps(record.id, ops) }
    this.clock = startingClock(record, this.view.state)
  }

  static async load(groupId: string): Promise<GroupStore | null> {
    const record = await getGroupRecord(groupId)
    return record ? new GroupStore(record, await loadOps(groupId)) : null
  }

  readonly getSnapshot = (): GroupView => this.view

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Records changes as this device's member, saving before anyone sees them. */
  async write(changes: readonly Change[]): Promise<Op[]> {
    const { me, actor } = this.record
    if (!me) throw new Error('Choose who you are before making changes')
    const now = Date.now()
    let clock = this.clock
    let encoded = this.record.clock
    const ops = changes.map(({ entity, key, set }) => {
      clock = hlcTick(clock, now, actor)
      const op = makeOp(clock, me, entity, key, set)
      encoded = op.hlc
      return op
    })
    const record = { ...this.record, clock: encoded }
    await saveOps(record, ops)
    this.record = record
    this.clock = clock
    this.ops = [...this.ops, ...ops]
    this.publish(true)
    announce(record.id)
    return ops
  }

  /** Changes what this device keeps about the group: who it is, what it has read. */
  async update(patch: Partial<Pick<GroupRecord, 'me' | 'readUpTo' | 'openedAt'>>): Promise<void> {
    this.record = { ...this.record, ...patch }
    await putGroupRecord(this.record)
    this.publish(false)
    announce(this.record.id)
  }

  /** Re-reads the group after another tab changed it. */
  async reload(): Promise<void> {
    const record = await getGroupRecord(this.record.id)
    if (!record) {
      stores.delete(this.record.id)
      this.view = { ...this.view, removed: true }
      for (const listener of this.listeners) listener()
      return
    }
    this.ops = await loadOps(record.id)
    this.record = record
    this.publish(true)
    // The other tab may have moved this device's clock past ours.
    const latest = startingClock(record, this.view.state)
    if (latest && hlcEncode(latest) > (this.record.clock ?? '')) this.clock = latest
  }

  private publish(refold: boolean) {
    const state = refold ? foldOps(this.record.id, this.ops) : this.view.state
    this.view = { record: this.record, state }
    for (const listener of this.listeners) listener()
  }
}

/** Continues after this device's own clock and after every operation it holds. */
function startingClock(record: GroupRecord, state: GroupState): Hlc | undefined {
  const own = record.clock ? (hlcDecode(record.clock) ?? undefined) : undefined
  const latest = state.latestHlc ? hlcDecode(state.latestHlc) : null
  if (!latest || latest.node === record.actor) return own
  return hlcReceive(own, latest, Date.now(), record.actor)
}

const stores = new Map<string, Promise<GroupStore | null>>()

/** The shared store for a group, or null if this device doesn't have it. */
export function groupStore(groupId: string): Promise<GroupStore | null> {
  // Callers like React's use() need the same promise every time, so a missing
  // group stays cached until a change for it arrives.
  let store = stores.get(groupId)
  if (!store) {
    store = GroupStore.load(groupId)
    stores.set(groupId, store)
  }
  return store
}

onGroupChange(({ groupId, local }) => {
  void stores.get(groupId)?.then((loaded) => {
    if (!loaded) stores.delete(groupId)
    else if (!local) void loaded.reload()
  })
})

// --- Creating and removing groups --------------------------------------------

export interface NewGroup {
  readonly name: string
  readonly currency: Currency
  readonly myName: string
  readonly others: readonly string[]
}

/** Creates a group with its members on this device, and returns its ID. */
export async function createGroup({ name, currency, myName, others }: NewGroup): Promise<string> {
  const id = randomId(16)
  const actor = randomId()
  const me = randomId()
  const now = Date.now()
  let clock: Hlc | undefined
  const op = (entity: EntityKind, key: string, set: Record<string, unknown>) => {
    clock = hlcTick(clock, now, actor)
    return makeOp(clock, me, entity, key, set)
  }
  const ops = [
    op('group', id, { name, currency }),
    op('member', me, { name: myName }),
    ...others.map((other) => op('member', randomId(), { name: other })),
  ]
  const latest = ops.at(-1)?.hlc ?? null
  await saveOps(
    {
      id,
      secret: randomId(32),
      actor,
      me,
      clock: latest,
      addedAt: now,
      openedAt: now,
      readUpTo: latest,
    },
    ops,
  )
  stores.delete(id)
  announce(id)
  keepStorage()
  return id
}

export async function removeGroup(groupId: string): Promise<void> {
  await deleteGroup(groupId)
  stores.delete(groupId)
  announce(groupId)
}

/** Asks the browser not to evict Tally's data under storage pressure. Best effort. */
function keepStorage() {
  if (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    'persist' in navigator.storage
  ) {
    navigator.storage.persist().catch(() => undefined)
  }
}

// --- The list of groups ------------------------------------------------------

export interface GroupSummary {
  readonly id: string
  readonly name: string
  readonly currency: Currency
  readonly people: number
  /** This device's member's balance, or null before choosing one. */
  readonly myNet: number | null
  readonly lastChangeAt: number | null
  readonly openedAt: number
}

/** Every group on this device, most recently opened first. */
export async function listGroups(): Promise<GroupSummary[]> {
  const records = await listGroupRecords()
  const summaries = await Promise.all(
    records.map(async (record) => summarize(record, foldOps(record.id, await loadOps(record.id)))),
  )
  return summaries.filter((summary) => summary !== null).sort((a, b) => b.openedAt - a.openedAt)
}

function summarize(record: GroupRecord, state: GroupState): GroupSummary | null {
  if (!state.group) return null
  return {
    id: record.id,
    name: state.group.name,
    currency: state.group.currency,
    people: [...state.members.values()].filter((member) => !member.deleted).length,
    myNet: record.me ? (balances(state).get(record.me)?.net ?? 0) : null,
    lastChangeAt: state.activity.at(-1)?.at ?? null,
    openedAt: record.openedAt,
  }
}

let summaries: GroupSummary[] | null = null
let generation = 0
const summaryListeners = new Set<() => void>()

async function refreshSummaries() {
  const current = ++generation
  const list = await listGroups()
  // A later refresh may have finished first; keep the newest.
  if (current !== generation) return
  summaries = list
  for (const listener of summaryListeners) listener()
}

/** For useSyncExternalStore: null until the first load finishes. */
export function getSummaries(): GroupSummary[] | null {
  return summaries
}

export function subscribeSummaries(listener: () => void): () => void {
  summaryListeners.add(listener)
  void refreshSummaries()
  return () => {
    summaryListeners.delete(listener)
  }
}

onGroupChange(() => {
  if (summaryListeners.size > 0) void refreshSummaries()
})
