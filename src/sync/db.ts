import { type DBSchema, type IDBPDatabase, type IDBPTransaction, openDB } from 'idb'

import type { MemberId } from '../domain/ids.ts'
import type { Op } from '../domain/ops.ts'
import { compareStrings } from '../domain/util.ts'

/** What this device keeps about a group besides its operations. */
export interface GroupRecord {
  readonly id: string
  /** 32 random bytes, base64url: the key material that invite links carry. */
  readonly secret: string
  /** This device's ID in this group. */
  readonly actor: string
  /** The member this device acts as, or null until it picks one. */
  readonly me: MemberId | null
  /** This device's latest clock in this group, encoded. */
  readonly clock: string | null
  readonly addedAt: number
  readonly openedAt: number
  /** Activity up to this clock has been seen here. */
  readonly readUpTo: string | null
  /** The last relay sequence number this device has. */
  readonly cursor: number
  /** The relay log this device last synced with, or null before it ever has. */
  readonly epoch: string | null
}

export interface OpRecord {
  readonly groupId: string
  readonly id: string
  readonly op: Op
  /** Whether the relay has it. */
  readonly synced: boolean
}

interface Schema extends DBSchema {
  groups: { key: string; value: GroupRecord }
  ops: { key: [string, string]; value: OpRecord; indexes: { byGroup: string } }
}

type Database = IDBPDatabase<Schema>

let opened: Promise<Database> | null = null

function database(): Promise<Database> {
  opened ??= openDB<Schema>('tally', 2, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        db.createObjectStore('groups', { keyPath: 'id' })
        db.createObjectStore('ops', { keyPath: ['groupId', 'id'] }).createIndex(
          'byGroup',
          'groupId',
        )
        return
      }
      // From version 1: add sync. Groups from before it have never reached the
      // relay. The database opens once this upgrade's transaction, and so this,
      // completes.
      void addSync(tx)
    },
    // A newer version of the app opened in another tab: make way, and reload
    // into the new version.
    blocking() {
      void opened?.then((db) => {
        db.close()
      })
      opened = null
      if (typeof location !== 'undefined') location.reload()
    },
  })
  return opened
}

async function addSync(tx: IDBPTransaction<Schema, ('groups' | 'ops')[], 'versionchange'>) {
  for await (const cursor of tx.objectStore('groups')) {
    await cursor.update({ ...cursor.value, cursor: 0, epoch: null })
  }
  for await (const cursor of tx.objectStore('ops')) {
    await cursor.update({ ...cursor.value, synced: false })
  }
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

/**
 * Saves operations and the group record together, so the clock and cursor
 * never fall behind them. `synced` says whether they came from the relay.
 */
export async function saveOps(
  record: GroupRecord,
  ops: readonly Op[],
  synced = false,
): Promise<void> {
  const tx = (await database()).transaction(['groups', 'ops'], 'readwrite')
  const store = tx.objectStore('ops')
  await Promise.all([
    tx.objectStore('groups').put(record),
    ...ops.map((op) => store.put({ groupId: record.id, id: op.id, op, synced })),
    tx.done,
  ])
}

/** The operations the relay doesn't have yet, oldest first. */
export async function pendingOps(groupId: string): Promise<Op[]> {
  const records = await (await database()).getAllFromIndex('ops', 'byGroup', groupId)
  return records
    .filter((record) => !record.synced)
    .map((record) => record.op)
    .sort((a, b) => compareStrings(a.hlc, b.hlc))
}

/** Marks operations as on the relay, and saves the cursor that came with them. */
export async function markSynced(record: GroupRecord, ids: readonly string[]): Promise<void> {
  const tx = (await database()).transaction(['groups', 'ops'], 'readwrite')
  const store = tx.objectStore('ops')
  const updates = ids.map(async (id) => {
    const found = await store.get([record.id, id])
    if (found && !found.synced) await store.put({ ...found, synced: true })
  })
  await Promise.all([tx.objectStore('groups').put(record), ...updates, tx.done])
}

/** For a relay log that starts over: every operation needs uploading again. */
export async function markAllPending(record: GroupRecord): Promise<void> {
  const tx = (await database()).transaction(['groups', 'ops'], 'readwrite')
  const updates = (async () => {
    for await (const cursor of tx.objectStore('ops').index('byGroup').iterate(record.id)) {
      if (cursor.value.synced) await cursor.update({ ...cursor.value, synced: false })
    }
  })()
  await Promise.all([tx.objectStore('groups').put(record), updates, tx.done])
}

export async function deleteGroup(groupId: string): Promise<void> {
  const tx = (await database()).transaction(['groups', 'ops'], 'readwrite')
  // Operation keys are [groupId, opId], and op IDs are base64url, so this covers all of them.
  const everyOp = IDBKeyRange.bound([groupId, ''], [groupId, '\uffff'])
  await Promise.all([
    tx.objectStore('groups').delete(groupId),
    tx.objectStore('ops').delete(everyOp),
    tx.done,
  ])
}
