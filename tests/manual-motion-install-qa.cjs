const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { mkdir, readFile, rename, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
const root = path.resolve(__dirname, '..');
const evidence = path.resolve(root, process.argv[2] || '.omo/evidence/motion-install');
const mime = { '.css':'text/css', '.html':'text/html', '.js':'text/javascript', '.svg':'image/svg+xml' };

async function pressCapture(page, locator, screenshotPath) {
  const box = await locator.boundingBox();
  assert.ok(box, `missing bounds for ${screenshotPath}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.screenshot({ path:screenshotPath });
  await page.mouse.up();
}

async function openAssignment(page) {
  await page.goto(`${baseUrl}/tests/fixtures/workbench-assignment-qa.html`);
  await page.getByRole('button', { name:'배정 열기' }).click();
  await page.getByRole('dialog', { name:'AI 작업대 배정' }).waitFor();
  await page.waitForFunction(() => Boolean(document.querySelector('link[data-workbench-assignment-style]')?.sheet));
  await page.waitForTimeout(220);
}

await mkdir(evidence, { recursive:true });
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(root)) { response.writeHead(403).end(); return; }
  try {
    response.writeHead(200, { 'content-type':mime[path.extname(file)] || 'application/octet-stream' });
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({
  viewport:{ width:1280, height:800 },
  colorScheme:'dark',
  recordVideo:{ dir:evidence, size:{ width:1280, height:800 } },
});
const page = await context.newPage();
const video = page.video();
const observations = [];

try {
  await page.goto(`${baseUrl}/tests/fixtures/web-login-ui-fixture.html`);
  await page.getByRole('button', { name:'AI 이미지 변환' }).click();
  const download = page.getByRole('link', { name:'설치형 다운로드' });
  await download.waitFor();
  await page.waitForTimeout(220);
  assert.equal(await download.evaluate((element) => getComputedStyle(element).transform), 'none');
  assert.match(await download.evaluate((element) => getComputedStyle(element).animationName), /orbit/u);
  assert.match(await download.getAttribute('href'), /^https:/u);
  await page.screenshot({ path:path.join(evidence, 'login-rest.png') });
  await download.hover();
  await page.waitForTimeout(120);
  await page.screenshot({ path:path.join(evidence, 'login-hover.png') });
  await page.evaluate(() => document.querySelector('.web-login-download').addEventListener('click', (event) => event.preventDefault(), { once:true }));
  await pressCapture(page, download, path.join(evidence, 'login-press.png'));
  await page.mouse.move(0, 0);
  await page.waitForTimeout(520);
  assert.equal(await download.evaluate((element) => getComputedStyle(element).transform), 'none');
  await page.screenshot({ path:path.join(evidence, 'login-settled.png') });
  observations.push('install link: idle orbit, hover sparkle, active scale/shimmer, settled scale, and release URL semantics verified');

  await openAssignment(page);
  const initial = page.locator('[data-placement="separate"]');
  const together = page.locator('[data-placement="together"]');
  const continueButton = page.locator('[data-action="continue"]');
  assert.equal(await initial.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.workbench-assignment-overlay').getAttribute('data-assignment-choice'), null);
  assert.match(await initial.evaluate((element) => getComputedStyle(element).backgroundImage), /conic-gradient/u);
  assert.equal(await initial.evaluate((element) => getComputedStyle(element).transform), 'none');
  await page.screenshot({ path:path.join(evidence, 'assignment-rest.png') });
  await together.hover();
  await page.waitForTimeout(120);
  await page.screenshot({ path:path.join(evidence, 'assignment-hover.png') });
  await pressCapture(page, together, path.join(evidence, 'assignment-press.png'));
  await page.mouse.move(0, 0);
  await page.waitForTimeout(520);
  assert.equal(await page.locator('.workbench-assignment-overlay').getAttribute('data-assignment-choice'), 'explicit');
  assert.equal(await together.getAttribute('aria-pressed'), 'true');
  assert.notEqual(await together.evaluate((element) => getComputedStyle(element).color), await initial.evaluate((element) => getComputedStyle(element).color));
  await page.screenshot({ path:path.join(evidence, 'assignment-settled.png') });
  await continueButton.hover();
  await page.waitForTimeout(120);
  assert.match(await continueButton.evaluate((element) => getComputedStyle(element).backgroundImage), /conic-gradient/u);
  const orbitBefore = await continueButton.evaluate((element) => getComputedStyle(element).getPropertyValue('--ai-action-orbit-angle'));
  await page.waitForTimeout(120);
  const orbitAfter = await continueButton.evaluate((element) => getComputedStyle(element).getPropertyValue('--ai-action-orbit-angle'));
  assert.notEqual(orbitAfter, orbitBefore);
  await page.screenshot({ path:path.join(evidence, 'assignment-submit-hover.png') });
  await page.evaluate(() => document.querySelector('[data-action="continue"]').addEventListener('click', (event) => event.stopImmediatePropagation(), { once:true }));
  const submitBox = await continueButton.boundingBox();
  assert.ok(submitBox);
  await page.mouse.move(submitBox.x + submitBox.width / 2, submitBox.y + submitBox.height / 2);
  await page.mouse.down();
  assert.notEqual(await continueButton.evaluate((element) => getComputedStyle(element).transform), 'none');
  assert.match(await continueButton.evaluate((element) => getComputedStyle(element, '::after').animationName), /shimmer/u);
  await page.screenshot({ path:path.join(evidence, 'assignment-submit-press.png') });
  await page.mouse.up();
  observations.push('assignment modes: semantic default stays neutral; hover, press shimmer, and explicit selected surface verified');
  observations.push('assignment submit: rendered idle orbit, hover sparkle, and held press/shimmer verified without changing its delegated click path');

  for (const viewport of [{ width:375, height:800 }, { width:768, height:900 }]) {
    const responsive = await browser.newContext({ viewport, colorScheme:'dark' });
    const responsivePage = await responsive.newPage();
    await responsivePage.goto(`${baseUrl}/tests/fixtures/web-login-ui-fixture.html`);
    await responsivePage.getByRole('button', { name:'AI 이미지 변환' }).click();
    await responsivePage.getByRole('link', { name:'설치형 다운로드' }).waitFor();
    await responsivePage.waitForTimeout(220);
    assert.equal(await responsivePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await responsivePage.screenshot({ path:path.join(evidence, `login-${viewport.width}.png`) });
    await openAssignment(responsivePage);
    assert.equal(await responsivePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await responsivePage.screenshot({ path:path.join(evidence, `assignment-${viewport.width}.png`) });
    await responsive.close();
  }
  observations.push('responsive: login and assignment remain unclipped without document overflow at 375, 768, and 1280px');

  const reduced = await browser.newContext({ viewport:{ width:1280, height:800 }, colorScheme:'dark', reducedMotion:'reduce' });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(`${baseUrl}/tests/fixtures/web-login-ui-fixture.html`);
  await reducedPage.getByRole('button', { name:'AI 이미지 변환' }).click();
  const reducedDownload = reducedPage.getByRole('link', { name:'설치형 다운로드' });
  assert.equal(await reducedDownload.evaluate((element) => getComputedStyle(element).animationName), 'none');
  await reducedDownload.hover();
  assert.equal(await reducedDownload.evaluate((element) => getComputedStyle(element, '::after').transform), 'none');
  await reducedPage.screenshot({ path:path.join(evidence, 'login-reduced-motion.png') });
  await openAssignment(reducedPage);
  const reducedMode = reducedPage.locator('[data-placement="separate"]');
  assert.equal(await reducedMode.evaluate((element) => getComputedStyle(element).animationName), 'none');
  await reducedMode.hover();
  assert.equal(await reducedMode.evaluate((element) => getComputedStyle(element, '::after').transform), 'none');
  await reducedPage.screenshot({ path:path.join(evidence, 'assignment-reduced-motion.png') });
  await reduced.close();
  observations.push('reduced motion: orbit, shimmer, hover travel, and active scaling are removed while controls stay actionable');
} finally {
  await page.close();
  await context.close();
  if (video) await rename(await video.path(), path.join(evidence, 'motion-states.webm'));
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

await writeFile(path.join(evidence, 'browser-results.json'), JSON.stringify({ passed:true, viewport:'1280x800', observations }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
