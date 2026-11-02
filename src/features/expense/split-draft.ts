import type { MemberId } from '../../domain/ids.ts'
import { isValidAmount } from '../../domain/money.ts'
import { allocate, FULL_PERCENT, type Split } from '../../domain/split.ts'

export type SplitMode = Split['mode']
export const SPLIT_MODES: readonly SplitMode[] = ['equal', 'exact', 'shares', 'percent']

/**
 * What the split editor holds. Every mode keeps its own values, so switching
 * modes and back loses nothing.
 */
export interface SplitDraft {
  readonly mode: SplitMode
  /** Equally: who's included. */
  readonly among: readonly MemberId[]
  /** Exact amounts, in minor units. 0 leaves someone out. */
  readonly amounts: Readonly<Record<MemberId, number>>
  /** Shares, whole numbers. 0 leaves someone out. */
  readonly shares: Readonly<Record<MemberId, number>>
  /** Percentages, in basis points. 0 leaves someone out. */
  readonly bps: Readonly<Record<MemberId, number>>
}

export type SplitProblem = 'nobody' | 'exact' | 'percent'

export type SplitResult =
  | { readonly split: Split; readonly problem?: undefined }
  | { readonly split?: undefined; readonly problem: SplitProblem }

function evenly(total: number, members: readonly MemberId[]): Record<MemberId, number> {
  if (members.length === 0) return {}
  return Object.fromEntries(allocate(total, { mode: 'equal', among: members }, 'even'))
}

function zeros(members: readonly MemberId[]): Record<MemberId, number> {
  return Object.fromEntries(members.map((member) => [member, 0]))
}

/** A new expense's split: equally among everyone, with even starting values for the other modes. */
export function newDraft(members: readonly MemberId[]): SplitDraft {
  return {
    mode: 'equal',
    among: members,
    amounts: {},
    shares: Object.fromEntries(members.map((member) => [member, 1])),
    bps: evenly(FULL_PERCENT, members),
  }
}

/** An existing expense's split, ready to edit. */
export function draftFrom(split: Split, members: readonly MemberId[]): SplitDraft {
  const draft = newDraft(members)
  switch (split.mode) {
    case 'equal':
      return { ...draft, among: split.among }
    case 'exact':
      return { ...draft, mode: 'exact', amounts: split.amounts }
    case 'shares':
      return { ...draft, mode: 'shares', shares: { ...zeros(members), ...split.shares } }
    case 'percent':
      return { ...draft, mode: 'percent', bps: { ...zeros(members), ...split.bps } }
  }
}

function sum(values: Readonly<Record<MemberId, number>>): number {
  return Object.values(values).reduce((total, value) => total + value, 0)
}

/** The positive values for current members only. */
function chosen(
  values: Readonly<Record<MemberId, number>>,
  members: readonly MemberId[],
): Record<MemberId, number> {
  return Object.fromEntries(
    members
      .filter((member) => (values[member] ?? 0) > 0)
      .map((member) => [member, values[member] ?? 0]),
  )
}

/** The split a draft describes, or why it doesn't add up yet. */
export function splitOf(
  draft: SplitDraft,
  amount: number | null,
  members: readonly MemberId[],
): SplitResult {
  switch (draft.mode) {
    case 'equal': {
      const among = members.filter((member) => draft.among.includes(member))
      return among.length > 0 ? { split: { mode: 'equal', among } } : { problem: 'nobody' }
    }
    case 'exact': {
      const amounts = chosen(draft.amounts, members)
      if (Object.keys(amounts).length === 0) return { problem: 'nobody' }
      return sum(amounts) === amount ? { split: { mode: 'exact', amounts } } : { problem: 'exact' }
    }
    case 'shares': {
      const shares = chosen(draft.shares, members)
      return Object.keys(shares).length > 0
        ? { split: { mode: 'shares', shares } }
        : { problem: 'nobody' }
    }
    case 'percent': {
      const bps = chosen(draft.bps, members)
      if (Object.keys(bps).length === 0) return { problem: 'nobody' }
      return sum(bps) === FULL_PERCENT
        ? { split: { mode: 'percent', bps } }
        : { problem: 'percent' }
    }
  }
}

/**
 * What's still unassigned: minor units for exact amounts, basis points for
 * percentages, negative when over. Null for modes that always add up.
 */
export function leftToAssign(
  draft: SplitDraft,
  amount: number | null,
  members: readonly MemberId[],
): number | null {
  if (draft.mode === 'exact')
    return amount === null ? null : amount - sum(chosen(draft.amounts, members))
  if (draft.mode === 'percent') return FULL_PERCENT - sum(chosen(draft.bps, members))
  return null
}

/**
 * Each person's part, as the expense will record it: `salt` is the expense's
 * ID, which decides who gets leftover units. Null until amount and split are valid.
 */
export function partsOf(
  draft: SplitDraft,
  amount: number | null,
  members: readonly MemberId[],
  salt: string,
): Map<MemberId, number> | null {
  if (!isValidAmount(amount)) return null
  const { split } = splitOf(draft, amount, members)
  return split ? allocate(amount, split, salt) : null
}
