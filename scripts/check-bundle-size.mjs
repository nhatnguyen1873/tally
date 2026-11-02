// Checks every screen's first load against the budgets in SPEC.md section 10.
// A screen's first load is the page's stylesheets, the app's entry and
// everything it imports, one language catalog (the larger, since a phone loads
// the one it uses), and the screen's own chunk and everything that imports.
// Run after `pnpm build`.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = 'dist/client'
const MANIFEST = 'dist/client-manifest.json'
const BUDGETS = { js: 110_000, css: 15_000 } // gzipped bytes
const CATALOGS = ['src/i18n/en.ts', 'src/i18n/vi.ts']
// Home ships with the entry and loads the group list as soon as it renders.
const HOME_LOADS = 'src/sync/groups.ts'

if (!existsSync(MANIFEST)) {
  console.error(`${MANIFEST} not found. Run \`pnpm build\` first.`)
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))

const sizes = new Map()
function gzipped(file) {
  if (!sizes.has(file)) sizes.set(file, gzipSync(readFileSync(join(DIST, file))).length)
  return sizes.get(file)
}

/** Every file a chunk needs before it can run: itself and its static imports, with their CSS. */
function closure(key, files = { js: new Set(), css: new Set() }) {
  const chunk = manifest[key]
  if (!chunk || files.js.has(chunk.file)) return files
  files.js.add(chunk.file)
  for (const css of chunk.css ?? []) files.css.add(css)
  for (const imported of chunk.imports ?? []) closure(imported, files)
  return files
}

// The stylesheets index.html links. The build puts all CSS in one file, which
// no chunk lists, so it's read from the page.
const pageCss = [
  ...readFileSync(join(DIST, 'index.html'), 'utf8').matchAll(
    /<link rel="stylesheet"[^>]*? href="\/([^"]+)"/g,
  ),
].map((match) => match[1])
if (pageCss.length === 0) throw new Error(`No stylesheet linked from ${DIST}/index.html`)

const entries = Object.entries(manifest)
const keyOf = (src) => entries.find(([, chunk]) => chunk.src === src)?.[0]
const entryKey = entries.find(([, chunk]) => chunk.isEntry)?.[0]
// Screens are the files named *Route.tsx (see src/app/Routes.tsx).
const screens = [
  ['HomeRoute', keyOf(HOME_LOADS)],
  ...entries
    .filter(([, chunk]) => chunk.isDynamicEntry && chunk.src?.endsWith('Route.tsx'))
    .map(([key, chunk]) => [chunk.name ?? key, key]),
]

let failed = false
const report = []
for (const [name, key] of screens) {
  const loads = CATALOGS.map((catalog) => {
    const files = closure(entryKey)
    for (const css of pageCss) files.css.add(css)
    closure(keyOf(catalog), files)
    closure(key, files)
    return files
  })
  const total = (files, kind) => [...files[kind]].reduce((sum, file) => sum + gzipped(file), 0)
  const js = Math.max(...loads.map((files) => total(files, 'js')))
  const css = Math.max(...loads.map((files) => total(files, 'css')))
  const over = js > BUDGETS.js || css > BUDGETS.css
  failed ||= over
  report.push({ name, js, css, over })
}

report.sort((a, b) => b.js - a.js)
for (const { name, js, css, over } of report) {
  const kb = (bytes) => `${(bytes / 1000).toFixed(1)} kB`.padStart(9)
  console.log(`${kb(js)} JS ${kb(css)} CSS  ${name}${over ? '  OVER BUDGET' : ''}`)
}
console.log(
  `\nBudgets: ${BUDGETS.js / 1000} kB JS and ${BUDGETS.css / 1000} kB CSS, gzipped, per screen's first load.`,
)
process.exit(failed ? 1 : 0)
