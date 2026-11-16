const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { timingSafeEqual, createHash, randomUUID } = require('node:crypto');
const MAX_BYTES = 18 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const STATUSES = new Set(['new', 'investigating', 'fixed', 'needs-info']);
const bounded = (value, max) => typeof value === 'string' && value.length <= max;
function validateReport(report) {
  if (report?.schemaVersion !== 1 || !UUID.test(report.id || '')
      || !bounded(report.title, 160) || !report.title.trim() || !bounded(report.description, 4000) || !report.description.trim()
      || !bounded(report.expected, 4000) || !bounded(report.steps, 4000)
      || !Number.isFinite(Date.parse(report.createdAt)) || !report.context || typeof report.context !== 'object'
      || JSON.stringify(report.context).length > 100000 || !Array.isArray(report.images) || report.images.length > 3) throw new Error('Invalid report');
  for (const image of report.images) {
    if (!bounded(image.name, 160) || !['original','result','screenshot'].includes(image.role)
        || !bounded(image.data, 8 * 1024 * 1024) || !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(image.data)) throw new Error('Invalid attachment');
  }
  return { schemaVersion: 1, id: report.id, createdAt: report.createdAt, title: report.title,
    description: report.description, steps: report.steps, expected: report.expected,
    context: report.context, images: report.images.map(({ name, role, data }) => ({ name, role, data })) };
}
function createBugReportServer({ directory, allowedOrigins = [], adminToken = '', clock = Date.now } = {}) {
  if (!directory) throw new Error('Report directory is required');
  const origins = new Set(allowedOrigins), recent = new Map();
  let ready = fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const authorization = request => {
    const actual = Buffer.from(request.headers.authorization || ''), expected = Buffer.from(`Bearer ${adminToken}`);
    return adminToken.length >= 24 && actual.length === expected.length && timingSafeEqual(actual, expected);
  };
  return http.createServer(async (request, response) => {
    const send = (status, body) => { response.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }); response.end(JSON.stringify(body)); };
    try {
      await ready;
      const host = request.headers.host;
      if (!/^127\.0\.0\.1:\d+$/.test(host || '')) return send(403, { error: 'host_rejected' });
      const ownOrigin = `http://${host}`, origin = request.headers.origin;
      if (origin && origin !== ownOrigin && !origins.has(origin)) return send(403, { error: 'origin_rejected' });
      if (origin && origins.has(origin)) response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
      const url = new URL(request.url, ownOrigin);
      if (request.method === 'OPTIONS' && url.pathname === '/api/bug-reports') {
        response.setHeader('Access-Control-Allow-Methods', 'POST'); response.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-5E-Report'); return send(204, null);
      }
      if (url.pathname === '/admin' && request.method === 'GET') {
        if (origin && origin !== ownOrigin) return send(403, { error:'admin_origin_rejected' });
        const html = await fs.readFile(path.join(__dirname, '../tools/bug-report-admin/index.html'));
        response.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" }); return response.end(html);
      }
      if (['/admin.js','/admin.css'].includes(url.pathname) && request.method === 'GET') {
        const data = await fs.readFile(path.join(__dirname, '../tools/bug-report-admin', url.pathname.slice(1)));
        response.writeHead(200, { 'Content-Type':url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css', 'Cache-Control':'no-store' }); return response.end(data);
      }
      if (url.pathname.startsWith('/api/admin/')) {
        if (origin && origin !== ownOrigin || !authorization(request)) return send(401, { error:'admin_auth_required' });
        if (request.method === 'GET' && url.pathname === '/api/admin/reports') {
          const files = (await fs.readdir(directory)).filter(file => UUID.test(file.replace(/\.json$/, '')) && file.endsWith('.json'));
          const latest = await Promise.all(files.map(async file => ({ file, modified:(await fs.stat(path.join(directory,file))).mtimeMs })));
          const reports = [];
          for (const { file } of latest.sort((a,b) => b.modified-a.modified).slice(0, 100)) {
            const report = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'));
            let review = { status:'new', note:'' };
            try { review = JSON.parse(await fs.readFile(path.join(directory, `${report.id}.review.json`), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
            reports.push({ id:report.id, title:report.title, receivedAt:report.receivedAt, review });
          }
          return send(200, { reports:reports.sort((a,b) => b.receivedAt.localeCompare(a.receivedAt)) });
        }
        const id = url.pathname.split('/').at(-1);
        if (request.method === 'GET' && UUID.test(id)) {
          const report = JSON.parse(await fs.readFile(path.join(directory, `${id}.json`), 'utf8'));
          let review = { status:'new', note:'' };
          try { review = JSON.parse(await fs.readFile(path.join(directory, `${id}.review.json`), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
          return send(200, { ...report, review });
        }
        if (request.method !== 'PUT' || !UUID.test(id)) return send(404, { error:'not_found' });
        await fs.access(path.join(directory, `${id}.json`));
        const review = await readJson(request, 10000);
        if (!STATUSES.has(review.status) || !bounded(review.note, 4000)) return send(400, { error:'invalid_review' });
        const next = { status:review.status, note:review.note, updatedAt:new Date(clock()).toISOString() };
        const target = path.join(directory, `${id}.review.json`), temp = `${target}.${randomUUID()}.tmp`;
        try { await fs.writeFile(temp, JSON.stringify(next), { flag:'wx', mode:0o600 }); await fs.rename(temp, target); }
        finally { await fs.rm(temp, { force:true }); }
        return send(200, next);
      }
      if (url.pathname !== '/api/bug-reports' || request.method !== 'POST') return send(404, { error:'not_found' });
      if (!origin || !(origin === ownOrigin || origins.has(origin)) || request.headers['x-5e-report'] !== '1'
          || !request.headers['content-type']?.startsWith('application/json')) return send(403, { error:'request_rejected' });
      const fingerprint = createHash('sha256').update(request.socket.remoteAddress || '').digest('hex');
      const now = clock(), times = (recent.get(fingerprint) || []).filter(time => now - time < 60000);
      if (times.length >= 10) return send(429, { error:'rate_limited' });
      times.push(now); recent.set(fingerprint, times);
      const report = validateReport(await readJson(request, MAX_BYTES));
      const file = path.join(directory, `${report.id}.json`);
      const stored = { ...report, receivedAt:new Date(now).toISOString() };
      const temp = `${file}.${randomUUID()}.tmp`;
      try { await fs.writeFile(temp, JSON.stringify(stored), { flag:'wx', mode:0o600 }); await fs.link(temp, file); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const previous = JSON.parse(await fs.readFile(file, 'utf8'));
        const { receivedAt, ...original } = previous;
        if (JSON.stringify(original) !== JSON.stringify(report)) return send(409, { error:'report_id_conflict' });
      }
      finally { await fs.rm(temp, { force:true }); }
      return send(201, { id:report.id });
    } catch (error) { return send(error.status || (error.code === 'ENOENT' ? 404 : 400), { error: error.status === 413 ? 'report_too_large' : 'request_failed' }); }
  });
}
function readJson(request, max) {
  return new Promise((resolve, reject) => {
    const chunks = []; let bytes = 0;
    request.on('data', chunk => { bytes += chunk.length; if (bytes <= max) chunks.push(chunk); });
    request.on('error', reject);
    request.on('end', () => { if (bytes > max) return reject(Object.assign(new Error('Body too large'), { status:413 })); try { resolve(JSON.parse(Buffer.concat(chunks))); } catch (error) { reject(error); } });
  });
}
module.exports = { createBugReportServer, validateReport };
if (require.main === module) {
  const directory = process.env.FIVE_E_REPORT_DIR || path.join(os.homedir(), 'Library/Application Support/5E/bug-reports');
  const adminToken = process.env.FIVE_E_REPORT_ADMIN_TOKEN;
  if (!adminToken || adminToken.length < 24) throw new Error('Set FIVE_E_REPORT_ADMIN_TOKEN (at least 24 characters)');
  const allowedOrigins = (process.env.FIVE_E_REPORT_ORIGINS || 'http://127.0.0.1:61808,http://127.0.0.1:50189').split(',');
  const server = createBugReportServer({ directory, adminToken, allowedOrigins });
  server.listen(Number(process.env.PORT || 61909), '127.0.0.1', () => console.log(`5E report service: http://127.0.0.1:${server.address().port}/admin`));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
