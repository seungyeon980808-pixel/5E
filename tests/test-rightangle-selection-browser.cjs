const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8798/preview/';
const evidence = process.env.EVIDENCE_DIR || path.join(__dirname, '..', '.omo', 'evidence', 'task-12-tool-render');

async function stateSnapshot(page) {
  return page.evaluate(async () => {
    const { state } = await import('./js/state.js?v=1.6.0-remediation-0929');
    return structuredClone(state.get());
  });
}

async function dismissWelcome(page) {
  const skip = page.getByRole('button', { name: '건너뛰기', exact: true });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function createRightAngle(page) {
  const before = await stateSnapshot(page);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
  const input = page.getByRole('textbox', { name: '오브젝트 이름 검색', exact: true });
  await input.fill('직각 표시');
  await page.locator('.object-search-row').filter({ hasText: '직각 표시' }).first().dblclick();
  const canvas = page.locator('#canvas');
  const box = await canvas.boundingBox();
  assert.ok(box, 'canvas must have a visible box');
  const x = box.x + box.width * 0.42;
  const y = box.y + box.height * 0.46;
  await page.mouse.click(x, y);
  await page.mouse.click(x + 28, y);
  await page.mouse.click(x + 28, y + 24);
  await page.waitForFunction((ids) => import('./js/state.js?v=1.6.0-remediation-0929')
    .then(({ state }) => state.get().objects.some((object) => object.type === 'rightangle' && !ids.includes(object.id))), before.objects.map((object) => object.id));
  return (await stateSnapshot(page)).objects.find((object) => object.type === 'rightangle' && !before.objects.some((old) => old.id === object.id));
}

async function createRect(page) {
  const before = await stateSnapshot(page);
  await page.locator('[data-tool="RECT"]').click();
  const box = await page.locator('#canvas').boundingBox();
  assert.ok(box, 'canvas must have a visible box for rect');
  const x = box.x + box.width * 0.25;
  const y = box.y + box.height * 0.25;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y + 20);
  await page.mouse.up();
  await page.waitForFunction((ids) => import('./js/state.js?v=1.6.0-remediation-0929')
    .then(({ state }) => state.get().objects.some((object) => object.type === 'rect' && !ids.includes(object.id))), before.objects.map((object) => object.id));
  return (await stateSnapshot(page)).objects.find((object) => object.type === 'rect' && !before.objects.some((old) => old.id === object.id));
}

async function createAngleArc(page) {
  const before = await stateSnapshot(page);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
  const input = page.getByRole('textbox', { name: '오브젝트 이름 검색', exact: true });
  await input.fill('각도 호');
  await page.locator('.object-search-row').filter({ hasText: '각도 호' }).first().dblclick();
  const box = await page.locator('#canvas').boundingBox();
  assert.ok(box, 'canvas must have a visible box for anglearc');
  const x = box.x + box.width * 0.64;
  const y = box.y + box.height * 0.32;
  await page.mouse.click(x, y);
  await page.mouse.click(x + 24, y);
  await page.mouse.click(x + 24, y + 20);
  await page.waitForFunction((ids) => import('./js/state.js?v=1.6.0-remediation-0929')
    .then(({ state }) => state.get().objects.some((object) => object.type === 'anglearc' && !ids.includes(object.id))), before.objects.map((object) => object.id));
  return (await stateSnapshot(page)).objects.find((object) => object.type === 'anglearc' && !before.objects.some((old) => old.id === object.id));
}

async function assertFiniteSingleFrame(page, label) {
  const frame = page.locator('rect[data-selection-frame="single"]');
  await frame.waitFor({ state: 'attached' });
  const values = await frame.evaluate((node) => ['x', 'y', 'width', 'height'].map((name) => node.getAttribute(name)));
  for (const [index, value] of values.entries()) assert.ok(Number.isFinite(Number(value)), `${label} frame attribute ${index} must be finite: ${value}`);
  return Object.fromEntries(['x', 'y', 'w', 'h'].map((name, index) => [name, Number(values[index])]));
}

