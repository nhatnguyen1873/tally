// Renders the app's first screen to HTML and puts it in the built index.html,
// so text paints as soon as the page arrives instead of after the JavaScript
// has downloaded and run. Runs after `vite build`.
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { build } from 'vite'

const PAGE = 'dist/client/index.html'
const ROOT = '<div id="root"></div>'

await build({ configFile: 'vite.prerender.config.ts' })
const { render } = await import(pathToFileURL('dist/prerender/prerender.js').href)

const html = readFileSync(PAGE, 'utf8')
if (!html.includes(ROOT)) throw new Error(`${ROOT} not found in ${PAGE}`)
writeFileSync(PAGE, html.replace(ROOT, `<div id="root">${render()}</div>`))
rmSync('dist/prerender', { recursive: true, force: true })
console.log(`Prerendered the first screen into ${PAGE}`)
