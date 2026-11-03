// Which groups sync, and when: the group on screen stays live; any other group
// syncs until it's caught up and has nothing to upload, then disconnects.

import { backoff, browserNetwork, GroupSync, type Network, type SyncStatus } from './engine.ts'

const engines = new Map<string, GroupSync>()
const holds = new Map<string, number>()
let network: Network = browserNetwork
let retryDelay = backoff

/** For tests: sync through a fake relay, retrying sooner. */
export function setNetwork(fake: Network, delay = backoff): void {
  network = fake
  retryDelay = delay
  for (const engine of engines.values()) engine.stop()
  engines.clear()
  holds.clear()
}

function engineFor(groupId: string): GroupSync {
  let engine = engines.get(groupId)
  if (!engine) {
    engine = new GroupSync(groupId, network, retryDelay)
    engines.set(groupId, engine)
  }
  return engine
}

/** Keeps a group live, for as long as its screen is open. Returns the release. */
export function holdSync(groupId: string): () => void {
  const engine = engineFor(groupId)
  holds.set(groupId, (holds.get(groupId) ?? 0) + 1)
  engine.start()
  let released = false
  return () => {
    if (released) return
    released = true
    const left = (holds.get(groupId) ?? 1) - 1
    holds.set(groupId, left)
    if (left === 0) engine.finish()
  }
}

/** Brings groups up to date in both directions, then lets them disconnect. */
export function catchUp(groupIds: readonly string[]): void {
  for (const groupId of groupIds) holdSync(groupId)()
}

/** Stops syncing a group, as when it's removed from this device. */
export function stopSync(groupId: string): void {
  engines.get(groupId)?.stop()
  engines.delete(groupId)
  holds.delete(groupId)
}

export function syncEngine(groupId: string): Pick<GroupSync, 'getStatus' | 'subscribe'> {
  return engineFor(groupId)
}

export type { SyncStatus }
