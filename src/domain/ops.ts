import { type Hlc, hlcDecode, hlcEncode } from './hlc.ts'
import { isId, type MemberId, randomId } from './ids.ts'
import { hasOnlyKeys, isRecord } from './util.ts'

export type EntityKind = 'group' | 'member' | 'expense' | 'payment'

/** Fields each kind of entity has. Every field is a last-writer-wins register. */
export const ENTITY_FIELDS = {
  group: ['name', 'currency'],
  member: ['name', 'deleted'],
  expense: ['title', 'money', 'date', 'category', 'deleted'],
  payment: ['money', 'date', 'deleted'],
} as const satisfies Record<EntityKind, readonly string[]>

/** An entity exists once all of these have been set. `deleted` defaults to false. */
export const REQUIRED_FIELDS = {
  group: ['name', 'currency'],
  member: ['name'],
  expense: ['title', 'money', 'date', 'category'],
  payment: ['money', 'date'],
} as const satisfies Record<EntityKind, readonly string[]>

/**
 * One immutable change: set some fields of one entity. Creating sets every
 * required field, deleting sets `deleted: true`, restoring sets it back.
 */
export interface Op {
  readonly v: 1
  readonly id: string
  /** Encoded hybrid logical clock; its node is always `actor`. */
  readonly hlc: string
  /** Random per device per group, so devices can't be linked across groups. */
  readonly actor: string
  /** The member the device says it is. Attribution only, never trusted. */
  readonly by: MemberId
  readonly entity: EntityKind
  readonly key: string
  readonly set: Readonly<Record<string, unknown>>
}

const OP_KEYS = ['v', 'id', 'hlc', 'actor', 'by', 'entity', 'key', 'set']

/** Checks an operation's envelope. The fold checks field values in context. */
export function isOp(value: unknown): value is Op {
  if (!isRecord(value) || !hasOnlyKeys(value, OP_KEYS)) return false
  const { v, id, hlc, actor, by, entity, key, set } = value
  if (v !== 1 || !isId(id) || !isId(actor) || !isId(by) || !isId(key)) return false
  if (typeof hlc !== 'string' || hlcDecode(hlc)?.node !== actor) return false
  if (!isEntityKind(entity) || !isRecord(set)) return false
  return Object.keys(set).length > 0 && hasOnlyKeys(set, ENTITY_FIELDS[entity])
}

function isEntityKind(value: unknown): value is EntityKind {
  return typeof value === 'string' && Object.hasOwn(ENTITY_FIELDS, value)
}

/** Builds an operation stamped with `clock`, which the caller has just ticked. */
export function makeOp(
  clock: Hlc,
  by: MemberId,
  entity: EntityKind,
  key: string,
  set: Readonly<Record<string, unknown>>,
): Op {
  return { v: 1, id: randomId(), hlc: hlcEncode(clock), actor: clock.node, by, entity, key, set }
}
