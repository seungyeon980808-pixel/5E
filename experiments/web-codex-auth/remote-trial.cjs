'use strict';
const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const { createServer } = require('./server.cjs');
const { createGateway } = require('./editor-gateway.cjs');

function sameSecret(value, secret) {
  const candidate = Buffer.from(value || '');
  const expected = Buffer.from(secret);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
function createTrialProxy({ gatewayPort, publicOrigin, accessKey, webEditorOrigin = '' }) {
  const external = new URL(publicOrigin);
  if (external.protocol !== 'https:' || external.origin !== publicOrigin) throw new Error('An exact HTTPS origin is required');
  if (!/^[a-f0-9]{64}$/.test(accessKey)) throw new Error('A 32-byte hex trial access key is required');
  const internal = `http://127.0.0.1:${gatewayPort}`;
  return http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reject = (status, message) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(message); };
    if (req.headers.host !== external.host) return reject(403, 'Origin rejected');
    const direct = webEditorOrigin === 'https://www.5e.ai.kr' && req.headers.origin === webEditorOrigin && /^\/api\/bridge-(status|models|account|send|events|interrupt)$/.test(req.url);
    if (direct) {
      res.setHeader('Access-Control-Allow-Origin', webEditorOrigin);
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        const requested = (req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
        if (req.headers['access-control-request-method'] !== 'POST' || requested.some(value => !['authorization', 'content-type', 'x-5e-request'].includes(value))) return reject(403, 'Request rejected');
        res.setHeader('Access-Control-Allow-Methods', 'POST');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-5E-Request');
        res.writeHead(204); return res.end();
      }
      if (req.method !== 'POST' || !/^Bearer [a-f0-9]{64}$/.test(req.headers.authorization || '') || req.headers['x-5e-request'] !== '1') return reject(401, 'Web session required');
    }
    if (req.headers.host !== external.host || (req.headers.origin && req.headers.origin !== publicOrigin && !direct)) return reject(403, 'Origin rejected');
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ready', mode: 'private-device-code-trial', modelCallsFromHealthCheck: 0 }));
    }
    if (req.headers['sec-fetch-site'] === 'cross-site' && req.method !== 'GET' && !direct) return reject(403, 'Origin rejected');
    const invitation = /^\/trial\/([a-f0-9]{64})$/.exec(req.url);
    if (req.method === 'GET' && invitation && sameSecret(invitation[1], accessKey)) {
      res.setHeader('Set-Cookie', `__Host-fivee_trial=${accessKey}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=21600`);
      res.writeHead(303, { Location: '/editor/' }); return res.end();
    }
    const key = /(?:^|;\s*)__Host-fivee_trial=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    const pathname = new URL(req.url, publicOrigin).pathname;
    const webConnection = webEditorOrigin === 'https://www.5e.ai.kr' && (['/web-connect', '/web-connect.js', '/client.js', '/style.css'].includes(pathname) || pathname.startsWith('/api/'));
    if (!webConnection && !sameSecret(key, accessKey)) return reject(401, '비공개 실사용 시험입니다. 전달받은 시험 초대 링크로 접속해 주세요.');
    if (Number(req.headers['content-length']) > 12000000) return reject(413, '이미지가 너무 큽니다.');
    const headers = { ...req.headers, host: `127.0.0.1:${gatewayPort}` };
    if (!direct) delete headers.authorization;
    delete headers['x-forwarded-host'];
    delete headers['x-forwarded-proto'];
    if (req.headers.origin) headers.origin = internal;
    headers['sec-fetch-site'] = 'same-origin';
    headers.cookie = (direct ? '' : req.headers.cookie || '').split(';').filter(part => part.trim().startsWith('fivee_auth_')).join(';');
    const started = performance.now();
    const upstream = http.request({ hostname: '127.0.0.1', port: gatewayPort, path: req.url, method: req.method, headers }, response => {
      const outgoing = { ...response.headers };
      if (direct) delete outgoing['set-cookie'];
      if (outgoing['set-cookie']) outgoing['set-cookie'] = outgoing['set-cookie'].map(cookie => cookie + '; Secure');
      outgoing['server-timing'] = `gateway;dur=${(performance.now() - started).toFixed(1)}`;
      res.writeHead(response.statusCode, outgoing);
      response.pipe(res);
    });
    upstream.setTimeout(40000, () => upstream.destroy());
    upstream.on('error', () => { if (!res.headersSent) reject(503, '연결이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'); else res.destroy(); });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
    req.pipe(upstream);
  });
}
function createTrialAuth({
  maxSessions = process.env.TRIAL_MAX_SESSIONS ?? '5',
  maxRunningGenerations = process.env.TRIAL_MAX_RUNNING_GENERATIONS ?? '5',
  runtimeFactory,
} = {}) {
  const limit = Number(maxSessions);
  const generationLimit = Number(maxRunningGenerations);
  if (!/^[1-9][0-9]*$/.test(String(maxSessions)) || !Number.isSafeInteger(limit)) throw new Error('TRIAL_MAX_SESSIONS must be a positive integer');
  if (!/^[1-9][0-9]*$/.test(String(maxRunningGenerations)) || !Number.isSafeInteger(generationLimit)) throw new Error('TRIAL_MAX_RUNNING_GENERATIONS must be a positive integer');
  return createServer({ runtimeFactory, maxSessions: limit, generationConcurrency: generationLimit,
    sessionOptions: { loginMode: 'chatgptDeviceCode', generationTimeout: 600000 } });
}
async function start() {
  const accessKey = process.env.TRIAL_ACCESS_KEY || '';
  const publicOrigin = process.env.RENDER_EXTERNAL_URL || process.env.TRIAL_PUBLIC_ORIGIN;
  if (!publicOrigin || !/^[a-f0-9]{64}$/.test(accessKey)) throw new Error('Configure public origin and TRIAL_ACCESS_KEY');
  const auth = createTrialAuth();
  await new Promise(resolve => auth.listen(0, '127.0.0.1', resolve));
  const gateway = createGateway({ authPort: auth.address().port, allowAnonymousEditor: true });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  const proxy = createTrialProxy({ gatewayPort: gateway.address().port, publicOrigin, accessKey, webEditorOrigin: process.env.FIVE_E_WEB_EDITOR_ORIGIN || '' });
  await new Promise(resolve => proxy.listen(Number(process.env.PORT || 10000), '0.0.0.0', resolve));
  console.log(`5E private trial ready; session limit ${process.env.TRIAL_MAX_SESSIONS ?? '5'}; generation limit ${process.env.TRIAL_MAX_RUNNING_GENERATIONS ?? '5'}; device login; no API fallback`);
  const stop = () => {
    proxy.closeAllConnections(); gateway.closeAllConnections(); auth.closeAllConnections();
    proxy.close(); gateway.close(); auth.close();
  };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  return { proxy, gateway, auth };
}
if (require.main === module) {
  if (process.argv.includes('--help')) console.log('TRIAL_ACCESS_KEY=<32-byte hex> TRIAL_PUBLIC_ORIGIN=https://host PORT=10000 TRIAL_MAX_SESSIONS=5 TRIAL_MAX_RUNNING_GENERATIONS=5 node remote-trial.cjs; Render supplies RENDER_EXTERNAL_URL. Session admission and global generation capacity default to 5.');
  else start().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { createTrialProxy, createTrialAuth, start };
