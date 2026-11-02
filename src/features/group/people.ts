import type { GroupState, Member } from '../../domain/fold.ts'
import type { MemberId } from '../../domain/ids.ts'
import { displayNames } from '../../domain/members.ts'
import type { Translate } from '../../i18n/i18n.ts'

/** How to name members on screen, from this device's point of view. */
export interface People {
  readonly me: MemberId | null
  /** Everyone, in the order they were added, including removed members. */
  readonly all: readonly Member[]
  /** Current members: the ones new expenses can include. */
  readonly active: readonly Member[]
  /** "An", "An (2)", or "Someone" for an unknown ID. */
  readonly name: (id: MemberId) => string
  /** As a sentence's subject: "You" for this device's member. */
  readonly subject: (id: MemberId) => string
  /** As a sentence's object: "you". */
  readonly object: (id: MemberId) => string
  /** For lists: "Minh (you)", "Bảo (removed)". */
  readonly label: (id: MemberId) => string
}

export function makePeople(state: GroupState, me: MemberId | null, t: Translate): People {
  const names = displayNames(state.members)
  const name = (id: MemberId) => names.get(id) ?? t('person.someone')
  const all = [...state.members.values()]
  return {
    me,
    all,
    active: all.filter((member) => !member.deleted),
    name,
    subject: (id) => (id === me ? t('person.you') : name(id)),
    object: (id) => (id === me ? t('person.youObject') : name(id)),
    label: (id) => {
      if (id === me) return t('person.youSuffix', { name: name(id) })
      if (state.members.get(id)?.deleted) return t('person.removedSuffix', { name: name(id) })
      return name(id)
    },
  }
}

/** Trimmed, single-spaced, composed (NFC) text, as stored in operations. */
export function cleanText(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim()
}
