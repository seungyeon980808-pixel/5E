const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8798/preview/';
const evidence = process.env.EVIDENCE_DIR || path.join(__dirname, '..', '.omo', 'evidence', 'task-12-funcgraph-selection');

async function snapshot(page) {
  return page.evaluate(() => import('./js/state.js?v=1.6.0-remediation-0929').then(({ state }) => structuredClone(state.get())));
}

async function waitForFuncgraph(page) {
  const store = await page.evaluateHandle(() => import('./js/state.js?v=1.6.0-remediation-0929').then(({ state }) => state));
  try {
    await page.waitForFunction((state) => state.get().objects.some((object) => object.type === 'funcgraph'), store);
  } finally {
    await store.dispose();
  }
}

async function dismissWelcome(page) {
  const skip = page.getByRole('button', { name: '건너뛰기', exact: true });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

function pointBounds(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

async function assertFiniteFuncgraphFrame(page, graph, label) {
  assert.ok(Array.isArray(graph.points) && graph.points.length > 1, `${label}: funcgraph must have point geometry`);
  assert.ok(graph.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)), `${label}: funcgraph points must be finite`);
  assert.equal('x' in graph, false, `${label}: funcgraph must stay point-defined`);
  const expected = pointBounds(graph.points);
  const frames = await page.locator('rect[data-selection-frame="multi-member"]').evaluateAll((nodes) => nodes.map((node) => ({
    x: Number(node.getAttribute('x')), y: Number(node.getAttribute('y')),
    w: Number(node.getAttribute('width')), h: Number(node.getAttribute('height')),
  })));
  const frame = frames.find((candidate) => ['x', 'y', 'w', 'h'].every((key) => Math.abs(candidate[key] - expected[key]) < 1e-6));
  assert.ok(frame, `${label}: multi-member frame must match funcgraph point bounds ${JSON.stringify(expected)}; got ${JSON.stringify(frames)}`);
  return { expected, frame, frames };
}

async function createFuncgraph(page) {
  await page.locator('#graph-tool-open').click();
  await page.locator('#gm-tab-func-btn').click();
  await page.locator('#gm-add-series').click();
  await page.locator('#gm-expr').last().fill('x^2');
  await page.locator('#gm-confirm').click();
  await waitForFuncgraph(page);
  return (await snapshot(page)).objects.find((object) => object.type === 'funcgraph');
}

async function selectAndMoveGroup(page, graphId, label) {
  const before = await snapshot(page);
  const groupId = before.objects.find((object) => object.id === graphId)?.groupId;
  const plane = before.objects.find((object) => object.type === 'coordplane' && object.groupId === groupId);
  assert.ok(plane, `${label}: generated graph must have a grouped coordinate plane`);
  await page.click(`[data-ui="hit-twin"][data-id="${plane.id}"]`);
  let state = await snapshot(page);
  const graph = state.objects.find((object) => object.id === graphId);
  assert.equal(state.selectedIds.length, 2, `${label}: selecting generated funcgraph must select the graph group`);
  assert.ok(state.selectedIds.includes(graphId), `${label}: funcgraph must remain selected`);
  const initial = await assertFiniteFuncgraphFrame(page, graph, `${label} select`);
  await page.keyboard.press('ArrowRight');
  state = await snapshot(page);
  const moved = state.objects.find((object) => object.id === graphId);
  assert.notDeepEqual(moved.points, graph.points, `${label}: group move must move funcgraph points`);
  const afterMove = await assertFiniteFuncgraphFrame(page, moved, `${label} move`);
  return { state, initial, afterMove };
}

async function saveAndReopen(page, context) {
  await page.locator('#file-menu-btn').click();
  await page.locator('#project-save').click();
  const downloadEvent = page.waitForEvent('download');
  const explicitDownload = page.locator('#project-save-download');
  if (await explicitDownload.isVisible().catch(() => false)) await explicitDownload.click();
  else await page.getByRole('button', { name: '저장', exact: true }).click();
  const savedPath = path.join(evidence, 'funcgraph-selection.5e');
  await (await downloadEvent).saveAs(savedPath);
  const reopened = await context.newPage();
  await reopened.addInitScript(() => {
    localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
    Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true });
  });
  await reopened.goto(`${base}?mode=pro&mobile=0`, { waitUntil: 'networkidle' });
  await dismissWelcome(reopened);
  await reopened.locator('#file-menu-btn').click();
  const chooser = reopened.waitForEvent('filechooser');
  await reopened.locator('#project-open').click();
  await (await chooser).setFiles(savedPath);
  const open = reopened.getByRole('button', { name: '열기', exact: true });
  await open.click();
  await waitForFuncgraph(reopened);
  return reopened;
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
      Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
      Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true });
    });
    await page.goto(`${base}?mode=pro&mobile=0`, { waitUntil: 'networkidle' });
    await dismissWelcome(page);
    const created = await createFuncgraph(page);
    const selected = await selectAndMoveGroup(page, created.id, 'created graph');
    await page.screenshot({ path: path.join(evidence, 'funcgraph-group-selected.png'), fullPage: true });
    const reopened = await saveAndReopen(page, context);
    reopened.on('console', recordConsole);
    const reopenedGraph = (await snapshot(reopened)).objects.find((object) => object.type === 'funcgraph');
    assert.equal(reopenedGraph?.id, created.id, 'reopened graph must be the saved graph');
    assert.deepEqual(reopenedGraph.points, selected.state.objects.find((object) => object.id === created.id).points, 'reopened graph must preserve the saved movement');
    const restored = await selectAndMoveGroup(reopened, reopenedGraph.id, 'reopened graph');
    await reopened.screenshot({ path: path.join(evidence, 'funcgraph-group-reopened.png'), fullPage: true });
    assert.deepEqual(invalidRectErrors, [], `funcgraph group selection must not emit invalid rect errors: ${invalidRectErrors.join(' | ')}`);
    const report = { scenario: 'public-graph-function-x-squared-select-group-move-save-reopen', created, selected, restored, invalidRectErrors, passed: true };
    fs.writeFileSync(path.join(evidence, 'funcgraph-selection-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    await reopened.close();
  } catch (error) {
    fs.writeFileSync(path.join(evidence, 'funcgraph-selection-report.json'), `${JSON.stringify({ passed: false, invalidRectErrors, error: error.stack || String(error) }, null, 2)}\n`);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
