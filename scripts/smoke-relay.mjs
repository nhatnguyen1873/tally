// Checks that the live relay answers, without creating anything: a hello for
// a random group nobody created must get not_found, which stores nothing
// (worker/test/relay.test.ts checks that). Usage: node scripts/smoke-relay.mjs <url>
const base = new URL(process.argv[2] ?? 'https://tally.nhatt.workers.dev')
const random = (bytes) =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString('base64url')

const scheme = base.protocol === 'https:' ? 'wss:' : 'ws:'
const socket = new WebSocket(`${scheme}//${base.host}/api/g/${random(16)}/ws`)
const timer = setTimeout(() => {
  console.error('The relay did not answer within 10 s')
  process.exit(1)
}, 10_000)

socket.addEventListener('open', () => {
  socket.send(JSON.stringify({ type: 'hello', token: random(32), after: 0 }))
})
socket.addEventListener('message', (event) => {
  clearTimeout(timer)
  const message = JSON.parse(String(event.data))
  if (message.type === 'error' && message.code === 'not_found') {
    console.log(`The relay at ${base.host} answers`)
    process.exit(0)
  }
  console.error(`Unexpected answer from the relay: ${String(event.data)}`)
  process.exit(1)
})
socket.addEventListener('error', () => {
  clearTimeout(timer)
  console.error('Could not connect to the relay')
  process.exit(1)
})
