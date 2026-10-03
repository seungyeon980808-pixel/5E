const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const base = process.env.PREVIEW_URL;
if (!base) throw new Error("PREVIEW_URL is required");

async function twoFrames(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

function projectObject(project, id) {
  for (const page of project.pages || []) {
    const object = (page.objects || []).find((candidate) => candidate.id === id);
    if (object) return object;
  }
  return null;
}

function assertPointClose(actual, expected, message) {
  assert.equal(actual.length, 2, message);
  assert.ok(Math.abs(actual[0] - expected[0]) < 1e-9 && Math.abs(actual[1] - expected[1]) < 1e-9, message);
}

async function exportDownload(page, format, filename) {
  await page.locator("#file-menu-btn").click();
  await page.locator("#image-export").click();
  await page.locator(`#export-format [data-format="${format}"]`).click();
  await page.locator("#export-filename").fill(filename);
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-confirm").click();
  return downloadPromise;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  try {
    await context.addInitScript(() => {
      localStorage.setItem("5e.preview:5e.tutorial.bannerSeen", "true");
      localStorage.setItem("5e.tutorial.bannerSeen", "true");
      Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined });
      Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: undefined });
    });
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on("pageerror", (error) => runtimeErrors.push(String(error)));
    await page.goto(`${base}?mode=pro&mobile=0`, { waitUntil: "networkidle" });
    await page.locator("#canvas").waitFor({ state: "visible" });
    await page.evaluate(async () => {
      const { state } = await import("./js/state.js?v=1.6.0-remediation-0929");
      state.update((s) => {
        s.objects = [{
          id: "scale-resistor",
          type: "circuit",
          element: "resistor",
          p1: { x: -3, y: -2 },
          p2: { x: 3, y: 2 },
          height: 3.2,
          bodyScale: 1,
          strokeWidth: 0.2,
          layerId: 1,
        }];
        s.selectedIds = ["scale-resistor"];
      });
    });
    await twoFrames(page);

    const body = page.locator('#scene > g[data-id="scale-resistor"]');
    await body.waitFor({ state: "attached" });
    const before = await body.evaluate((node) => node.outerHTML);
    const row = page.locator(".insp-row:visible").filter({
      has: page.locator("label.insp-field-label", { hasText: /^소자 크기$/ }),
    }).last();
    const input = row.locator('input[type="number"]');
    await input.fill("1.6");
    await input.press("Enter");
    await input.blur();
    await page.waitForFunction(() => import("./js/state.js?v=1.6.0-remediation-0929").then(({ state }) => state.get().objects[0].bodyScale === 1.6));
    await twoFrames(page);
    const after = await body.evaluate((node) => node.outerHTML);
    assert.notEqual(after, before, "short resistor bodyScale 1→1.6 must change rendered geometry");

    const geometry = await page.evaluate(async () => {
      const { renderCircuit } = await import("./js/render/circuit.js?v=1.6.0-preview-labeler-0917-1111");
      const read = (element, bodyScale) => {
        const node = renderCircuit({
          id: `${element}-${bodyScale}`,
          type: "circuit",
          element,
          p1: { x: -3, y: -2 },
          p2: { x: 3, y: 2 },
          height: 3.2,
          bodyScale,
          strokeWidth: 0.2,
          layerId: 1,
        });
        return { bodyScale, html: node.outerHTML };
      };
      return {
        resistor: [0.6, 1, 1.6].map((scale) => read("resistor", scale)),
        capacitor: [0.6, 1, 1.6].map((scale) => read("capacitor", scale)),
        inductor: [0.6, 1, 1.6].map((scale) => read("inductor", scale)),
      };
    });
    for (const [kind, samples] of Object.entries(geometry)) {
      assert.equal(new Set(samples.map((sample) => sample.html)).size, 3, `${kind} must render distinct geometry at 0.6/1/1.6`);
    }

    const resistorPoints = await body.locator("polyline").getAttribute("points");
    const terminals = resistorPoints.trim().split(/\s+/).map((pair) => pair.split(",").map(Number));
    assertPointClose(terminals[0], [-3, -2], "resistor body must remain attached to p1");
    assertPointClose(terminals.at(-1), [3, 2], "resistor body must remain attached to p2");

    await page.locator("#file-menu-btn").click();
    await page.locator("#project-save").click();
    const saveDialog = page.locator(".modal-overlay:not([hidden])").last();
    await saveDialog.locator(".modal-input").fill("circuit-scale-roundtrip");
    const savePromise = page.waitForEvent("download");
    await saveDialog.getByRole("button", { name: "저장", exact: true }).click();
    const savedDownload = await savePromise;
    const savedPath = await savedDownload.path();
    const savedProject = JSON.parse(fs.readFileSync(savedPath, "utf8"));
    assert.equal(projectObject(savedProject, "scale-resistor")?.bodyScale, 1.6, "project save must retain bodyScale");

    const reopened = await context.newPage();
    reopened.on("pageerror", (error) => runtimeErrors.push(String(error)));
    await reopened.goto(`${base}?mode=pro&mobile=0`, { waitUntil: "networkidle" });
    await reopened.locator("#canvas").waitFor({ state: "visible" });
    await reopened.locator("#file-menu-btn").click();
    const chooserPromise = reopened.waitForEvent("filechooser");
    await reopened.locator("#project-open").click();
    const chooser = await chooserPromise;
    await chooser.setFiles(savedPath);
    await reopened.getByRole("button", { name: "열기", exact: true }).click();
    await reopened.waitForFunction(() => import("./js/state.js?v=1.6.0-remediation-0929").then(({ state }) => {
      const object = state.get().objects.find((candidate) => candidate.id === "scale-resistor");
      return object?.bodyScale === 1.6;
    }));
    await twoFrames(reopened);
    const reopenedPoints = await reopened.locator('#scene > g[data-id="scale-resistor"] polyline').getAttribute("points");
    assert.equal(reopenedPoints, resistorPoints, "reopened project must reproduce the scaled resistor geometry");

    const svgDownload = await exportDownload(reopened, "svg", "circuit-scale-1-6");
    const svgPath = await svgDownload.path();
    const svg = fs.readFileSync(svgPath, "utf8");
    assert.match(svg, /data-id="scale-resistor"/, "SVG export must include the scaled resistor");
    assert.ok(svg.includes(resistorPoints), "SVG export must retain the scaled resistor points");

    const pngDownload = await exportDownload(reopened, "png", "circuit-scale-1-6");
    const pngPath = await pngDownload.path();
    const png = fs.readFileSync(pngPath);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "PNG export must produce PNG bytes");
    assert.ok(png.length > 1000, "PNG export must contain rendered image data");

    const evidence = process.env.EVIDENCE_DIR;
    if (evidence) {
      fs.mkdirSync(evidence, { recursive: true });
      fs.copyFileSync(savedPath, path.join(evidence, "circuit-scale-roundtrip.5e"));
      fs.copyFileSync(svgPath, path.join(evidence, "circuit-scale-1-6.svg"));
      fs.copyFileSync(pngPath, path.join(evidence, "circuit-scale-1-6.png"));
      await reopened.screenshot({ path: path.join(evidence, "circuit-scale-reopened.png"), fullPage: true });
    }
    assert.deepEqual(runtimeErrors, [], "circuit scaling and round-trip must not raise browser runtime errors");

    console.log(JSON.stringify({
      passed: true,
      uiChanged: true,
      roundTripBodyScale: projectObject(savedProject, "scale-resistor").bodyScale,
      distinctGeometryScales: Object.fromEntries(Object.entries(geometry).map(([kind, samples]) => [kind, samples.map(({ bodyScale }) => bodyScale)])),
      exports: { svgBytes: Buffer.byteLength(svg), pngBytes: png.length },
    }));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
