const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const previewUrl = process.env.PREVIEW_URL || 'http://127.0.0.1:8794/preview/';
const presets = ['small', 'medium', 'large', 'wide'];
const tolerance = 0.5;

async function dismissWelcome(page) {
  const skip = page.getByRole('button', { name: '건너뛰기', exact: true });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function snapshot(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#canvas');
    const ruler = document.querySelector('#ruler-h');
    const artboard = document.querySelector('#scene > rect');
    const ctm = svg.getScreenCTM();
    const canvasRect = svg.getBoundingClientRect();
    const rulerRect = ruler.getBoundingClientRect();
    const artboardRect = artboard.getBoundingClientRect();
    const screenPoint = { x: canvasRect.left + canvasRect.width * 0.37, y: canvasRect.top + canvasRect.height * 0.63 };
    const point = svg.createSVGPoint();
    point.x = screenPoint.x;
    point.y = screenPoint.y;
    const world = point.matrixTransform(ctm.inverse());
    const roundTrip = world.matrixTransform(ctm);
    return {
      screenMidpointX: innerWidth / 2,
      canvasMidpointX: canvasRect.left + canvasRect.width / 2,
      artboardMidpointX: artboardRect.left + artboardRect.width / 2,
      originScreenX: ctm.e,
      ctm: { a: ctm.a, d: ctm.d, e: ctm.e, f: ctm.f },
      rulerCanvasDeltas: {
        left: rulerRect.left - canvasRect.left,
        right: rulerRect.right - canvasRect.right,
        width: rulerRect.width - canvasRect.width,
      },
      pointerRoundTripError: { x: roundTrip.x - screenPoint.x, y: roundTrip.y - screenPoint.y },
    };
  });
}

function assertNear(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${label}: ${actual} vs ${expected}`);
}

function assertProjection(before, after, label) {
  for (const key of ['a', 'd', 'e', 'f']) assertNear(after.ctm[key], before.ctm[key], `${label} CTM.${key}`);
  assertNear(after.artboardMidpointX, before.artboardMidpointX, `${label} artboard midpoint`);
}

function assertCentered(snapshotValue, label) {
  assertNear(snapshotValue.canvasMidpointX, snapshotValue.screenMidpointX, `${label} canvas midpoint`);
  assertNear(snapshotValue.artboardMidpointX, snapshotValue.screenMidpointX, `${label} artboard midpoint`);
  assertNear(snapshotValue.originScreenX, snapshotValue.screenMidpointX, `${label} origin screen X`);
  assert.deepEqual(snapshotValue.rulerCanvasDeltas, { left: 0, right: 0, width: 0 }, `${label} ruler/canvas bounds`);
  assertNear(snapshotValue.pointerRoundTripError.x, 0, `${label} pointer round-trip X`);
  assertNear(snapshotValue.pointerRoundTripError.y, 0, `${label} pointer round-trip Y`);
}

async function togglePanel(page, side) {
  await page.locator(`.app-shell-header [data-panel-toggle="${side}"]`).click();
  await page.waitForTimeout(360);
}

(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const page = await context.newPage();
      await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
      await page.goto(previewUrl, { waitUntil: 'networkidle' });
      await dismissWelcome(page);

      const baseline = await snapshot(page);
      assertCentered(baseline, `${engine.name()} visible rulers at 100%`);

      for (const preset of presets) {
        await page.evaluate(value => document.documentElement.setAttribute('data-screen', value), preset);
        await page.waitForTimeout(100);
        const afterPreset = await snapshot(page);
        assertProjection(baseline, afterPreset, `${engine.name()} ${preset} preset`);
        assertNear(afterPreset.pointerRoundTripError.x, 0, `${engine.name()} ${preset} pointer round-trip X`);
        assertNear(afterPreset.pointerRoundTripError.y, 0, `${engine.name()} ${preset} pointer round-trip Y`);
      }
      await page.evaluate(() => document.documentElement.setAttribute('data-screen', 'large'));
      await page.waitForTimeout(100);

      const beforePanels = await snapshot(page);
      await togglePanel(page, 'right');
      assertProjection(beforePanels, await snapshot(page), `${engine.name()} right collapse`);
      await togglePanel(page, 'right');
      await togglePanel(page, 'left');
      assertProjection(beforePanels, await snapshot(page), `${engine.name()} left collapse`);
      await togglePanel(page, 'left');

      await page.evaluate(() => document.querySelector('#ruler-container').classList.add('rulers-hidden'));
      await page.waitForTimeout(100);
      assertProjection(beforePanels, await snapshot(page), `${engine.name()} rulers hidden`);

      await context.close();
      console.log(`${engine.name()}: visible centering, presets, panel transitions, ruler hiding, and native hit mapping passed`);
    } finally {
      await browser.close();
    }
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
