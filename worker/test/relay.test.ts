import { env, exports } from 'cloudflare:workers'
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import { LIMITS } from '../../shared/protocol.ts'
import { RETENTION_MS } from '../group-log.ts'
import { Client, fakeOp, newGroupId, newToken } from './relay.ts'

const stub = (groupId: string) => env.GROUP_LOG.get(env.GROUP_LOG.idFromName(groupId))

/** The table names in a group's storage: none until someone creates it. */
function tables(groupId: string) {
  return runInDurableObject(stub(groupId), (_instance, state) =>
    state.storage.sql
      .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .toArray()
      .map((row) => row.name),
  )
}

/** A new group with `count` operations, pushed in batches of up to 100. */
async function seeded(count: number) {
  const groupId = newGroupId()
  const token = newToken()
  const { client } = await Client.join(groupId, token, 0, true)
  const ops = Array.from({ length: count }, () => fakeOp())
  for (let i = 0; i < ops.length; i += 100) {
    // A connection may push 120 operations a minute; use a fresh one per batch.
    const pusher = i === 0 ? client : (await Client.join(groupId, token)).client
    pusher.send({ type: 'push', ops: ops.slice(i, i + 100) })
    await pusher.next()
  }
  return { groupId, token, ops }
}

describe('the Worker', () => {
  it('answers the health check', async () => {
    const response = await exports.default.fetch('https://tally.test/api/health')
    expect(await response.json()).toEqual({ ok: true })
  })

  it('routes only well-formed group IDs, and only WebSocket upgrades', async () => {
    const bad = await exports.default.fetch('https://tally.test/api/g/not-an-id/ws', {
      headers: { Upgrade: 'websocket' },
    })
    expect(bad.status).toBe(404)
    const plain = await exports.default.fetch(`https://tally.test/api/g/${newGroupId()}/ws`)
    expect(plain.status).toBe(426)
    const other = await exports.default.fetch('https://tally.test/api/anything')
    expect(other.status).toBe(404)
  })
})

describe('joining and creating', () => {
  it('reports a group nobody has uploaded, without storing anything', async () => {
    const groupId = newGroupId()
    const client = await Client.connect(groupId)
    client.send({ type: 'hello', token: newToken(), after: 0 })
    expect(await client.next()).toEqual({ type: 'error', code: 'not_found' })
    await client.whenClosed()
    expect(await tables(groupId)).toEqual([])
  })

  it('creates a group, then lets in only the token that created it', async () => {
    const groupId = newGroupId()
    const token = newToken()
    const before = Date.now()
    const { welcome } = await Client.join(groupId, token, 0, true)
    expect(welcome).toMatchObject({ type: 'welcome', head: 0 })
    expect(welcome.now).toBeGreaterThanOrEqual(before)

    const again = await Client.join(groupId, token)
    expect(again.welcome).toEqual({ ...welcome, now: again.welcome.now })

    const stranger = await Client.connect(groupId)
    stranger.send({ type: 'hello', token: newToken(), after: 0, create: true })
    expect(await stranger.next()).toEqual({ type: 'error', code: 'unauthorized' })
    await stranger.whenClosed()
  })

  it('keeps the token’s hash, never the token', async () => {
    const groupId = newGroupId()
    const token = newToken()
    await Client.join(groupId, token, 0, true)
    const stored = await runInDurableObject(stub(groupId), (_instance, state) =>
      state.storage.sql
        .exec<{ key: string; value: string }>('SELECT key, value FROM meta')
        .toArray(),
    )
    expect(stored.map((row) => row.key).sort()).toEqual(['count', 'epoch', 'token_hash'])
    expect(JSON.stringify(stored)).not.toContain(token)
  })

  it('lets two devices create the same group at once', async () => {
    const groupId = newGroupId()
    const token = newToken()
    const [one, two] = await Promise.all([
      Client.join(groupId, token, 0, true),
      Client.join(groupId, token, 0, true),
    ])
    expect(one.welcome.epoch).toBe(two.welcome.epoch)
  })
})

