import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import type { MemberId } from '../domain/ids.ts'
import type { Op } from '../domain/ops.ts'

/** What this device keeps about a group besides its operations. */
export interface GroupRecord {
  readonly id: string
  /** 32 random bytes: the key material that invite links carry (used from milestone 3). */
  readonly secret: string
  /** This device's ID in this group. */
  readonly actor: string
  /** The member this device acts as. */
  readonly me: MemberId | null
  /** This device's latest clock in this group, encoded. */
  readonly clock: string | null
  readonly addedAt: number
  readonly openedAt: number
  /** Activity up to this clock has been seen here. */
  readonly readUpTo: string | null
}

export interface OpRecord {
  readonly groupId: string
  readonly id: string
  readonly op: Op
}

interface Schema extends DBSchema {
  groups: { key: string; value: GroupRecord }
  ops: { key: [string, string]; value: OpRecord; indexes: { byGroup: string } }
}

type Database = IDBPDatabase<Schema>

let opened: Promise<Database> | null = null

function database(): Promise<Database> {
  opened ??= openDB<Schema>('tally', 1, {
    upgrade(db) {
      db.createObjectStore('groups', { keyPath: 'id' })
      db.createObjectStore('ops', { keyPath: ['groupId', 'id'] }).createIndex('byGroup', 'groupId')
    },
  })
  return opened
}

/** Closes the connection so tests can start from an empty database. */
export async function closeDatabase(): Promise<void> {
  const db = await opened
  db?.close()
  opened = null
}

export async function listGroupRecords(): Promise<GroupRecord[]> {
  return (await database()).getAll('groups')
}

export async function getGroupRecord(groupId: string): Promise<GroupRecord | undefined> {
  return (await database()).get('groups', groupId)
}

export async function putGroupRecord(record: GroupRecord): Promise<void> {
  await (await database()).put('groups', record)
}

export async function loadOps(groupId: string): Promise<Op[]> {
  const records = await (await database()).getAllFromIndex('ops', 'byGroup', groupId)
  return records.map((record) => record.op)
}

/** Saves operations and the group record together, so the clock never falls behind them. */
export async function saveOps(record: GroupRecord, ops: readonly Op[]): Promise<void> {
  const tx = (await database()).transaction(['groups', 'ops'], 'readwrite')
  const store = tx.objectStore('ops')
  await Promise.all([
    tx.objectStore('groups').put(record),
    ...ops.map((op) => store.put({ groupId: record.id, id: op.id, op })),
    tx.done,
  ])
}

export async function deleteGroup(groupId: string): Promise<void> {
  const tx = (await database()).transaction(['groups', 'ops'], 'readwrite')
  // Operation keys are [groupId, opId], and op IDs are base64url, so this covers all of them.
  const everyOp = IDBKeyRange.bound([groupId, ''], [groupId, '￿'])
  await Promise.all([
    tx.objectStore('groups').delete(groupId),
    tx.objectStore('ops').delete(everyOp),
    tx.done,
  ])
}
