const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const h = require('./helpers/rhwp-exam.cjs');
const output = path.resolve('_work/overnight-qa/nqa020-browser');
fs.mkdirSync(output, { recursive: true });

h.withServer(async origin => {
  for (const engine of [chromium,webkit].filter(e=>!process.env.BROWSER_ENGINE||e.name()===process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch();
    try { for (const surface of ['/', '/preview/']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await h.navigate(page, new URL(surface + '?mode=pro&mobile=0&exam=0', origin).href);
      await h.ready(page);
      await page.locator('#graph-tool-open').click();
      await page.locator('#graph-modal-overlay').waitFor({ state: 'visible' });
      await page.locator('#gm-bounds-on').check();
      for (const [axis, min, max] of [['x', '-3', '3'], ['y', '-2', '4']]) {
        await page.locator(`#gm-exact-${axis}-min`).fill(min);
        await page.locator(`#gm-exact-${axis}-max`).fill(max);
      }
      await page.locator('#gm-tab-func-btn').click();
      await page.locator('#gm-add-series').click();
      for (const expression of ['sqrt(x)', 'ln(x)', 'asin(x)', 'sqrt(1-x^2)', 'sqrt(x^2-1)']) {
        await page.locator('#gm-expr').fill(expression);
        await page.waitForFunction(() => !document.querySelector('#gm-error').textContent.trim());
        const paths = await page.locator('#gm-preview [data-preview-series="0"] path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d') || ''));
        assert.ok(paths.length > 0 && paths.every(d => !/NaN|Infinity/.test(d)), expression);
      }
      await page.locator('#gm-dmin').fill('-1');
      await page.locator('#gm-dmax').fill('1');
      await page.locator('#gm-expr').fill('sin(1600*pi*x)');
      await page.waitForFunction(() => /4,000/.test(document.querySelector('#gm-error').textContent));
      await page.locator('#gm-dmin').fill('');
      await page.locator('#gm-dmax').fill('');
      await page.locator('#gm-expr').fill('sqrt(x)');
      await page.waitForFunction(() => !document.querySelector('#gm-error').textContent.trim());
      await page.screenshot({ path: path.join(output, `${engine.name()}-${surface === '/' ? 'root' : 'preview'}.png`) });
      await page.locator('#gm-confirm').click();
      const { stateUrl } = h.runtime(page);
      const read = () => page.evaluate(async url => JSON.parse(JSON.stringify((await import(url)).state.get().objects)), stateUrl);
      const objects = await read();
      const curve = objects.find(o => o.type === 'funcgraph');
      assert.equal(curve.expr, 'sqrt(x)');
      assert.ok(curve.points.length >= 2 && curve.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
      await page.keyboard.press('Meta+z');
      assert.equal((await read()).filter(o => o.type === 'funcgraph').length, 0);
      await page.keyboard.press('Meta+Shift+z');
      assert.deepEqual(await read(), objects);
      await page.evaluate(async url => {
        const { state } = await import(url), io = await import(new URL('project-io.js?v=1.7.0-four-session-integration', url).href);
        io.applyLoaded(state, structuredClone(io.serialize(state.get())));
      }, stateUrl);
      const restored = await read();
      assert.equal(restored.length, objects.length);
      for (const before of objects) {
        const after = restored.find(o => o.id === before.id);
        for (const key of Object.keys(before)) assert.deepEqual(after[key], before[key], `saved ${before.type}.${key}`);
      }
      assert.deepEqual(errors, []);
      console.log(`${engine.name()} ${surface}: partial domains, budget guard, insertion, undo/redo and serialization PASS`);
      await page.close();
    }} finally { await browser.close(); }
  }
}).catch(error => { console.error(error); process.exitCode = 1; });
