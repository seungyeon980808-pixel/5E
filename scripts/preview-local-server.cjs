const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8795);
const origin = `http://127.0.0.1:${port}`;
const types = { '.html':'text/html', '.mjs':'text/javascript', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.woff2':'font/woff2', '.pdf':'application/pdf' };
const api = /^\/api\/(web-login-(start|status|cancel)|bridge-(status|models|account|send|events|interrupt))$/;
const server = http.createServer((req, res) => {
  const fail = (status, message) => { res.writeHead(status, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ error:message })); };
  if (req.headers.host !== `127.0.0.1:${port}`) return fail(403, 'Host rejected');
  res.setHeader('Cache-Control', 'no-store');
  const pathname = new URL(req.url, origin).pathname;
  if (pathname.startsWith('/api/')) {
    if (!api.test(pathname) || req.method !== 'POST') return fail(404, 'Unknown API');
    if (req.headers.origin !== origin || req.headers['x-5e-request'] !== '1') return fail(403, 'Origin rejected');
    const headers = { Origin:'https://www.5e.ai.kr', 'Content-Type':'application/json', 'X-5E-Request':'1' };
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;
    const upstream = https.request(`https://five-e-ai-runtime-probe.onrender.com${pathname}`, { method:'POST', headers }, response => {
      res.writeHead(response.statusCode, { 'Content-Type':response.headers['content-type'] || 'application/json' });
      response.pipe(res);
    });
    upstream.setTimeout(120000, () => upstream.destroy(new Error('Authentication server timeout')));
    upstream.on('error', () => { if (!res.headersSent) fail(502, '인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'); else res.destroy(); });
    req.pipe(upstream);
    return;
  }
  if (!['GET','HEAD'].includes(req.method)) return fail(405, 'Method rejected');
  let file;
  try { file = path.resolve(root, `.${decodeURIComponent(pathname)}`); } catch { return fail(400, 'Invalid path'); }
  if (!file.startsWith(root + path.sep) && file !== root) return fail(403, 'Path rejected');
  fs.stat(file, (error, stat) => {
    if (error) return fail(404, 'Not found');
    if (stat.isDirectory()) file = path.join(file, 'index.html');
    const stream = fs.createReadStream(file);
    stream.on('error', () => { if (!res.headersSent) fail(404, 'Not found'); else res.destroy(); });
    stream.on('open', () => {
      res.writeHead(200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream' });
      if (req.method === 'HEAD') { stream.destroy(); res.end(); } else stream.pipe(res);
    });
  });
});
server.listen(port, '127.0.0.1', () => console.log(`Local preview: ${origin}/preview/`));
