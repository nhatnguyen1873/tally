import './ui/tokens.css'
import './ui/global.css'

import { StrictMode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

import { App } from './app/App.tsx'
import { applyTheme, getPrefs } from './app/prefs.ts'
import { listenForInstall } from './app/install.ts'
import { preloadScreens } from './app/Routes.tsx'
import { registerServiceWorker } from './app/updates.ts'
import { loadCatalog, resolveLanguage } from './i18n/language.ts'

const RELOADED = 'tally:reloaded-for-update'

// Leaving the page: WebKit then rejects the imports still loading, which
// isn't a missing chunk, and a reload would override where the page is going.
// WebKit rejects them as the navigation starts, right after beforeunload and
// long before pagehide, so both mark the page as leaving. (beforeunload
// doesn't keep a page out of the back-forward cache; unload would.) A
// navigation can still stop without leaving (the Stop button), so the mark
// from beforeunload lapses after a few seconds, long after those rejections.
let leaving = false
let lapse: ReturnType<typeof setTimeout> | undefined
window.addEventListener('beforeunload', () => {
  leaving = true
  clearTimeout(lapse)
  lapse = setTimeout(() => {
    leaving = false
  }, 3000)
})
window.addEventListener('pagehide', () => {
  clearTimeout(lapse)
  leaving = true
})
window.addEventListener('pageshow', () => {
  leaving = false
})

// A deploy replaced the chunk this page asked for: reload once to get the new
// version, rather than leaving a broken screen. Never loop.
window.addEventListener('vite:preloadError', (event) => {
  if (leaving) return
  try {
    if (sessionStorage.getItem(RELOADED)) return
    sessionStorage.setItem(RELOADED, '1')
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

listenForInstall()

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

/**
 * Resolves once the browser has shown the first contentful paint, or after
 * 100 ms at most (a hidden tab doesn't paint).
 */
function firstPaintShown(): Promise<void> {
  return new Promise((resolve) => {
    if (!PerformanceObserver.supportedEntryTypes.includes('paint')) {
      resolve()
      return
    }
    const done = () => {
      observer.disconnect()
      clearTimeout(timeout)
      resolve()
    }
    const observer = new PerformanceObserver((list) => {
      if (list.getEntriesByName('first-contentful-paint').length > 0) done()
    })
    const timeout = setTimeout(done, 100)
    observer.observe({ type: 'paint', buffered: true })
  })
}

const prefs = getPrefs()
applyTheme(prefs.theme)
const language = resolveLanguage(prefs.language, navigator.languages)

// The build prerenders the first screens into #root (see src/prerender.tsx),
// so one paints before this code has even arrived, and the app replaces it
// with the same markup. On a fast load, wait until it's on screen first:
// replaced before the browser has shown it, it wouldn't count as the first
// paint, and the largest contentful paint would wait for the app.
void Promise.all([loadCatalog(language), firstPaintShown()]).then(([catalog]) => {
  // Someone may have tabbed to a link on the prerendered screen already; keep
  // their place when the app replaces it.
  const focused = document.activeElement
  const href =
    focused instanceof HTMLAnchorElement && root.contains(focused)
      ? focused.getAttribute('href')
      : null
  const app = createRoot(root)
  flushSync(() => {
    app.render(
      <StrictMode>
        <App initial={{ language, catalog }} />
      </StrictMode>,
    )
  })
  if (href) root.querySelector<HTMLElement>(`a[href="${CSS.escape(href)}"]`)?.focus()
})

// Safari has no requestIdleCallback.
const whenIdle = (run: () => void) => {
  if ('requestIdleCallback' in window) window.requestIdleCallback(run)
  else setTimeout(run, 1000)
}
whenIdle(() => {
  // Production only: the dev server's modules change as they're edited.
  if (import.meta.env.PROD) registerServiceWorker()
  // Only once every screen has arrived may a later missing chunk reload again.
  // Cleared any sooner, a chunk still missing after the reload (WebKit even
  // keeps the failed response) would reload the page over and over.
  void preloadScreens().then((loaded) => {
    if (!loaded || leaving) return
    try {
      sessionStorage.removeItem(RELOADED)
    } catch {
      // Storage is unavailable; nothing to clean up.
    }
  })
})
