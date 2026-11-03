// Renders the app icons' PNG sizes from their SVGs, with Playwright's
// Chromium. Run after changing public/icons/*.svg, and commit the PNGs:
//   node scripts/make-icons.mjs
import { readFileSync } from 'node:fs'

import { chromium } from '@playwright/test'

const SIZES = [
  // [source, output, size]: "any" icons keep their rounded corners; maskable
  // ones fill the square, and launchers cut them to shape. iOS rounds its own.
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['maskable.svg', 'maskable-192.png', 192],
  ['maskable.svg', 'maskable-512.png', 512],
  ['maskable.svg', 'apple-touch-icon.png', 180],
]

const browser = await chromium.launch()
for (const [source, output, size] of SIZES) {
  const svg = readFileSync(`public/icons/${source}`, 'utf8')
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  )
  await page.screenshot({ path: `public/icons/${output}`, omitBackground: true })
  await page.close()
  console.log(`public/icons/${output}`)
}
await browser.close()
