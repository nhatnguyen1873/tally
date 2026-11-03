/// <reference lib="webworker" />
// The service worker (SPEC.md section 7). It keeps one version of the app,
// everything it needs, in a cache: the build lists the files (and stamps the
// version) after the HTML is final, so repeat visits work with no network.
// Page loads always get this version's shell; a new version installs beside
// it and waits until the app asks it to take over ("New version ready").

declare const self: ServiceWorkerGlobalScope
/** Filled in by scripts/prerender.mjs. */
declare const PRECACHE: readonly string[]
declare const VERSION: string

const CACHE = `tally-${VERSION}`
/** The app's page: every address is the same single-page app. */
const SHELL = '/'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Straight from the network, never from the HTTP cache.
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('tally-') && key !== CACHE) await caches.delete(key)
      }
      // The first install takes the open page at once, so it works offline.
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  // The relay, other sites and anything but reads go to the network.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  // The server sends Vary: Origin, and module loads carry an Origin header the
  // install's requests didn't: these files are the same either way.
  const options = { cacheName: CACHE, ignoreVary: true }
  const cached =
    request.mode === 'navigate' ? caches.match(SHELL, options) : caches.match(request, options)
  event.respondWith(cached.then((response) => response ?? fetch(request)))
})
