const { editorResultsSource, panelResultsSource } = require('./editor-results-source.cjs');
const { editorCutSource, editorImagePasteSource } = require('./editor-cut-source.cjs');
const http = require('node:http');
const { editorCommentsSource } = require('./editor-comments-source.cjs');
const { editorCanvasSource } = require('./editor-canvas-source.cjs');
const { editorPanelSource } = require('./editor-source.cjs');
const fs = require('node:fs');
const path = require('node:path');
const projectRoot = path.resolve(__dirname, '../..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.otf': 'font/otf', '.ico': 'image/x-icon' };
const authActions = new Set(['session', 'status', 'login', 'cancel', 'logout', 'generate', 'generation', 'generation-cancel', 'bridge-status', 'bridge-models', 'bridge-account', 'bridge-send', 'bridge-events', 'bridge-interrupt']);
function createGateway({ authPort = 19383, allowAnonymousEditor = false } = {}) {
  const upstream = `http://127.0.0.1:${authPort}`;
  async function auth(req, action) {
    const cookieName = `fivee_auth_${authPort}=`;
    const cookie = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(cookieName)) || '';
    let body;
    if (['generate', 'generation', 'generation-cancel'].includes(action) || action.startsWith('bridge-')) {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 12_000_000) { const error = new Error('Request too large'); error.status = 413; throw error; }
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks);
    }
    return fetch(`${upstream}/api/${action}`, { method: 'POST', headers: { Origin: upstream, 'X-5E-Request': '1', Cookie: cookie, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(35000) });
  }
  return http.createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${req.socket.localPort}`;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    const reply = (status, body, type = 'application/json') => { res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` }); res.end(body); };
    const redirect = target => { res.writeHead(302, { Location: target }); res.end(); };
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return reply(403, '{"error":"Origin rejected"}');
    try {
      const url = new URL(req.url, origin);
      if (url.pathname.startsWith('/api/')) {
        const action = url.pathname.slice(5);
        if (req.method !== 'POST' || req.headers.origin !== origin || req.headers['x-5e-request'] !== '1') return reply(403, '{"error":"Request rejected"}');
        if (!authActions.has(action)) return reply(404, '{"error":"Unknown endpoint"}');
        const response = await auth(req, action);
        const cookie = response.headers.get('set-cookie');
        if (cookie) res.setHeader('Set-Cookie', cookie);
        return reply(response.status, await response.text());
      }
      if (req.method !== 'GET') return reply(405, '{"error":"Method rejected"}');
      if (url.pathname === '/' || url.pathname === '/editor/' || url.pathname === '/editor') {
        const response = await auth(req, 'status');
        const cookie = response.headers.get('set-cookie');
        if (cookie) res.setHeader('Set-Cookie', cookie);
        const state = await response.json();
        if (!allowAnonymousEditor && (response.status === 401 || (response.ok && !state.signedIn))) return redirect('/login');
        if (!response.ok && !(allowAnonymousEditor && response.status === 401)) return reply(503, '인증 서버에 연결할 수 없습니다. 잠시 후 새로고침해 주세요.', 'text/plain');
        if (url.pathname !== '/editor/') return redirect('/editor/');
        let html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
        html = html.replace('</head>', '<link rel="stylesheet" href="/editor-session.css"><link rel="stylesheet" href="/editor-background.css"><link rel="stylesheet" href="/editor-results.css"><script src="/editor-bridge.js"></script><script src="/editor-session.js" type="module"></script></head>');
        html = html.replace('<body>', '<body><nav class="web-session" aria-label="계정 연결"><span id="web-session-status" role="status">계정 확인 중</span><span>AI 이미지 생성</span><a href="/account" target="_blank" rel="noopener">계정</a></nav>');
        html = html.replace(/<script type="module" src="js\/mcp-bridge[^>]*><\/script>/, '');
        return reply(200, html, 'text/html');
      }
      if (url.pathname === '/login' || url.pathname === '/account') {
        let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
        html = html.replace(/ data-editor-url="[^"]*"/, url.pathname === '/login' ? ' data-editor-url="/editor/"' : '');
        html = html.replace('로컬 인증 실험입니다.<br>이미지 변환 기능은 꺼져 있습니다.<br>원격 무설치 사용은 검증 전입니다.', url.pathname === '/account' ? '로그인을 완료한 뒤 편집기로 돌아가세요.<br>AI 이미지 생성과 수정을 시험할 수 있습니다.' : '로그인하면 5E 편집기로 이동합니다.<br>편집기에서 AI 이미지를 생성할 수 있습니다.');
        if (url.pathname === '/account') html = html.replace('</section>', '<a href="/editor/">5E 편집기 열기</a></section>');
        return reply(200, html, 'text/html');
      }
      const own = { '/editor-cut.mjs': 'editor-cut.mjs', '/editor-results.css': 'editor-results.css', '/editor-review.js': 'editor-review.js', '/editor-feedback.js': 'editor-feedback.js', '/outer-background.mjs': 'outer-background.mjs', '/editor-background.js': 'editor-background.js', '/editor-background.css': 'editor-background.css', '/editor-bridge.js': 'editor-bridge.js', '/client.js': 'client.js', '/style.css': 'style.css', '/editor-session.js': 'editor-session.js', '/editor-session.css': 'editor-session.css', '/editor-generation.js': 'editor-generation.js', '/editor-generation.css': 'editor-generation.css' }[url.pathname];
      if (own) return reply(200, fs.readFileSync(path.join(__dirname, own)), mime[path.extname(own)]);
      const relative = decodeURIComponent(url.pathname.replace(/^\/editor\//, '/')).slice(1);
      if (relative.includes('..') || relative.includes('\\') || !/^(?:css\/|js\/|assets\/|fonts\/|docs\/credits\.html$|manifest\.json$)/.test(relative)) return reply(404, '{"error":"Not found"}');
      const file = path.join(projectRoot, relative);
      const real = fs.realpathSync(file);
      if (!real.startsWith(projectRoot + path.sep) || !fs.statSync(real).isFile() || !mime[path.extname(real)]) return reply(404, '{"error":"Not found"}');
      let content = fs.readFileSync(real);
      if (relative === 'js/image-paste.js') content = editorImagePasteSource(content.toString('utf8'));
      if (relative === 'js/transform.js') content = editorCutSource(content.toString('utf8'));
      if (relative === 'js/ai-image-comments.js') content = editorCommentsSource(content.toString('utf8'));
      if (relative === 'js/ai-panel.js') content = panelResultsSource(editorCanvasSource(editorPanelSource(content.toString('utf8'))));
      if (relative === 'js/ai-workbench.js') content = editorResultsSource(content.toString('utf8'));
      return reply(200, content, mime[path.extname(real)]);
    } catch (error) {
      if (error.status === 413) return reply(413, '{"error":"이미지는 8MB 이하로 선택해 주세요."}');
      if (error instanceof URIError) return reply(400, '{"error":"Malformed request path"}');
      if (error.code === 'ENOENT' || error.code === 'EISDIR') return reply(404, '{"error":"Not found"}');
      return reply(503, '{"error":"Connection unavailable"}');
    }
  });
}
if (require.main === module) {
  const server = createGateway();
  server.listen(19385, '127.0.0.1', () => console.log('5E authenticated editor: http://127.0.0.1:19385'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
module.exports = { createGateway };
