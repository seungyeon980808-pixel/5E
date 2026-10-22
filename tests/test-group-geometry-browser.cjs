const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

async function scenario(engine, origin, surface) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await h.navigate(page, new URL(surface + '?mode=pro&mobile=0&exam=0', origin).href); await h.ready(page);
    const { stateUrl } = h.runtime(page);
    const field = label => page.locator('.insp-section-geometry .insp-row').filter({
      has: page.locator('label.insp-field-label', { hasText: new RegExp('^' + label + '$') }),
    }).locator('input');
    const commit = async (label, value) => { await field(label).fill(String(value)); await field(label).press('Enter'); };
    const read = async () => (await h.drawing(page, stateUrl)).objects;
    const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-5, message + ': ' + a + ' != ' + b);
    const seed = async locked => page.evaluate(async ({ stateUrl, locked }) => {
      const { state } = await import(stateUrl); const layerId = state.get().activeLayerId;
      const plane = { id: 'group-plane', type: 'coordplane', x: -28, y: -14, w: 56, h: 28,
        rotation: 0, xMin: 0, xMax: 3.5, yMin: 0, yMax: 1.4,
        showGrid: false, showTicks: true, showAxisLabels: true, labelX: 't', labelY: 'h',
        strokeWidth: .3, strokeLevel: 0, layerId };
      const curve = { id: 'group-curve', type: 'funcgraph', planeId: plane.id,
        points: Array.from({ length: 121 }, (_, i) => ({ x: -28 + i * 48 / 120, y: 14 - 20 * Math.cos(Math.PI * i / 40) ** 2 })),
        strokeWidth: .4, strokeLevel: 0, curveStyle: 'straight', area: { baseY: 14, level: 220 },
        guideSegs: [[{ x: -12, y: -6 }, { x: -12, y: 14 }]], markers: [{ x: -12, y: -6 }], layerId };
      const text = { id: 'group-label', type: 'text', x: 3, y: -8, text: '묶음 검수', fontSize: 3,
        rotation: 0, fillLevel: 0, layerId, locked: !!locked };
      state.update(s => { s.objects = [plane, curve, text]; s.selectedIds = s.objects.map(o => o.id); s.undoStack = []; s.redoStack = []; });
    }, { stateUrl, locked });
    await seed(false); await page.keyboard.press('g');
    const original = await read();
    const pivot = { x: Number(await field('X').inputValue()), y: -Number(await field('Y').inputValue()) };
    const rot = p => { const a = Math.PI / 6, dx = p.x - pivot.x, dy = p.y - pivot.y;
      return { x: pivot.x + dx * Math.cos(a) - dy * Math.sin(a), y: pivot.y + dx * Math.sin(a) + dy * Math.cos(a) }; };
    await commit('회전', 30); const turned = await read();
    near(turned[0].rotation, 30, 'axis rotation');
    for (let i = 0; i < original[1].points.length; i++) {
      const expected = rot(original[1].points[i]); near(turned[1].points[i].x, expected.x, 'curve x'); near(turned[1].points[i].y, expected.y, 'curve y');
    }
    const expectedLabel = rot(original[2]); near(turned[2].x, expectedLabel.x, 'label x'); near(turned[2].y, expectedLabel.y, 'label y');
    near(turned[2].rotation, 30, 'label rotation');
    near(Number(await field('회전').inputValue()), 30, 'displayed group rotation');
    const fill = await page.locator('#canvas [data-id="group-curve"] path[fill="#dcdcdc"]').evaluate(el => ({
      d: el.getAttribute('d'), matrix: Array.from(['a','b','c','d','e','f'], key => el.ownerSVGElement.getCTM().inverse().multiply(el.getCTM())[key]),
    }));
    assert.ok(fill.d.length > 20, 'rotated shading still exists');
    // A shaded baseline is carried by its own affine frame: both end points
    // must rotate, rather than becoming a new horizontal baseline.
    assert.ok(Math.abs(turned[1].area.frame?.[1] - .5) < 1e-5, 'shading baseline follows the rotation');
    assert.ok(Math.abs(fill.matrix[1]) > .1, 'the rendered fill follows the saved affine frame');
    const first = fill.d.match(/^M ([^ ]+) ([^ ]+)/).slice(1).map(Number);
    const baseline = rot({ x: original[1].points[0].x, y: original[1].area.baseY });
    near(fill.matrix[0] * first[0] + fill.matrix[2] * first[1] + fill.matrix[4], baseline.x, 'painted baseline x');
    near(fill.matrix[1] * first[0] + fill.matrix[3] * first[1] + fill.matrix[5], baseline.y, 'painted baseline y');
    assert.equal(await field('길이').first().isVisible(), false, 'irrelevant per-object rows stay hidden for groups');
    await page.keyboard.press('Meta+z'); assert.deepEqual(await read(), original);
    await page.keyboard.press('Meta+Shift+z'); assert.deepEqual(await read(), turned);
    await page.keyboard.press('Meta+z');
    await commit('X', pivot.x + 5); const moved = await read();
    for (let i = 0; i < original[1].points.length; i++) near(moved[1].points[i].x, original[1].points[i].x + 5, 'numeric group translation');
    near(moved[2].x, original[2].x + 5, 'label translation');
    await page.keyboard.press('Meta+z');
    const width = Number(await field('W').inputValue()); await commit('W', width * 1.5);
    const resized = await read(); near(resized[0].w, original[0].w * 1.5, 'group axis size');
    near(resized[2].fontSize, original[2].fontSize * 1.5, 'group label size');
    near(resized[1].points[120].x - resized[1].points[0].x, 72, 'group curve size');
    await page.keyboard.press('Meta+z'); assert.deepEqual(await read(), original);
    await page.keyboard.press('r'); await page.keyboard.press('Shift+PageUp');
    const keyboardRotated = await read(); assert.ok(keyboardRotated[1].area.frame, 'keyboard group rotation also carries shading');
    assert.notDeepEqual(keyboardRotated[1].guideSegs, original[1].guideSegs, 'keyboard rotation carries graph guides');
    await page.evaluate(async stateUrl => { const { state } = await import(stateUrl); state.update(s => { s.objects.find(o => o.id === 'group-label').locked = true; }); }, stateUrl);
    assert.equal(await field('회전').isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log(engine.name() + ' ' + surface + ': group numeric rotation/move/size, shaded baseline, labels, guides, undo/redo and locks passed');
  } finally { await browser.close(); }
}
(async () => h.withServer(async origin => {
  for (const engine of [chromium,webkit].filter(e=>!process.env.BROWSER_ENGINE||e.name()===process.env.BROWSER_ENGINE)) for (const surface of ['/', '/preview/']) await scenario(engine, origin, surface);
}))().catch(error => { console.error(error); process.exitCode = 1; });
