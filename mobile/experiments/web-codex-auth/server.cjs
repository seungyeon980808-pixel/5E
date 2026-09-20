const http = require('node:http');
const { randomBytes, createHash } = require('node:crypto');
const { mkdtempSync, chmodSync, readFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Runtime } = require('./runtime.cjs');
const { RequestError } = require('./generation.cjs');
const { Session } = require('./session.cjs');
const { GlobalGenerationScheduler } = require('./global-generation-scheduler.cjs');
const bridgeRoutes = new Set(['status', 'models', 'account', 'send', 'events', 'interrupt'].map(action => '/api/bridge-' + action));
function createServer({ runtimeFactory = dir => new Runtime(dir), sessionOptions, maxSessions = 8, generationConcurrency = 10, editorNavigation = true } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), '5e-auth-'));
  chmodSync(root, 0o700);
  const sessions = new Map();
  const webSessions = new Map();
  const loginTickets = new Map();
  const digest = token => createHash("sha256").update(token).digest("hex");
  const generationScheduler = new GlobalGenerationScheduler({ maxRunning: generationConcurrency });
  const assets = new Map([['/', ['index.html', 'text/html']], ['/client.js', ['client.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']]]);
  const dispose = (id, entry) => {
    sessions.delete(id);
    for (const [ticket, item] of loginTickets) if (item.id === id) loginTickets.delete(ticket);
    if (entry.webToken) webSessions.delete(digest(entry.webToken));
    entry.session.close();
    rmSync(entry.directory, { recursive: true, force: true });
  };
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
    const routes = new Set(['/api/web-login-start', '/api/web-login-status', '/api/web-login-cancel', '/api/web-session', '/api/session', '/api/status', '/api/login', '/api/cancel', '/api/logout', '/api/generate', '/api/generation', '/api/generation-cancel']);
    if (!routes.has(req.url) && !bridgeRoutes.has(req.url)) return json(404, { error: 'Unknown endpoint' });
    const cookieName = `fivee_auth_${server.address().port}`;
    let id = new RegExp(`(?:^|;\\s*)${cookieName}=([a-f0-9]{64})(?:;|$)`).exec(req.headers.cookie || '')?.[1];
    const bearer = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
    const loginRoute = ['/api/web-login-status', '/api/web-login-cancel'].includes(req.url);
    const ticket = bearer && loginTickets.get(digest(bearer));
    if (loginRoute) {
      if (!ticket || ticket.expires < Date.now()) {
        if (bearer) loginTickets.delete(digest(bearer));
        return json(401, { error: 'Login expired. Please try again.' });
      }
      id = ticket.id;
    } else if (req.headers.authorization) {
      if (!bearer || !bridgeRoutes.has(req.url)) return json(401, { error: 'Invalid web session' });
      id = webSessions.get(digest(bearer));
    }
    let entry = sessions.get(id);
    if (req.headers.authorization && (!entry || Date.now() - entry.touched > 1800000)) return json(401, { error: 'Web session expired. Sign in again.' });
    try {
      if (entry?.session.runtime.dead && req.url === '/api/session') {
        dispose(id, entry);
        entry = undefined;
      }
      if (!entry && ['/api/session', '/api/web-login-start'].includes(req.url)) {
        if (sessions.size >= maxSessions) return json(429, { error: `현재 ${maxSessions}명이 연결되어 있습니다. 잠시 후 다시 시도해 주세요.` });
        const newId = randomBytes(32).toString('hex');
        const directory = mkdtempSync(path.join(root, 'session-'));
        const session = new Session(runtimeFactory(directory), {
          ...sessionOptions,
          generationScheduler,
          schedulerOwner: newId,
        });
        entry = { session, directory, touched: Date.now(), ...(req.url === '/api/web-login-start' ? { loginExpires: Date.now() + 600000 } : {}) };
        sessions.set(newId, entry);
        try { await session.runtime.init(); } catch (error) { sessions.delete(newId); session.close(); rmSync(directory, { recursive: true, force: true }); entry = undefined; throw error; }
        id = newId;
      }
      if (!entry && req.url === '/api/bridge-status') { req.resume(); return json(200, { login: { loggedIn: false }, server: false }); }
      if (!entry) return json(401, { error: 'Session expired. Reload the page.' });
      entry.touched = Date.now();
      res.setHeader('Set-Cookie', `${cookieName}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800`);
      if (req.url === '/api/web-login-start') {
        req.resume();
        const result = await entry.session.run(() => entry.session.start());
        for (const [key, item] of loginTickets) if (item.id === id) loginTickets.delete(key);
        const ticket = randomBytes(32).toString('hex');
        loginTickets.set(digest(ticket), { id, expires: Date.now() + 600000 });
        return json(200, { ...result, ticket });
      }
      if (loginRoute) {
        req.resume();
        if (req.url === '/api/web-login-cancel') {
          loginTickets.delete(digest(bearer));
          const result = await entry.session.run(() => entry.session.cancel());
          if (entry.loginExpires && !entry.webToken) dispose(id, entry);
          return json(200, result);
        }
        const result = await entry.session.run(() => entry.session.status());
        if (!result.signedIn) return json(200, { state: result.state, signedIn: false });
        if (!entry.webToken) {
          entry.webToken = randomBytes(32).toString('hex');
          webSessions.set(digest(entry.webToken), id);
        }
        return json(200, { signedIn: true, token: entry.webToken });
      }
      if (req.url === '/api/web-session') {
        req.resume();
        if (!(await entry.session.run(() => entry.session.status())).signedIn) throw new RequestError(401, 'Sign in first');
        if (!entry.webToken) {
          entry.webToken = randomBytes(32).toString('hex');
          webSessions.set(digest(entry.webToken), id);
        }
        return json(200, { token: entry.webToken });
      }
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
        const result = await entry.session.run(() => req.url === '/api/generate' ? entry.session.generate(body) : req.url === '/api/generation' ? entry.session.snapshotGeneration(body.jobId) : entry.session.cancelGeneration(body.jobId));
        return json(req.url === '/api/generate' ? 202 : 200, result);
      }
      const action = { '/api/session': 'status', '/api/status': 'status', '/api/login': 'start', '/api/cancel': 'cancel', '/api/logout': 'logout' }[req.url];
      const result = await entry.session.run(() => entry.session[action]());
      if (req.url === '/api/logout') {
        dispose(id, entry);
        res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
      }
      json(200, result);
    } catch (error) { if (req.url === '/api/web-login-start' && entry?.loginExpires && !entry.webToken) dispose(id, entry); if (error instanceof RequestError) return json(error.status, { error: error.message }); json(503, { error: '인증 연결에 실패했습니다. 새로고침 후 다시 시도해 주세요.' }); }
  });
  const cleanup = setInterval(() => {
    for (const [id, entry] of sessions) if (Date.now() - entry.touched > 1800000 || (entry.loginExpires && !entry.webToken && Date.now() > entry.loginExpires)) {
      dispose(id, entry);
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
