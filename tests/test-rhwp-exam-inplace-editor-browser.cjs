// 11-06 결정 11-05e: 한글에서 그림을 두 번 누르면 그 자리 편집기(다섯 도구)가 뜬다.
// 복원 → 그래프 객체로 바뀌고 같은 자리·같은 폭, 그래프 그림을 두 번 누르면 바로 그래프 창, 그림으로 되돌리기, AI 변환은 AI 작업대(이미지)를 그 그림으로 연다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/rhwp/verification/inplace-editor');
const fixture = 'data:image/png;base64,' + fs.readFileSync(path.resolve(__dirname, 'fixtures/rights-clear-smoke.png')).toString('base64');
const root = page => page.locator('#exam-inline-editor');
const button = (page, action) => root(page).locator(`[data-inline-action="${action}"]`);
const pageOf = figure => figure.source.pages.find(page => page.id === figure.source.activePageId);
const types = figure => pageOf(figure).objects.map(object => object.type);

async function freshPage(browser, origin, errors) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('5e.tutorial.bannerSeen','true');localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: undefined });
  });
  await h.navigate(page, new URL('', origin).href + '?mode=pro&mobile=0&exam=1', { waitUntil: 'domcontentloaded' }); await h.ready(page);
  return { page, context };
}

async function placePicture(page) {
  await h.action(page, 'close');
  await page.evaluate(async fixture => {
    const { state } = await import('/js/state.js?v=1.7.0-four-session-integration');
    const { prepareLoadedProject, serialize } = await import('/js/project-io.js?v=1.7.0-four-session-integration');
    state.update(s => {
      s.objects = [{ id: 'inplace-picture', type: 'image', src: fixture, x: -20, y: -15, w: 40, h: 30, rotation: 0, mode: 'edit', opacity: 1, exportable: true, aspectLocked: true, cutouts: [], layerId: 1, order: 0 }];
      s.selectedIds = []; s.undoStack = []; s.redoStack = [];
      s.artboard = { w: 100, h: 100 }; s.viewBox = { x: -50, y: -50, w: 100, h: 100 };
      s.objects = prepareLoadedProject(serialize(s)).active.objects;
    });
  }, fixture);
  await h.crop(page); await h.place(page);
}

// 11-06 사용자: 그림을 고르면 그림 단추 다섯 칸(간단한 수정·이미지 변환·그래프 복원·맞춤·설정).
async function selectPicture(page) {
  const pt = await h.point(page, 'image', 0); await page.mouse.click(pt.x, pt.y); await h.idle(page);
  await page.locator('#exam-picture-controls .exam-picture-tools').waitFor({ state: 'visible' });
}
// 간단한 수정 = 5E_image와 똑같은 편집 화면이 한글 위에 뜨는 창(한글은 뒤에 어둡게, 5E_image로 넘어가지 않음).
async function openFloat(page, how = 'pencil') {
  if (how === 'pencil') { await selectPicture(page); await page.locator('#exam-picture-controls [data-picture-modify]').click(); }
  else await h.doubleClick(page, 0);
  await page.waitForFunction(() => document.body.classList.contains('exam-float-edit') && !!document.querySelector('#exam-edit-bar:not([hidden])')?.getClientRects().length, null, { timeout: 30000 }); await h.idle(page);
}
async function closeFloat(page) {
  await page.locator('#exam-edit-bar button', { hasText: '돌아가기' }).click();
  await page.waitForFunction(() => !document.body.classList.contains('exam-editing') && !document.body.classList.contains('exam-float-edit')); await h.idle(page);
}

