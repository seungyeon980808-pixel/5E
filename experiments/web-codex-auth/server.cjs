const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { mkdtempSync, chmodSync, readFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Runtime } = require('./runtime.cjs');
const { RequestError } = require('./generation.cjs');
const { Session } = require('./session.cjs');
const bridgeRoutes = new Set(['status', 'models', 'account', 'send', 'events', 'interrupt'].map(action => '/api/bridge-' + action));
function createServer({ runtimeFactory = dir => new Runtime(dir), sessionOptions, maxSessions = 8, editorNavigation = true } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), '5e-auth-'));
  chmodSync(root, 0o700);
  const sessions = new Map();
  const assets = new Map([['/', ['index.html', 'text/html']], ['/client.js', ['client.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']]]);
  const server = http.createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return json(403, { error: 'Origin rejected' });
    if (req.method === 'GET' && assets.has(req.url)) {
      const [file, type] = assets.get(req.url);
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
      const body = readFileSync(path.join(__dirname, file));
      return res.end(file === 'index.html' && !editorNavigation ? body.toString('utf8').replace(/ data-editor-url="[^"]*"/, '') : body);
    }
    if (req.method !== 'POST' || req.headers.origin !== origin || req.headers['x-5e-request'] !== '1') return json(403, { error: 'Request rejected' });
    const routes = new Set(['/api/session', '/api/status', '/api/login', '/api/cancel', '/api/logout', '/api/generate', '/api/generation', '/api/generation-cancel']);
    if (!routes.has(req.url) && !bridgeRoutes.has(req.url)) return json(404, { error: 'Unknown endpoint' });
    const cookieName = `fivee_auth_${server.address().port}`;
    let id = new RegExp(`(?:^|;\\s*)${cookieName}=([a-f0-9]{64})(?:;|$)`).exec(req.headers.cookie || '')?.[1];
    let entry = sessions.get(id);
    try {
      if (entry?.session.runtime.dead && req.url === '/api/session') {
        sessions.delete(id);
        entry.session.close();
        rmSync(entry.directory, { recursive: true, force: true });
        entry = undefined;
      }
      if (!entry && req.url === '/api/session') {
        if (sessions.size >= maxSessions) return json(429, { error: 'Session limit reached' });
        const newId = randomBytes(32).toString('hex');
        const directory = mkdtempSync(path.join(root, 'session-'));
        const session = new Session(runtimeFactory(directory), sessionOptions);
        entry = { session, directory, touched: Date.now() };
        sessions.set(newId, entry);
        try { await session.runtime.init(); } catch (error) { sessions.delete(newId); session.close(); rmSync(directory, { recursive: true, force: true }); throw error; }
        id = newId;
      }
      if (!entry) return json(401, { error: 'Session expired. Reload the page.' });
      entry.touched = Date.now();
      res.setHeader('Set-Cookie', `${cookieName}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800`);
      if (bridgeRoutes.has(req.url) || ['/api/generate', '/api/generation', '/api/generation-cancel'].includes(req.url)) {
        if (req.url !== '/api/bridge-status' && !(await entry.session.run(() => entry.session.status())).signedIn) throw new RequestError(401, 'Sign in first');
        if (!req.headers['content-type']?.startsWith('application/json')) throw new RequestError(400, 'JSON required');
        const limit = 12_000_000;
        if (Number(req.headers['content-length']) > limit) { req.resume(); throw new RequestError(413, 'Request too large'); }
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size <= limit) chunks.push(chunk);
        }
        if (size > limit) throw new RequestError(413, 'Request too large');
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new RequestError(400, 'Invalid JSON'); }
        if (bridgeRoutes.has(req.url)) return json(200, await entry.session.run(() => entry.session.bridge.call(req.url.slice('/api/bridge-'.length), body)));
        if (req.url !== '/api/generate' && (!body || !(typeof body.jobId === 'string' || (req.url === '/api/generation' && body.jobId === null)) || Object.keys(body).some(key => key !== 'jobId'))) throw new RequestError(400, 'Invalid job request');
        const result = await entry.session.run(() => req.url === '/api/generate' ? entry.session.generate(body) : req.url === '/api/generation' ? entry.session.generation.snapshot(body.jobId) : entry.session.generation.cancel(body.jobId));
        return json(req.url === '/api/generate' ? 202 : 200, result);
      }
      const action = { '/api/session': 'status', '/api/status': 'status', '/api/login': 'start', '/api/cancel': 'cancel', '/api/logout': 'logout' }[req.url];
      const result = await entry.session.run(() => entry.session[action]());
      json(200, result);
    } catch (error) { if (error instanceof RequestError) return json(error.status, { error: error.message }); json(503, { error: '인증 연결에 실패했습니다. 새로고침 후 다시 시도해 주세요.' }); }
  });
  const cleanup = setInterval(() => {
    for (const [id, entry] of sessions) if (Date.now() - entry.touched > 1800000) {
      sessions.delete(id); entry.session.close(); rmSync(entry.directory, { recursive: true, force: true });
    }
  }, 60000);
  cleanup.unref();
  server.on('close', () => {
    clearInterval(cleanup);
    for (const entry of sessions.values()) entry.session.close();
    rmSync(root, { recursive: true, force: true });
  });
  return server;
}
if (require.main === module) {
  if (process.argv.includes('--help')) { console.log('node server.cjs [port] (loopback only; default 19383; AI only through explicit authenticated generation requests)'); }
  else {
    const port = Number(process.argv[2] || 19383);
    if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 19382) throw new Error('Choose a valid experiment port other than 19382');
    const server = createServer();
    server.listen(port, '127.0.0.1', () => console.log(`5E authentication experiment: http://127.0.0.1:${port}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
  }
}
module.exports = { createServer };
