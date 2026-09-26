const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const playwrightRoot = process.env.PLAYWRIGHT_ROOT;
if (!playwrightRoot) throw new Error('PLAYWRIGHT_ROOT is required');
const { chromium } = require(path.join(playwrightRoot, 'playwright'));

const url = process.argv[2] || 'http://127.0.0.1:47831/tests/task8-geometry-browser.html';
const evidenceDir = path.resolve(process.argv[3]);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), '5e-task8-browser-'));

async function run() {
  const consoleMessages = [];
  const pageErrors = [];
  const failedResources = [];
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      viewport: { width: 1440, height: 1100 },
    });
    const page = context.pages()[0] || await context.newPage();
    page.on('console', message => consoleMessages.push({
      type: message.type(), text: message.text(), location: message.location(),
    }));
    page.on('pageerror', error => pageErrors.push(error.stack || String(error)));
    page.on('response', response => {
      if (response.status() >= 400) failedResources.push({ status: response.status(), url: response.url() });
    });
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200, 'QA page must load');
    await page.waitForFunction(() => /^(PASS|FAIL) Task 8/.test(document.title));
    const title = await page.title();
    const result = await page.locator('#result').textContent();
    if (!title.startsWith('PASS')) throw new Error(result || title);
    assert.equal(pageErrors.length, 0, `browser page errors: ${pageErrors.join('\n')}`);
    const report = JSON.parse(result);
    assert.deepEqual(report.viewport, { width: 1440, height: 1100 }, 'QA viewport must be 1440 x 1100');
    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({ path: path.join(evidenceDir, 'task-8-browser-viewport-1440x1100.png') });
    await page.screenshot({ path: path.join(evidenceDir, 'task-8-browser-full-page.png'), fullPage: true });
    fs.writeFileSync(path.join(evidenceDir, 'browser-console.json'), `${JSON.stringify({
      title, consoleMessages, pageErrors, failedResources,
    }, null, 2)}\n`);
    for (const filename of [
      'browser-report.json',
      'task-8-5e-160-release-remediation.png',
      'browser-export-zorder.png',
      'browser-arrow-content-fit.png',
      'browser-arrow-content-fit.svg',
      'browser-wavy-content-fit.png',
      'browser-wavy-content-fit.svg',
      'task-8-browser-viewport-1440x1100.png',
      'task-8-browser-full-page.png',
    ]) {
      const artifact = path.join(evidenceDir, filename);
      assert.ok(fs.existsSync(artifact) && fs.statSync(artifact).size > 0, `${filename} must be non-empty`);
    }
    process.stdout.write(`${result}\n`);
  } finally {
    await context?.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

run().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
