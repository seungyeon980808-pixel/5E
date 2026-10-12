'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHmac, randomBytes } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ENDPOINT = '/api/visitor-stats';
const TIMEZONE = 'Asia/Seoul';
const PRODUCTION_ORIGINS = ['https://www.5e.ai.kr', 'https://5e.ai.kr'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOTS = /bot\b|crawler|spider|slurp|headless|phantomjs|selenium|playwright|puppeteer|lighthouse|curl|wget|python|\bnode\b|undici|postman|facebookexternalhit|preview|axios/i;

function assertRuntime() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major !== 24 || minor < 21) throw new Error('Visitor stats requires Node.js >=24.21.0 <25.');
}

function defaultDataDir() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', '5E', 'visitor-stats');
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), '5E', 'visitor-stats');
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), '5e', 'visitor-stats');
}

// Resolve existing ancestors as well, so a symlink cannot put the database in the site.
function canonicalPath(value) {
  let parent = path.resolve(value);
  const missing = [];
  while (!fs.existsSync(parent)) {
    missing.unshift(path.basename(parent));
    parent = path.dirname(parent);
  }
  return path.join(fs.realpathSync(parent), ...missing);
}

function isWithin(target, root) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function kstDate(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) throw new Error('Invalid visitor stats clock.');
  return new Date(time + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function createVisitorStatsStore({ dataDir = defaultDataDir(), webRoot = path.join(__dirname, '..'), clock = Date.now } = {}) {
  assertRuntime();
  if (!path.isAbsolute(dataDir)) throw new Error('Visitor stats data directory must be an absolute path.');
  const directory = canonicalPath(dataDir);
  if (isWithin(directory, canonicalPath(webRoot))) throw new Error('Visitor stats data directory must be outside the web root.');
  if (directory === path.parse(directory).root || directory === canonicalPath(os.homedir())) throw new Error('Use a dedicated visitor stats data directory.');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const databasePath = path.join(directory, 'visitors.sqlite');
  if (fs.existsSync(databasePath)) {
    const stat = fs.lstatSync(databasePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Visitor stats database must be a regular file.');
  } else {
    fs.closeSync(fs.openSync(databasePath, 'wx', 0o600));
  }
  fs.chmodSync(databasePath, 0o600);
  const db = new DatabaseSync(databasePath);
  let secret;
  try {
    db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) throw new Error('Unsupported visitor stats database version.');
    db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS visitors (visitor_hash TEXT PRIMARY KEY) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS daily_visitors (
        day TEXT NOT NULL, visitor_hash TEXT NOT NULL,
        PRIMARY KEY (day, visitor_hash)
      ) WITHOUT ROWID;
      PRAGMA user_version = 1;
      BEGIN IMMEDIATE;
    `);
    db.prepare('INSERT OR IGNORE INTO metadata (key, value) VALUES (?, ?)').run('hash_secret', randomBytes(32).toString('hex'));
    secret = db.prepare('SELECT value FROM metadata WHERE key = ?').get('hash_secret').value;
    if (!/^[0-9a-f]{64}$/.test(secret)) throw new Error('Invalid visitor stats database secret.');
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    db.close();
    throw error;
  }
  const insertVisitor = db.prepare('INSERT OR IGNORE INTO visitors (visitor_hash) VALUES (?)');
  const insertDaily = db.prepare('INSERT OR IGNORE INTO daily_visitors (day, visitor_hash) VALUES (?, ?)');
  // Both numbers come from one SQLite read snapshot, including across processes.
  const counts = db.prepare('SELECT (SELECT COUNT(*) FROM visitors) AS total, (SELECT COUNT(*) FROM daily_visitors WHERE day = ?) AS today');
  let closed = false;
  function snapshot(day) {
    if (closed) throw new Error('Visitor stats store is closed.');
    return { ...counts.get(day), date: day, timezone: TIMEZONE };
  }
  return {
    databasePath,
    stats() { return snapshot(kstDate(clock())); },
    record(visitorId) {
      if (typeof visitorId !== 'string' || !UUID.test(visitorId)) throw new TypeError('visitorId must be a UUID v4.');
      if (closed) throw new Error('Visitor stats store is closed.');
      const day = kstDate(clock());
      const hash = createHmac('sha256', Buffer.from(secret, 'hex')).update(visitorId.toLowerCase()).digest('hex');
      db.exec('BEGIN IMMEDIATE');
      try {
        insertVisitor.run(hash);
        insertDaily.run(day, hash);
        const result = snapshot(day);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch {}
        throw error;
      }
    },
    close() { if (!closed) { closed = true; db.close(); } },
  };
}

function integer(value, fallback, name, min, max) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`Invalid ${name}.`);
  return number;
}

function localOrigin(origin) {
  const host = new URL(origin).hostname.toLowerCase();
  return host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host) || ['[::1]', '0.0.0.0', '[::]'].includes(host);
}

function originAllowlist(origins, allowLocal) {
  const allowed = new Set();
  for (const value of origins) {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Allowed origins must be exact HTTP(S) origins.');
    if (localOrigin(url.origin) && !allowLocal) throw new Error('Local origins require the explicit VISITOR_STATS_ALLOW_LOCAL=1 test override.');
    allowed.add(url.origin);
  }
  if (!allowed.size) throw new Error('Visitor stats requires at least one allowed origin.');
  return allowed;
}

class RequestError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}

function readBody(req, limit, timeoutMs) {
  const length = req.headers['content-length'];
  if (length !== undefined && Number(length) > limit) return Promise.reject(new RequestError(413, 'body_too_large'));
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const timer = setTimeout(() => finish(new RequestError(408, 'request_timeout')), timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('aborted', onAborted);
      req.removeListener('error', onError);
    }
    function finish(error, value) { cleanup(); if (error) reject(error); else resolve(value); }
    function onData(chunk) {
      size += chunk.length;
      if (size > limit) finish(new RequestError(413, 'body_too_large'));
      else chunks.push(chunk);
    }
    function onEnd() {
      try { finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { finish(new RequestError(400, 'invalid_json')); }
    }
    function onAborted() { finish(new RequestError(400, 'request_aborted')); }
    function onError() { finish(new RequestError(400, 'request_failed')); }
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('aborted', onAborted);
    req.on('error', onError);
  });
}

function createRateLimiter({ limit, windowMs, clock }) {
  const salt = randomBytes(32);
  const buckets = new Map();
  let nextSweep = 0;
  return function accept(address) {
    const now = new Date(clock()).getTime();
    if (!Number.isFinite(now)) throw new Error('Invalid visitor stats clock.');
    if (now >= nextSweep) {
      for (const [key, bucket] of buckets) if (now >= bucket.until) buckets.delete(key);
      nextSweep = now + windowMs;
    }
    const key = createHmac('sha256', salt).update(address || 'unknown').digest('hex');
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.until) {
      if (buckets.size >= 10000 && !bucket) return false;
      bucket = { until: now + windowMs, used: 0 };
      buckets.set(key, bucket);
    }
    return ++bucket.used <= limit;
  };
}

async function startVisitorStatsServer(options = {}) {
  const env = options.env || process.env;
  const allowLocal = options.allowLocal ?? env.VISITOR_STATS_ALLOW_LOCAL === '1';
  const origins = options.allowedOrigins ?? (env.VISITOR_STATS_ALLOWED_ORIGINS ? env.VISITOR_STATS_ALLOWED_ORIGINS.split(',').map(value => value.trim()) : PRODUCTION_ORIGINS);
  const allowed = originAllowlist(origins, allowLocal);
  const host = options.host ?? env.VISITOR_STATS_HOST ?? '127.0.0.1';
  const port = integer(options.port ?? env.PORT, 8796, 'PORT', 0, 65535);
  const bodyLimit = integer(options.bodyLimit ?? env.VISITOR_STATS_BODY_LIMIT, 1024, 'VISITOR_STATS_BODY_LIMIT', 64, 65536);
  const rateLimit = integer(options.rateLimit ?? env.VISITOR_STATS_RATE_LIMIT, 120, 'VISITOR_STATS_RATE_LIMIT', 1, 100000);
  const rateWindowMs = integer(options.rateWindowMs ?? env.VISITOR_STATS_RATE_WINDOW_MS, 60000, 'VISITOR_STATS_RATE_WINDOW_MS', 1, 3600000);
  const clock = options.clock || Date.now;
  const store = createVisitorStatsStore({ dataDir: options.dataDir ?? env.VISITOR_STATS_DATA_DIR, webRoot: options.webRoot ?? env.VISITOR_STATS_WEB_ROOT, clock });
  const accept = createRateLimiter({ limit: rateLimit, windowMs: rateWindowMs, clock });
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    const reply = (status, value, close = false) => {
      if (res.destroyed || res.writableEnded) return;
      if (close) { res.setHeader('Connection', 'close'); req.resume(); }
      res.writeHead(status);
      res.end(value === undefined ? undefined : JSON.stringify(value));
    };
    try {
      if (new URL(req.url, 'http://visitor-stats.invalid').pathname !== ENDPOINT) return reply(404, { error: 'not_found' }, true);
      const origin = req.headers.origin;
      if (origin && !allowed.has(origin)) return reply(403, { error: 'origin_rejected' }, true);
      if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
      if (req.method === 'OPTIONS') {
        const requestedMethod = req.headers['access-control-request-method'];
        const requestedHeaders = (req.headers['access-control-request-headers'] || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
        if (!origin || !['POST', 'GET'].includes(requestedMethod) || requestedHeaders.some(value => value !== 'content-type')) return reply(403, { error: 'preflight_rejected' }, true);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Max-Age', '600');
        return reply(204);
      }
      if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST, OPTIONS');
        return reply(405, { error: 'method_rejected' }, true);
      }
      if (req.method === 'POST' && !origin) return reply(403, { error: 'origin_required' }, true);
      // Do not trust forwarded addresses. The TLS proxy should also limit per client.
      if (!accept(req.socket.remoteAddress)) {
        res.setHeader('Retry-After', String(Math.ceil(rateWindowMs / 1000)));
        return reply(429, { error: 'rate_limited' }, true);
      }
      if (req.method === 'GET') return reply(200, store.stats());
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '') || !['identity', undefined].includes(req.headers['content-encoding'])) return reply(415, { error: 'json_required' }, true);
      const body = await readBody(req, bodyLimit, 5000);
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.visitorId !== 'string' || !UUID.test(body.visitorId)) return reply(400, { error: 'invalid_visitor_id' });
      const agent = req.headers['user-agent'] || '';
      const bot = !agent || BOTS.test(agent) || /headless/i.test(req.headers['sec-ch-ua'] || '') || req.headers['sec-purpose'] === 'prefetch' || req.headers.purpose === 'prefetch';
      return reply(200, bot ? store.stats() : store.record(body.visitorId));
    } catch (error) {
      if (!(error instanceof RequestError)) {
        try { options.onError?.(error); } catch {}
      }
      return reply(error instanceof RequestError ? error.status : 503, { error: error instanceof RequestError ? error.message : 'stats_unavailable' }, true);
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.timeout = 10000;
  server.keepAliveTimeout = 5000;
  server.on('close', () => store.close());
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.removeListener('error', reject); resolve(); });
    });
  } catch (error) { store.close(); throw error; }
  const address = server.address();
  const urlHost = address.address.includes(':') ? `[${address.address}]` : address.address;
  return {
    server,
    store,
    origin: `http://${urlHost}:${address.port}`,
    close() { return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}

module.exports = { ENDPOINT, TIMEZONE, PRODUCTION_ORIGINS, kstDate, defaultDataDir, createVisitorStatsStore, startVisitorStatsServer };

if (require.main === module) {
  startVisitorStatsServer().then(instance => {
    console.log(`5E visitor stats: ${instance.origin}${ENDPOINT}`);
    let closing = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
      if (closing) return;
      closing = true;
      instance.close().then(() => { process.exitCode = 0; }).catch(() => { process.exitCode = 1; });
    });
  }).catch(error => {
    console.error(`Visitor stats failed to start: ${error.message}`);
    process.exitCode = 1;
  });
}
