'use strict';

// Historical synthetic candidates exercise the real document/canvas UI.
// No model quality or native Safari claim is made by this local regression.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const { instrumentAiMain } = require('./helpers/canonical-fixture-adapter.cjs');
const root = path.resolve(__dirname, '..');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/ai-hwp-direct-output');
process.env.APP_ENTRY = '/';
const lifecycle = fs.readFileSync(path.join(root, 'tests/test-ai-workspace-lifecycle-browser.cjs'), 'utf8');
const start = lifecycle.indexOf('function seedRequestWorkspaces(');
const end = lifecycle.indexOf('\nasync function requestBrowserFixture(', start);
assert.ok(start >= 0 && end > start);
const seed = lifecycle.slice(start, end).replace('window.__task5Expected = structuredClone(tabs);', `
  for (const tab of tabs) { tab.conversionKind = 'image'; tab.generated[0].reviewState = 'scoped-applied'; }
  tabs[1].generated[0].labelPlan = { version:4, frozen:true, reviewRequired:true, uncertainties:[], labels:[
    { id:'direct-label', text:'direct output label', mode:'text', scope:'general', contentMode:'plain',
      position:{x:.5,y:.2}, anchor:{x:.5,y:.2}, typography:{role:'text',bounds:{x:.3,y:.15,w:.4,h:.1}} }
  ] };
  window.__task5Expected = structuredClone(tabs);`);

