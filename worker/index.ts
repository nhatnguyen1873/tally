// Static assets are served without reaching this code (see wrangler.jsonc);
// only /api/* requests run here: the health check and the sync relay.
import { GROUP_ID } from '../shared/protocol.ts'
import { CLIENT_IP } from './group-log.ts'

export { GroupLog } from './group-log.ts'

const RELAY = /^\/api\/g\/([^/]+)\/ws$/

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)

    if (pathname === '/api/health') {
      return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const groupId = RELAY.exec(pathname)?.[1]
    if (groupId !== undefined && GROUP_ID.test(groupId)) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return Response.json({ error: 'upgrade_required' }, { status: 426 })
      }
      const ip = request.headers.get('CF-Connecting-IP') ?? ''
      const { success } = await env.CONNECT_LIMIT.limit({ key: ip })
      if (!success) return Response.json({ error: 'rate_limited' }, { status: 429 })
      const forwarded = new Request(request)
      forwarded.headers.set(CLIENT_IP, ip)
      return env.GROUP_LOG.get(env.GROUP_LOG.idFromName(groupId)).fetch(forwarded)
    }

    return Response.json({ error: 'not_found' }, { status: 404 })
  },
} satisfies ExportedHandler<Env>
