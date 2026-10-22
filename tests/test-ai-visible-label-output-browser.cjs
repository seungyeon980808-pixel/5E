'use strict';

// Real candidate insertion and document capture, with historical synthetic
// transport seeds. This verifies UI/output agreement, not provider quality.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const { instrumentAiMain } = require('./helpers/canonical-fixture-adapter.cjs');
const root = path.resolve(__dirname, '..');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/visible-label-output');
process.env.APP_ENTRY = '/';
const lifecycle = fs.readFileSync(path.join(root, 'tests/test-ai-workspace-lifecycle-browser.cjs'), 'utf8');
const start = lifecycle.indexOf('function seedRequestWorkspaces(');
const end = lifecycle.indexOf('\nasync function requestBrowserFixture(', start);
assert.ok(start >= 0 && end > start);
const seed = lifecycle.slice(start, end).replace('window.__task5Expected = structuredClone(tabs);', `
  for (const tab of tabs) { tab.conversionKind = 'image'; tab.generated[0].reviewState = 'scoped-applied'; }
  tabs[1].generated[0].labelPlan = { version:4, frozen:true, reviewRequired:true, uncertainties:[], labels:[
    { id:'visible-label', text:'visible output label', mode:'text', scope:'general', contentMode:'plain',
      position:{x:.5,y:.2}, anchor:{x:.5,y:.2}, typography:{role:'text',bounds:{x:.3,y:.15,w:.4,h:.1}} }
  ] };
  window.__task5Expected = structuredClone(tabs);`);

async function observeMain(page, seeded) {
  const observed = instrumentAiMain(root, { seedReady:seeded, manager:'__visibleManager', state:'__visibleState' });
  await page.route('**/js/main.js?*', route => route.fulfill({ contentType:'text/javascript', body:observed.body }));
}

h.withServer(async origin => {
  fs.mkdirSync(evidence, { recursive:true });
  for (const [engineName, engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless:true });
    try {
      for (const included of [false, true]) {
        const context = await browser.newContext({ viewport:{width:1440,height:1000}, acceptDownloads:true });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const caseName = `${engineName}-${included ? 'on' : 'off'}`;
        try {
          await page.addInitScript({ content:seed + '\nseedRequestWorkspaces(2);' });
          await observeMain(page, true);
          await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=0'); await h.ready(page);
          await page.evaluate(() => __visibleManager.sharingSnapshot());
          await page.locator('#ai-image-install-open').click();
          await page.locator('#ai-image-panel [data-tab-id="task-1"] .ai-task-tab-select').click();
          const toggle = page.locator('#ai-image-panel [data-ai-label-toggle]');
          await toggle.waitFor(); await page.waitForFunction(() => !document.querySelector('#ai-image-panel [data-ai-label-toggle]').disabled);
          if (!included) await toggle.click();
          assert.equal(await toggle.getAttribute('aria-checked'), String(included));
          // 카드의 '캔버스에 삽입'은 숨겨지고(2026-10-12~13) 아래 단추 줄의 한 단추가 선택한 결과를 넣는다.
          const output = page.locator('#ai-image-panel [data-ai-insert-selected]');
          assert.equal((await output.textContent()).includes('라벨 1개'), included, 'Output caption must describe the visible label choice');
          if (!included) assert.ok(!(await output.getAttribute('title')).includes('함께 넣습니다'), 'Hidden labels are not promised by the output tooltip');
          const before = await page.evaluate(async () => {
            const tab = (await __visibleManager.sharingSnapshot()).workspaces.flatMap(w => w.tabs).find(t => t.id === 'task-1');
            return { candidate:tab.generated[0], labels:tab.labelPreviewIncluded };
          });
          const image = page.locator('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img');
          await page.waitForFunction(({included,raw}) => {
            const image = document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img');
            return image?.complete && image.naturalWidth === 512 && (included ? image.src !== raw : image.src === raw);
          }, { included, raw:before.candidate.data });
          await output.click();
          await page.locator('#ai-image-panel').waitFor({ state:'hidden' });
          const drawing = await page.evaluate(() => structuredClone(__visibleState.get().objects));
          assert.equal(drawing.filter(o => o.aiAutoLabel).length, Number(included), 'Canvas must preserve the currently visible label choice');
          assert.equal(drawing.find(o => o.type === 'image').src, before.candidate.data, 'Editable labels stay separate from unchanged candidate pixels');
          const after = await page.evaluate(async () => (await __visibleManager.sharingSnapshot()).workspaces.flatMap(w => w.tabs).find(t => t.id === 'task-1'));
          assert.deepEqual(after.generated[0], before.candidate, 'Output choice never removes the retained label plan');
          assert.equal(after.labelPreviewIncluded['candidate-1'], included);

          await h.crop(page);
          await page.locator('[data-dialog-purpose="hwp"]').getByRole('button', { name:'새 문서 만들기', exact:true }).click();
          await h.place(page);
          const [picture] = await h.pictures(page);
          assert.equal(picture.figure.context.ai.taskId, 'task-1');
          assert.equal(picture.figure.context.ai.snapshot.tabs[0].selectedCandidateId, 'candidate-1');
          assert.equal(picture.figure.context.ai.snapshot.tabs[0].labelPreviewIncluded['candidate-1'], included);
          assert.equal(picture.figure.source.pages[0].objects.filter(o => o.aiAutoLabel).length, Number(included), 'HWP uses the same native objects captured from the canvas');
          assert.equal(picture.figure.source.pages[0].objects.find(o => o.type === 'image').src, before.candidate.data);
          const waiting = page.waitForEvent('download'); await h.action(page, 'save');
          const project = path.join(evidence, caseName + '.5e'); await (await waiting).saveAs(project); await h.idle(page);

          const portable = await browser.newContext({ viewport:{width:1440,height:1000} });
          try {
            const reopened = await portable.newPage(); await observeMain(reopened, false);
            reopened.on('pageerror', error => errors.push(error.message));
            await reopened.addInitScript(() => localStorage.setItem('5e.tutorial.bannerSeen', 'true'));
            await h.navigate(reopened, origin + '/?mode=pro&mobile=0&exam=1'); await h.ready(reopened);
            await reopened.locator('#exam-project-file').setInputFiles(project); await h.idle(reopened);
            const [restored] = await h.pictures(reopened);
            assert.equal(restored.figure.source.pages[0].objects.filter(o => o.aiAutoLabel).length, Number(included));
            await h.originalEdit(reopened); await reopened.locator('#ai-image-panel').waitFor({ state:'visible' });
            assert.equal(await reopened.locator('#ai-image-panel [data-ai-label-toggle]').getAttribute('aria-checked'), String(included));
            assert.equal(await reopened.locator('#ai-image-panel .ai-task-tab.is-on').getAttribute('data-tab-id'), 'task-1');
          } finally { await portable.close(); }
          assert.deepEqual(errors, []);
          assert.equal(await page.evaluate(() => __task2.sends.length), 0, 'Local output and document capture never request AI');
          fs.writeFileSync(path.join(evidence, caseName + '.json'), JSON.stringify({ included, canvasLabelCount:drawing.filter(o => o.aiAutoLabel).length, retainedCandidate:true, documentRoundTrip:true, providerCalls:await page.evaluate(() => __task2.sends.length), nativeSafari:false }, null, 2));
          console.log(caseName + ': visible label choice, candidate preservation, canvas → HWP and portable original return passed');
        } finally {
          await page.screenshot({ path:path.join(evidence, caseName + '.png') }).catch(() => {});
          await context.close();
        }
      }
    } finally { await browser.close(); }
  }
}).catch(error => { console.error(error); process.exitCode = 1; });
