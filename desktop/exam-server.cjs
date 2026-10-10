const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.pdf':'application/pdf'};
const DIRECTORIES = new Set(['js','css','vendor','assets','fonts']);

async function startExamServer({root, port = 39821}) {
  const base = await fs.realpath(root), seeds = new Map(); let origin;
  const server = http.createServer(async (request, response) => {
    const fail = (code, message) => { response.writeHead(code, {'Content-Type':'text/plain'}); response.end(message); };
    try {
      if (request.headers.host !== new URL(origin).host) return fail(403, 'Host rejected');
      if (!['GET','HEAD'].includes(request.method)) return fail(405, 'Method rejected');
      if (request.headers.origin && request.headers.origin !== origin) return fail(403, 'Origin rejected');
      response.setHeader('Cache-Control','no-store');
      response.setHeader('X-Content-Type-Options','nosniff');
      response.setHeader('Cross-Origin-Resource-Policy','same-origin');
      const pathname = decodeURIComponent(new URL(request.url, origin).pathname);
      const seedMatch = /^\/exam-seed\/([a-f0-9]{48})$/.exec(pathname);
      if (seedMatch) {
        const seed = seeds.get(seedMatch[1]);
        if (!seed || Date.now() - seed.at > 60000) { seeds.delete(seedMatch[1]); return fail(410, 'Source expired'); }
        response.setHeader('Content-Type','application/json');
        if (request.method === 'HEAD') return response.end();
        seeds.delete(seedMatch[1]); return response.end(seed.json);
      }
      const parts = pathname.split('/').filter(Boolean), relative = parts.length ? parts.join('/') : 'index.html';
      if (parts.some(part => part.startsWith('.') || part.includes('\\') || part.includes('\0')) ||
          (relative !== 'index.html' && !DIRECTORIES.has(parts[0])) || !TYPES[path.extname(relative)]) return fail(404,'Not found');
      const file = await fs.realpath(path.resolve(base, relative));
      if (!file.startsWith(base + path.sep)) return fail(403,'Path rejected');
      const stat = await fs.stat(file); if (!stat.isFile()) return fail(404,'Not found');
      const bytes = request.method === 'HEAD' ? null : await fs.readFile(file);
      response.writeHead(200, {'Content-Type':TYPES[path.extname(file)], 'Content-Length':stat.size}); response.end(bytes);
    } catch (error) {
      if (!response.headersSent) fail(error instanceof URIError ? 400 : 404,'Not found'); else response.destroy();
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port,'127.0.0.1',resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    seed(payload) {
      const source = payload?.source || payload;
      if (!source || !Array.isArray(source.pages) || typeof source.activePageId !== 'string') throw new Error('그림 원본을 확인할 수 없습니다.');
      const json = JSON.stringify(payload); if (Buffer.byteLength(json) > 128 * 1024 * 1024) throw new Error('그림 프로젝트가 너무 큽니다.');
      for (const [key,value] of seeds) if (Date.now() - value.at > 60000) seeds.delete(key);
      if (seeds.size >= 8) throw new Error('열기 요청이 너무 많습니다. 잠시 후 다시 열어주세요.');
      const key = randomBytes(24).toString('hex'); seeds.set(key,{at:Date.now(),json}); return key;
    },
    async close() { seeds.clear(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}
module.exports = { startExamServer };
