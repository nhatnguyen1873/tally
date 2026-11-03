// Base64url without padding (RFC 4648 section 5), for IDs, keys and ciphertext
// in URLs and JSON. Runs unchanged in browsers and in the Workers runtime.

export function toBase64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/** The bytes, or null if `text` isn't base64url. */
export function fromBase64url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** How many bytes a base64url string of this length holds. */
export function base64urlBytes(length: number): number {
  return Math.floor((length * 3) / 4)
}
