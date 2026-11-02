// Test helpers for domain tests. Not shipped: nothing outside tests imports it.
import { type Hlc, hlcDecode, hlcReceive, hlcTick } from './hlc.ts'
import type { MemberId } from './ids.ts'
import type { Currency } from './money.ts'
import { type EntityKind, makeOp, type Op } from './ops.ts'

export const GROUP_ID = 'group-dalat-trip-00000'
export const VND: Currency = { code: 'VND', digits: 0 }

/** A readable 16-character ID: id('minh') is 'minh------------'. */
export function id(name: string): string {
  return name.padEnd(16, '-')
}

/** A simulated phone, with its own device ID and clock. */
export class Device {
  readonly actor: string
  now: number
  private clock: Hlc | undefined

  constructor(name: string, start = Date.UTC(2026, 10, 2, 12)) {
    this.actor = id(`dev-${name}`)
    this.now = start
  }

  /** Writes an operation as member `by`, `ms` milliseconds after the previous one. */
  op(
    by: MemberId,
    entity: EntityKind,
    key: string,
    set: Readonly<Record<string, unknown>>,
    ms = 1000,
  ): Op {
    this.now += ms
    this.clock = hlcTick(this.clock, this.now, this.actor)
    return makeOp(this.clock, by, entity, key, set)
  }

  /** Sees other devices' operations, so what it writes next sorts after them. */
  receive(ops: readonly Op[]): void {
    for (const op of ops) {
      const remote = hlcDecode(op.hlc)
      if (remote) this.clock = hlcReceive(this.clock, remote, this.now, this.actor)
    }
  }
}
