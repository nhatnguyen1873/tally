import type { Catalog } from './en.ts'

export type Language = 'en' | 'vi'
export type LanguagePreference = Language | 'system'

export const LANGUAGES: readonly Language[] = ['en', 'vi']

function baseOf(tag: string): string {
  return tag.toLowerCase().split('-')[0] ?? ''
}

/** The saved choice, else the phone's first supported language, else English. */
export function resolveLanguage(
  preference: LanguagePreference,
  phoneLanguages: readonly string[],
): Language {
  if (preference !== 'system') return preference
  for (const tag of phoneLanguages) {
    const base = baseOf(tag)
    if (base === 'vi' || base === 'en') return base
  }
  return 'en'
}

/** Formatting locale: the phone's own variant of the language (en-GB), else a default. */
export function localeFor(language: Language, phoneLanguages: readonly string[]): string {
  return (
    phoneLanguages.find((tag) => baseOf(tag) === language) ??
    (language === 'vi' ? 'vi-VN' : 'en-US')
  )
}

/**
 * Each catalog is its own file, so a phone downloads only the language it
 * uses. The boot script in index.html preloads it.
 */
export async function loadCatalog(language: Language): Promise<Catalog> {
  return language === 'vi' ? (await import('./vi.ts')).vi : (await import('./en.ts')).en
}