// AI 작업대가 한글 위에 열렸는지(로그인 전이면 ChatGPT 로그인 안내가 먼저).
async function aiOpened(page, kind) {
  await page.waitForFunction(() => document.querySelector('#ai-image-panel:not([hidden])')?.offsetParent || [...document.querySelectorAll('dialog[open], [role="dialog"]')].some(d => /AI 기능을 시작하세요/.test(d.textContent)), null, { timeout: 20000 });
  const opened = await page.evaluate(() => document.querySelector('#ai-image-panel:not([hidden])')?.offsetParent ? 'panel' : 'login');
  if (opened === 'panel') {
    assert.equal(await page.locator('#ai-image-panel').getAttribute('data-ai-workflow'), kind);
    assert.equal((await page.locator('#ai-image-panel [data-ai-exam-send]').textContent()).trim(), '한글 파일에 넣기');
  }
  return opened;
}
async function closeAi(page) {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#ai-image-panel:not([hidden])')?.offsetParent && ![...document.querySelectorAll('dialog[open]')].some(d => /AI 기능을 시작하세요/.test(d.textContent)), null, { timeout: 10000 }).catch(async () => {
    await page.locator('dialog[open] button, #ai-image-panel [data-ai-close]').filter({ hasText: /닫기|나중에|취소/ }).first().click().catch(() => {});
  });
}
// AI 작업대의 「이 자리에 넣기」가 보내는 것과 같은 결과를 한글로 보낸다(검사 환경엔 AI 로그인이 없다).
const linearPlan = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/graph-reconstruction/linear.json'), 'utf8'));
async function sendBack(page, figureId, { graph = false, image = false }) {
  const before = (await h.pictures(page))[0].figure.version;
  await page.evaluate(async ({ figureId, graph, image, plan, fixture }) => {
    let detail = { target: { figureId }, name: 'AI 결과' };
    if (graph) {
      const api = await import('/js/graph/workbench-result.js?v=1.7.0-four-session-integration');
      plan.source = { id: 'source-0', hash: 'test', width: 512, height: 384, plotBox: { x: 40, y: 50, w: 420, h: 280 } };
      detail.graph = api.buildWorkbenchGraph(plan, plan.source);
    }
    if (image) detail.image = { data: fixture, width: 400, height: 300 };
    window.dispatchEvent(new CustomEvent('5e:hwp-inplace-ai', { detail }));
  }, { figureId, graph, image, plan: linearPlan, fixture });
  await h.waitForState(page, () => !document.querySelector('#rhwp-exam-workspace')?.getAttribute('aria-busy') || document.querySelector('#rhwp-exam-workspace').getAttribute('aria-busy') === 'false');
  for (let i = 0; i < 100 && (await h.pictures(page))[0].figure.version === before; i++) await page.waitForTimeout(100);
  await h.idle(page);
}

