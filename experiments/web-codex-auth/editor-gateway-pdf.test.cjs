const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createGateway } = require('./editor-gateway.cjs');

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function fixture(t, options = {}) {
  const auth = http.createServer((_req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end('{"signedIn":false}');
  });
  await listen(auth);
  const gateway = createGateway({ authPort: auth.address().port, allowAnonymousEditor: true, ...options });
  const base = await listen(gateway);
  t.after(async () => {
    gateway.closeAllConnections();
    auth.closeAllConnections();
    await Promise.all([
      new Promise(resolve => gateway.close(resolve)),
      new Promise(resolve => auth.close(resolve)),
    ]);
  });
  return base;
}

test('Given the web editor gateway, when PDF.js and OCR assets load, then only required vendor trees have browser MIME types', async t => {
  const base = await fixture(t);
  const expected = new Map([
    ['/editor/vendor/pdfjs/pdf.mjs', 'text/javascript'],
    ['/editor/vendor/pdfjs/wasm/openjpeg.wasm', 'application/wasm'],
    ['/editor/vendor/pdfjs/cmaps/78-H.bcmap', 'application/octet-stream'],
    ['/editor/vendor/pdfjs/standard_fonts/LiberationSans-Regular.ttf', 'font/ttf'],
    ['/editor/vendor/pdfjs/standard_fonts/FoxitSymbol.pfb', 'application/octet-stream'],
    ['/editor/vendor/ocr/tesseract.esm.min.js', 'text/javascript'],
    ['/editor/vendor/ocr/lang/kor.traineddata.gz', 'application/gzip'],
  ]);
  for (const [route, contentType] of expected) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type') || '', new RegExp(`^${contentType.replace('/', '\\/')}`), route);
    assert.ok((await response.arrayBuffer()).byteLength > 0, route);
  }
  assert.equal((await fetch(base + '/editor/vendor/not-allowed.js')).status, 404);
  assert.equal((await fetch(base + '/editor/vendor/pdfjs/%2e%2e%2focr/worker.min.js')).status, 404);
});

test('Given a configured PDF pack URL, when editor HTML is served, then the value is injected without executable markup', async t => {
  const payload = 'https://packs.example/base/</script><script>globalThis.pwned=true</script>';
  const base = await fixture(t, { pdfPackBaseUrl: payload });
  const html = await (await fetch(base + '/editor/')).text();
  assert.match(html, /window\.FIVE_E_PDF_PACK_BASE_URL=/);
  assert.doesNotMatch(html, /<script>globalThis\.pwned/);
  assert.match(html, /\\u003c\/script\\u003e/);
});

test('Given no PDF pack deployment, when editor HTML is served, then an explicit blank override is injected', async t => {
  const base = await fixture(t, { pdfPackBaseUrl: '' });
  const html = await (await fetch(base + '/editor/')).text();
  assert.match(html, /window\.FIVE_E_PDF_PACK_BASE_URL="";/);
});
