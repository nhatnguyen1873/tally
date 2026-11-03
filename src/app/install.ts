// Installing Tally (SPEC.md section 7): Android's native prompt, iOS's Share →
// Add to Home Screen, and in-app browsers, where neither is possible.

/** Chrome's install prompt, which it offers once the app qualifies. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>
}

let prompt: InstallPrompt | null = null
let installed = false
const listeners = new Set<() => void>()

function changed() {
  for (const listener of listeners) listener()
}

/** Call at start-up: Chrome may offer the prompt soon after the page loads. */
export function listenForInstall(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep it for the Install button instead of Chrome's own mini-bar.
    event.preventDefault()
    prompt = event as InstallPrompt
    changed()
  })
  window.addEventListener('appinstalled', () => {
    prompt = null
    installed = true
    changed()
  })
}

export type InstallWay = 'prompt' | 'ios' | null

/** How this browser can install Tally, if it isn't installed already. */
export function installWay(): InstallWay {
  if (installed || isStandalone()) return null
  if (prompt) return 'prompt'
  return isIos() && !inAppBrowser() ? 'ios' : null
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Shows Chrome's install prompt. It can be shown only once. */
export async function install(): Promise<void> {
  const shown = prompt
  prompt = null
  changed()
  await shown?.prompt()
}

function isStandalone(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  // iPadOS reports itself as a Mac, but Macs have no touch screen.
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  )
}

/**
 * Zalo, Messenger, Facebook and Instagram open links in their own browsers,
 * whose storage is separate and which can't install apps.
 */
export function inAppBrowser(): boolean {
  return /\b(Zalo|FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram)\b/i.test(navigator.userAgent)
}
