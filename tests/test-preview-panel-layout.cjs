const assert = require("node:assert/strict");
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const previewUrl = process.env.PREVIEW_URL || "http://127.0.0.1:8794/preview/";

function numberFromTransform(transform) {
  const match = /translate3d\((-?[\d.]+)px/.exec(transform || "");
  return match ? Number(match[1]) : Number.NaN;
}

async function snapshot(page) {
  return page.evaluate(() => {
    const svg = document.querySelector("#canvas");
    const readout = document.querySelector("#zoom-readout");
    return {
      scale: svg.getScreenCTM().a,
      readout: Number.parseFloat(readout.textContent.match(/[\d.]+/)?.[0] || "NaN"),
    };
  });
}

async function toggleAndMeasure(page, side) {
  const panel = page.locator(`#panel-${side}`);
  const width = await panel.evaluate(element => element.offsetWidth);
  await page.locator(`.app-shell-header [data-panel-toggle="${side}"]`).click();
  const motion = await panel.evaluate(element => {
    const animation = element.getAnimations()[0];
    const frames = animation?.effect?.getKeyframes() || [];
    return {
      duration: animation?.effect?.getTiming().duration,
      first: frames[0]?.transform || "",
      last: frames.at(-1)?.transform || "",
    };
  });
  await page.waitForTimeout(360);
  return { width, motion, settled: await snapshot(page) };
}

(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      await page.goto(previewUrl);
      await page.getByRole("button", { name: "건너뛰기", exact: true }).click();
      const initial = await snapshot(page);
      const left = await toggleAndMeasure(page, "left");
      await page.locator('.app-shell-header [data-panel-toggle="left"]').click();
      await page.waitForTimeout(360);
      const right = await toggleAndMeasure(page, "right");

      if (process.env.PANEL_DEBUG) console.log(JSON.stringify({ initial, left, right }, null, 2));

      for (const [name, state] of [["initial", initial], ["left", left.settled], ["right", right.settled]]) {
        assert.ok(Math.abs(state.readout - state.scale) < 0.02,
          `${engine.name()} ${name} zoom readout ${state.readout} must match render scale ${state.scale}`);
      }
      assert.ok(Math.abs(left.settled.scale - initial.scale) < 0.01,
        `${engine.name()} left toggle changed canvas scale`);
      assert.ok(Math.abs(right.settled.scale - initial.scale) < 0.01,
        `${engine.name()} right toggle changed canvas scale`);
      assert.equal(left.motion.duration, right.motion.duration,
        `${engine.name()} panel durations must match`);
      assert.ok(Math.abs(numberFromTransform(left.motion.first)) < 1,
        `${engine.name()} left panel must start at its live position: ${left.motion.first}`);
      assert.ok(Math.abs(numberFromTransform(right.motion.first)) < 1,
        `${engine.name()} right panel must start at its live position: ${right.motion.first}`);
      assert.ok(numberFromTransform(left.motion.last) < -left.width * 0.95,
        `${engine.name()} left panel must exit left: ${left.motion.last}`);
      assert.ok(numberFromTransform(right.motion.last) > right.width * 0.95,
        `${engine.name()} right panel must exit right: ${right.motion.last}`);
      console.log(`${engine.name()}: canvas scale and symmetric panel motion passed`);
    } finally {
      await browser.close();
    }
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
