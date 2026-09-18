const { randomBytes } = require('node:crypto');
const { parseProject, projectPackageZip, MAX_PROJECT_BYTES } = require('../../desktop/project-package.cjs');
const fs = require('node:fs/promises');
const { createWindowsProjectPackage } = require('../../desktop/windows-project-package.cjs');

function createProjectRoutes({ now = Date.now, webEditorOrigin = '', publicApiUrl, editorUrl,
  packageZip = projectPackageZip, windowsPackage = createWindowsProjectPackage } = {}) {
  const entries = new Map();
  let used = 0;
  let active = 0;
  function sweep() {
    for (const [id, entry] of entries) if (entry.expiresAt <= now()) { entries.delete(id); used -= entry.bytes; }
  }
  async function handle(req, reply, origin) {
    const url = new URL(req.url, origin);
    if (!url.pathname.startsWith('/api/project-')) return false;
    try {
      sweep();
      const match = /^\/api\/project-launch\/([a-f0-9]{48})$/.exec(url.pathname);
      if (req.headers.origin && req.headers.origin !== origin && req.headers.origin !== webEditorOrigin) { reply(403, '{}'); return true; }
      if (req.method === 'GET' && match && !url.search) {
        const entry = entries.get(match[1]);
        if (!entry) { reply(410, JSON.stringify({ error: '열기 요청이 만료되었습니다. 저장한 프로젝트 파일을 다시 더블클릭해 주세요.' })); return true; }
        reply(200, entry.json); return true;
      }
      if (!['/api/project-launch', '/api/project-package'].includes(url.pathname) || url.search) { reply(404, '{}'); return true; }
      if (req.method !== 'POST' || (req.headers.origin !== origin && !(url.pathname === '/api/project-package' && webEditorOrigin && req.headers.origin === webEditorOrigin)) || req.headers['x-5e-request'] !== '1' || !req.headers['content-type']?.startsWith('application/json')) { reply(403, '{}'); return true; }
      if (active >= 1) { reply(503, JSON.stringify({ error: '다른 프로젝트를 처리하고 있습니다. 잠시 후 다시 시도해 주세요.' })); return true; }
      if (Number(req.headers['content-length']) > MAX_PROJECT_BYTES) { reply(413, JSON.stringify({ error: '프로젝트는 32MB 이하로 저장해 주세요.' })); return true; }
      active++;
      try {
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_PROJECT_BYTES) { const error = new Error('프로젝트는 32MB 이하로 저장해 주세요.'); error.status = 413; throw error; }
          chunks.push(chunk);
        }
        const json = Buffer.concat(chunks).toString('utf8');
        parseProject(json);
        if (url.pathname === '/api/project-launch') {
          if (entries.size >= 32 || used + size > 128 * 1024 * 1024) { reply(503, JSON.stringify({ error: '잠시 후 프로젝트 파일을 다시 열어 주세요.' })); return true; }
          const id = randomBytes(24).toString('hex');
          entries.set(id, { json, bytes: size, expiresAt: now() + 60 * 60 * 1000 }); used += size;
          const editor = editorUrl || process.env.FIVE_E_PROJECT_EDITOR_URL || `${origin}/editor/`;
          reply(201, JSON.stringify({ url: `${editor.replace(/#.*$/, '')}#project=${id}` }));
        } else {
          const target = req.headers['x-5e-target'] || 'darwin';
          if (!['darwin', 'win32'].includes(target)) { reply(400, JSON.stringify({ error: '지원하지 않는 프로젝트 파일 형식입니다.' })); return true; }

          const options = { json, server: publicApiUrl || process.env.FIVE_E_PROJECT_PUBLIC_API_URL || origin };
          if (target === 'win32') {
            const pkg = await windowsPackage(options);
            try { reply(200, await fs.readFile(pkg.bundle), 'application/octet-stream'); }
            finally { await pkg.close(); }
          } else { reply(200, await packageZip(options), 'application/zip'); }
        }
      } finally { active--; }
    } catch (error) {
      reply(error.status || 400, JSON.stringify({ error: error.code ? '실행형 프로젝트를 저장하지 못했습니다. 작업은 그대로 유지됩니다.' : error.message }));
    }
    return true;
  }
  const timer = setInterval(sweep, 60_000); timer.unref();
  return { handle, close() { clearInterval(timer); entries.clear(); used = 0; } };
}
module.exports = { createProjectRoutes };
