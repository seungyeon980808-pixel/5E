const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const h = require('./helpers/rhwp-exam.cjs');

h.withServer(async origin => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try { for (const surface of ['/', '/preview/']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await h.navigate(page, new URL(surface + '?mode=pro&mobile=0&exam=0', origin).href);
      await h.ready(page);
      const spacing = await page.evaluate(async () => {
        const { measureFormula, renderFormula } = await import('/js/formula.js?v=1.7.0-four-session-integration');
        const F = 10, width = source => measureFormula(source, F).w;
        const visible = source => renderFormula({ source, fontSize: F, x: 0, y: 0 }).textContent;
        return {
          quad: width('a\\quad b') - width('a{}b'),
          qquad: width('a\\qquad b') - width('a{}b'),
          repeated: width('a\\quad\\qquad b') - width('a{}b'),
          fraction: width('\\frac{a\\quad b}{c}') - width('\\frac{a{}b}{c}'),
          literal: visible('quad qquad'),
          rendered: visible('F=ma,\\quad v=\\frac{\\Delta x}{\\Delta t}'),
        };
      });
      assert.ok(Math.abs(spacing.quad - 10) < 1e-8, 'quad must advance one em, with its delimiter space consumed');
      assert.ok(Math.abs(spacing.qquad - 20) < 1e-8, 'qquad must advance two em');
      assert.ok(Math.abs(spacing.repeated - 30) < 1e-8, 'adjacent spacing commands accumulate');
      assert.ok(spacing.fraction > 0 && spacing.fraction <= 10, 'spacing works in a smaller fraction row');
      assert.ok(spacing.literal.includes('quad') && spacing.literal.includes('qquad'), 'bare words retain literal text');
      assert.ok(!spacing.rendered.includes('quad') && spacing.rendered.includes('Δ'), 'canvas/export renderer retains symbols without command letters');

      const { stateUrl } = h.runtime(page);
      await page.locator('#canvas').click({ position: { x: 650, y: 350 } });
      await page.keyboard.press('t');
      await page.locator('#canvas').click({ position: { x: 650, y: 350 } });
      const editor = page.locator('.unified-text-editor');
      await editor.waitFor({ state: 'visible' });
      const source = editor.locator('textarea');
      await source.press('Tab');
      const input = 'F=ma,\\quad v=\\frac{\\Delta x}{\\Delta t}';
      await source.fill(input);
      await page.waitForFunction(() => {
        const p = document.querySelector('.unified-preview');
        return p?.textContent.includes('Δ') && !p.textContent.includes('quad');
      });
      await editor.getByRole('button', { name: '확인', exact: true }).click();
      const read = () => page.evaluate(async stateUrl => {
        const { state } = await import(stateUrl);
        return state.get().objects.filter(o => o.type === 'formula');
      }, stateUrl);
      const formulas = await read();
      assert.ok(formulas.at(-1)?.source.includes('\\quad') && formulas.at(-1).source.includes('\\frac'),
        'confirmation retains editable spacing and fraction commands');
      assert.ok(!(await page.locator('#canvas').textContent()).includes('quad'), 'committed canvas matches the preview');
      await page.keyboard.press('Meta+z');
      assert.equal((await read()).length, formulas.length - 1, 'one undo removes the formula');
      await page.keyboard.press('Meta+Shift+z');
      assert.deepEqual(await read(), formulas, 'redo restores spacing and fraction source');
      const formula = page.locator(`#canvas g[data-id="${formulas.at(-1).id}"]`);
      await formula.dblclick();
      await source.fill('x\\qquad y');
      await source.press('Escape');
      assert.deepEqual(await read(), formulas, 'cancelled re-edit preserves the original formula');
      assert.deepEqual(errors, []);
      console.log(`${engine.name()} ${surface}: spacing, fraction, literal words, real editor, canvas, undo/redo and cancel PASS`);
      await page.close();
    }} finally { await browser.close(); }
  }
}).catch(error => { console.error(error); process.exitCode = 1; });
