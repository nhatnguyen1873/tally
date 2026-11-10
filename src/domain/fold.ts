import { hlcDecode } from './hlc.ts'
import type { MemberId } from './ids.ts'
import {
  type Category,
  type ExpenseMoney,
  isCategory,
  isExpenseMoney,
  isPaymentMoney,
  isValidDate,
  isValidText,
  LIMITS,
  type PaymentMoney,
} from './model.ts'
import { type Currency, isValidCurrency } from './money.ts'
import { type EntityKind, isOp, type Op, REQUIRED_FIELDS } from './ops.ts'
import { type Split, splitMembers } from './split.ts'
import { compareStrings, isRecord, stableStringify } from './util.ts'

export interface GroupInfo {
  readonly name: string
  readonly currency: Currency
}

/** Bookkeeping shared by members, expenses and payments. */
interface Tracked {
  readonly id: string
  readonly deleted: boolean
  /** Clock of the operation that completed the entity. */
  readonly createdAt: string
  readonly createdBy: MemberId
  /** Clock of the latest operation that changed it. */
  readonly updatedAt: string
}

export interface Member extends Tracked {
  readonly name: string
}

export interface Expense extends Tracked {
  readonly title: string
  readonly amount: number
  readonly paidBy: MemberId
  readonly split: Split
  readonly date: string
  readonly category: Category
}

export interface Payment extends Tracked {
  readonly amount: number
  readonly from: MemberId
  readonly to: MemberId
  readonly date: string
}

export type ActivityKind = 'created' | 'updated' | 'deleted' | 'restored'

export interface FieldChange {
  readonly field: string
  readonly before: unknown
  readonly after: unknown
}

export interface Activity {
  readonly opId: string
  readonly hlc: string
  /** Milliseconds since the epoch, by the writer's clock. */
  readonly at: number
  readonly by: MemberId
  /** The device that wrote it, so a device can tell its own changes from others'. */
  readonly actor: string
  readonly entity: EntityKind
  readonly key: string
  readonly kind: ActivityKind
  /** For updates: the fields that changed. For deletes and restores: any other fields that did. */
  readonly changes: readonly FieldChange[]
}

export interface Rejection {
  readonly opId: string
  readonly reason: string
}

export interface GroupState {
  readonly groupId: string
  /** Null until the group's name and currency have arrived. */
  readonly group: GroupInfo | null
  /** In the order they were created. Removed members stay, marked deleted. */
  readonly members: ReadonlyMap<MemberId, Member>
  readonly expenses: ReadonlyMap<string, Expense>
  readonly payments: ReadonlyMap<string, Payment>
  /** Every change, oldest first. */
  readonly activity: readonly Activity[]
  readonly rejected: readonly Rejection[]
  /** The latest clock among well-formed operations, to seed this device's clock. */
  readonly latestHlc: string | null
}

/**
 * Folds operations into group state. Operations are sorted by clock and
 * applied in that order, with each field taking the latest valid value, so the
 * same operations give the same state on every device in whatever order they
 * arrived. An operation counts once however often it arrives.
 */
export function foldOps(groupId: string, ops: Iterable<unknown>): GroupState {
  const valid: Op[] = []
  const malformed: Rejection[] = []
  for (const op of ops) {
    if (isOp(op)) valid.push(op)
    else {
      const opId = isRecord(op) && typeof op.id === 'string' ? op.id : ''
      malformed.push({ opId, reason: 'malformed' })
    }
  }
  valid.sort((a, b) => compareStrings(a.hlc, b.hlc) || compareStrings(a.id, b.id))
  malformed.sort((a, b) => compareStrings(a.opId, b.opId))

  const fold = new Fold(groupId)
  const seen = new Set<string>()
  for (const op of valid) {
    if (seen.has(op.id)) continue
    seen.add(op.id)
    fold.apply(op)
  }
  return fold.result(malformed, valid.at(-1)?.hlc ?? null)
}

interface Entry {
  readonly fields: Map<string, unknown>
  created: boolean
  updatedAt: string
}

interface Created {
  readonly key: string
  readonly entry: Entry
  readonly at: string
  readonly by: MemberId
}

class Fold {
  private readonly groupId: string
  private readonly entries: Record<EntityKind, Map<string, Entry>> = {
    group: new Map(),
    member: new Map(),
    expense: new Map(),
    payment: new Map(),
  }
  /** Entities in the order they were created, which is clock order. */
  private readonly created: Record<EntityKind, Created[]> = {
    group: [],
    member: [],
    expense: [],
    payment: [],
  }
  private readonly activity: Activity[] = []
  private readonly rejected: Rejection[] = []

  constructor(groupId: string) {
    this.groupId = groupId
  }

  apply(op: Op): void {
    const reason = this.check(op)
    if (reason) {
      this.rejected.push({ opId: op.id, reason })
      return
    }

    const entries = this.entries[op.entity]
    const entry: Entry = entries.get(op.key) ?? {
      fields: new Map<string, unknown>(),
      created: false,
      updatedAt: op.hlc,
    }
    entries.set(op.key, entry)
    const before = new Map(entry.fields)
    for (const [field, value] of Object.entries(op.set)) entry.fields.set(field, value)

    if (!entry.created) {
      if (!REQUIRED_FIELDS[op.entity].every((field) => entry.fields.has(field))) return
      entry.created = true
      entry.updatedAt = op.hlc
      this.created[op.entity].push({ key: op.key, entry, at: op.hlc, by: op.by })
      this.record(op, 'created', [])
      return
    }

    const changes: FieldChange[] = []
    for (const [field, after] of Object.entries(op.set)) {
      // `deleted` starts out false; every other field was set when the entity was created.
      const previous = field === 'deleted' ? before.get(field) === true : before.get(field)
      if (stableStringify(previous) !== stableStringify(after)) {
        changes.push({ field, before: previous, after })
      }
    }
    if (changes.length === 0) return

    entry.updatedAt = op.hlc
    const deletion = changes.find((change) => change.field === 'deleted')
    const kind = !deletion ? 'updated' : deletion.after === true ? 'deleted' : 'restored'
    this.record(
      op,
      kind,
      changes.filter((change) => change !== deletion),
    )
  }

