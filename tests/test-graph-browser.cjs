const fs = require('node:fs');
const path = require('node:path');

const playwrightRoot = process.env.PLAYWRIGHT_ROOT;
if (!playwrightRoot) throw new Error('PLAYWRIGHT_ROOT is required');
const { chromium } = require(path.join(playwrightRoot, 'playwright'));
let activeBrowser = null;

async function main() {
  const baseUrl = process.env.GRAPH_BASE_URL;
  const evidenceDir = process.env.GRAPH_EVIDENCE_DIR;
  const profileDir = process.env.GRAPH_BROWSER_PROFILE;
  if (!baseUrl || !evidenceDir || !profileDir) throw new Error('GRAPH_BASE_URL, GRAPH_EVIDENCE_DIR, and GRAPH_BROWSER_PROFILE are required');
  fs.mkdirSync(evidenceDir, { recursive: true });

  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1440, height: 960 },
  });
  activeBrowser = browser;
  const page = browser.pages()[0] || await browser.newPage();
  page.setDefaultTimeout(8_000);
  await page.addInitScript(() => localStorage.setItem('5e.tutorial.bannerSeen', 'true'));
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto(`${baseUrl}/preview/`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  console.log('loaded preview');
  const welcome = page.locator('.tut-banner-no');
  await welcome.waitFor({ state: 'visible' });
  await welcome.click();
  await page.locator('#graph-tool-open').click();
  console.log('clicked graph tool');
  await page.locator('#graph-modal-overlay:not([hidden])').waitFor();
  if (await welcome.count()) await welcome.click({ force: true });
  console.log('graph modal visible');

  const tickStarted = Date.now();
  await page.locator('#gm-xpos').fill('1000000');
  await page.locator('#gm-xpos').dispatchEvent('input');
  await page.locator('#gm-tickmode button').filter({ hasText: '배수' }).click();
  await page.locator('#gm-tickbase-x').fill('t');
  await page.locator('#gm-tickbase-x').dispatchEvent('input');
  console.log('million-tick input complete');
  const tickElapsedMs = Date.now() - tickStarted;
  const tickPreviewNodes = await page.locator('#gm-preview *').count();
  const tickBudgetNotice = await page.locator('#gm-tickbase-rows .gm-ax-note').textContent();

  await page.locator('#gm-xpos').fill('5');
  await page.locator('#gm-xpos').dispatchEvent('input');
  await page.locator('#gm-variant-sel button[data-variant="cross"]').click();
  await page.locator('#gm-xneg').fill('5');
  await page.locator('#gm-xneg').dispatchEvent('input');
  await page.locator('#gm-yneg').fill('5');
  await page.locator('#gm-yneg').dispatchEvent('input');

  await page.locator('#gm-tab-func-btn').click();
  await page.locator('#gm-add-series').click();
  await page.locator('#gm-dmin').fill('-1');
  await page.locator('#gm-dmax').fill('1');
  await page.locator('#gm-dmin').dispatchEvent('change');
  await page.locator('#gm-dmax').dispatchEvent('change');
  const functionScenarios = [];
  for (const expression of ['exp(x)', '1/x', 'sign(x)', 'floor(x)', 'ceil(x)', 'round(x)', 'sin(10*x)']) {
    await page.locator('#gm-expr').fill(expression);
    const paths = await page.locator('#gm-preview path').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('d') || ''));
    functionScenarios.push({
      expression,
      error: await page.locator('#gm-error').textContent(),
      pathCount: paths.length,
      maxMoveCount: Math.max(0, ...paths.map((value) => (value.match(/M /g) || []).length)),
      finitePaths: paths.every((value) => !/NaN|Infinity/.test(value)),
    });
  }
  await page.locator('#gm-expr').fill('sin(1600*pi*x)');
  console.log('high-frequency input complete');
  const samplingError = await page.locator('#gm-error').textContent();
  const modalNodes = await page.locator('#graph-modal-overlay *').count();
  const screenshot = path.join(evidenceDir, 'task-9-graph-browser.png');
  await page.screenshot({ path: screenshot, fullPage: true });

  const report = {
    browser: await page.evaluate(() => navigator.userAgent),
    url: page.url(),
    tickElapsedMs,
    tickPreviewNodes,
    tickBudgetNotice,
    samplingError,
    functionScenarios,
    modalNodes,
    pageErrors,
    pass: tickElapsedMs < 2000
      && tickPreviewNodes < 1000
      && /최대 160개/.test(tickBudgetNotice || '')
      && /4,000개/.test(samplingError || '')
      && functionScenarios.every((scenario) => !scenario.error && scenario.finitePaths && scenario.pathCount > 0)
      && functionScenarios.filter((scenario) => ['1/x', 'sign(x)', 'floor(x)', 'ceil(x)', 'round(x)'].includes(scenario.expression)).every((scenario) => scenario.maxMoveCount > 1)
      && pageErrors.length === 0,
  };
  fs.writeFileSync(path.join(evidenceDir, 'task-9-5e-160-release-remediation-error.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  activeBrowser = null;
  if (!report.pass) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error);
  if (activeBrowser) await activeBrowser.close();
  process.exitCode = 1;
});
