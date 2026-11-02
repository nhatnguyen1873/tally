import './ui/tokens.css'
import './ui/global.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App.tsx'
import { applyTheme, getPrefs } from './app/prefs.ts'
import { preloadScreens } from './app/Routes.tsx'
import { loadCatalog, resolveLanguage } from './i18n/language.ts'

const RELOADED = 'tally:reloaded-for-update'

// A deploy replaced the chunk this page asked for: reload once to get the new
// version, rather than leaving a broken screen. Never loop.
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem(RELOADED)) return
    sessionStorage.setItem(RELOADED, '1')
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

const prefs = getPrefs()
applyTheme(prefs.theme)
const language = resolveLanguage(prefs.language, navigator.languages)

// The build prerenders the app's frame into #root (see src/prerender.tsx), so
// it paints before this code has arrived; the app replaces it.
void loadCatalog(language).then((catalog) => {
  createRoot(root).render(
    <StrictMode>
      <App initial={{ language, catalog }} />
    </StrictMode>,
  )
})

// Safari has no requestIdleCallback.
const whenIdle = (run: () => void) => {
  if ('requestIdleCallback' in window) window.requestIdleCallback(run)
  else setTimeout(run, 1000)
}
whenIdle(() => {
  preloadScreens()
  try {
    sessionStorage.removeItem(RELOADED)
  } catch {
    // Storage is unavailable; nothing to clean up.
  }
})
