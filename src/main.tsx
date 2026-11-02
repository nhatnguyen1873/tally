import './ui/tokens.css'
import './ui/global.css'

import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'

import { App } from './app/App.tsx'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

const app = (
  <StrictMode>
    <App />
  </StrictMode>
)

// Production builds render the first screen into index.html (see
// scripts/prerender.mjs), so it paints before this script runs. Hydrate it
// rather than replace it; the dev server serves an empty root.
if (root.hasChildNodes()) hydrateRoot(root, app)
else createRoot(root).render(app)
