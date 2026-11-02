// Serves the built client compressed with Brotli or gzip, as Cloudflare does
// in production. Lighthouse runs against this: the Workers preview doesn't
// compress, so Lighthouse would simulate a download no visitor ever gets.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
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

createServer((request, response) => {
  // URL parsing already removes ".." segments.
  const { pathname } = new URL(request.url ?? '/', 'http://localhost')
  let file = join(ROOT, pathname)
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, 'index.html')

  const body = readFileSync(file)
  const accepts = String(request.headers['accept-encoding'] ?? '')
  const headers = { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }
  let encoded = body
  if (/\bbr\b/.test(accepts)) {
    encoded = brotliCompressSync(body)
    headers['content-encoding'] = 'br'
  } else if (/\bgzip\b/.test(accepts)) {
    encoded = gzipSync(body)
    headers['content-encoding'] = 'gzip'
  }
  response.writeHead(200, headers).end(encoded)
}).listen(PORT, () => console.log(`Serving ${ROOT} at http://localhost:${PORT}`))