describe('pushing', () => {
  it('numbers operations, acknowledges them and sends them to the group’s other devices', async () => {
    const groupId = newGroupId()
    const token = newToken()
    const { client: minh } = await Client.join(groupId, token, 0, true)
    const { client: an } = await Client.join(groupId, token)
    const ops = [fakeOp(), fakeOp()]
    minh.send({ type: 'push', ops })

    expect(await minh.next()).toEqual({
      type: 'ack',
      acks: [
        { id: ops[0]?.id, seq: 1 },
        { id: ops[1]?.id, seq: 2 },
      ],
    })
    expect(await an.next()).toEqual({
      type: 'ops',
      ops: ops.map((op, index) => ({ ...op, seq: index + 1 })),
    })
    // The pusher doesn't get its own operations back.
    expect(await minh.hasMore()).toBe(false)
  })

  it('drops duplicates by ID, acknowledging where they already are', async () => {
    const groupId = newGroupId()
    const token = newToken()
    const { client: minh } = await Client.join(groupId, token, 0, true)
    const { client: an } = await Client.join(groupId, token)
    const op = fakeOp()
    minh.send({ type: 'push', ops: [op, op] })
    expect(await minh.next()).toEqual({ type: 'ack', acks: [{ id: op.id, seq: 1 }] })
    expect(await an.next()).toEqual({ type: 'ops', ops: [{ ...op, seq: 1 }] })

    // Another device uploads the same operation again (as re-upload does).
    an.send({ type: 'push', ops: [op, fakeOp()] })
    const ack = await an.next()
    expect(ack.type === 'ack' && ack.acks.map((entry) => entry.seq)).toEqual([1, 2])
    const forwarded = await minh.next()
    expect(forwarded.type === 'ops' && forwarded.ops.map((entry) => entry.seq)).toEqual([2])
  })

  it('refuses pushes before the hello', async () => {
    const client = await Client.connect(newGroupId())
    client.send({ type: 'push', ops: [fakeOp()] })
    expect(await client.next()).toEqual({ type: 'error', code: 'unauthorized' })
    await client.whenClosed()
  })

  it('refuses messages it can’t understand, and a second hello', async () => {
    const groupId = newGroupId()
    const token = newToken()
    for (const bad of ['not json', JSON.stringify({ type: 'nope' }), new ArrayBuffer(4)]) {
      const client = await Client.connect(groupId)
      client.send(bad)
      expect(await client.next()).toEqual({ type: 'error', code: 'bad_request' })
      await client.whenClosed()
    }
    const { client } = await Client.join(groupId, token, 0, true)
    client.send({ type: 'hello', token, after: 0 })
    expect(await client.next()).toEqual({ type: 'error', code: 'bad_request' })
    await client.whenClosed()
  })
})

describe('catching up', () => {
  it('streams the operations after the cursor, in order, 100 at a time', async () => {
    const { groupId, token, ops } = await seeded(250)
    const { client, welcome } = await Client.join(groupId, token)
    expect(welcome).toMatchObject({ head: 250 })
    const batches = [await client.next(), await client.next(), await client.next()]
    expect(batches.map((batch) => batch.type === 'ops' && batch.ops.length)).toEqual([100, 100, 50])
    const seqs = batches.flatMap((batch) => (batch.type === 'ops' ? batch.ops : []))
    expect(seqs.map((op) => op.id)).toEqual(ops.map((op) => op.id))
    expect(seqs.map((op) => op.seq)).toEqual(ops.map((_op, index) => index + 1))
    expect(await client.hasMore()).toBe(false)

    const resumed = await Client.join(groupId, token, 240)
    const rest = await resumed.client.next()
    expect(rest.type === 'ops' && rest.ops.map((op) => op.seq)).toEqual([
      241, 242, 243, 244, 245, 246, 247, 248, 249, 250,
    ])
    const current = await Client.join(groupId, token, 250)
    expect(await current.client.hasMore()).toBe(false)
  })

  it('keeps sessions across hibernation', async () => {
    const groupId = newGroupId()
    const token = newToken()
    const { client: minh } = await Client.join(groupId, token, 0, true)
    const { client: an } = await Client.join(groupId, token)
    await evictDurableObject(stub(groupId))
    const op = fakeOp()
    minh.send({ type: 'push', ops: [op] })
    expect(await minh.next()).toEqual({ type: 'ack', acks: [{ id: op.id, seq: 1 }] })
    expect(await an.next()).toEqual({ type: 'ops', ops: [{ ...op, seq: 1 }] })
  })
})

