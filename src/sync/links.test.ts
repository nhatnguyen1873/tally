import { describe, expect, it } from 'vitest'

import { randomId } from '../domain/ids.ts'
import { inviteLink, parseInvite, secretFromHash } from './links.ts'

const invite = { groupId: randomId(16), secret: randomId(32) }

describe('invite links', () => {
  it('round-trips through the link', () => {
    const link = inviteLink('https://tally.nhatt.workers.dev', invite)
    expect(link).toBe(`https://tally.nhatt.workers.dev/g/${invite.groupId}#${invite.secret}`)
    expect(parseInvite(link)).toEqual(invite)
  })

  it('finds the link inside a chat message, on any host', () => {
    const text = `Join our trip: http://localhost:5173/g/${invite.groupId}#${invite.secret} see you!`
    expect(parseInvite(text)).toEqual(invite)
    expect(parseInvite(`/g/${invite.groupId}/#${invite.secret}`)).toEqual(invite)
  })

  it('rejects links with a missing, short or long part', () => {
    expect(parseInvite(`https://x/g/${invite.groupId}`)).toBeNull()
    expect(parseInvite(`https://x/g/${invite.groupId}#${invite.secret.slice(1)}`)).toBeNull()
    expect(parseInvite(`https://x/g/${invite.groupId}#${invite.secret}A`)).toBeNull()
    expect(parseInvite(`https://x/g/${invite.groupId}A#${invite.secret}`)).toBeNull()
    expect(parseInvite('nothing here')).toBeNull()
  })

  it('reads the secret from an address’s fragment', () => {
    expect(secretFromHash(`#${invite.secret}`)).toBe(invite.secret)
    expect(secretFromHash(invite.secret)).toBe(invite.secret)
    expect(secretFromHash('')).toBeNull()
    expect(secretFromHash('#abc')).toBeNull()
  })
})
