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
/**
 * The latest time an operation may carry: the last millisecond of the year
 * 9999. Far beyond any real clock, yet so far below what the encoding holds
 * that counting on from it can never run out of room.
 */
export const LATEST_WALL = Date.UTC(9999, 11, 31, 23, 59, 59, 999)
const NODE = /^[A-Za-z0-9_-]{16,32}$/
const ENCODED = /^(\d{15}):(\d{6}):([A-Za-z0-9_-]{16,32})$/

/** The clock for a new local event. */
export function hlcTick(previous: Hlc | undefined, now: number, node: string): Hlc {
  const wall = Math.max(previous?.wall ?? 0, now)
  const count = previous?.wall === wall ? previous.count + 1 : 0
  return checked(carry({ wall, count, node }))
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
  return checked(carry({ wall, count, node }))
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

/** Whether an operation's clock is one a real device could have stamped. */
export function hlcIsPlausible(clock: Hlc): boolean {
  return clock.wall <= LATEST_WALL
}

/**
 * A full counter moves on to the next millisecond, which still sorts after
 * every clock the device has seen. A clock that came in already at its
 * highest count would otherwise leave nothing to stamp next.
 */
function carry(clock: Hlc): Hlc {
  return clock.count > MAX_COUNT ? { ...clock, wall: clock.wall + 1, count: 0 } : clock
}

function checked(clock: Hlc): Hlc {
  if (!Number.isSafeInteger(clock.wall) || clock.wall < 0 || clock.wall > MAX_WALL) {
    throw new RangeError(`Clock time out of range: ${clock.wall}`)
  }
  if (clock.count > MAX_COUNT) throw new RangeError('Clock counter overflow')
  if (!NODE.test(clock.node)) throw new RangeError(`Invalid clock node: ${clock.node}`)
  return clock
}
