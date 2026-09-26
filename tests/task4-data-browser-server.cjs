const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const evidence = path.resolve(process.env.EVIDENCE_DIR || path.join(root, '.omo/evidence/task4'));
const port = Number(process.env.PORT || 18798);
const outputs = {
  '/__task4_report': path.join(evidence, 'browser-report.json'),
  '/__task4_screenshot': path.join(evidence, 'browser-pass.png'),
};

fs.mkdirSync(evidence, { recursive: true });

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.mjs') || file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

const server = http.createServer((request, response) => {
  if (request.method === 'POST' && outputs[request.url]) {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      fs.writeFileSync(outputs[request.url], Buffer.concat(chunks));
      response.writeHead(204);
      response.end();
    });
    return;
  }
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403);
    response.end('forbidden');
    return;
  }
  fs.readFile(file, (error, bytes) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end(error.message);
      return;
    }
    response.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-store' });
    response.end(bytes);
  });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Task 4 browser server http://127.0.0.1:${port}\n`);
});
