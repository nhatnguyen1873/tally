import { createContext, type ReactNode, use, useEffect, useMemo, useState } from 'react'

import { usePrefs } from '../app/prefs.ts'
import type { Catalog } from './en.ts'
import { type I18n, makeI18n } from './i18n.ts'
import { type Language, loadCatalog, localeFor, resolveLanguage } from './language.ts'

const I18nContext = createContext<I18n | null>(null)

interface Loaded {
  readonly language: Language
  readonly catalog: Catalog
}

/** Provides the language the preferences ask for, loading its catalog when it changes. */
export function I18nProvider({ initial, children }: { initial: Loaded; children: ReactNode }) {
  const { language: preference } = usePrefs()
  const [loaded, setLoaded] = useState(initial)
  const wanted = resolveLanguage(preference, navigator.languages)

  useEffect(() => {
    if (wanted === loaded.language) return
    let current = true
    void loadCatalog(wanted).then((catalog) => {
      if (current) setLoaded({ language: wanted, catalog })
    })
    return () => {
      current = false
    }
  }, [wanted, loaded.language])

  useEffect(() => {
    document.documentElement.lang = loaded.language
  }, [loaded.language])

  const value = useMemo(
    () =>
      makeI18n(loaded.language, loaded.catalog, localeFor(loaded.language, navigator.languages)),
    [loaded],
  )
  return <I18nContext value={value}>{children}</I18nContext>
}

/** A fixed language, for rendering outside the app (the build's prerender). */
export function I18nStatic({ value, children }: { value: I18n; children: ReactNode }) {
  return <I18nContext value={value}>{children}</I18nContext>
}

export function useI18n(): I18n {
  const value = use(I18nContext)
  if (!value) throw new Error('useI18n needs an I18nProvider')
  return value
}
