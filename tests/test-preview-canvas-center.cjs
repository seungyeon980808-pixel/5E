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
      rulerVisible: getComputedStyle(ruler).display !== 'none',
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

function assertAligned(snapshotValue, expectedOffsetMm, rulersVisible, label) {
  const expectedProjectionX = snapshotValue.canvasMidpointX + expectedOffsetMm * snapshotValue.ctm.a;
  assertNear(snapshotValue.artboardMidpointX, expectedProjectionX, `${label} artboard midpoint`);
  assertNear(snapshotValue.originScreenX, expectedProjectionX, `${label} origin screen X`);
  assert.equal(snapshotValue.rulerVisible, rulersVisible, `${label} ruler visibility`);
  if (rulersVisible) {
    assert.deepEqual(snapshotValue.rulerCanvasDeltas, { left: 0, right: 0, width: 0 }, `${label} ruler/canvas bounds`);
  }
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
      const separator = previewUrl.includes('?') ? '&' : '?';
      await page.goto(`${previewUrl}${separator}mode=pro`, { waitUntil: 'networkidle' });
      await dismissWelcome(page);

      const baseline = await snapshot(page);
      assertAligned(baseline, 0, true, `${engine.name()} Pro coordinate lock centers the origin`);
      assert.equal(await page.locator('#center-view-btn').getAttribute('data-mode'), 'coordinate');
      await page.locator('#canvas').hover();
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(100);
      assertProjection(baseline, await snapshot(page), `${engine.name()} default lock blocks wheel panning`);

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

      await page.click('#center-view-btn');
      await page.click('[data-canvas-lock-mode="free"]');
      const beforeFreePan = await snapshot(page);
      await page.locator('#canvas').hover();
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(100);
      assert.ok(Math.abs((await snapshot(page)).ctm.f - beforeFreePan.ctm.f) > 1, 'free mode remains available');

      const lite = await context.newPage();
      await lite.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
      await lite.goto(`${previewUrl}${separator}mode=lite`, { waitUntil: 'networkidle' });
      await dismissWelcome(lite);
      assertAligned(await snapshot(lite), 0, false, `${engine.name()} Lite centered projection`);
      await lite.close();

      await context.close();
      console.log(`${engine.name()}: default coordinate lock, optional free pan, Lite centering, panel transitions, rulers, and native hit mapping passed`);
    } finally {
      await browser.close();
    }
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
