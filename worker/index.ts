// Static assets are served without reaching this code (see wrangler.jsonc);
// only /api/* requests run here. The sync relay arrives in milestone 3.
export default {
  fetch(request) {
    const { pathname } = new URL(request.url)

    if (pathname === '/api/health') {
      return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
    }

    return Response.json({ error: 'not_found' }, { status: 404 })
  },
} satisfies ExportedHandler<Env>
