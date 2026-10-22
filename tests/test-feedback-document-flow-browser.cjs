const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const stateUrl = '/js/state.js?v=1.7.0-four-session-integration';
const bridgeUrl = '/js/rhwp-exam-bridge.js?v=1.7.0-four-session-integration';
const evidence = path.resolve('_work/feedback/document-flow');

async function observeBridge(page) {
  await page.evaluate(async url => {
    const { RhwpExamBridge } = await import(url), frame = document.querySelector('#exam-studio iframe');
    window.feedbackBridge = Object.assign(Object.create(RhwpExamBridge.prototype), {
      editor: { element: frame }, deps: frame.contentWindow.rhwpStudio.plugins.deps,
    });
  }, bridgeUrl);
}
async function openSource(page) {
  await page.locator('.exam-figure').first().click(); await h.idle(page);
  await page.locator('[data-picture-modify]').click();
  await page.locator('[data-exam-action="edit"]').click();
  await page.locator('#exam-source-region').waitFor({ state: 'visible' }); await h.idle(page);
}

h.withServer(async origin => {
  fs.mkdirSync(evidence, { recursive: true });
  for (const [name, type] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) {
    const browser = await type.launch(), page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=1'); await h.ready(page);
      await h.action(page, 'demo'); await h.idle(page); await observeBridge(page);
      await page.evaluate(() => {
        const b = feedbackBridge, w = b.wasm;
        for (let i = 0; i < 70; i++) {
          w.splitParagraph(0, 0, 0, null);
          w.insertText(0, 0, 0, `${i + 1}. 그림의 앞에 있는 본문입니다. `.repeat(8));
        }
        b.deps.eventBus.emit('document-changed');
      });
      const download = page.waitForEvent('download'); await h.action(page, 'export-hwp');
      const file = await download, target = path.join(evidence, name + '.hwp'); await file.saveAs(target); await h.idle(page);
      await h.action(page, 'new'); await h.idle(page); await h.nativeOpen(page, target); await observeBridge(page);
      const original = await page.evaluate(() => {
        const b = feedbackBridge, picture = b.documentPictures()[0];
        return { id: picture.id, page: picture.ref.pageIndex, props: b.properties(picture.ref) };
      });
      assert.ok(original.page > 0, 'real imported HWP picture is beyond the first page');
      await openSource(page);
      await page.evaluate(async url => { const { state } = await import(url); state.update(s => { s.objects[0].strokeWidth = .6; }); }, stateUrl);
      await page.locator('[data-source-apply]').click(); await h.idle(page);
      const returned = await page.evaluate(() => {
        const b = feedbackBridge; b.picturesCache = null;
        const p = b.documentPictures()[0], g = b.figureGeometry(p.ref), v = b.figureViewport();
        return { id: p.id, page: p.ref.pageIndex, props: b.properties(p.ref), selected: b.selectedFigureId(), g, v };
      });
      assert.notEqual(returned.id, original.id, 'source revision replaced');
      assert.equal(returned.page, original.page, 'return follows the actual picture page');
      assert.equal(returned.selected, returned.id, 'updated picture remains selected');
      assert.ok(returned.g && returned.g.y < returned.v.y + returned.v.h && returned.g.y + returned.g.h > returned.v.y, 'returned picture is visible');
      for (const key of ['width', 'height', 'treatAsChar']) assert.equal(returned.props[key], original.props[key], key + ' preserved');
      await page.screenshot({ path: path.join(evidence, name + '-returned.png') });
      await openSource(page);
      await page.evaluate(async url => {
        const { state } = await import(url), { addPage } = await import('/js/pages.js?v=1.7.0-four-session-integration');
        addPage(state); state.update(s => { s.objects = [{ id: 'new-tab-line', type: 'line', p1: { x: -10, y: -10 }, p2: { x: 10, y: 10 }, strokeWidth: .3, strokeLevel: 0, layerId: 1, order: 0 }]; });
      }, stateUrl);
      await page.locator('#exam-source-region').waitFor({ state: 'hidden', timeout: 3000 });
      assert.equal(await page.locator('#exam-source-region').isVisible(), false, 'source region cannot leak into another tab');
      await h.crop(page); await h.idle(page);
      assert.equal(await page.locator('.exam-placement strong').textContent(), '삽입할 위치를 선택하세요', 'new tab asks for a document destination');
      assert.equal(await page.locator('[data-exam-action="confirm-placement"]').isDisabled(), true, 'insertion cannot use a stale cursor');
      assert.equal(await page.getByRole('dialog', { name: '시험지 보내기' }).count(), 0, 'no obsolete owner-tab rejection');
      const retained = await page.evaluate(() => { feedbackBridge.picturesCache = null; return feedbackBridge.documentPictures().map(p => p.id); });
      assert.deepEqual(retained, [returned.id], 'old picture stays unchanged while a new insertion is pending');
      await h.action(page, 'cancel-placement'); await h.idle(page);
      assert.deepEqual(errors, []);
      console.log(name + ': imported multi-page picture return, native geometry, tab isolation and insertion destination passed');
      const fresh = await browser.newPage({ viewport: { width: 1440, height: 950 } });
      try {
        await h.navigate(fresh, origin + '/?mode=pro&mobile=0&exam=0'); await h.ready(fresh);
        await fresh.evaluate(async url => {
          const { state } = await import(url);
          state.update(s => { s.objects = [{ id: 'fresh-line', type: 'line', p1: { x: -10, y: -10 }, p2: { x: 10, y: 10 }, strokeWidth: .3, strokeLevel: 0, layerId: 1, order: 0 }]; });
        }, stateUrl);
        await h.crop(fresh);
        const choice = fresh.getByRole('alertdialog', { name: '한글 문서 선택', exact: true });
        await choice.waitFor({ state: 'visible' });
        await choice.getByRole('button', { name: '취소', exact: true }).click();
        assert.equal(await fresh.locator('#rhwp-exam-workspace').isVisible(), false, 'cancel does not open a document');
        await h.crop(fresh); await choice.waitFor({ state: 'visible' });
        await choice.getByRole('button', { name: '새 문서 만들기', exact: true }).click();
        await fresh.locator('.exam-placement:not([hidden])').waitFor(); await h.idle(fresh);
        assert.equal(await fresh.locator('[data-exam-action="confirm-placement"]').isDisabled(), true, 'new document asks for a destination before insertion');
        await h.place(fresh);
        assert.equal((await h.pictures(fresh)).length, 1, 'chosen crop inserts into the newly opened real document');
        await fresh.screenshot({ path: path.join(evidence, name + '-new-document.png') });
        console.log(name + ': no-document cancel, new document and destination insertion passed');
      } finally { await fresh.close(); }
    } finally { await page.close(); await browser.close(); }
  }
}).catch(error => { console.error(error); process.exitCode = 1; });
