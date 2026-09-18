import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
const dataDir = resolve(process.argv[2] || '/tmp/5e-drive-index');
const evidenceDir = resolve(process.argv[3] || '.omo/evidence/library-year-runtime-0918/green');
await mkdir(evidenceDir, { recursive: true });
const root = process.cwd();
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = pathname.startsWith('/qa-data/') ? resolve(dataDir, pathname.slice(9)) : resolve(root, `.${pathname}`);
    if (!path.startsWith(root + '/') && !path.startsWith(dataDir + '/')) throw new Error('outside fixture root');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css' })[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.statusCode = 404; res.end('not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const scenarios = [];
try {
  await page.goto(`${baseUrl}/tests/fixtures/library-year-catalog-qa.html`);
  await page.waitForSelector('.unilib-result-card');
  await page.locator('[data-unilib-type="question"]').click();
  await page.waitForFunction(() => window.qaSearches.length >= 2);
  const catalog = await page.evaluate(() => window.qaCatalog);
  await writeFile(`${evidenceDir}/catalog.json`, JSON.stringify(catalog, null, 2));
  await page.screenshot({ path: `${evidenceDir}/dropdown.png` });
  await writeFile(`${evidenceDir}/dropdown-dom.html`, await page.content());
  assert.equal(catalog.documents, 422);
  assert.equal(catalog.entries, 8751);
  const options = await page.locator('[data-unilib-year-start] option').evaluateAll(nodes => nodes.map(n => n.value));
  assert.ok(options.includes('2025'), 'real catalog must populate selectable 2025 academic year');
  const start = page.locator('[data-unilib-year-start]');
  const end = page.locator('[data-unilib-year-end]');
  async function change(control, value) {
    const before = await page.evaluate(() => window.qaSearches.length);
    await control.selectOption(value);
    await page.waitForFunction(before => window.qaSearches.length > before, before);
  }
  async function record(name, expected, predicate) {
    const result = await page.evaluate(() => window.qaSearches.at(-1));
    assert.ok(result.count > 0, `${name}: nonempty results`);
    assert.ok(result.years.every(predicate), `${name}: years ${result.years}`);
    assert.deepEqual({ start: await start.inputValue(), end: await end.inputValue() }, expected);
    scenarios.push({ name, observable: 'PASS', selection: expected, ...result });
    await page.screenshot({ path: `${evidenceDir}/${name}.png` });
  }
  await change(start, '2025'); await record('start-only', { start: '2025', end: '' }, year => year >= 2025);
  await change(start, ''); await change(end, '2025'); await record('end-only', { start: '', end: '2025' }, year => year <= 2025);
  await change(start, '2024'); await record('range', { start: '2024', end: '2025' }, year => year >= 2024 && year <= 2025);
  await change(start, '2025'); await change(end, '2024'); await record('reversed', { start: '2025', end: '2024' }, year => year >= 2024 && year <= 2025);
  await change(page.locator('[data-unilib-filter="subject"]'), 'p1'); await record('subject-switch', { start: '2025', end: '2024' }, year => year >= 2024 && year <= 2025);
  assert.deepEqual(scenarios.at(-1).subjects, ['p1']);
  const before = await page.evaluate(() => window.qaSearches.length);
  await page.locator('[data-unilib-query]').fill('자석');
  await page.waitForFunction(before => window.qaSearches.length > before, before);
  await record('search-rerender', { start: '2025', end: '2024' }, year => year >= 2024 && year <= 2025);
  await change(start, ''); await change(end, ''); await record('clear', { start: '', end: '' }, year => Number.isInteger(year));
  assert.equal(Object.hasOwn(scenarios.at(-1).filters, 'startYear'), false);
  assert.equal(Object.hasOwn(scenarios.at(-1).filters, 'endYear'), false);
  await writeFile(`${evidenceDir}/scenarios.json`, JSON.stringify({ baseUrl, options, scenarios }, null, 2));
  console.log(JSON.stringify({ outcome: 'PASS', scenarios: scenarios.map(s => s.name), evidenceDir }));
} catch (error) {
  await writeFile(`${evidenceDir}/failure.json`, JSON.stringify({ message: error.message, scenarios }, null, 2));
  throw error;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
