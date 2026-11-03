// Finishes the built index.html:
// - renders the first screens into #root (src/prerender.tsx), so one paints
//   before the JavaScript has downloaded and run;
// - tells the inline boot script each language's catalog file, to preload;
// - lists the files of the parts of screens that load on demand, for the app
//   to fetch once idle (main.tsx), without adding imports to the bundle;
// - allows the boot script in the CSP by its hash, so no other inline script
//   can run.
// Runs after `vite build`.
import { createHash } from 'node:crypto'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { build } from 'vite'

const PAGE = 'dist/client/index.html'
const HEADERS = 'dist/client/_headers'
const MANIFEST = 'dist/client/.vite/manifest.json'
const ROOT = '<div id="root"></div>'
const CATALOGS = 'var catalogs = {}'
/** Parts that load when first shown: preloaded so they work if the phone goes offline first. */
const PARTS = [
  'src/features/join/JoinScreen.tsx',
  'src/features/join/WhoAreYou.tsx',
  'src/features/share/ShareSheet.tsx',
  '/uqr/',
  'src/features/home/JoinDialog.tsx',
  'src/features/activity/History.tsx',
  'src/domain/csv.ts',
]

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

/** A chunk's file and every file it imports. */
function files(key, found = new Set()) {
  const chunk = manifest[key]
  if (!chunk || found.has(chunk.file)) return found
  found.add(chunk.file)
  for (const imported of chunk.imports ?? []) files(imported, found)
  return found
}
// The page already loads the entry and what it imports.
const entryKey = Object.keys(manifest).find((name) => manifest[name].isEntry)
const loaded = files(entryKey)
const partFiles = new Set()
for (const part of PARTS) {
  const key = Object.keys(manifest).find((name) => name === part || name.includes(part))
  if (!key) throw new Error(`No chunk for ${part} in ${MANIFEST}`)
  for (const file of files(key)) if (!loaded.has(file)) partFiles.add(`/${file}`)
}
const preload = `<meta name="tally-preload" content="${[...partFiles].join(' ')}" />`
if (!html.includes('</head>')) throw new Error(`</head> not found in ${PAGE}`)
html = html.replace('</head>', () => `${preload}\n  </head>`)
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
