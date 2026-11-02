import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { cssModules } from './vite.shared.ts'

// Builds src/prerender.tsx for Node, so scripts/prerender.mjs can render the
// first screen to HTML at build time.
export default defineConfig({
  plugins: [react()],
  css: { modules: cssModules },
  logLevel: 'warn',
  build: {
    ssr: 'src/prerender.tsx',
    outDir: 'dist/prerender',
    emptyOutDir: true,
    copyPublicDir: false,
  },
})
