/**
 * Hybrid logical clock: wall-clock milliseconds plus a counter, stamped by a
 * device ("node"). Operations sorted by it respect causality even when phone
 * clocks drift: anything a device has seen sorts before what it writes next.
 * Encoded as fixed-width text, so plain string comparison sorts correctly.
 */
export interface Hlc {
  readonly wall: number
  readonly count: number
  readonly node: string
}

const WALL_DIGITS = 15
const COUNT_DIGITS = 6
const MAX_COUNT = 10 ** COUNT_DIGITS - 1
const MAX_WALL = 10 ** WALL_DIGITS - 1
const NODE = /^[A-Za-z0-9_-]{16,32}$/
const ENCODED = /^(\d{15}):(\d{6}):([A-Za-z0-9_-]{16,32})$/

/** The clock for a new local event. */
export function hlcTick(previous: Hlc | undefined, now: number, node: string): Hlc {
  const wall = Math.max(previous?.wall ?? 0, now)
  const count = previous?.wall === wall ? previous.count + 1 : 0
  return checked({ wall, count, node })
}

/** The clock after seeing a remote event, so later local events sort after it. */
export function hlcReceive(previous: Hlc | undefined, remote: Hlc, now: number, node: string): Hlc {
  const localWall = previous?.wall ?? 0
  const localCount = previous?.count ?? 0
  const wall = Math.max(localWall, remote.wall, now)
  let count = 0
  if (wall === localWall && wall === remote.wall) count = Math.max(localCount, remote.count) + 1
  else if (wall === localWall) count = localCount + 1
  else if (wall === remote.wall) count = remote.count + 1
  return checked({ wall, count, node })
}

export function hlcEncode(clock: Hlc): string {
  const wall = String(clock.wall).padStart(WALL_DIGITS, '0')
  const count = String(clock.count).padStart(COUNT_DIGITS, '0')
  return `${wall}:${count}:${clock.node}`
}

export function hlcDecode(text: string): Hlc | null {
  const match = ENCODED.exec(text)
  if (!match) return null
  return { wall: Number(match[1]), count: Number(match[2]), node: match[3] ?? '' }
}

function checked(clock: Hlc): Hlc {
  if (!Number.isSafeInteger(clock.wall) || clock.wall < 0 || clock.wall > MAX_WALL) {
    throw new RangeError(`Clock time out of range: ${clock.wall}`)
  }
  if (clock.count > MAX_COUNT) throw new RangeError('Clock counter overflow')
  if (!NODE.test(clock.node)) throw new RangeError(`Invalid clock node: ${clock.node}`)
  return clock
}
