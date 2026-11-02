import { cloudflare } from '@cloudflare/vite-plugin'
import babel from '@rolldown/plugin-babel'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { cssModules } from './vite.shared.ts'

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), cloudflare()],
  css: { modules: cssModules },
  environments: {
    // For scripts/check-bundle-size.mjs; scripts/prerender.mjs moves it out of
    // dist/client so it isn't deployed.
    // One stylesheet (about 10 kB gzipped for every screen) instead of one per
    // chunk: stylesheets block first paint and hold back scripts, so one
    // request beats six.
    client: { build: { manifest: true, cssCodeSplit: false } },
  },
})
