// Finishes the built index.html:
// - renders the first screens into #root (src/prerender.tsx), so one paints
//   before the JavaScript has downloaded and run;
// - tells the inline boot script each language's catalog file, to preload;
// - allows the boot script in the CSP by its hash, so no other inline script
//   can run;
// - builds the service worker (src/service-worker.ts) with the list of files
//   to keep offline, taken now that the HTML is final.
// Runs after `vite build`.
import { createHash } from 'node:crypto'
import { copyFileSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import { build } from 'vite'

const PAGE = 'dist/client/index.html'
const HEADERS = 'dist/client/_headers'
const MANIFEST = 'dist/client/.vite/manifest.json'
const ROOT = '<div id="root"></div>'
const CATALOGS = 'var catalogs = {}'

await build({ configFile: 'vite.prerender.config.ts' })
const { render } = await import(pathToFileURL('dist/prerender/prerender.js').href)

let html = readFileSync(PAGE, 'utf8')
if (!html.includes(ROOT)) throw new Error(`${ROOT} not found in ${PAGE}`)
html = html.replace(ROOT, () => `<div id="root">${render()}</div>`)

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const catalogs = Object.fromEntries(
  ['en', 'vi'].map((language) => {
    const chunk = manifest[`src/i18n/${language}.ts`]
    if (!chunk) throw new Error(`No chunk for the ${language} catalog in ${MANIFEST}`)
    return [language, `/${chunk.file}`]
  }),
)
if (!html.includes(CATALOGS)) throw new Error(`${CATALOGS} not found in ${PAGE}`)
html = html.replace(CATALOGS, () => `var catalogs = ${JSON.stringify(catalogs)}`)
writeFileSync(PAGE, html)

const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? '')
if (inline.length !== 1)
  throw new Error(`Expected one inline script in ${PAGE}, found ${inline.length}`)
const hash = createHash('sha256').update(inline[0]).digest('base64')
const headers = readFileSync(HEADERS, 'utf8')
if (!headers.includes("script-src 'self';")) throw new Error(`script-src not found in ${HEADERS}`)
writeFileSync(HEADERS, headers.replace("script-src 'self';", `script-src 'self' 'sha256-${hash}';`))

// The build manifest is for the bundle-size check, not for visitors.
renameSync(MANIFEST, 'dist/client-manifest.json')
rmSync('dist/client/.vite', { recursive: true, force: true })
rmSync('dist/prerender', { recursive: true, force: true })
console.log(`Prerendered ${PAGE} and allowed its boot script (sha256-${hash})`)

// --- The service worker ----------------------------------------------------------

/**
 * Files Cloudflare reads rather than serves (including those .assetsignore
 * names), or that mustn't be kept offline.
 */
const ignored = readFileSync('dist/client/.assetsignore', 'utf8').split('\n').filter(Boolean)
const NOT_CACHED = new Set(['.assetsignore', ...ignored, '_headers', 'robots.txt', 'sw.js'])
const precache = []
const version = createHash('sha256')
for (const entry of readdirSync('dist/client', { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue
  const file = join(entry.parentPath, entry.name)
  const path = relative('dist/client', file).split(sep).join('/')
  if (NOT_CACHED.has(path)) continue
  // The page is served at /, as every address serves it.
  const url = path === 'index.html' ? '/' : `/${path}`
  precache.push(url)
  version.update(url).update(readFileSync(file))
}
precache.sort()
const stamp = version.digest('base64url').slice(0, 16)
await build({
  configFile: false,
  logLevel: 'warn',
  publicDir: false,
  define: { PRECACHE: JSON.stringify(precache), VERSION: JSON.stringify(stamp) },
  build: {
    outDir: 'dist/sw',
    emptyOutDir: true,
    lib: {
      entry: 'src/service-worker.ts',
      formats: ['iife'],
      name: 'tally',
      fileName: () => 'sw.js',
    },
  },
})
copyFileSync('dist/sw/sw.js', 'dist/client/sw.js')
rmSync('dist/sw', { recursive: true, force: true })
console.log(`Built the service worker: version ${stamp}, ${precache.length} files kept offline`)
