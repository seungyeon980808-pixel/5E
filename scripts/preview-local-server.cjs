const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const runFile = promisify(execFile);
const root = path.resolve(process.env.FIVE_E_SITE_ROOT || path.join(__dirname, '..'));
const workspace = createHash('sha256').update(fs.realpathSync(root)).digest('hex');
const localBridge = process.env.LOCAL_CODEX_BINARY ? require('./local-codex-bridge.cjs').createLocalCodexBridge({binary:process.env.LOCAL_CODEX_BINARY}) : null;
const requestedPort = Number(process.env.PORT || 8795);
let port = requestedPort;
let origin = `http://127.0.0.1:${port}`;
const types = { '.html':'text/html', '.mjs':'text/javascript', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.woff2':'font/woff2', '.wasm':'application/wasm', '.pdf':'application/pdf' };
const api = /^\/api\/(web-login-(start|status|cancel)|bridge-(status|models|account|send|events|interrupt))$/;
async function previewRevision() {
  try {
    const read = async args => (await runFile('git', ['-C', root, ...args], { timeout:2000, maxBuffer:1024*1024 })).stdout.trim();
    const [commit, branch, status] = await Promise.all([
      read(['rev-parse', 'HEAD']), read(['rev-parse', '--abbrev-ref', 'HEAD']), read(['status', '--porcelain', '--untracked-files=normal']),
    ]);
    return { commit, branch, dirty:Boolean(status) };
  } catch { return null; }
}
function revisionBadge(html, revision) {
  if (!revision) return html;
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return html.replace(/<span\b([^>]*\bdata-change-summary\b[^>]*)>([^<]*)<\/span>/, (match, attributes, label) => {
    const detail = `브랜치: ${revision.branch} · 기준 커밋: ${revision.commit} · ${revision.dirty ? '미커밋 수정 포함' : '커밋과 동일한 소스'}`;
    const short = attributes.match(/\bdata-change-short="([^"]*)"/)?.[1] || label;
    const version = `${revision.commit.slice(0, 8)}${revision.dirty ? ' · 미커밋' : ''}`;
    attributes = attributes.replace(/\b(title|aria-label)="([^"]*)"/g, (_, name, value) => `${name}="${value} · ${escape(detail)}"`);
    return `<span${attributes} data-preview-commit="${revision.commit}" data-preview-dirty="${revision.dirty}">${short} · ${version}</span>`;
  });
}
const server = http.createServer(async (req, res) => {
  const fail = (status, message) => { res.writeHead(status, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ error:message })); };
  if (req.headers.host !== `127.0.0.1:${port}`) return fail(403, 'Host rejected');
  res.setHeader('Cache-Control', 'no-store');
  const pathname = new URL(req.url, origin).pathname;
  if (pathname === '/api/local-preview') {
    if (!['GET', 'HEAD'].includes(req.method)) return fail(405, 'Method rejected');
    if (req.headers.origin && req.headers.origin !== origin) return fail(403, 'Origin rejected');
    res.writeHead(200, { 'Content-Type':'application/json' });
    return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ app:'5e-local-preview', workspace, revision:await previewRevision() }));
  }
  if (pathname === '/api/local-ai-config' && req.method === 'GET') {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({local:Boolean(localBridge)}));
    return;
  }
  if (pathname === '/api/bug-reports') {
    if (req.method !== 'POST') return fail(405, 'Method rejected');
    if (req.headers.origin !== origin || req.headers['x-5e-report'] !== '1'
        || !req.headers['content-type']?.startsWith('application/json')) return fail(403, 'Origin rejected');
    const reportPort = Number(process.env.FIVE_E_REPORT_PORT || 61909);
    if (!Number.isInteger(reportPort) || reportPort < 1 || reportPort > 65535) return fail(503, 'Report service unavailable');
    const upstream = http.request({ hostname:'127.0.0.1', port:reportPort, path:'/api/bug-reports', method:'POST',
      headers:{ Origin:`http://127.0.0.1:${reportPort}`, 'Content-Type':'application/json', 'X-5E-Report':'1' } }, response => {
      res.writeHead(response.statusCode, { 'Content-Type':'application/json' }); response.pipe(res);
    });
    upstream.setTimeout(15000, () => upstream.destroy(new Error('Report service timeout')));
    upstream.on('error', () => { if (!res.headersSent) fail(502, '문제 신고 서버에 연결하지 못했습니다. 리포트 파일로 저장해 주세요.'); else res.destroy(); });
    req.on('aborted', () => upstream.destroy()); req.pipe(upstream); return;
  }
  if (pathname.startsWith('/api/')) {
    if (!api.test(pathname) || req.method !== 'POST') return fail(404, 'Unknown API');
    if (req.headers.origin !== origin || req.headers['x-5e-request'] !== '1') return fail(403, 'Origin rejected');
    if(localBridge && pathname.startsWith('/api/bridge-')) {
      let body='',size=0;
      req.on('data',chunk=>{size+=chunk.length;if(size>30000000){req.destroy();return;}body+=chunk;});
      req.on('end',async()=>{
        try {
          const result=await localBridge.handle(pathname.slice(5),JSON.parse(body||'{}'));
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify(result));
        } catch(error) { fail(400,error.message); }
      });
      return;
    }
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
  fs.stat(file, async (error, stat) => {
    if (error) return fail(404, 'Not found');
    if (stat.isDirectory()) file = path.join(file, 'index.html');
    if (path.basename(file) === 'index.html') {
      try {
        const html = await fs.promises.readFile(file, 'utf8');
        const content = revisionBadge(html, await previewRevision());
        res.writeHead(200, { 'Content-Type':'text/html' });
        return res.end(req.method === 'HEAD' ? undefined : content);
      } catch { return fail(404, 'Not found'); }
    }
    const stream = fs.createReadStream(file);
    stream.on('error', () => { if (!res.headersSent) fail(404, 'Not found'); else res.destroy(); });
    stream.on('open', () => {
      res.writeHead(200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream' });
      if (req.method === 'HEAD') { stream.destroy(); res.end(); } else stream.pipe(res);
    });
  });
});
server.listen(requestedPort, '127.0.0.1', () => {
  port = server.address().port;
  origin = `http://127.0.0.1:${port}`;
  console.log(`Local preview: ${origin}/preview/`);
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{localBridge?.close();server.close();process.exit(0);});
