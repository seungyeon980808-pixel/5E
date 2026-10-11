const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

async function scenario(engine, origin, surface) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await h.navigate(page, new URL(surface + '?mode=pro&mobile=0&exam=0', origin).href);
    await h.ready(page);
    const runtime = h.runtime(page);
    const exportUrl = new URL('svg-export.js' + runtime.moduleQuery, runtime.mainUrl).href;
    const results = await page.evaluate(async exportUrl => {
      const { getContentBounds, rasterizeExportCanvas, buildExportSvg, ensureEmbeddedFonts } = await import(exportUrl);
      await ensureEmbeddedFonts(); await document.fonts.ready;
      const plane = { id: 'fit-plane', type: 'coordplane', x: -28, y: -14, w: 56, h: 28,
        xMin: 0, xMax: 3.5, yMin: 0, yMax: 1.4, gridStepX: 1, gridStepY: 1,
        showGrid: false, showTicks: true, showTickLabels: true, showAxisLines: true,
        showOrigin: true, labelOrigin: '0', labelX: 't', labelY: 'h', showAxisLabels: true,
        tickLabelSize: 3.5, axisLabelSize: 3.5, originLabelSize: 3.5, strokeWidth: .3, strokeLevel: 0, layerId: 1 };
      const curve = { id: 'fit-curve', type: 'funcgraph', planeId: plane.id,
        points: Array.from({ length: 121 }, (_, i) => ({ x: -28 + i * 48 / 120, y: 14 - 20 * Math.cos(Math.PI * i / 40) ** 2 })),
        curveStyle: 'smooth', strokeWidth: .4, strokeLevel: 0, area: { baseY: 14, level: 220 }, layerId: 1 };
      const cases = [
        ['axis-labels', [plane, curve]],
        ['rotated-axis', [{ ...plane, rotation: 31 }, curve]],
        ['offset-axis-label', [{ ...plane, labelY: 'height', labelYOffset: { dx: -8, dy: -3 } }, curve]],
        ['area-baseline', [{ ...curve, planeId: undefined, points: [{ x: -20, y: -10 }, { x: 0, y: -18 }, { x: 20, y: -10 }], area: { baseY: 18, level: 150 } }]],
      ];
      const results = [];
      for (const [name, objects] of cases) {
        const s = { artboard: { w: 160, h: 120 }, objects, layers: [{ id: 1, visible: true }, { id: 2, visible: false }] };
        const original = JSON.stringify(s);
        const bounds = getContentBounds(s);
        // Independently scan a generously sized PNG. All painted pixels in the
        // reference must fit inside the automatically cropped physical region.
        const { canvas } = await rasterizeExportCanvas(s, { dpi: 180 });
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if (pixels[i] >= 245 && pixels[i + 1] >= 245 && pixels[i + 2] >= 245) continue;
          left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
        const ink = { x: -80 + left * 160 / canvas.width, y: -60 + top * 120 / canvas.height,
          right: -80 + (right + 1) * 160 / canvas.width, bottom: -60 + (bottom + 1) * 120 / canvas.height };
        const padded = getContentBounds(s, {}, 2);
        const withHidden = getContentBounds({ ...s, objects: [...objects, { ...plane, id: 'hidden-plane', x: 1000, y: 1000, layerId: 2 }] });
        const manual = { x: -5, y: -4, w: 10, h: 8 };
        const manualViewBox = buildExportSvg(s, manual).getAttribute('viewBox');
        results.push({ name, bounds, ink, padded, withHidden, manualViewBox, unchanged: original === JSON.stringify(s),
          leakedMeasuringNodes: document.querySelectorAll('[data-export-measure]').length });
      }
      return results;
    }, exportUrl);
    for (const result of results) {
      const { bounds: b, ink: i, name } = result;
      const tolerance = .25;
      assert.ok(b.x <= i.x + tolerance && b.y <= i.y + tolerance && b.x + b.w >= i.right - tolerance && b.y + b.h >= i.bottom - tolerance,
        name + ': automatic export clips painted graph content: ' + JSON.stringify(result));
      assert.deepEqual(result.withHidden, b, name + ': hidden graph is excluded');
      assert.ok(Math.abs(result.padded.x - (b.x - 2)) < 1e-8 && Math.abs(result.padded.w - (b.w + 4)) < 1e-8);
      assert.equal(result.manualViewBox, '-5 -4 10 8', 'manual cropping keeps its explicit bounds');
      assert.equal(result.unchanged, true, 'export measurement never edits the document');
      assert.equal(result.leakedMeasuringNodes, 0);
    }
    assert.deepEqual(errors, []);
    console.log(engine.name() + ' ' + surface + ': axis labels, rotation, offset labels, area fill, hidden layer and manual crop passed');
  } finally { await browser.close(); }
}
(async () => h.withServer(async origin => {
  for (const engine of [chromium, webkit]) for (const surface of ['/', '/preview/']) await scenario(engine, origin, surface);
}))().catch(error => { console.error(error); process.exitCode = 1; });