h.withServer(async origin => {
  fs.mkdirSync(evidence, { recursive:true });
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless:true });
    const page = await browser.newPage({ viewport:{width:1440,height:1000} }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.addInitScript({ content:seed + '\nseedRequestWorkspaces(2);' });
      const observed = instrumentAiMain(root, { manager:'__directManager', state:'__directState' });
      await page.route('**/js/main.js?*', route => route.fulfill({ contentType:'text/javascript', body:observed.body }));
      await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=0'); await h.ready(page);
      await page.evaluate(() => __directManager.sharingSnapshot());
      const ai = page.locator('#ai-image-panel');
      const choose = async id => {
        if (!await ai.isVisible()) await page.locator('#ai-image-install-open').click();
        await ai.locator(`[data-tab-id="${id}"] .ai-task-tab-select`).click();
        await page.waitForFunction(id => {
          const active = document.querySelector('#ai-image-panel .ai-task-tab.is-on');
          const card = document.querySelector('#ai-image-panel .is-ai-active-candidate');
          return active?.dataset.tabId === id && card?.dataset.aiCandidateId === id.replace('task-', 'candidate-');
        }, id);
      };
      const output = ai.locator('.is-ai-active-candidate [data-ai-canvas-output]');
      await choose('task-0'); await output.click(); await ai.waitFor({ state:'hidden' });
      await h.crop(page);
      await page.locator('[data-dialog-purpose="hwp"]').getByRole('button', { name:'새 문서 만들기', exact:true }).click();
      await h.place(page);
      const firstPicture = (await h.pictures(page))[0];
      await h.action(page, 'close');

      await choose('task-1'); await output.click(); await ai.waitFor({ state:'hidden' });
      const originalDrawing = await page.evaluate(() => structuredClone(__directState.get().objects));
      assert.equal(originalDrawing.filter(o => o.type === 'image').length, 2, 'Ordinary canvas insertion preserves composition');
      // Existing figure ownership must not be silently overwritten by task 1.
      await page.locator('#exam-send').click(); await page.locator('[data-exam-document-insert]').click(); await h.idle(page);
      assert.equal(await page.locator('.capture-overlay').count(), 0);
      assert.match(await page.locator('#exam-status').textContent(), /다른 그림에 연결/);
      await page.getByRole('button', { name:'확인', exact:true }).filter({ visible:true }).click().catch(() => {});

      await choose('task-1');
      const direct = ai.locator('[data-ai-exam-send]');
      fs.writeFileSync(path.join(evidence, engineName + '-ownership.json'), JSON.stringify({
        unrelatedOwnerProtected:true, directButtonCount:await direct.count(), retainedCanvasImages:2, nativeSafari:false,
      }, null, 2));
      assert.equal(await direct.count(), 1, 'A separate AI task needs its advertised independent document-send action');
      assert.equal(await direct.isVisible(), true); assert.equal(await direct.isEnabled(), true);
      assert.equal(await direct.evaluate(node => getComputedStyle(node).borderTopColor), 'rgb(219, 165, 43)', 'HWP uses a yellow outline');
      for (const width of [1440, 1024, 720]) {
        await page.setViewportSize({width,height:1000});
        await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
        const placement = await direct.evaluate(node => {
          const rect=node.getBoundingClientRect(), close=node.closest('.ai-head').querySelector('[data-ai-close]').getBoundingClientRect();
          return {width:rect.width,left:rect.left,right:rect.right,bottom:rect.bottom,top:rect.top,closeLeft:close.left,closeTop:close.top,closeBottom:close.bottom};
        });
        assert.ok(placement.width > 0 && placement.left >= 0 && placement.right <= width, `Visible send button at width ${width}`);
        assert.ok(placement.right <= placement.closeLeft || placement.bottom <= placement.closeTop || placement.top >= placement.closeBottom, 'Send and close never overlap');
      }
      await page.setViewportSize({width:1440,height:1000});
      await ai.locator('[data-ai-label-toggle]').click();
      const before = await page.evaluate(async () => (await __directManager.sharingSnapshot()).workspaces.flatMap(w => w.tabs).find(t => t.id === 'task-1'));
      await h.crop(page, '#ai-image-panel [data-ai-exam-send]'); await h.place(page);
      const pictures = await h.pictures(page);
      assert.equal(pictures.length, 2);
      assert.deepEqual(pictures[0].figure, firstPicture.figure, 'The first linked figure and its source stay exact');
      const second = pictures.find(p => p.figure.context.ai?.taskId === 'task-1');
      assert.ok(second); assert.notDeepEqual(second.figure.link, firstPicture.figure.link);
      assert.equal(second.figure.source.pages[0].objects.filter(o => o.type === 'image').length, 1);
      assert.equal(second.figure.source.pages[0].objects.filter(o => o.aiAutoLabel).length, 0, 'Direct output honors labels OFF');
      assert.equal(second.figure.source.pages[0].objects.find(o => o.type === 'image').src, before.generated[0].data);
      assert.equal(second.figure.context.ai.snapshot.tabs[0].labelPreviewIncluded['candidate-1'], false);
      const after = await page.evaluate(async () => (await __directManager.sharingSnapshot()).workspaces.flatMap(w => w.tabs).find(t => t.id === 'task-1'));
      assert.deepEqual(after.generated, before.generated, 'Document output never edits the retained candidates');
      const composedPage = await page.evaluate(() => __directState.get().pages.find(p => p.objects.filter(o => o.type === 'image').length === 2));
      assert.deepEqual(composedPage.objects, originalDrawing, 'Independent sending preserves the composed canvas');

      await h.action(page, 'close'); await choose('task-1');
      await h.crop(page, '#ai-image-panel [data-ai-exam-send]'); await h.place(page);
      assert.equal((await h.pictures(page)).length, 2, 'Sending the same task replaces its own figure');
      await h.action(page, 'close'); await choose('task-0'); await direct.click();
      await page.locator('.capture-overlay').waitFor(); await page.keyboard.press('Escape');
      await ai.waitFor({ state:'visible' });
      assert.equal(await ai.locator('.ai-task-tab.is-on').getAttribute('data-tab-id'), 'task-0');
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => __task2.sends.length), 0);
      await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
      console.log(engineName + ': independent task send, label OFF, owner preservation, replacement and cancellation passed');
    } finally {
      await page.screenshot({ path:path.join(evidence, engineName + '.png') }).catch(() => {});
      await browser.close();
    }
  }
}).catch(error => { console.error(error); process.exitCode = 1; });
