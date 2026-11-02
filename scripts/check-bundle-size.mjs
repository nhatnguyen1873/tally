// Checks what a first visit downloads against the budgets in SPEC.md
// section 10: the entry script, every chunk it preloads, and its stylesheets.
// Chunks loaded on demand don't count. Run after `pnpm build`.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = 'dist/client'
const BUDGETS = { js: 100_000, css: 15_000 } // gzipped bytes

const htmlPath = join(DIST, 'index.html')
if (!existsSync(htmlPath)) {
  console.error(`${htmlPath} not found. Run \`pnpm build\` first.`)
  process.exit(1)
}

const html = readFileSync(htmlPath, 'utf8')
const attribute = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
const files = { js: [], css: [] }
for (const tag of html.match(/<(script|link)\b[^>]*>/g) ?? []) {
  if (tag.startsWith('<script')) {
    const src = attribute(tag, 'src')
    if (src) files.js.push(src)
    continue
  }
  const rel = attribute(tag, 'rel')
  const href = attribute(tag, 'href')
  if (href && rel === 'modulepreload') files.js.push(href)
  if (href && rel === 'stylesheet') files.css.push(href)
}

let failed = false
for (const [kind, budget] of Object.entries(BUDGETS)) {
  let total = 0
  for (const file of files[kind]) {
    const size = gzipSync(readFileSync(join(DIST, file))).length
    total += size
    console.log(`  ${(size / 1000).toFixed(1).padStart(6)} kB  ${file}`)
  }
  const over = total > budget
  failed ||= over
  const verdict = over ? 'OVER BUDGET' : 'ok'
  console.log(
    `${kind.toUpperCase()}: ${(total / 1000).toFixed(1)} kB of ${budget / 1000} kB gzipped (${verdict})\n`,
  )
}
process.exit(failed ? 1 : 0)
