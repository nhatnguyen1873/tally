import { useSyncExternalStore } from 'react'

import type { LanguagePreference } from '../i18n/language.ts'

export type ThemePreference = 'system' | 'light' | 'dark'

export interface Prefs {
  readonly language: LanguagePreference
  readonly theme: ThemePreference
}

/** Also read by the boot script in index.html, which applies the theme before first paint. */
export const PREFS_KEY = 'tally:prefs'
const DEFAULTS: Prefs = { language: 'system', theme: 'system' }

function parse(raw: string | null): Prefs {
  try {
    const value: unknown = JSON.parse(raw ?? '{}')
    if (typeof value !== 'object' || value === null) return DEFAULTS
    const { language, theme } = value as Record<string, unknown>
    return {
      language: language === 'en' || language === 'vi' ? language : 'system',
      theme: theme === 'light' || theme === 'dark' ? theme : 'system',
    }
  } catch {
    return DEFAULTS
  }
}

// Storage can be unavailable (private browsing, blocked site data); preferences
// then last for the session.
function read(): Prefs {
  try {
    return parse(localStorage.getItem(PREFS_KEY))
  } catch {
    return DEFAULTS
  }
}

let current: Prefs = typeof window === 'undefined' ? DEFAULTS : read()
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

if (typeof window !== 'undefined') {
  // Another tab changed them.
  window.addEventListener('storage', (event) => {
    if (event.key !== PREFS_KEY) return
    current = parse(event.newValue)
    notify()
  })
}

export function getPrefs(): Prefs {
  return current
}

export function setPrefs(patch: Partial<Prefs>): void {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(current))
  } catch {
    // Kept in memory for this session.
  }
  notify()
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, () => DEFAULTS)
}

/** Forces a theme on the page; "system" leaves it to the color-scheme media query. */
export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
}