function rightAngleBounds(object) {
  const size = Math.max(object.size || 4, 0.1);
  const angle = (object.angle || 0) * Math.PI / 180;
  const side = (object.orientation ?? 1) >= 0 ? 1 : -1;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const vx = -uy * side;
  const vy = ux * side;
  const p0 = { x: object.x, y: object.y };
  const p1 = { x: p0.x + ux * size, y: p0.y + uy * size };
  const p2 = { x: p1.x + vx * size, y: p1.y + vy * size };
  const p3 = { x: p0.x + vx * size, y: p0.y + vy * size };
  const xs = [p0.x, p1.x, p2.x, p3.x];
  const ys = [p0.y, p1.y, p2.y, p3.y];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

async function assertRightAngleFrame(page, object, label) {
  const actual = await assertFiniteSingleFrame(page, label);
  const expected = rightAngleBounds(object);
  for (const key of ['x', 'y', 'w', 'h']) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 1e-6, `${label} ${key} must match oriented right-angle bounds: expected ${expected[key]}, got ${actual[key]}`);
  }
  return { actual, expected };
}

async function selectMoveResizeRotate(page, id) {
  let target = page.locator(`[data-id="${id}"]`).first();
  await target.click({ force: true });
  const selected = await stateSnapshot(page);
  assert.ok(selected.selectedIds.includes(id), 'rightangle must be selected');
  const selectedObject = selected.objects.find((object) => object.id === id);
  const initialFrame = await assertRightAngleFrame(page, selectedObject, 'select');

  let box = await target.boundingBox();
  assert.ok(box, 'rightangle must render before move');
  const beforeMove = JSON.stringify(selected.objects.find((object) => object.id === id));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 16, box.y + box.height / 2 + 10);
  await page.mouse.up();
  const afterMove = await stateSnapshot(page);
  assert.notEqual(JSON.stringify(afterMove.objects.find((object) => object.id === id)), beforeMove, 'move must change rightangle geometry');
  const moveFrame = await assertRightAngleFrame(page, afterMove.objects.find((object) => object.id === id), 'move');

  const resizeHandle = page.locator('#handles [data-handle]').last();
  box = await resizeHandle.boundingBox();
  assert.ok(box, 'rightangle resize handle must render');
  const beforeResize = JSON.stringify(afterMove.objects.find((object) => object.id === id));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 18, box.y + box.height / 2 + 12);
  await page.mouse.up();
  const afterResize = await stateSnapshot(page);
  assert.notEqual(JSON.stringify(afterResize.objects.find((object) => object.id === id)), beforeResize, 'resize must change rightangle geometry');
  const resizeFrame = await assertRightAngleFrame(page, afterResize.objects.find((object) => object.id === id), 'resize');

  await page.locator('[data-tool="rotate"]').click();
  const rotateHandle = page.locator('#handles [data-handle="ne"]');
  box = await rotateHandle.boundingBox();
  assert.ok(box, 'rightangle rotate handle must render');
  const beforeRotate = JSON.stringify(afterResize.objects.find((object) => object.id === id));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 - 14);
  await page.mouse.up();
  const afterRotate = await stateSnapshot(page);
  assert.notEqual(JSON.stringify(afterRotate.objects.find((object) => object.id === id)), beforeRotate, 'rotate must change rightangle geometry');
  assert.notEqual(afterRotate.objects.find((object) => object.id === id).angle, afterResize.objects.find((object) => object.id === id).angle, 'rotate must change rightangle angle');
  await page.locator('[data-tool="V"]').click();
  const rotatedObject = afterRotate.objects.find((object) => object.id === id);
  const rotateFrame = await assertRightAngleFrame(page, rotatedObject, 'rotate');

  const orientation = page.locator('select.insp-input:has(option[value="-1"])');
  await orientation.selectOption('-1');
  await page.waitForFunction((selectedId) => import('./js/state.js?v=1.6.0-remediation-0929')
    .then(({ state }) => state.get().objects.find((object) => object.id === selectedId)?.orientation === -1), id);
  const oppositeOrientation = (await stateSnapshot(page)).objects.find((object) => object.id === id);
  const oppositeFrame = await assertRightAngleFrame(page, oppositeOrientation, 'opposite orientation');
  return { initialFrame, moveFrame, resizeFrame, rotateFrame, oppositeFrame, object: oppositeOrientation };
}

