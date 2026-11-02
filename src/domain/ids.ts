export type MemberId = string

// Random base64url strings: 16 characters (12 bytes) for members, expenses,
// payments, operations and devices; 22 characters (16 bytes) for groups.
const ID_PATTERN = /^[A-Za-z0-9_-]{16,32}$/

export function randomId(bytes = 12): string {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  let binary = ''
  for (const byte of buffer) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function isId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value)
}
