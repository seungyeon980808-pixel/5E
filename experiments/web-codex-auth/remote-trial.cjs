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
function createTrialProxy({ gatewayPort, publicOrigin, accessKey }) {
  const external = new URL(publicOrigin);
  if (external.protocol !== 'https:' || external.origin !== publicOrigin) throw new Error('An exact HTTPS origin is required');
  if (!/^[a-f0-9]{64}$/.test(accessKey)) throw new Error('A 32-byte hex trial access key is required');
  const internal = `http://127.0.0.1:${gatewayPort}`;
  return http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reject = (status, message) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(message); };
    if (req.headers.host !== external.host || (req.headers.origin && req.headers.origin !== publicOrigin)) return reject(403, 'Origin rejected');
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ready', mode: 'private-device-code-trial', modelCallsFromHealthCheck: 0 }));
    }
    if (req.headers['sec-fetch-site'] === 'cross-site' && req.method !== 'GET') return reject(403, 'Origin rejected');
    const invitation = /^\/trial\/([a-f0-9]{64})$/.exec(req.url);
    if (req.method === 'GET' && invitation && sameSecret(invitation[1], accessKey)) {
      res.setHeader('Set-Cookie', `__Host-fivee_trial=${accessKey}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=21600`);
      res.writeHead(303, { Location: '/editor/' }); return res.end();
    }
    const key = /(?:^|;\s*)__Host-fivee_trial=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    if (!sameSecret(key, accessKey)) return reject(401, '비공개 실사용 시험입니다. 전달받은 시험 초대 링크로 접속해 주세요.');
    if (Number(req.headers['content-length']) > 12000000) return reject(413, '이미지가 너무 큽니다.');
    const headers = { ...req.headers, host: `127.0.0.1:${gatewayPort}` };
    delete headers.authorization;
    delete headers['x-forwarded-host'];
    delete headers['x-forwarded-proto'];
    if (req.headers.origin) headers.origin = internal;
    headers['sec-fetch-site'] = 'same-origin';
    headers.cookie = (req.headers.cookie || '').split(';').filter(part => part.trim().startsWith('fivee_auth_')).join(';');
    const started = performance.now();
    const upstream = http.request({ hostname: '127.0.0.1', port: gatewayPort, path: req.url, method: req.method, headers }, response => {
      const outgoing = { ...response.headers };
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
async function start() {
  const accessKey = process.env.TRIAL_ACCESS_KEY || '';
  const publicOrigin = process.env.RENDER_EXTERNAL_URL || process.env.TRIAL_PUBLIC_ORIGIN;
  if (!publicOrigin || !/^[a-f0-9]{64}$/.test(accessKey)) throw new Error('Configure public origin and TRIAL_ACCESS_KEY');
  const auth = createServer({ maxSessions: 1, sessionOptions: { loginMode: 'chatgptDeviceCode', generationTimeout: 600000 } });
  await new Promise(resolve => auth.listen(0, '127.0.0.1', resolve));
  const gateway = createGateway({ authPort: auth.address().port, allowAnonymousEditor: true });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  const proxy = createTrialProxy({ gatewayPort: gateway.address().port, publicOrigin, accessKey });
  await new Promise(resolve => proxy.listen(Number(process.env.PORT || 10000), '0.0.0.0', resolve));
  console.log('5E private trial ready; one session; device login; no API fallback');
  const stop = () => {
    proxy.closeAllConnections(); gateway.closeAllConnections(); auth.closeAllConnections();
    proxy.close(); gateway.close(); auth.close();
  };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  return { proxy, gateway, auth };
}
if (require.main === module) {
  if (process.argv.includes('--help')) console.log('TRIAL_ACCESS_KEY=<32-byte hex> TRIAL_PUBLIC_ORIGIN=https://host PORT=10000 node remote-trial.cjs; Render supplies RENDER_EXTERNAL_URL. Private single-session trial.');
  else start().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { createTrialProxy, start };
