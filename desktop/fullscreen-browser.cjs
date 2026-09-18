const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const out = process.env.FULLSCREEN_QA_OUT || path.join(root, '.omo/evidence/fullscreen-real-0918/browser');
const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

function server() {
  return http.createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) { response.writeHead(403).end(); return; }
    try {
      response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
      response.end(await fs.readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
}

(async () => {
  await fs.mkdir(out, { recursive: true });
  const app = server();
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const { port } = app.address();
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.getByRole('button', { name: '건너뛰기', exact: true }).click();
    const button = page.locator('#fullscreen-toggle');
    await page.screenshot({ path: path.join(out, 'windowed.png') });
    await button.click();
    await page.waitForFunction(() => document.fullscreenElement === document.documentElement && document.getElementById('fullscreen-toggle')?.getAttribute('aria-pressed') === 'true');
    const entered = await page.evaluate(() => ({
      element: document.fullscreenElement === document.documentElement,
      pressed: document.getElementById('fullscreen-toggle')?.getAttribute('aria-pressed'),
      innerHeight: window.innerHeight,
      visualHeight: window.visualViewport?.height,
    }));
    assert.equal(entered.element, true);
    assert.equal(entered.pressed, 'true');
    assert.ok(Math.abs(entered.innerHeight - entered.visualHeight) <= 1, JSON.stringify(entered));
    await page.screenshot({ path: path.join(out, 'entered.png') });
    await button.click();
    await page.waitForFunction(() => !document.fullscreenElement && document.getElementById('fullscreen-toggle')?.getAttribute('aria-pressed') === 'false');
    const exitedByButton = await page.evaluate(() => ({
      element: document.fullscreenElement,
      pressed: document.getElementById('fullscreen-toggle')?.getAttribute('aria-pressed'),
    }));
    assert.equal(exitedByButton.element, null);
    assert.equal(exitedByButton.pressed, 'false');
    await page.screenshot({ path: path.join(out, 'exited-by-button.png') });
    await button.click();
    await page.waitForFunction(() => document.fullscreenElement === document.documentElement && document.getElementById('fullscreen-toggle')?.getAttribute('aria-pressed') === 'true');
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => !document.fullscreenElement && document.getElementById('fullscreen-toggle')?.getAttribute('aria-pressed') === 'false');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    const exited = await page.evaluate(() => ({
      element: document.fullscreenElement,
      pressed: document.getElementById('fullscreen-toggle')?.getAttribute('aria-pressed'),
      innerHeight: window.innerHeight,
      visualHeight: window.visualViewport?.height,
    }));
    assert.equal(exited.element, null);
    assert.equal(exited.pressed, 'false');
    await page.screenshot({ path: path.join(out, 'exited-by-api.png') });
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ scenario: 'click fullscreen button to enter and exit, then exit through the browser API and verify Escape does not re-enter on the real editor page', entered, exitedByButton, exited, errors }, null, 2));
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolve => app.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
