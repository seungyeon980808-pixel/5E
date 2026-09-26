const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const evidenceDir = path.resolve(process.argv[2]);
const port = Number(process.argv[3] || 47831);
fs.mkdirSync(evidenceDir, { recursive: true });

const outputs = new Map([
  ['/__task8_report', ['browser-report.json', 'application/json']],
  ['/__task8_board', ['task-8-5e-160-release-remediation.png', 'image/png']],
  ['/__task8_export_png', ['browser-export-zorder.png', 'image/png']],
  ['/__task8_arrow_png', ['browser-arrow-content-fit.png', 'image/png']],
  ['/__task8_export_svg', ['browser-arrow-content-fit.svg', 'image/svg+xml']],
]);
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.woff2', 'font/woff2'],
]);

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (request.method === 'POST' && outputs.has(pathname)) {
    const [filename, type] = outputs.get(pathname);
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      fs.writeFileSync(path.join(evidenceDir, filename), Buffer.concat(chunks));
      response.writeHead(204).end();
    });
    return;
  }
  const relative = pathname === '/'
    ? 'tests/task8-geometry-browser.html'
    : pathname.replace(/^\/tests\/fonts\//, 'preview/fonts/').replace(/^\//, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, { 'content-type': contentTypes.get(path.extname(file)) || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`TASK8_BROWSER_URL=http://127.0.0.1:${port}/tests/task8-geometry-browser.html`);
});
