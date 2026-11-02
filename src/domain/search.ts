/**
 * Text for matching: lower case, without accents, and with "đ" as "d", so
 * "pho" finds "Phở" and "da lat" finds "Đà Lạt".
 */
export function searchable(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase()
}

/** Whether every word of the query appears in the text, in any order. */
export function matchesSearch(text: string, query: string): boolean {
  const words = searchable(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = searchable(text)
  return words.every((word) => haystack.includes(word))
}
