const { MAX_BYTES } = require('./sharing-store.cjs');
async function handleSharing(req, reply, store, origin) {
  const url = new URL(req.url, origin);
  if (!url.pathname.startsWith('/api/shares')) return false;
  const match = /^\/api\/shares(?:\/([a-f0-9]{48}))?$/.exec(url.pathname);
  if (!match || url.search) { reply(404, JSON.stringify({ error: 'Unknown endpoint' })); return true; }
  try {
    if (req.method === 'GET' && match[1]) { reply(200, JSON.stringify(store.get(match[1]))); return true; }
    if (!['POST', 'DELETE'].includes(req.method) || req.headers.origin !== origin || req.headers['x-5e-request'] !== '1' || !req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('Request rejected'), { status: 403 });
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BYTES) throw Object.assign(new Error('공유 문서는 32MB 이하로 저장해 주세요.'), { status: 413 });
      chunks.push(chunk);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
    if (req.method === 'POST' && !match[1]) reply(201, JSON.stringify(await store.create(body)));
    else if (req.method === 'DELETE' && match[1]) { store.revoke(match[1], body.revokeKey); reply(200, '{}'); }
    else reply(405, JSON.stringify({ error: 'Method rejected' }));
  } catch (error) { reply(error.status || 400, JSON.stringify({ error: error.code ? '공유 문서 저장에 실패했습니다. 다시 시도해 주세요.' : error.message })); }
  return true;
}
module.exports = { handleSharing };
