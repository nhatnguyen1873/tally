import { renderToString } from 'react-dom/server'
import { Router } from 'wouter'

import { Shell } from './app/Shell.tsx'
import { HomeRoute } from './features/home/HomeRoute.tsx'
import type { Catalog } from './i18n/en.ts'
import { en } from './i18n/en.ts'
import { makeI18n } from './i18n/i18n.ts'
import { I18nStatic } from './i18n/I18nProvider.tsx'
import type { Language } from './i18n/language.ts'
import { vi } from './i18n/vi.ts'

function home(language: Language, catalog: Catalog, locale: string): string {
  const html = renderToString(
    <Router ssrPath="/">
      <I18nStatic value={makeI18n(language, catalog, locale)}>
        <HomeRoute />
      </I18nStatic>
    </Router>,
    { identifierPrefix: `first-paint-${language}-` },
  )
  return `<div data-first-paint="home" lang="${language}">${html}</div>`
}

/**
 * What index.html shows before the app starts: the home screen in English and
 * in Vietnamese, and the app's frame for every other address. The boot script
 * in index.html and global.css pick the one that fits; the app then replaces
 * it with the same markup.
 */
export function render(): string {
  return [
    home('en', en, 'en-US'),
    home('vi', vi, 'vi-VN'),
    `<div data-first-paint="other">${renderToString(<Shell />)}</div>`,
  ].join('')
}
