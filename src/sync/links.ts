// Invite links: https://<host>/g/<groupId>#<secret> (SPEC.md section 6.3).
// Browsers never send the part after # to servers.

import { GROUP_ID } from '../../shared/protocol.ts'
import { SECRET } from './crypto.ts'

export interface Invite {
  readonly groupId: string
  readonly secret: string
}

export function inviteLink(origin: string, { groupId, secret }: Invite): string {
  return `${origin}/g/${groupId}#${secret}`
}

/** The secret in an address's #fragment, if it holds one. */
export function secretFromHash(hash: string): string | null {
  const secret = hash.startsWith('#') ? hash.slice(1) : hash
  return SECRET.test(secret) ? secret : null
}

/**
 * The invite in pasted text: a whole link, or a message that contains one
 * (chat apps often add text around it). Any host is accepted, since only the
 * group ID and secret matter.
 */
export function parseInvite(text: string): Invite | null {
  const match = /\/g\/([A-Za-z0-9_-]{22})\/?#([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/.exec(text)
  if (!match) return null
  const [, groupId = '', secret = ''] = match
  return GROUP_ID.test(groupId) && SECRET.test(secret) ? { groupId, secret } : null
}
