import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'

import { App } from './app/App.tsx'

/** The app's first render as HTML, placed in index.html at build time. */
export function render(): string {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
