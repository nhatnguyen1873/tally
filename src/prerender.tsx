import { renderToString } from 'react-dom/server'

import { Shell } from './app/Shell.tsx'

/** The app's frame, placed in index.html at build time so it paints before the app's code arrives. */
export function render(): string {
  return renderToString(<Shell />)
}
