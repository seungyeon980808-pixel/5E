const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '../..');
const evidence = process.env.EVIDENCE_DIR || path.join(root, '.omo/evidence/labeler-creation-finish/browser');
const moduleBase = process.env.APP_MODULE_BASE || '/js/';
const moduleQuery = process.env.APP_MODULE_QUERY ?? '?v=1.7.0-four-session-integration';
let preview = process.env.PREVIEW_URL || process.env.RELEASE_URL;
let server;

test.before(async () => {
  if (preview) return;
  server = spawn(process.execPath, ['scripts/preview-local-server.cjs'], {
    cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  preview = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Preview server did not start')), 10000);
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Preview server exited: ${code}`)); });
    server.stdout.on('data', chunk => {
      const match = String(chunk).match(/Local preview: (http:\/\/127\.0\.0\.1:\d+\/preview\/)/);
      if (match) { clearTimeout(timer); resolve(new URL(process.env.APP_ENTRY || '/', match[1]).href); }
    });
  });
});
test.after(() => server?.kill('SIGTERM'));

async function openPage(engine) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true'));
    await page.goto(preview + '?mode=pro', { waitUntil: 'networkidle' });
    const skip = page.getByRole('button', { name: '건너뛰기', exact: true });
    if (await skip.isVisible()) await skip.click();
    await page.evaluate(async ({ moduleBase, moduleQuery }) => {
      const v = moduleQuery;
      const { state } = await import(moduleBase + 'state.js' + v);
      const { worldToScreen, screenToWorld } = await import(moduleBase + 'viewport.js' + v);
      const { setActiveTool } = await import(moduleBase + 'tools.js' + v);
      const { undo, redo } = await import(moduleBase + 'transform.js' + v);
      const { beginLabelerBranches } = await import(moduleBase + 'tools/labeler-branches.js' + v);
      window.creationQA = { state, worldToScreen, screenToWorld, setActiveTool, undo, redo, beginLabelerBranches };
      setActiveTool('V');
      state.update(s => {
        s.objects = []; s.groups = []; s.selectedIds = []; s.targetedId = null;
        s.layers = [{ id: 1, name: '검수', visible: true }]; s.activeLayerId = 1;
        s.artboard = { w: 100, h: 80 }; s.viewBox = { x: 0, y: 0, w: 100, h: 80 };
        s.undoStack = []; s.redoStack = []; s.draft = null; s.draftText = null;
      });
      await document.fonts.ready;
    }, { moduleBase, moduleQuery });
    return { browser, page, errors };
  } catch (error) {
    try { await browser.close(); } catch { /* Preserve the original setup failure. */ }
    throw error;
  }
}

async function point(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const q = window.creationQA, svg = document.querySelector('#canvas');
    const screen = q.worldToScreen(svg, q.state.get().viewBox, x, y);
    return { ...screen, world: q.screenToWorld(svg, q.state.get().viewBox, screen.x, screen.y) };
  }, { x, y });
}
async function click(page, x, y) {
  const p = await point(page, x, y);
  await page.mouse.click(p.x, p.y);
  return p.world;
}
function closePoint(actual, expected, description) {
  assert.ok(actual, `${description}: point exists`);
  assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < .15,
    `${description}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
async function saveReceipt(page, name, details) {
  const dir = path.join(evidence, name); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(details, null, 2));
  await page.screenshot({ path: path.join(dir, 'canvas.png') });
}

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  for (const finish of ['Enter', 'Space']) {
    test(`two clicked labeler points ignore hovering endpoint when finished with ${finish} in ${name}`, { timeout: 60000 }, async () => {
      const { browser, page, errors } = await openPage(engine);
      try {
        await page.keyboard.press('Shift+T');
        assert.equal(await page.evaluate(() => window.creationQA.state.get().activeTool), 'LABELER');
        const target = await click(page, 20, 40);
        const labelPosition = await click(page, 55, 25);
        const hover = await point(page, 72, 48);
        await page.mouse.move(hover.x, hover.y, { steps: 5 });
        const draft = await page.evaluate(() => structuredClone(window.creationQA.state.get().draft));
        assert.equal(draft.type, 'labeler', 'a live preview is present before finish');
        assert.equal(await page.evaluate(() => window.creationQA.state.get().objects.length), 0);
        await page.keyboard.press(finish);
        const editor = page.locator('.unified-text-editor');
        await editor.waitFor({ state: 'visible' });
        const pending = await page.evaluate(() => structuredClone(window.creationQA.state.get().draftText.pendingLabeler));
        await saveReceipt(page, `${name}-${finish}-pending`, { target, labelPosition, hover, draft, pending, errors });
        closePoint(pending.p1, target, 'clicked target is preserved');
        closePoint(pending.p2, labelPosition, 'second click sets the label position');
        assert.equal(pending.elbow, undefined, 'two committed points produce a straight leader');
        assert.equal(await page.evaluate(() => window.creationQA.state.get().activeTool), 'V');
        assert.equal(await editor.locator('select.unified-style-select').isVisible(), true, 'creation retains detailed text controls');
        await editor.locator('textarea').fill('온도 센서');
        await editor.getByRole('button', { name: '확인', exact: true }).click();
        const created = await page.evaluate(() => structuredClone(window.creationQA.state.get().objects[0]));
        closePoint(created.p1, target, 'confirmed target');
        closePoint(created.p2, labelPosition, 'confirmed label position');
        assert.equal(created.elbow, undefined);
        assert.equal(created.text, '온도 센서');
        assert.equal(await page.locator(`#scene > [data-id="${created.id}"]:not([data-ui]) line`).count(), 1,
          'the canvas contains one straight leader segment');
        assert.equal(await page.locator(`#handles [data-id="${created.id}"][data-handle="elbow"]`).count(), 0);
        await page.evaluate(() => window.creationQA.undo(window.creationQA.state));
        assert.equal(await page.evaluate(() => window.creationQA.state.get().objects.length), 0, 'one undo removes the whole new label');
        await page.evaluate(() => window.creationQA.redo(window.creationQA.state));
        assert.deepEqual(await page.evaluate(() => structuredClone(window.creationQA.state.get().objects[0])), created);
        assert.deepEqual(errors, []);
        await saveReceipt(page, `${name}-${finish}-confirmed`, { created, errors });
      } finally { await browser.close(); }
    });
  }

  test(`three labeler clicks retain the real elbow and third label point in ${name}`, { timeout: 60000 }, async () => {
    const { browser, page, errors } = await openPage(engine);
    try {
      await page.keyboard.press('Shift+T');
      const target = await click(page, 20, 40), elbow = await click(page, 50, 40), labelPosition = await click(page, 50, 20);
      const editor = page.locator('.unified-text-editor'); await editor.waitFor({ state: 'visible' });
      const pending = await page.evaluate(() => structuredClone(window.creationQA.state.get().draftText.pendingLabeler));
      closePoint(pending.p1, target, 'target'); closePoint(pending.elbow, elbow, 'clicked elbow'); closePoint(pending.p2, labelPosition, 'third label point');
      await editor.locator('textarea').fill('꺾인 지시선');
      await editor.getByRole('button', { name: '확인', exact: true }).click();
      const created = await page.evaluate(() => structuredClone(window.creationQA.state.get().objects[0]));
      assert.equal(await page.locator(`#scene > [data-id="${created.id}"]:not([data-ui]) line`).count(), 2);
      assert.deepEqual(errors, []);
      await saveReceipt(page, `${name}-bent`, { created, errors });
    } finally { await browser.close(); }
  });

  test(`labeler finish requires two clicks and cancelling text leaves no object in ${name}`, { timeout: 60000 }, async () => {
    const { browser, page, errors } = await openPage(engine);
    try {
      for (const finish of ['Enter', 'Space']) {
        await page.keyboard.press('Shift+T');
        await click(page, 20, 40);
        const hover = await point(page, 55, 25); await page.mouse.move(hover.x, hover.y);
        await page.keyboard.press(finish);
        assert.equal(await page.locator('.unified-text-editor').count(), 0, `${finish} cannot commit an unclicked endpoint`);
        assert.equal(await page.evaluate(() => window.creationQA.state.get().draft), null);
        assert.equal(await page.evaluate(() => window.creationQA.state.get().objects.length), 0);
        await page.keyboard.press('v');
      }
      await page.keyboard.press('Shift+T');
      await click(page, 20, 40); await click(page, 55, 25); await page.keyboard.press('Enter');
      const editor = page.locator('.unified-text-editor'); await editor.waitFor({ state: 'visible' });
      await editor.locator('textarea').fill('취소할 라벨');
      await editor.getByRole('button', { name: '취소', exact: true }).click();
      assert.equal(await page.evaluate(() => window.creationQA.state.get().objects.length), 0);
      assert.equal(await page.evaluate(() => window.creationQA.state.get().undoStack.length), 0, 'cancelled placement never enters history');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(`polyline Enter and labeler branch Enter retain only their clicked geometry in ${name}`, { timeout: 60000 }, async () => {
    const { browser, page, errors } = await openPage(engine);
    try {
      await page.keyboard.press('p');
      const first = await click(page, 15, 55), second = await click(page, 35, 55), third = await click(page, 35, 35);
      let hover = await point(page, 65, 60); await page.mouse.move(hover.x, hover.y); await page.keyboard.press('Enter');
      const polyline = await page.evaluate(() => structuredClone(window.creationQA.state.get().objects[0]));
      assert.equal(polyline.type, 'polyline'); assert.equal(polyline.points.length, 3);
      [first, second, third].forEach((p, i) => closePoint(polyline.points[i], p, `polyline clicked point ${i + 1}`));
      await page.evaluate(() => {
        const q = window.creationQA;
        q.state.update(s => {
          s.objects = [{ id: 'branched', type: 'labeler', text: '가지', p1: { x: 15, y: 40 }, p2: { x: 50, y: 20 }, labelSize: 3.7, labelType: 'label', strokeWidth: .2, strokeLevel: 0, layerId: 1 }];
          s.selectedIds = ['branched']; s.undoStack = []; s.redoStack = [];
        });
        q.beginLabelerBranches('branched');
      });
      const elbow = await click(page, 40, 40), anchor = await click(page, 25, 60);
      hover = await point(page, 75, 55); await page.mouse.move(hover.x, hover.y); await page.keyboard.press('Enter');
      const branched = await page.evaluate(() => structuredClone(window.creationQA.state.get().objects[0]));
      closePoint(branched.elbow, elbow, 'branch elbow'); closePoint(branched.p3, anchor, 'branch anchor');
      assert.deepEqual(branched.p1, { x: 15, y: 40 }); assert.deepEqual(branched.p2, { x: 50, y: 20 });
      await page.evaluate(() => window.creationQA.undo(window.creationQA.state));
      assert.equal(await page.evaluate(() => window.creationQA.state.get().objects[0].p3), undefined, 'one undo removes the new branch');
      assert.deepEqual(errors, []);
      await saveReceipt(page, `${name}-other-gestures`, { polyline, branched, errors });
    } finally { await browser.close(); }
  });
}
