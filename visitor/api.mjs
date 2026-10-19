// 방문자 집계 API. Cloudflare Worker(visitor/worker)와 단위 검사가 같은 코드를 쓴다.
// 계약은 docs/VISITOR_STATS_SERVER.md, 로컬 Node 서버 scripts/visitor-stats-server.cjs와 같다.
export const ENDPOINT = '/api/visitor-stats';
export const TIMEZONE = 'Asia/Seoul';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOTS = /bot\b|crawler|spider|slurp|headless|phantomjs|selenium|playwright|puppeteer|lighthouse|curl|wget|python|\bnode\b|undici|postman|facebookexternalhit|preview|axios/i;
const BODY_LIMIT = 1024;

export function kstDate(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) throw new Error('Invalid visitor stats clock.');
  return new Date(time + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const hex = bytes => [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');

// D1(또는 같은 모양의 SQLite 어댑터) 위의 저장소. 누적·오늘 추가와 두 숫자 읽기는 한 batch(트랜잭션)에서 처리한다.
export function createVisitorStore(db) {
  let key;
  async function hmacKey() {
    if (key) return key;
    const fresh = hex(crypto.getRandomValues(new Uint8Array(32)));
    await db.prepare('INSERT OR IGNORE INTO metadata (key, value) VALUES (?, ?)').bind('hash_secret', fresh).run();
    const secret = (await db.prepare('SELECT value FROM metadata WHERE key = ?').bind('hash_secret').first())?.value;
    if (!/^[0-9a-f]{64}$/.test(secret || '')) throw new Error('Invalid visitor stats database secret.');
    const raw = new Uint8Array(secret.match(/../g).map(pair => parseInt(pair, 16)));
    key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return key;
  }
  const counts = day => db.prepare('SELECT (SELECT COUNT(*) FROM visitors) AS total, (SELECT COUNT(*) FROM daily_visitors WHERE day = ?) AS today').bind(day);
  const shape = (row, day) => ({ total: Number(row.total), today: Number(row.today), date: day, timezone: TIMEZONE });
  return {
    async stats(day) { return shape(await counts(day).first(), day); },
    async record(day, visitorId) {
      const hash = hex(await crypto.subtle.sign('HMAC', await hmacKey(), new TextEncoder().encode(visitorId.toLowerCase())));
      const results = await db.batch([
        db.prepare('INSERT OR IGNORE INTO visitors (visitor_hash) VALUES (?)').bind(hash),
        db.prepare('INSERT OR IGNORE INTO daily_visitors (day, visitor_hash) VALUES (?, ?)').bind(day, hash),
        counts(day),
      ]);
      return shape(results[2].results[0], day);
    },
  };
}

// 본문을 다 받기 전에 거른다: Content-Length가 크면 바로, 없거나 속였으면 스트림을 BODY_LIMIT까지만 읽고 끊는다.
// 한도를 넘으면 null.
async function readLimitedText(request) {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && !(Number(declared) <= BODY_LIMIT)) return null;
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > BODY_LIMIT) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

// 한 Worker 인스턴스 안에서만 세는 느슨한 제한. 정확한 차단은 Cloudflare 쪽 규칙이 맡는다.
function createRateLimiter({ limit, windowMs, clock }) {
  const buckets = new Map();
  return address => {
    const now = clock();
    for (const [name, bucket] of buckets) if (now >= bucket.until) buckets.delete(name);
    let bucket = buckets.get(address);
    if (!bucket) {
      // 기록이 가득 차면 가장 오래된 주소를 지운다. 가득 찼다고 새 주소를 모두 거절하면 진짜 방문도 안 세진다(보안 점검 L3).
      if (buckets.size >= 10000) buckets.delete(buckets.keys().next().value);
      bucket = { until: now + windowMs, used: 0 };
      buckets.set(address, bucket);
    }
    return ++bucket.used <= limit;
  };
}

// postLimiter: Cloudflare Workers Rate Limiting 바인딩(있으면 POST만 주소별로 더 엄격하게, 모든 인스턴스 공통).
export function createVisitorApi({ store, allowedOrigins, clock = Date.now, rateLimit = 120, rateWindowMs = 60000, postLimiter = null }) {
  const allowed = new Set(allowedOrigins.map(value => new URL(value).origin));
  const accept = createRateLimiter({ limit: rateLimit, windowMs: rateWindowMs, clock });
  return async function handle(request, { clientIp = 'unknown' } = {}) {
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' });
    const reply = (status, value) => new Response(value === undefined ? null : JSON.stringify(value), { status, headers });
    try {
      if (new URL(request.url).pathname !== ENDPOINT) return reply(404, { error: 'not_found' });
      const origin = request.headers.get('Origin');
      if (origin && !allowed.has(origin)) return reply(403, { error: 'origin_rejected' });
      if (origin) headers.set('Access-Control-Allow-Origin', origin);
      if (request.method === 'OPTIONS') {
        const method = request.headers.get('Access-Control-Request-Method');
        const asked = (request.headers.get('Access-Control-Request-Headers') || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
        if (!origin || !['POST', 'GET'].includes(method) || asked.some(value => value !== 'content-type')) return reply(403, { error: 'preflight_rejected' });
        headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        headers.set('Access-Control-Allow-Headers', 'Content-Type');
        headers.set('Access-Control-Max-Age', '600');
        return reply(204);
      }
      if (!['GET', 'POST'].includes(request.method)) {
        headers.set('Allow', 'GET, POST, OPTIONS');
        return reply(405, { error: 'method_rejected' });
      }
      if (request.method === 'POST' && !origin) return reply(403, { error: 'origin_required' });
      if (!accept(clientIp) || request.method === 'POST' && postLimiter && !(await postLimiter.limit({ key: clientIp })).success) {
        headers.set('Retry-After', String(Math.ceil(rateWindowMs / 1000)));
        return reply(429, { error: 'rate_limited' });
      }
      const day = kstDate(clock());
      if (request.method === 'GET') return reply(200, await store.stats(day));
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') || '')) return reply(415, { error: 'json_required' });
      const text = await readLimitedText(request);
      if (text === null) return reply(413, { error: 'body_too_large' });
      let body;
      try { body = JSON.parse(text); } catch { return reply(400, { error: 'invalid_json' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.visitorId !== 'string' || !UUID.test(body.visitorId)) return reply(400, { error: 'invalid_visitor_id' });
      const agent = request.headers.get('User-Agent') || '';
      const bot = !agent || BOTS.test(agent) || /headless/i.test(request.headers.get('Sec-CH-UA') || '')
        || request.headers.get('Sec-Purpose') === 'prefetch' || request.headers.get('Purpose') === 'prefetch';
      return reply(200, bot ? await store.stats(day) : await store.record(day, body.visitorId));
    } catch {
      return reply(503, { error: 'stats_unavailable' });
    }
  };
}
