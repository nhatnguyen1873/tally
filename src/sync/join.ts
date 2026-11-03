// Opening an invite link on a device that doesn't have the group yet: download
// its whole log from the relay, decrypt it, and keep it (SPEC.md section 4, Join).

import { parseServerMessage } from '../../shared/protocol.ts'
import { foldOps } from '../domain/fold.ts'
import type { Op } from '../domain/ops.ts'
import { decryptOp, deriveKeys } from './crypto.ts'
import { browserNetwork, type Network } from './engine.ts'
import { saveJoinedGroup } from './groups.ts'

export type JoinOutcome =
  | 'joined'
  /** The device is offline, and a first open needs a connection. */
  | 'offline'
  /** Nobody has uploaded the group yet: its creator hasn't been online with it. */
  | 'not_found'
  /** The link's secret doesn't match the group: it was cut short or changed. */
  | 'unauthorized'
  /** Online, but the relay didn't answer. */
  | 'unreachable'

export async function joinGroup(
  groupId: string,
  secret: string,
  network: Network = browserNetwork,
  timeout = 20_000,
): Promise<JoinOutcome> {
  if (!network.isOnline()) return 'offline'
  const keys = await deriveKeys(secret)

  return new Promise((resolve) => {
    const socket = network.connect(groupId)
    let done = false
    let queue: Promise<void> = Promise.resolve()
    const ops: Op[] = []
    let head: number | null = null
    let epoch = ''
    let cursor = 0

    const finish = (outcome: JoinOutcome) => {
      if (done) return
      done = true
      clearTimeout(timer)
      socket.close()
      resolve(outcome)
    }
    const timer = setTimeout(() => {
      finish('unreachable')
    }, timeout)

    /** Once the backlog is in: keep the group, if it decrypted to one. */
    const complete = async () => {
      if (head === null || cursor < head) return
      const state = foldOps(groupId, ops)
      if (!state.group) {
        finish('not_found')
        return
      }
      await saveJoinedGroup({ id: groupId, secret, ops, cursor, epoch, latest: state.latestHlc })
      finish('joined')
    }

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'hello', token: keys.token, after: 0 }))
    })
    socket.addEventListener('message', (event) => {
      const message = parseServerMessage(event.data)
      queue = queue.then(async () => {
        if (done || !message) return
        switch (message.type) {
          case 'welcome':
            head = message.head
            epoch = message.epoch
            await complete()
            break
          case 'ops': {
            const decrypted = await Promise.all(
              message.ops.map((op) => decryptOp(keys, groupId, op)),
            )
            ops.push(...decrypted.filter((op): op is Op => op !== null))
            cursor = Math.max(cursor, ...message.ops.map((op) => op.seq))
            await complete()
            break
          }
          case 'error':
            finish(
              message.code === 'not_found' || message.code === 'unauthorized'
                ? message.code
                : 'unreachable',
            )
            break
        }
      })
      queue = queue.catch(() => {
        finish('unreachable')
      })
    })
    const closed = () => {
      void queue.then(() => {
        finish(network.isOnline() ? 'unreachable' : 'offline')
      })
    }
    socket.addEventListener('close', closed)
    socket.addEventListener('error', closed)
  })
}
