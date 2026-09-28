const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(__dirname, 'test-ai-workspace-lifecycle-browser.cjs'), 'utf8');
const harness = source.slice(source.indexOf('function seedRequestWorkspaces('), source.indexOf('\nfor (const count of [1, 10, 30])'));
const fixture = new Function('require', 'root', 'fs', 'path', 'assert', 'chromium', 'webkit', harness + ';return requestBrowserFixture;')(require, root, fs, path, assert, chromium, webkit);
for (const engine of ['chromium', 'webkit']) {
  test(`${engine}: comparison aligns images and keeps controls beside their context`, { timeout: 90000 }, async t => {
    process.env.TASK2_ENGINE = engine;
    const evidence = path.join(root, '.omo/evidence/ai-followup-0928/layout', process.env.QA_PHASE || 'green', engine);
    fs.mkdirSync(evidence, { recursive: true });
    const { page, errors } = await fixture(t, 2, evidence);
    const panel = '#ai-image-panel';
    await page.click(`${panel} [data-ai-layout-mode="side-by-side"]`);
    async function geometry(name) {
      await page.waitForFunction(() => [...document.querySelectorAll('#ai-image-panel .ai-image-card:not([hidden]) .ai-preview-stage > img')].every(img => img.complete));
      const result = await page.evaluate(() => {
        const panel = document.querySelector('#ai-image-panel');
        const rect = selector => { const r = panel.querySelector(selector).getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; };
        return { source:rect('.is-ai-active-source .ai-preview-stage'), result:rect('.is-ai-active-candidate .ai-preview-stage'),
          title:rect('.ai-result-pane .ai-pane-metadata > strong'), picker:rect('[data-ai-version-button]') };
      });
      fs.writeFileSync(path.join(evidence, `${name}.json`), JSON.stringify(result, null, 2));
      await page.screenshot({ path:path.join(evidence, `${name}.png`) });
      assert.ok(Math.abs(result.source.y - result.result.y) <= 1, JSON.stringify(result));
      assert.ok(Math.abs(result.source.height - result.result.height) <= 1, JSON.stringify(result));
      assert.ok(result.picker.x - (result.title.x + result.title.width) < 15, 'revision picker sits immediately beside its heading');
    }
    await geometry('same-ratio');
    assert.equal(await page.locator(`${panel} [data-ai-capture]`).count(), 0);
    assert.equal(await page.locator(`${panel} .ai-conversation [data-ai-comment-visibility]`).count(), 1);
    await page.click(`${panel} [data-ai-comment-visibility]`);
    assert.equal(await page.locator(panel).getAttribute('data-ai-comments-visible'), 'false');
    // A portrait result must keep its own proportions while sharing the reference's displayed height.
    await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 500;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,300,500); ctx.fillStyle = '#222'; ctx.fillRect(30,40,240,420);
      document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img').src = canvas.toDataURL();
    });
    await page.waitForFunction(() => document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img').naturalWidth === 300);
    await page.click(`${panel} [data-ai-zoom-action="fit"]`);
    await geometry('different-ratio');
    const ratio = await page.locator(`${panel} .is-ai-active-candidate .ai-preview-stage`).evaluate(node => node.clientWidth / node.clientHeight);
    assert.ok(Math.abs(ratio - 0.6) < 0.01, 'result is not stretched or letterboxed to source ratio');
    assert.deepEqual(errors, []);
  });
}