async function saveAndReopen(page, browser, id) {
  await page.locator('#file-menu-btn').click();
  await page.locator('#project-save').click();
  const downloadEvent = page.waitForEvent('download');
  const explicitDownload = page.locator('#project-save-download');
  if (await explicitDownload.isVisible().catch(() => false)) await explicitDownload.click();
  else await page.getByRole('button', { name: '저장', exact: true }).click();
  const download = await downloadEvent;
  const savedPath = path.join(evidence, 'rightangle-selection.5e');
  await download.saveAs(savedPath);
  // Verify the downloaded file independently of the original tab's autosave.
  const reopenedContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', locale: 'ko-KR' });
  await reopenedContext.addInitScript(() => {
    localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
    localStorage.setItem('5e.tutorial.bannerSeen', 'true');
  });
  const reopened = await reopenedContext.newPage();
  const reopenedErrors = [];
  reopened.on('pageerror', (error) => reopenedErrors.push(error.message));
  await reopened.goto(`${base}?mode=pro&mobile=0`, { waitUntil: 'networkidle' });
  await reopened.locator('html[data-mode="pro"]').waitFor({ state: 'attached' });
  await dismissWelcome(reopened);
  await reopened.locator('#file-menu-btn').click();
  const chooser = reopened.waitForEvent('filechooser');
  await reopened.locator('#project-open').click();
  await (await chooser).setFiles(savedPath);
  const open = reopened.getByRole('button', { name: '열기', exact: true });
  // FileReader opens this confirmation asynchronously. Await the real user
  // action instead of treating a not-yet-visible dialog as already confirmed.
  await open.click();
  const rendered = reopened.locator(`[data-id="${id}"]`).first();
  try {
    await rendered.waitFor({ state: 'attached' });
  } catch (error) {
    const snapshot = await stateSnapshot(reopened);
    fs.writeFileSync(path.join(evidence, 'reopen-failure-state.json'), JSON.stringify({ snapshot, errors: reopenedErrors }, null, 2));
    await reopened.screenshot({ path: path.join(evidence, 'reopen-failure.png'), fullPage: true });
    throw new Error(`${error.message}; reopen errors=${JSON.stringify(reopenedErrors)}`);
  }
  await rendered.click({ force: true });
  const object = (await stateSnapshot(reopened)).objects.find((candidate) => candidate.id === id);
  const frame = await assertRightAngleFrame(reopened, object, 'reopen');
  assert.deepEqual(reopenedErrors, [], 'file reopening must not emit runtime errors');
  return { reopened, reopenedContext, savedPath, frame, object };
}

(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', locale: 'ko-KR' });
  const page = await context.newPage();
  const invalidRectErrors = [];
  const recordConsole = (message) => {
    if (message.type() === 'error' && /<rect> attribute (?:x|y|width|height): Expected length, "undefined"/.test(message.text())) invalidRectErrors.push(message.text());
  };
  page.on('console', recordConsole);
  try {
    await page.addInitScript(() => {
      localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
      localStorage.setItem('5e.tutorial.bannerSeen', 'true');
      Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
      Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true });
    });
    await page.goto(`${base}?mode=pro&mobile=0`, { waitUntil: 'networkidle' });
    await dismissWelcome(page);
    const rightangle = await createRightAngle(page);
    const interaction = await selectMoveResizeRotate(page, rightangle.id);
    await page.screenshot({ path: path.join(evidence, 'rightangle-selected.png'), fullPage: true });
    const rect = await createRect(page);
    await page.locator(`[data-id="${rect.id}"]`).first().click({ force: true });
    const rectFrame = await assertFiniteSingleFrame(page, 'rect regression');
    const anglearc = await createAngleArc(page);
    await page.locator(`[data-id="${anglearc.id}"]`).first().click({ force: true });
    const anglearcFrame = await assertFiniteSingleFrame(page, 'anglearc regression');
    await page.screenshot({ path: path.join(evidence, 'selection-regressions.png'), fullPage: true });
    const persisted = await saveAndReopen(page, browser, rightangle.id);
    persisted.reopened.on('console', recordConsole);
    await persisted.reopened.screenshot({ path: path.join(evidence, 'rightangle-reopened.png'), fullPage: true });
    assert.deepEqual(invalidRectErrors, [], `rightangle interaction must not emit invalid rect errors: ${invalidRectErrors.join(' | ')}`);
    const report = { scenario: 'search-create-select-move-resize-rotate-save-reopen-rightangle', rightangle, interaction, rectFrame, anglearcFrame, reopenedFrame: persisted.frame, invalidRectErrors, savedPath: persisted.savedPath, passed: true };
    fs.writeFileSync(path.join(evidence, 'rightangle-selection-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    await persisted.reopenedContext.close();
  } catch (error) {
    fs.writeFileSync(path.join(evidence, 'rightangle-selection-report.json'), `${JSON.stringify({ passed: false, invalidRectErrors, error: error.stack || String(error) }, null, 2)}\n`);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