async function scenario(browser, origin, name) {
  const errors = [], { page, context } = await freshPage(browser, origin, errors);
  try {
    await placePicture(page);
    const placed = (await h.pictures(page))[0];
    assert.deepEqual(types(placed.figure).filter(type => type !== 'labeler'), ['image'], 'the placed picture starts as an image object');

    // ① 연필(간단한 수정)·두 번 누르기 → image와 같은 편집 화면이 한글 위 창으로(한글은 뒤에 보이고 잠김)
    for (const how of ['pencil', 'double']) {
      await openFloat(page, how);
      const shown = await page.evaluate(() => ({ hwp: getComputedStyle(document.querySelector('#rhwp-exam-workspace')).display, inert: document.querySelector('#rhwp-exam-workspace').inert, tools: !!document.querySelector('.tool-btn[data-tool="V"]')?.getClientRects().length, bg: [...document.querySelectorAll('#exam-edit-bar [data-edit-bg]')].map(b => b.textContent) }));
      assert.notEqual(shown.hwp, 'none', `${how}: the exam stays visible behind`); assert.equal(shown.inert, true); assert.equal(shown.tools, true, `${how}: the same 5E_image tools`);
      assert.deepEqual(shown.bg, ['흰 바탕', '투명 격자'], `${how}: background choice`);
      if (how === 'pencil') await page.screenshot({ path: path.join(evidence, name + '-1-editor.png') });
      await closeFloat(page);
    }
    assert.equal((await h.pictures(page))[0].figure.version, placed.figure.version, 'returning without changes keeps the picture');

    // ② 그래프 복원 단추 → AI 그래프 창(이 그림을 원본으로, 한글 위에서 — 5E_image로 넘어가지 않음).
    await selectPicture(page);
    await page.locator('#exam-picture-controls [data-exam-action="picture-ai-graph"]').click();
    await aiOpened(page, 'graph');
    assert.equal(await page.evaluate(() => document.body.classList.contains('exam-editing')), false, 'restore does not jump to 5E_image');
    assert.equal(await page.locator('#rhwp-exam-workspace').isVisible(), true, 'the exam stays open under the AI workbench');
    await page.screenshot({ path: path.join(evidence, name + '-2-restore-ai.png') });
    await closeAi(page);
    // 작업대에서 「이 자리에 넣기」 → 같은 자리·같은 폭의 그래프 객체(원래 그림은 되돌리기용)
    await sendBack(page, placed.figure.id, { graph: true });
    const restored = (await h.pictures(page))[0];
    assert.ok(types(restored.figure).includes('coordplane'), 'the picture became a graph object');
    assert.ok(!types(restored.figure).includes('image'), 'the image object is replaced');
    assert.ok(pageOf(restored.figure).meta.examRestoredFrom?.objects.some(object => object.type === 'image'), 'the original picture is kept for revert');
    assert.equal(restored.figure.version, placed.figure.version + 1);
    assert.equal(restored.props.width, placed.props.width, 'same width in the document');
    assert.equal(restored.control.paraIdx, placed.control.paraIdx, 'same place in the document');
    await page.screenshot({ path: path.join(evidence, name + '-3-restored.png') });

    // ③ 그래프 그림을 두 번 누르면 바로 그래프 창(편집) → 고쳐서 적용
    await h.doubleClick(page, 0);
    await page.locator('#graph-modal-overlay').waitFor({ state: 'visible' });
    assert.equal((await page.locator('#gm-title').textContent()).trim(), '그래프 편집');
    await page.locator('#gm-variant-sel button[data-variant="cross"]').click();
    await page.screenshot({ path: path.join(evidence, name + '-4-graph-edit.png') });
    await page.locator('#gm-confirm').click();
    await page.locator('#graph-modal-overlay').waitFor({ state: 'hidden' });
    await root(page).waitFor({ state: 'hidden' }); await h.idle(page);
    const edited = (await h.pictures(page))[0];
    assert.equal(edited.figure.version, restored.figure.version + 1, 'graph edit replaced the picture');
    assert.equal(pageOf(edited.figure).objects.find(object => object.type === 'coordplane').axisVariant, 'cross');
    assert.equal(edited.props.width, placed.props.width);

    // ④ 그래프 창을 닫으면 편집기가 남고, 「그림으로 되돌리기」로 원래 그림
    await h.doubleClick(page, 0);
    await page.locator('#graph-modal-overlay').waitFor({ state: 'visible' });
    await page.locator('#gm-cancel').click();
    await page.locator('#graph-modal-overlay').waitFor({ state: 'hidden' });
    await root(page).waitFor({ state: 'visible' });
    assert.equal((await root(page).locator('[data-inline-restore-label]').textContent()).trim(), '그래프 편집');
    assert.equal(await button(page, 'revert').isVisible(), true, 'revert is offered for a restored graph');
    await page.screenshot({ path: path.join(evidence, name + '-5-revert-offer.png') });
    await button(page, 'revert').click();
    await root(page).waitFor({ state: 'hidden' }); await h.idle(page);
    const reverted = (await h.pictures(page))[0];
    assert.deepEqual(types(reverted.figure).filter(type => type !== 'labeler'), ['image'], 'back to the original picture');
    assert.equal(pageOf(reverted.figure).meta.examRestoredFrom, undefined);
    assert.equal(reverted.props.width, placed.props.width);

    // ⑥ 이미지 변환 단추 → 한글 위에 AI 이미지 창, 결과를 「한글 파일에 넣기」하면 같은 자리·같은 폭의 그림으로
    const texted = reverted;
    await selectPicture(page);
    await page.locator('#exam-picture-controls [data-exam-action="picture-ai-image"]').click();
    const opened = await aiOpened(page, 'image');
    assert.equal(await page.evaluate(() => document.body.classList.contains('exam-editing')), false, 'AI conversion does not jump to 5E_image');
    await page.screenshot({ path: path.join(evidence, name + '-7-ai.png') });
    await closeAi(page);
    await sendBack(page, texted.figure.id, { image: true });
    const converted = (await h.pictures(page))[0];
    assert.deepEqual(types(converted.figure).filter(type => type !== 'labeler'), ['image'], 'the AI result is an image object in place');
    assert.equal(converted.figure.version, texted.figure.version + 1);
    assert.equal(converted.props.width, placed.props.width, 'same width after AI conversion');
    assert.ok(pageOf(converted.figure).meta.examRestoredFrom, 'the picture before AI is kept for revert');

    assert.deepEqual(errors, [], 'no runtime errors');
    console.log(name + ': pencil/double-click open the 5E_image editor floating over the exam, graph restore opens the AI graph window over the exam and returns a graph object in place, graph double-click edit, revert, AI conversion returns in place (' + opened + ')');
  } catch (error) {
    if (!page.isClosed()) await page.screenshot({ path: path.join(evidence, name + '-failure.png') }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

h.withServer(async origin => {
  fs.mkdirSync(evidence, { recursive: true });
  for (const [engineName, engine] of Object.entries({ chromium, webkit }).filter(([k]) => !process.env.BROWSER_ENGINE || k === process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    try { await scenario(browser, origin, engineName); } finally { await browser.close(); }
  }
}).catch(error => { console.error(error); process.exitCode = 1; });