describe('limits', () => {
  it('refuses more than 100 operations in one message', async () => {
    const { client } = await Client.join(newGroupId(), newToken(), 0, true)
    client.send({ type: 'push', ops: Array.from({ length: 101 }, () => fakeOp()) })
    expect(await client.next()).toEqual({ type: 'error', code: 'too_large' })
  })

  it('refuses an operation over 4 KB', async () => {
    const { client } = await Client.join(newGroupId(), newToken(), 0, true)
    client.send({ type: 'push', ops: [fakeOp(LIMITS.opBytes + 1)] })
    expect(await client.next()).toEqual({ type: 'error', code: 'too_large' })
    // At the limit is fine.
    client.send({ type: 'push', ops: [fakeOp(LIMITS.opBytes)] })
    expect(await client.next()).toMatchObject({ type: 'ack' })
  })

  it('refuses a message too long to be valid, and closes', async () => {
    const client = await Client.connect(newGroupId())
    client.send('x'.repeat(700_001))
    expect(await client.next()).toEqual({ type: 'error', code: 'too_large' })
    await client.whenClosed()
  })

  it('allows 120 operations a minute per connection', async () => {
    const { client } = await Client.join(newGroupId(), newToken(), 0, true)
    client.send({ type: 'push', ops: Array.from({ length: 100 }, () => fakeOp()) })
    expect(await client.next()).toMatchObject({ type: 'ack' })
    client.send({ type: 'push', ops: Array.from({ length: 21 }, () => fakeOp()) })
    const limited = await client.next()
    expect(limited).toMatchObject({ type: 'error', code: 'rate_limited' })
    const wait = limited.type === 'error' ? (limited.retryAfter ?? 0) : 0
    expect(wait).toBeGreaterThan(0)
    expect(wait).toBeLessThanOrEqual(60_000)
    // The connection stays open, and 20 more still fit this minute.
    client.send({ type: 'push', ops: Array.from({ length: 20 }, () => fakeOp()) })
    expect(await client.next()).toMatchObject({ type: 'ack' })
  })

  it('stops at 20,000 operations per group', async () => {
    const groupId = newGroupId()
    const { client } = await Client.join(groupId, newToken(), 0, true)
    await runInDurableObject(stub(groupId), (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE meta SET value = ? WHERE key = 'count'",
        String(LIMITS.opsPerGroup - 1),
      )
    })
    client.send({ type: 'push', ops: [fakeOp(), fakeOp()] })
    expect(await client.next()).toEqual({ type: 'error', code: 'group_full' })
    client.send({ type: 'push', ops: [fakeOp()] })
    expect(await client.next()).toMatchObject({ type: 'ack' })
  })

  it('allows 50 connections per group', async () => {
    const groupId = newGroupId()
    const token = newToken()
    const { client: first } = await Client.join(groupId, token, 0, true)
    const others = await Promise.all(
      Array.from({ length: LIMITS.connectionsPerGroup - 1 }, () => Client.join(groupId, token)),
    )
    const extra = await Client.connect(groupId)
    expect(await extra.next()).toEqual({ type: 'error', code: 'group_full' })
    await extra.whenClosed()
    // The others still work.
    first.send({ type: 'push', ops: [fakeOp()] })
    expect(await first.next()).toMatchObject({ type: 'ack' })
    expect(await others[0]?.client.next()).toMatchObject({ type: 'ops' })
  })

  it('doesn’t let connections that never say hello keep devices out', async () => {
    const groupId = newGroupId()
    const token = newToken()
    const { client: creator } = await Client.join(groupId, token, 0, true)
    // The creator and these fill every place.
    const idle: Client[] = []
    for (let i = 1; i < LIMITS.connectionsPerGroup; i++) idle.push(await Client.connect(groupId))

    // A new device takes the place of the connection that has waited longest.
    const { welcome } = await Client.join(groupId, token)
    expect(welcome).toMatchObject({ type: 'welcome' })
    expect(await idle[0]?.next()).toEqual({ type: 'error', code: 'group_full' })
    await idle[0]?.whenClosed()
    expect(idle[1]?.closed).toBe(false)
    // The creator was never in danger.
    creator.send({ type: 'push', ops: [fakeOp()] })
    expect(await creator.next()).toMatchObject({ type: 'ack' })
  })
})

describe('retention', () => {
  it('moves the deletion alarm a year out on every connection', async () => {
    const groupId = newGroupId()
    const before = Date.now()
    await Client.join(groupId, newToken(), 0, true)
    const alarm = await runInDurableObject(stub(groupId), (_instance, state) =>
      state.storage.getAlarm(),
    )
    expect(alarm).toBeGreaterThanOrEqual(before + RETENTION_MS)
    expect(alarm).toBeLessThanOrEqual(Date.now() + RETENTION_MS)
  })

  it('deletes the group when the alarm fires, and takes a re-upload with a new epoch', async () => {
    const { groupId, token, ops } = await seeded(3)
    const { welcome: first } = await Client.join(groupId, token)
    expect(await runDurableObjectAlarm(stub(groupId))).toBe(true)
    expect(await tables(groupId)).toEqual([])

    // A device that still has the group finds it gone and uploads it again.
    const lost = await Client.connect(groupId)
    lost.send({ type: 'hello', token, after: 3 })
    expect(await lost.next()).toEqual({ type: 'error', code: 'not_found' })
    const { client, welcome } = await Client.join(groupId, token, 0, true)
    expect(welcome).toMatchObject({ head: 0 })
    expect(welcome.epoch).not.toBe(first.epoch)
    client.send({ type: 'push', ops })
    const ack = await client.next()
    expect(ack.type === 'ack' && ack.acks.map((entry) => entry.seq)).toEqual([1, 2, 3])
  })

  it('doesn’t schedule deletion for a group nobody created', async () => {
    const groupId = newGroupId()
    const client = await Client.connect(groupId)
    client.send({ type: 'hello', token: newToken(), after: 0 })
    await client.whenClosed()
    expect(await runDurableObjectAlarm(stub(groupId))).toBe(false)
  })
})