  /** Why `op` can't apply to the state so far, or null if it can. */
  private check(op: Op): string | null {
    const { set } = op
    const has = (field: string) => Object.hasOwn(set, field)
    switch (op.entity) {
      case 'group':
        if (op.key !== this.groupId) return 'wrong-group'
        if (has('name') && !isValidText(set.name, LIMITS.groupName)) return 'invalid-name'
        if (has('currency')) {
          if (!isValidCurrency(set.currency)) return 'invalid-currency'
          // Changing it would reinterpret every amount already recorded.
          const group = this.entries.group.get(this.groupId)
          const hasMoney = this.created.expense.length > 0 || this.created.payment.length > 0
          if (group?.fields.has('currency') && hasMoney) return 'currency-locked'
        }
        return null
      case 'member':
        if (has('name') && !isValidText(set.name, LIMITS.memberName)) return 'invalid-name'
        if (has('deleted') && typeof set.deleted !== 'boolean') return 'invalid-deleted'
        if (this.joinsMembers(op) && this.activeMembers() >= LIMITS.members) {
          return 'too-many-members'
        }
        return null
      case 'expense':
        if (has('title') && !isValidText(set.title, LIMITS.title)) return 'invalid-title'
        if (has('money')) {
          if (!isExpenseMoney(set.money)) return 'invalid-money'
          const involved = [set.money.paidBy, ...splitMembers(set.money.split)]
          if (!involved.every((id) => this.exists('member', id))) return 'unknown-member'
        }
        if (has('date') && !isValidDate(set.date)) return 'invalid-date'
        if (has('category') && !isCategory(set.category)) return 'invalid-category'
        if (has('deleted') && typeof set.deleted !== 'boolean') return 'invalid-deleted'
        return null
      case 'payment':
        if (has('money')) {
          if (!isPaymentMoney(set.money)) return 'invalid-money'
          if (!this.exists('member', set.money.from) || !this.exists('member', set.money.to)) {
            return 'unknown-member'
          }
        }
        if (has('date') && !isValidDate(set.date)) return 'invalid-date'
        if (has('deleted') && typeof set.deleted !== 'boolean') return 'invalid-deleted'
        return null
    }
  }

  /** Members not removed. Removed ones don't count toward the limit. */
  private activeMembers(): number {
    return this.created.member.filter(({ entry }) => entry.fields.get('deleted') !== true).length
  }

  /** Whether a member operation adds someone, or restores someone removed. */
  private joinsMembers(op: Op): boolean {
    const entry = this.entries.member.get(op.key)
    const activeBefore = entry?.created === true && entry.fields.get('deleted') !== true
    const named = Object.hasOwn(op.set, 'name') || entry?.fields.has('name') === true
    const deleted = Object.hasOwn(op.set, 'deleted')
      ? op.set.deleted === true
      : entry?.fields.get('deleted') === true
    return !activeBefore && named && !deleted
  }

  private exists(kind: EntityKind, key: string): boolean {
    return this.entries[kind].get(key)?.created === true
  }

  private record(op: Op, kind: ActivityKind, changes: FieldChange[]): void {
    this.activity.push({
      opId: op.id,
      hlc: op.hlc,
      at: hlcDecode(op.hlc)?.wall ?? 0,
      by: op.by,
      actor: op.actor,
      entity: op.entity,
      key: op.key,
      kind,
      changes,
    })
  }

  result(malformed: readonly Rejection[], latestHlc: string | null): GroupState {
    const [group] = this.created.group
    return {
      groupId: this.groupId,
      group: group
        ? {
            name: group.entry.fields.get('name') as string,
            currency: group.entry.fields.get('currency') as Currency,
          }
        : null,
      members: this.build('member', (fields, tracked) => ({
        ...tracked,
        name: fields.get('name') as string,
      })),
      expenses: this.build('expense', (fields, tracked) => {
        const money = fields.get('money') as ExpenseMoney
        return {
          ...tracked,
          title: fields.get('title') as string,
          amount: money.amount,
          paidBy: money.paidBy,
          split: money.split,
          date: fields.get('date') as string,
          category: fields.get('category') as Category,
        }
      }),
      payments: this.build('payment', (fields, tracked) => {
        const money = fields.get('money') as PaymentMoney
        return {
          ...tracked,
          amount: money.amount,
          from: money.from,
          to: money.to,
          date: fields.get('date') as string,
        }
      }),
      activity: this.activity,
      rejected: [...malformed, ...this.rejected],
      latestHlc,
    }
  }

  /** Every existing entity of `kind`, in creation order. */
  private build<T>(
    kind: 'member' | 'expense' | 'payment',
    make: (fields: ReadonlyMap<string, unknown>, tracked: Tracked) => T,
  ): Map<string, T> {
    return new Map(
      this.created[kind].map(({ key, entry, at, by }) => [
        key,
        make(entry.fields, {
          id: key,
          deleted: entry.fields.get('deleted') === true,
          createdAt: at,
          createdBy: by,
          updatedAt: entry.updatedAt,
        }),
      ]),
    )
  }
}
