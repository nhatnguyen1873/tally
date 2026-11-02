// Serves the built client compressed with Brotli or gzip, as Cloudflare does
// in production. Lighthouse runs against this: the Workers preview doesn't
// compress, so Lighthouse would simulate a download no visitor ever gets.
// Every file is compressed once at start, as a CDN caches it; compressing per
// request would hold each response behind the ones before it, and delay the
// stylesheet, and so the first paint, by hundreds of milliseconds.
import { readdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, relative, sep } from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'

const ROOT = 'dist/client'
const PORT = Number(process.argv[2] ?? 4174)
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
}

const files = new Map()
for (const entry of readdirSync(ROOT, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue
  const file = join(entry.parentPath, entry.name)
  const body = readFileSync(file)
  files.set(`/${relative(ROOT, file).split(sep).join('/')}`, {
    type: TYPES[extname(file)] ?? 'application/octet-stream',
    body,
    br: brotliCompressSync(body),
    gzip: gzipSync(body),
  })
}
const page = files.get('/index.html')
if (!page) throw new Error(`No index.html in ${ROOT}; build first`)

createServer((request, response) => {
  // URL parsing already removes ".." segments; anything else is the app's page.
  const { pathname } = new URL(request.url ?? '/', 'http://localhost')
  const file = files.get(pathname) ?? page
  const accepts = String(request.headers['accept-encoding'] ?? '')
  const headers = { 'content-type': file.type }
  let body = file.body
  if (/\bbr\b/.test(accepts)) {
    body = file.br
    headers['content-encoding'] = 'br'
  } else if (/\bgzip\b/.test(accepts)) {
    body = file.gzip
    headers['content-encoding'] = 'gzip'
  }
  response.writeHead(200, headers).end(body)
}).listen(PORT, () => console.log(`Serving ${ROOT} at http://localhost:${PORT}`))
