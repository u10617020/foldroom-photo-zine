const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

async function countUsers(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS usage_totals (name TEXT PRIMARY KEY, users INTEGER NOT NULL DEFAULT 0)').run();
  await db.prepare("INSERT OR IGNORE INTO usage_totals (name, users) VALUES ('editor', 0)").run();
  const row = await db.prepare("SELECT users FROM usage_totals WHERE name = 'editor'").first();
  return row?.users ?? 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/usage') return env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'POST') {
      return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
    }
    if (request.method === 'POST' && request.headers.get('origin') !== url.origin) {
      return new Response(null, { status: 403 });
    }
    if (!env.DB) return Response.json({ error: 'statistics unavailable' }, { status: 503, headers });
    try {
      let users = await countUsers(env.DB);
      const seen = /(?:^|;\s*)foldroom_used=1(?:;|$)/.test(request.headers.get('cookie') || '');
      if (request.method === 'POST' && !seen) {
        await env.DB.prepare("UPDATE usage_totals SET users = users + 1 WHERE name = 'editor'").run();
        users += 1;
      }
      const response = Response.json({ users }, { headers });
      if (request.method === 'POST' && !seen) {
        response.headers.set('set-cookie', 'foldroom_used=1; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax');
      }
      return response;
    } catch (error) {
      console.error('Usage counter failed:', error);
      return Response.json({ error: 'statistics unavailable' }, { status: 503, headers });
    }
  },
};
