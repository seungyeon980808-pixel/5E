const assert = require("node:assert/strict");
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const previewUrl = process.env.PREVIEW_URL || "http://127.0.0.1:8794/preview/";

async function snapshot(page) {
  return page.evaluate(() => {
    const svg = document.querySelector("#canvas");
    const readout = document.querySelector("#zoom-readout");
    const artboard = document.querySelector("#scene > rect").getBoundingClientRect();
    const surface = document.querySelector(".panel-center").getBoundingClientRect();
    const controls = document.querySelector(".toolbar-inspector-controls");
    return {
      scale: svg.getScreenCTM().a,
      readout: Number.parseFloat(readout.textContent.match(/[\d.]+/)?.[0] || "NaN"),
      artboard: { x: artboard.x, y: artboard.y, width: artboard.width, height: artboard.height },
      surface: { x: surface.x, width: surface.width },
      controlsVisible: controls.getClientRects().length > 0,
    };
  });
}

async function toggleAndMeasure(page, side) {
  const panel = page.locator(`#panel-${side}`);
  const before = await snapshot(page);
  await page.locator(`.app-shell-header [data-panel-toggle="${side}"]`).click();
  await page.waitForTimeout(140);
  const middle = await snapshot(page);
  await page.waitForTimeout(220);
  return { before, middle, settled: await snapshot(page), panelHidden: await panel.evaluate(element => element.hidden) };
}

function assertRectNear(engine, label, actual, expected) {
  for (const key of ["x", "y", "width", "height"]) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 0.5,
      `${engine} ${label} artboard ${key} moved: ${actual[key]} vs ${expected[key]}`);
  }
}

(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const viewport of [{ width: 986, height: 800 }, { width: 1600, height: 1000 }]) {
        const label = `${engine.name()} ${viewport.width}px`;
        const page = await browser.newPage({ viewport });
        await page.goto(previewUrl);
        await page.getByRole("button", { name: "건너뛰기", exact: true }).click();
        const initial = await snapshot(page);
        const left = await toggleAndMeasure(page, "left");
        await page.locator('.app-shell-header [data-panel-toggle="left"]').click();
        await page.waitForTimeout(360);
        const right = await toggleAndMeasure(page, "right");

        if (process.env.PANEL_DEBUG) console.log(JSON.stringify({ viewport, initial, left, right }, null, 2));

        for (const [name, state] of [["initial", initial], ["left", left.settled], ["right", right.settled]]) {
          assert.ok(Math.abs(state.readout - state.scale) < 0.02,
            `${label} ${name} zoom readout ${state.readout} must match render scale ${state.scale}`);
        }
        assert.ok(Math.abs(left.settled.scale - initial.scale) < 0.01,
          `${label} left toggle changed canvas scale`);
        assert.ok(Math.abs(right.settled.scale - initial.scale) < 0.01,
          `${label} right toggle changed canvas scale`);
        for (const [side, result] of [["left", left], ["right", right]]) {
          assertRectNear(label, `${side} middle`, result.middle.artboard, result.before.artboard);
          assertRectNear(label, `${side} settled`, result.settled.artboard, result.before.artboard);
          assert.equal(result.middle.controlsVisible, true, `${label} ${side} middle controls disappeared`);
          assert.equal(result.settled.controlsVisible, true, `${label} ${side} settled controls disappeared`);
          assert.equal(result.panelHidden, true, `${label} ${side} panel must hide after its track closes`);
        }
        assert.ok(left.middle.surface.x < left.before.surface.x
          && left.middle.surface.x > left.settled.surface.x,
        `${label} left workspace must expand progressively toward the left`);
        assert.ok(right.middle.surface.width > right.before.surface.width
          && right.middle.surface.width < right.settled.surface.width,
        `${label} right workspace must expand progressively toward the right`);
        console.log(`${label}: canvas scale and symmetric panel motion passed`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
