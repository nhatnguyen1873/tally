import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  type Hlc,
  hlcDecode,
  hlcEncode,
  hlcIsPlausible,
  hlcReceive,
  hlcTick,
  LATEST_WALL,
} from './hlc.ts'
import { compareStrings } from './util.ts'

const NODE_A = 'node-a----------'
const NODE_B = 'node-b----------'

const clock = fc.record({
  wall: fc.integer({ min: 0, max: 4_102_444_800_000 }),
  count: fc.integer({ min: 0, max: 999_999 }),
  node: fc.stringMatching(/^[A-Za-z0-9_-]{16}$/),
})

function compareClocks(a: Hlc, b: Hlc): number {
  return a.wall - b.wall || a.count - b.count || compareStrings(a.node, b.node)
}

describe('hlcTick', () => {
  it('follows the wall clock while it moves forward', () => {
    const first = hlcTick(undefined, 1000, NODE_A)
    expect(first).toEqual({ wall: 1000, count: 0, node: NODE_A })
    expect(hlcTick(first, 2000, NODE_A)).toEqual({ wall: 2000, count: 0, node: NODE_A })
  })

  it('counts up when the wall clock stalls or goes backwards', () => {
    const first = hlcTick(undefined, 1000, NODE_A)
    expect(hlcTick(first, 1000, NODE_A)).toEqual({ wall: 1000, count: 1, node: NODE_A })
    expect(hlcTick(first, 500, NODE_A)).toEqual({ wall: 1000, count: 1, node: NODE_A })
  })
})

describe('hlcReceive', () => {
  const at = (wall: number, count: number, node = NODE_A): Hlc => ({ wall, count, node })

  it('moves past a remote clock that is ahead', () => {
    expect(hlcReceive(at(1000, 0), at(5000, 3, NODE_B), 2000, NODE_A)).toEqual(at(5000, 4))
  })

  it('keeps counting from the local clock when it is ahead', () => {
    expect(hlcReceive(at(5000, 2), at(1000, 9, NODE_B), 2000, NODE_A)).toEqual(at(5000, 3))
  })

  it('takes the higher counter when both clocks show the same time', () => {
    expect(hlcReceive(at(5000, 2), at(5000, 7, NODE_B), 1000, NODE_A)).toEqual(at(5000, 8))
  })

  it('follows the wall clock when it is ahead of both', () => {
    expect(hlcReceive(at(1000, 2), at(2000, 7, NODE_B), 3000, NODE_A)).toEqual(at(3000, 0))
  })

  it('starts from the remote clock on a fresh device', () => {
    expect(hlcReceive(undefined, at(5000, 3, NODE_B), 1000, NODE_A)).toEqual(at(5000, 4))
  })
})

describe('encoding', () => {
  it('round-trips', () => {
    fc.assert(
      fc.property(clock, (value) => {
        expect(hlcDecode(hlcEncode(value))).toEqual(value)
      }),
    )
  })

  it('sorts as plain text in clock order', () => {
    fc.assert(
      fc.property(clock, clock, (a, b) => {
        expect(Math.sign(compareStrings(hlcEncode(a), hlcEncode(b)))).toBe(
          Math.sign(compareClocks(a, b)),
        )
      }),
    )
  })

  it('rejects malformed text', () => {
    for (const text of [
      '',
      'yesterday',
      '1:2:node-a----------',
      '000001762088711204:000000:node-a----------',
      '001762088711204:000000:short',
      '001762088711204:000000:node a---------',
    ]) {
      expect(hlcDecode(text)).toBeNull()
    }
  })
})

describe('limits', () => {
  it('moves to the next millisecond instead of overflowing the counter', () => {
    const full = { wall: 1000, count: 999_999, node: NODE_A }
    expect(hlcTick(full, 1000, NODE_A)).toEqual({ wall: 1001, count: 0, node: NODE_A })
    expect(hlcReceive(undefined, { ...full, node: NODE_B }, 500, NODE_A)).toEqual({
      wall: 1001,
      count: 0,
      node: NODE_A,
    })
    expect(hlcReceive(full, { ...full, node: NODE_B }, 500, NODE_A)).toEqual({
      wall: 1001,
      count: 0,
      node: NODE_A,
    })
  })

  it('counts on from the latest plausible clock without running out of room', () => {
    const latest = { wall: LATEST_WALL, count: 999_999, node: NODE_B }
    expect(hlcIsPlausible(latest)).toBe(true)
    expect(hlcIsPlausible({ ...latest, wall: LATEST_WALL + 1 })).toBe(false)
    const next = hlcReceive(undefined, latest, 1000, NODE_A)
    expect(compareStrings(hlcEncode(next), hlcEncode(latest))).toBe(1)
  })

  it('refuses invalid nodes and times', () => {
    expect(() => hlcTick(undefined, 1000, 'bad node')).toThrow(RangeError)
    expect(() => hlcTick(undefined, 1.5, NODE_A)).toThrow(RangeError)
    expect(() => hlcTick(undefined, 10 ** 15, NODE_A)).toThrow(RangeError)
  })
})

describe('causality', () => {
  it('stamps every event after everything its device has already seen', () => {
    const nodes = ['node-0----------', 'node-1----------', 'node-2----------']
    const event = fc.record({
      node: fc.integer({ min: 0, max: 2 }),
      from: fc.option(fc.integer({ min: 0, max: 2 }), { nil: undefined }),
      // Wall clocks wander, including backwards, as phone clocks do.
      now: fc.integer({ min: 1_000_000, max: 1_000_100 }),
    })

    fc.assert(
      fc.property(fc.array(event, { maxLength: 60 }), (events) => {
        const clocks: (Hlc | undefined)[] = [undefined, undefined, undefined]
        const seen: string[] = ['', '', '']
        for (const { node, from, now } of events) {
          const nodeId = nodes[node] ?? ''
          const remote = from === undefined ? undefined : clocks[from]
          const next =
            remote === undefined
              ? hlcTick(clocks[node], now, nodeId)
              : hlcReceive(clocks[node], remote, now, nodeId)
          const encoded = hlcEncode(next)
          expect(compareStrings(encoded, seen[node] ?? '')).toBe(1)
          if (remote) expect(compareStrings(encoded, hlcEncode(remote))).toBe(1)
          clocks[node] = next
          seen[node] = encoded
        }
      }),
    )
  })
})
