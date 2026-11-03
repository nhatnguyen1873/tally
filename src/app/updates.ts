// Registers the service worker (src/service-worker.ts) and says when a new
// version has installed and is waiting: the app shows "New version ready",
// and switches only when asked to.

let waiting: ServiceWorker | null = null
const listeners = new Set<() => void>()

function setWaiting(worker: ServiceWorker) {
  waiting = worker
  for (const listener of listeners) listener()
}

/** For useSyncExternalStore: whether a new version is ready. */
export function isUpdateReady(): boolean {
  return waiting !== null
}

export function subscribeUpdate(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Switches to the new version; the page reloads once it has taken over. */
export function applyUpdate(): void {
  waiting?.postMessage('skip-waiting')
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  const container = navigator.serviceWorker
  // The first install takes over an uncontrolled page with nothing to
  // reload; a later version taking over (from this tab or another) means
  // this page's code is out of date.
  let controlled = container.controller !== null
  container.addEventListener('controllerchange', () => {
    if (controlled) location.reload()
    controlled = true
  })

  container
    .register('/sw.js')
    .then((registration) => {
      const track = (worker: ServiceWorker | null) => {
        if (!worker) return
        const check = () => {
          if (worker.state === 'installed' && container.controller) setWaiting(worker)
        }
        check()
        worker.addEventListener('statechange', check)
      }
      track(registration.waiting)
      track(registration.installing)
      registration.addEventListener('updatefound', () => {
        track(registration.installing)
      })
      // Look for a new version whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible')
          void registration.update().catch(() => undefined)
      })
    })
    .catch(() => {
      // No service worker (private browsing, blocked storage): the app works online.
    })
}
