const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/rhwp/verification/inline');
const fixture = 'data:image/png;base64,' + fs.readFileSync(path.resolve(__dirname, 'fixtures/rights-clear-smoke.png')).toString('base64');
const root = page => page.locator('#exam-inline-editor');
const canvas = page => root(page).locator('svg.exam-inline-canvas');
const button = (page, action) => root(page).locator(`[data-inline-action="${action}"]`);
const field = (page, name) => root(page).locator(`[data-inline-field="${name}"]`);
const wrapper = (page, id) => canvas(page).locator(`g[data-annotation-id="${id}"]`);
const labels = objects => objects.filter(object => object.type === 'labeler');
const background = objects => objects.filter(object => object.type !== 'labeler');
const sourceObjects = figure => figure.source.pages.find(page => page.id === figure.source.activePageId).objects;

function pageObjects(drawing, pageId) {
  const page = drawing.pages.find(p => p.id === pageId);
  assert.ok(page, 'the expected drawing tab exists');
  return pageId === drawing.activePageId ? drawing.objects : page.objects;
}

async function linkedDrawing(page, stateUrl, link) {
  const drawing = await h.drawing(page, stateUrl);
  const linked = drawing.pages.find(p => p.meta?.examLink?.tabId === link.tabId && p.meta.examLink.assetId === link.assetId);
  assert.ok(linked, 'the original linked 5E tab exists');
  return { ...linked, objects: pageObjects(drawing, linked.id) };
}

async function waitLabel(page, stateUrl, link, id, expected) {
  await h.waitForState(page,async ({ stateUrl, link, id, expected }) => {
    const { state } = await import(stateUrl), value = state.get();
    const page = value.pages.find(p => p.meta?.examLink?.tabId === link.tabId && p.meta.examLink.assetId === link.assetId);
    const object = (page?.id === value.activePageId ? value.objects : page?.objects)?.find(o => o.id === id);
    return expected === null ? !object : !!object && Object.entries(expected).every(([key, value]) => JSON.stringify(object[key]) === JSON.stringify(value));
  }, { stateUrl, link, id, expected });
}

async function openInline(page, index = 0) {
  await h.doubleClick(page, index);
  await root(page).waitFor({ state: 'visible' });
  await canvas(page).waitFor({ state: 'visible' });
  await h.idle(page);
  assert.equal(await root(page).evaluate(node => node.ownerDocument === document && node.parentElement === document.body), true, 'inline controls belong to the top-level document');
  assert.equal(await page.locator('#exam-edit-bar').isVisible(), false, 'picture double-click opens inline editing');
  assert.equal(await page.locator('#rhwp-exam-workspace').isVisible(), true, 'the exam remains visible during inline editing');
  for (const action of ['add-label', 'add-leader', 'delete', 'undo', 'redo', 'crop', 'original', 'apply', 'close']) {
    assert.equal(await button(page, action).isVisible(), true, `inline ${action} action is visible`);
    if (!['delete', 'undo', 'redo'].includes(action)) assert.equal(await button(page, action).isEnabled(), true, `inline ${action} action is enabled after opening`);
  }
}

async function returnToExistingExam(page) {
  if (await page.locator('#exam-edit-bar').isVisible()) {
    await page.locator('#exam-edit-bar').getByRole('button', { name: '돌아가기', exact: true }).click();
  } else {
    // The separate exam-open button was removed. Use the current send entry,
    // then cancel placement so the existing document receives no new picture.
    const count = (await h.pictures(page)).length;
    await h.crop(page);
    await page.locator('.exam-placement:not([hidden])').waitFor();
    await h.action(page, 'cancel-placement');
    assert.equal((await h.pictures(page)).length, count);
  }
  await h.idle(page);
}

// Use the actual SVG matrix, including its placement over the iframe picture.
async function svgPoint(svg, fx, fy) {
  return svg.evaluate((node, { fx, fy }) => {
    const b = node.viewBox.baseVal, world = { x: b.x + b.width * fx, y: b.y + b.height * fy };
    const screen = new DOMPoint(world.x, world.y).matrixTransform(node.getScreenCTM());
    return { x: screen.x, y: screen.y, world };
  }, { fx, fy });
}

async function clickSvg(page, fx, fy) {
  const position = await svgPoint(canvas(page), fx, fy);
  // WebKit reports whole CSS-pixel pointer positions. Click whole pixels and
  // derive the expected source point from those actual event coordinates.
  const x = Math.round(position.x), y = Math.round(position.y);
  const world = await canvas(page).evaluate((node, { x, y }) => {
    const point = new DOMPoint(x, y).matrixTransform(node.getScreenCTM().inverse());
    return { x: point.x, y: point.y };
  }, { x, y });
  await page.mouse.click(x, y);
  return world;
}

async function textPoint(page, id) {
  // The p2 handle sits on the text anchor. Pick an exposed part of the visible
  // caption instead of forcing a click through the handle at its center.
  const point = await wrapper(page, id).locator('text').last().evaluate(text => {
    const b = text.getBoundingClientRect(), svg = text.closest('svg').getBoundingClientRect();
    const left = Math.max(b.left, svg.left), right = Math.min(b.right, svg.right);
    const top = Math.max(b.top, svg.top), bottom = Math.min(b.bottom, svg.bottom);
    for (const fx of [.15, .85, .3, .7]) for (const fy of [.5, .3, .7]) {
      const x = left + (right - left) * fx, y = top + (bottom - top) * fy;
      const hit = document.elementFromPoint(x, y);
      if (hit && !hit.closest('[data-inline-handle]') && hit.closest('g[data-annotation-id]') === text.closest('g[data-annotation-id]')) return { x, y };
    }
    return null;
  });
  assert.ok(point, `label ${id} has exposed text to click`);
  return point;
}

async function clickText(page, id, double = false) {
  const point = await textPoint(page, id);
  if (double) await page.mouse.dblclick(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

async function dragFrom(page, { x, y }, dx, dy) {
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 }); await page.mouse.up();
}

async function drag(page, target, dx, dy) {
  const box = await target.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, 'drag target is visible');
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await dragFrom(page, { x, y }, dx, dy);
}

async function changeField(page, name, value) {
  const input = field(page, name);
  if (await input.evaluate(node => node.tagName === 'SELECT')) await input.selectOption(value);
  else await input.fill(String(value));
  await input.press('Tab'); // The contract commits on change/blur.
}

async function annotationBoxes(page) {
  return canvas(page).locator('g[data-annotation-id]').evaluateAll(nodes => nodes.map(node => {
    const b = node.getBBox();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }));
}

async function bitmap(page, includePixels = false) {
  return page.evaluate(async includePixels => {
    const wasm = document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.wasm;
    const c = wasm.getPageControlLayout(0).controls.find(c => c.type === 'image');
    const bytes = wasm.getControlImageData(c.secIdx, c.paraIdx, c.controlIdx, JSON.stringify(c.cellPath || []));
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    try {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', pixels))].map(n => n.toString(16).padStart(2, '0')).join('');
      let encoded;
      if (includePixels) {
        const chunks = [];
        for (let i = 0; i < pixels.length; i += 32768) chunks.push(String.fromCharCode(...pixels.subarray(i, i + 32768)));
        encoded = btoa(chunks.join(''));
      }
      return { width: canvas.width, height: canvas.height, digest, ...(includePixels ? { pixels: encoded } : {}) };
    } finally { URL.revokeObjectURL(url); }
  }, includePixels);
}

function unchangedBackground(before, after, bounds, boxes, annotationLabels) {
  assert.equal(after.width, before.width); assert.equal(after.height, before.height);
  const a = Buffer.from(before.pixels, 'base64'), b = Buffer.from(after.pixels, 'base64');
  const sx = before.width / bounds.w, sy = before.height / bounds.h;
  // The shared renderer's SVG boxes cover caption glyphs and leader segments.
  // Expand for the white text halo, stroke width, and raster antialiasing only.
  const halo = Math.max(.5, ...annotationLabels.map(label => Math.max((label.labelSize || 3.7) * .3, (label.strokeWidth || .2) * 2)));
  const regions = boxes.map(box => ({
    left: Math.floor((box.x - halo - bounds.x) * sx) - 2,
    top: Math.floor((box.y - halo - bounds.y) * sy) - 2,
    right: Math.ceil((box.x + box.w + halo - bounds.x) * sx) + 2,
    bottom: Math.ceil((box.y + box.h + halo - bounds.y) * sy) + 2,
  }));
  let compared = 0, painted = 0, changed = 0, firstChange;
  for (let y = 0; y < before.height; y++) for (let x = 0; x < before.width; x++) {
    if (regions.some(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) continue;
    const i = (y * before.width + x) * 4; compared++;
    if (a[i + 3] && Math.min(a[i], a[i + 1], a[i + 2]) < 245) painted++;
    if ([0, 1, 2, 3].some(channel => a[i + channel] !== b[i + channel])) {
      changed++; firstChange ||= { x, y, before: [...a.subarray(i, i + 4)], after: [...b.subarray(i, i + 4)] };
    }
  }
  assert.ok(compared > before.width * before.height * .3, 'pixel comparison covers at least 30% of the picture outside edited annotations');
  assert.ok(painted > 100, 'the compared background includes actual image/line pixels');
  assert.equal(changed, 0, `background pixels outside annotation footprints are identical: ${JSON.stringify({ compared, painted, changed, firstChange })}`);
}

async function nativeHistory(page, direction, expectedId) {
  await page.evaluate(direction => {
    const input = document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler();
    if (direction === 'undo') input.performUndo(); else input.performRedo();
  }, direction);
  await h.waitForState(page,async expectedId => {
    const wasm = document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.wasm;
    const c = wasm.getPageControlLayout(0).controls.find(c => c.type === 'image');
    if (!c) return false;
    const { readEditablePng } = await import('/js/editable-png.js?v=1.7.0-four-session-integration');
    return readEditablePng(wasm.getControlImageData(c.secIdx, c.paraIdx, c.controlIdx, JSON.stringify(c.cellPath || [])))?.id === expectedId;
  }, expectedId);
  await h.idle(page);
}

async function save(page, filename) {
  const waiting = page.waitForEvent('download'); await h.action(page, 'save');
  const download = await waiting; assert.match(download.suggestedFilename(), /\.5e$/);
  const file = path.join(evidence, filename); await download.saveAs(file); await h.idle(page);
  const project = await page.evaluate(async bytes => {
    const { parseExamProject } = await import('/js/rhwp-exam-project.js?v=1.7.0-four-session-integration');
    return parseExamProject(new Uint8Array(bytes));
  }, [...fs.readFileSync(file)]);
  return { file, project };
}

async function freshPage(browser, origin, surface, errors, contexts) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
  contexts.push(context);
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: undefined });
  });
  await h.navigate(page,new URL(surface, origin).href + '?mode=pro&mobile=0&exam=1',{waitUntil:'domcontentloaded'}); await h.ready(page);
  return page;
}

async function scenario(browser, origin, surface, name) {
  const contexts = [], errors = [];
  const stateUrl = '/js/state.js?v=1.7.0-four-session-integration';
  const projectUrl = '/js/project-io.js?v=1.7.0-four-session-integration';
  try {
    const legacy = await freshPage(browser, origin, surface, errors, contexts);
    await h.action(legacy, 'demo'); await h.idle(legacy); await openInline(legacy);
    assert.doesNotMatch(await legacy.locator('.exam-figure').first().textContent(), /미반영/, 'loader defaults do not look like unapplied edits');
    await button(legacy, 'apply').click(); await root(legacy).waitFor({ state: 'hidden' }); await h.idle(legacy);
    assert.doesNotMatch(await legacy.locator('.exam-figure').first().textContent(), /미반영/, 'unchanged Apply has no false draft indicator');
    const page = await freshPage(browser, origin, surface, errors, contexts);
    await h.action(page, 'close');
    await page.evaluate(async ({ stateUrl, projectUrl, fixture }) => {
      const { state, DEFAULT_TEXT_FONT } = await import(stateUrl);
      const { prepareLoadedProject, serialize } = await import(projectUrl);
      state.update(s => {
        s.objects = [
          { id: 'inline-background', type: 'image', src: fixture, x: -14, y: -12, w: 28, h: 24, rotation: 0, mode: 'edit', opacity: 1, exportable: true, aspectLocked: true, cutouts: [], layerId: 1, order: 0 },
          { id: 'inline-line', type: 'line', p1: { x: -12, y: 8 }, p2: { x: 12, y: 8 }, rotation: 0, strokeWidth: .3, strokeLevel: 0, lineMode: 'solid', arrowHead: 'none', layerId: 1, order: 1 },
          { id: 'inline-seed', type: 'labeler', p1: { x: -7, y: -3 }, elbow: { x: -4, y: -6 }, p2: { x: 1, y: -6 }, text: '기존 라벨', labelType: 'label', fontFamily: DEFAULT_TEXT_FONT, labelSize: 3, strokeWidth: .2, strokeLevel: 0, layerId: 1, order: 2, locked: false, positionLocked: false },
        ];
        s.selectedIds = []; s.undoStack = []; s.redoStack = [];
        s.artboard = { w: 100, h: 100 }; s.viewBox = { x: -50, y: -50, w: 100, h: 100 };
        // Use canonical object defaults so reopening does not look like a data
        // change merely because the normal loader backfills fixture fields.
        s.objects = prepareLoadedProject(serialize(s)).active.objects;
      });
    }, { stateUrl, projectUrl, fixture });
    await h.crop(page); await h.place(page);
    const first = (await h.pictures(page))[0], originalPixels = await bitmap(page, true);
    const { pixels: ignoredOriginalPixels, ...originalBitmap } = originalPixels;
    const committedBackground = background(sourceObjects(first.figure));
    assert.equal(labels(sourceObjects(first.figure)).length, 1);
    assert.ok(first.figure.render.bounds, 'the picture has a committed crop');

    // A dormant original tab has an unrelated background draft. Inline Apply
    // must patch its labels without publishing or discarding that drawing edit.
    await h.action(page, 'close');
    await page.evaluate(async ({ stateUrl, projectUrl, surface, link }) => {
      const { state } = await import(stateUrl);
      const { prepareLoadedProject, serialize } = await import(projectUrl);
      const { addPage } = await import('/js/pages.js?v=1.7.0-four-session-integration');
      addPage(state);
      state.update(s => {
        s.objects = [{ id: 'unrelated-inline-tab', type: 'line', p1: { x: 0, y: 0 }, p2: { x: 2, y: 2 }, layerId: 1, order: 0, strokeWidth: .3 }];
        const linked = s.pages.find(p => p.meta?.examLink?.tabId === link.tabId);
        linked.objects.find(o => o.id === 'inline-line').p2.y += 3;
        s.objects = prepareLoadedProject(serialize(s)).active.objects;
      });
    }, { stateUrl, projectUrl, surface, link: first.figure.link });
    const unrelated = await h.drawing(page, stateUrl);
    const draftBackground = background((await linkedDrawing(page, stateUrl, first.figure.link)).objects);
    assert.notDeepEqual(draftBackground, committedBackground, 'the background draft differs from the committed source');
    await returnToExistingExam(page);
    await openInline(page);
    assert.equal(await canvas(page).locator('g[data-annotation-id]').count(), 1);
    const originalBoxes = await annotationBoxes(page);

    await clickText(page, 'inline-seed', true);
    assert.equal(await field(page, 'text').evaluate(node => node === document.activeElement), true, 'label double-click focuses the toolbar textarea');
    const captionHandle=canvas(page).locator('[data-inline-handle="p2"]');
    assert.deepEqual(await captionHandle.evaluate(node=>({x:Number(node.getAttribute('cx')),y:Number(node.getAttribute('cy'))})),{x:1,y:-6},'label handle sits at the actual caption centre');
    const handleBox=await captionHandle.boundingBox();
    await page.mouse.dblclick(handleBox.x+handleBox.width/2,handleBox.y+handleBox.height/2);
    assert.equal(await field(page, 'text').evaluate(node=>node===document.activeElement),true,'the centred handle also supports text double-click');
    await changeField(page, 'text', '기존 라벨 수정');
    await waitLabel(page, stateUrl, first.figure.link, 'inline-seed', { text: '기존 라벨 수정' });

    await button(page, 'add-label').click();
    assert.equal(await canvas(page).locator('g[data-annotation-id]').count(), 1, 'the add button waits for placement');
    await clickSvg(page, .72, .3);
    assert.equal(await field(page, 'text').evaluate(node => node === document.activeElement), true, 'placing a label focuses its text field');
    await changeField(page, 'text', '추가 라벨');
    let drawing = await linkedDrawing(page, stateUrl, first.figure.link);
    const added = labels(drawing.objects).find(o => o.id !== 'inline-seed');
    assert.ok(added, 'a new label is stored as an original 5E object');
    assert.equal(added.type, 'labeler'); assert.equal(added.text, '추가 라벨'); assert.deepEqual(added.p1, added.p2, 'text-only labels have no leader');
    await dragFrom(page, await textPoint(page, added.id), 18, 10);
    const moved = labels((await linkedDrawing(page, stateUrl, first.figure.link)).objects).find(o => o.id === added.id);
    assert.notDeepEqual(moved.p2, added.p2, 'pointer-up persists label movement'); assert.deepEqual(moved.p1, moved.p2);
    await changeField(page, 'size', 12);
    await changeField(page, 'stroke', .35);
    const otherFont = await field(page, 'font').evaluate(select => [...select.options].find(option => !option.disabled && option.value !== select.value)?.value);
    assert.ok(otherFont, 'font control offers another font'); await changeField(page, 'font', otherFont);
    await waitLabel(page, stateUrl, first.figure.link, added.id, { labelSize: 12 * 25.4 / 72, strokeWidth: .35, fontFamily: otherFont });

    await button(page, 'add-leader').click();
    const anchor = await clickSvg(page, .25, .55);
    assert.equal(await canvas(page).locator('g[data-annotation-id]').count(), 2, 'the leader anchor waits for a label point');
    const labelPoint = await clickSvg(page, .62, .72);
    assert.equal(await field(page, 'text').evaluate(node => node === document.activeElement), true);
    await changeField(page, 'text', '새 지시선');
    drawing = await linkedDrawing(page, stateUrl, first.figure.link);
    const leader = labels(drawing.objects).find(o => !['inline-seed', added.id].includes(o.id));
    assert.ok(leader); assert.equal(leader.text, '새 지시선');
    for (const [key, expected] of [['p1', anchor], ['p2', labelPoint]]) {
      assert.ok(Math.abs(leader[key].x - expected.x) < .1 && Math.abs(leader[key].y - expected.y) < .1, `${key} uses the clicked SVG coordinates: ${JSON.stringify({ actual: leader[key], expected })}`);
    }

    await clickText(page, 'inline-seed');
    for (const [key, dx, dy] of [['p1', -9, 8], ['p2', 10, 6], ['elbow', -8, -7]]) {
      const before = labels((await linkedDrawing(page, stateUrl, first.figure.link)).objects).find(o => o.id === 'inline-seed');
      await drag(page, canvas(page).locator(`[data-inline-handle="${key}"]`), dx, dy);
      const after = labels((await linkedDrawing(page, stateUrl, first.figure.link)).objects).find(o => o.id === 'inline-seed');
      assert.notDeepEqual(after[key], before[key], `${key} handle updates source geometry`);
      for (const other of ['p1', 'p2', 'elbow'].filter(other => other !== key)) assert.deepEqual(after[other], before[other], `${key} drag preserves ${other}`);
      if (key === 'elbow') {
        await button(page, 'undo').click(); await waitLabel(page, stateUrl, first.figure.link, before.id, { elbow: before.elbow });
        await button(page, 'redo').click(); await waitLabel(page, stateUrl, first.figure.link, after.id, { elbow: after.elbow });
      }
    }
    await clickText(page, added.id); await button(page, 'delete').click();
    await waitLabel(page, stateUrl, first.figure.link, added.id, null);
    assert.equal(await wrapper(page, added.id).count(), 0);
    await button(page, 'undo').click(); await waitLabel(page, stateUrl, first.figure.link, added.id, { text: '추가 라벨' });
    await button(page, 'redo').click(); await waitLabel(page, stateUrl, first.figure.link, added.id, null);
    await button(page, 'undo').click(); await waitLabel(page, stateUrl, first.figure.link, added.id, { text: '추가 라벨' });
    const draftLabels = labels((await linkedDrawing(page, stateUrl, first.figure.link)).objects);
    const editedBoxes = await annotationBoxes(page);
    assert.equal(draftLabels.length, 3);
    await page.screenshot({ path: path.join(evidence, name + '-draft.png') });

    await button(page, 'close').click(); await root(page).waitFor({ state: 'hidden' }); await h.idle(page);
    assert.deepEqual(labels((await linkedDrawing(page, stateUrl, first.figure.link)).objects), draftLabels, 'closing retains unapplied annotations');
    assert.deepEqual((await h.pictures(page))[0].figure, first.figure, 'closing does not change the document source');
    assert.deepEqual(await bitmap(page), originalBitmap, 'closing leaves the committed bitmap intact');
    assert.match(await page.locator('.exam-figure span').textContent(), /미반영/);
    const draft = await save(page, name + '-unapplied.5e');
    assert.deepEqual(labels(sourceObjects(draft.project.figures[0])), labels(sourceObjects(first.figure)), 'draft save retains the committed document source');
    const savedTab = draft.project.workspace.drawing.pages.find(p => p.meta?.examLink?.tabId === first.figure.link.tabId);
    assert.deepEqual(labels(savedTab.objects), draftLabels, 'portable workspace stores unapplied labeler data');
    assert.deepEqual(background(savedTab.objects), draftBackground);
    assert.deepEqual(draft.project.workspace.drawing.pages.find(p => p.id === unrelated.activePageId).objects, unrelated.objects, 'serialization writes back the active unrelated tab');
    assert.deepEqual(pageObjects(await h.drawing(page, stateUrl), unrelated.activePageId), unrelated.objects);

    const reopened = await freshPage(browser, origin, surface, errors, contexts);
    await reopened.locator('#exam-project-file').setInputFiles(draft.file); await h.idle(reopened);
    assert.deepEqual(labels((await linkedDrawing(reopened, stateUrl, first.figure.link)).objects), draftLabels);
    assert.deepEqual(await bitmap(reopened), originalBitmap);
    await openInline(reopened);
    for (const label of draftLabels) assert.ok((await wrapper(reopened, label.id).textContent()).includes(label.text), 'restored inline labels show the saved draft');
    await button(reopened, 'original').click(); await root(reopened).waitFor({ state: 'hidden' });
    await reopened.locator('#exam-edit-bar').waitFor({ state: 'visible' });
    assert.equal((await h.drawing(reopened, stateUrl)).activePageId, savedTab.id, 'Original activates the actual source tab');
    assert.deepEqual(labels((await h.drawing(reopened, stateUrl)).objects), draftLabels);
    await returnToExistingExam(reopened); await openInline(reopened);

    await button(reopened, 'apply').click(); await root(reopened).waitFor({ state: 'hidden' }); await h.idle(reopened);
    assert.equal(await reopened.locator('.capture-overlay').isVisible(), false, 'Apply uses the fixed crop without recapture');
    assert.equal(await reopened.locator('#exam-inline-crop-dialog').count(), 0);
    assert.equal(await reopened.locator('#exam-edit-bar').isVisible(), false);
    assert.equal(await reopened.locator('#exam-status').getAttribute('data-error'), 'false', await reopened.locator('#exam-status').textContent());
    const applied = (await h.pictures(reopened))[0];
    assert.notEqual(applied.figure.id, first.figure.id); assert.deepEqual(applied.figure.link, first.figure.link);
    assert.deepEqual(applied.figure.render.bounds, first.figure.render.bounds, 'inline Apply retains the committed crop');
    for (const key of ['width', 'height', 'horzOffset', 'vertOffset', 'treatAsChar', 'rotationAngle']) assert.equal(applied.props[key], first.props[key], `fixed-crop Apply retains native ${key}`);
    assert.deepEqual(labels(sourceObjects(applied.figure)), draftLabels, 'committed PNG carries edited labeler objects');
    assert.deepEqual(background(sourceObjects(applied.figure)), committedBackground, 'annotation Apply does not publish the background draft');
    assert.deepEqual(background((await linkedDrawing(reopened, stateUrl, first.figure.link)).objects), draftBackground, 'annotation Apply preserves the live background draft');
    assert.match(await reopened.locator('.exam-figure').first().textContent(), /미반영/, 'the genuine background draft remains indicated after annotation Apply');
    assert.deepEqual(pageObjects(await h.drawing(reopened, stateUrl), unrelated.activePageId), unrelated.objects);
    const appliedPixels = await bitmap(reopened, true);
    const { pixels: ignoredAppliedPixels, ...appliedBitmap } = appliedPixels;
    assert.equal(appliedBitmap.width, originalBitmap.width); assert.equal(appliedBitmap.height, originalBitmap.height);
    assert.notEqual(appliedBitmap.digest, originalBitmap.digest, 'Apply updates rendered pixels as well as metadata');
    unchangedBackground(originalPixels, appliedPixels, first.figure.render.bounds, [...originalBoxes, ...editedBoxes], [...labels(sourceObjects(first.figure)), ...draftLabels]);

    await nativeHistory(reopened, 'undo', first.figure.id); await openInline(reopened);
    assert.deepEqual(labels((await linkedDrawing(reopened, stateUrl, first.figure.link)).objects), labels(sourceObjects(first.figure)), 'native RHWP Undo restores the previous inline annotation revision');
    assert.deepEqual(background((await linkedDrawing(reopened, stateUrl, first.figure.link)).objects), draftBackground, 'native Undo retains the nonlabel draft');
    assert.deepEqual(await bitmap(reopened), originalBitmap, 'native Undo restores the exact committed pixels');
    await button(reopened, 'close').click(); await root(reopened).waitFor({ state: 'hidden' }); await h.idle(reopened);
    await nativeHistory(reopened, 'redo', applied.figure.id); await openInline(reopened);
    assert.deepEqual(labels((await linkedDrawing(reopened, stateUrl, first.figure.link)).objects), draftLabels, 'native RHWP Redo restores the edited inline annotation revision');
    assert.deepEqual(background((await linkedDrawing(reopened, stateUrl, first.figure.link)).objects), draftBackground, 'native Redo retains the nonlabel draft');
    assert.deepEqual(await bitmap(reopened), appliedBitmap, 'native Redo restores the exact applied pixels');
    await button(reopened, 'close').click(); await root(reopened).waitFor({ state: 'hidden' }); await h.idle(reopened);
    const saved = await save(reopened, name + '-applied.5e');
    assert.deepEqual(labels(sourceObjects(saved.project.figures.find(figure => figure.id === applied.figure.id))), draftLabels);
    assert.deepEqual(saved.project.workspace.drawing.pages.find(p => p.id === unrelated.activePageId).objects, unrelated.objects, 'applied save retains the unrelated serialized tab');

    const portable = await freshPage(browser, origin, surface, errors, contexts);
    await portable.locator('#exam-project-file').setInputFiles(saved.file); await h.idle(portable);
    assert.deepEqual((await h.pictures(portable))[0].figure, applied.figure);
    assert.deepEqual(await bitmap(portable), appliedBitmap);
    assert.deepEqual(background((await linkedDrawing(portable, stateUrl, first.figure.link)).objects), draftBackground, 'applied .5e also retains the uncommitted background');
    assert.deepEqual(pageObjects(await h.drawing(portable, stateUrl), unrelated.activePageId), unrelated.objects);
    await openInline(portable);
    await button(portable, 'crop').click();
    const cropDialog = portable.locator('#exam-inline-crop-dialog'); await cropDialog.waitFor({ state: 'visible' });
    assert.equal(await portable.locator('.capture-overlay').isVisible(), false, 'Crop uses the explicit inline area editor');
    // Shrink the crop through its visible corner, cancel, then repeat and confirm.
    await drag(portable, cropDialog.locator('[data-crop-handle="se"]'), -16, -12);
    await cropDialog.locator('[data-crop-cancel]').click(); await cropDialog.waitFor({ state: 'hidden' });
    assert.deepEqual((await h.pictures(portable))[0].figure.render.bounds, applied.figure.render.bounds);
    await button(portable, 'crop').click(); await cropDialog.waitFor({ state: 'visible' });
    await drag(portable, cropDialog.locator('[data-crop-handle="se"]'), -16, -12);
    await cropDialog.locator('[data-crop-confirm]').click(); await cropDialog.waitFor({ state: 'hidden' });
    assert.deepEqual((await h.pictures(portable))[0].figure.render.bounds, applied.figure.render.bounds, 'area confirmation waits for Apply');
    await button(portable, 'apply').click(); await root(portable).waitFor({ state: 'hidden' }); await h.idle(portable);
    const cropped = (await h.pictures(portable))[0];
    assert.ok(cropped.figure.render.bounds.w < applied.figure.render.bounds.w && cropped.figure.render.bounds.h < applied.figure.render.bounds.h, 'explicit crop confirmation is applied');
    assert.deepEqual(labels(sourceObjects(cropped.figure)), draftLabels);
    assert.deepEqual(background((await linkedDrawing(portable, stateUrl, first.figure.link)).objects), draftBackground);
    await portable.screenshot({ path: path.join(evidence, name + '-committed.png') });

    // Keep the toolbar field focused while the real source tab changes the same
    // label, then blur. This exercises the actual stale-patch boundary without
    // mocking requests or allowing refresh to replace the user's typed draft.
    await openInline(portable); await clickText(portable, 'inline-seed', true);
    await field(portable, 'text').fill('인라인 충돌 초안');
    await portable.evaluate(async ({ stateUrl, link }) => {
      const { state } = await import(stateUrl);
      state.update(s => {
        const page = s.pages.find(p => p.meta?.examLink?.tabId === link.tabId);
        const objects = page.id === s.activePageId ? s.objects : page.objects;
        objects.find(o => o.id === 'inline-seed').text = '원본 라벨 동시 수정';
      });
    }, { stateUrl, link: cropped.figure.link });
    await field(portable, 'text').press('Tab');
    await h.waitForState(portable,() => document.querySelector('#exam-status')?.dataset.error === 'true');
    assert.match(await portable.locator('#exam-status').textContent(), /라벨.*보관/);
    await waitLabel(portable, stateUrl, first.figure.link, 'inline-seed', { text: '원본 라벨 동시 수정' });
    assert.deepEqual((await h.pictures(portable))[0].figure, cropped.figure, 'a stale annotation patch cannot change the document');
    await button(portable, 'apply').click(); await h.idle(portable);
    assert.equal(await root(portable).isVisible(), true, 'conflicted Apply keeps the attempted draft open');
    assert.deepEqual((await h.pictures(portable))[0].figure, cropped.figure);
    await button(portable, 'close').click(); await root(portable).waitFor({ state: 'hidden' }); await h.idle(portable);
    const conflict = await save(portable, name + '-conflict.5e');
    const recovery = conflict.project.workspace.annotationDrafts?.find(draft => draft.id === cropped.figure.id);
    assert.ok(recovery, 'save retains the rejected annotation patch as a separate recoverable draft');
    assert.equal(recovery.edited.find(label => label.id === 'inline-seed').text, '인라인 충돌 초안');
    const conflictTab = conflict.project.workspace.drawing.pages.find(p => p.meta?.examLink?.tabId === first.figure.link.tabId);
    assert.equal(conflictTab.objects.find(o => o.id === 'inline-seed').text, '원본 라벨 동시 수정');

    const recovered = await freshPage(browser, origin, surface, errors, contexts);
    await recovered.locator('#exam-project-file').setInputFiles(conflict.file); await h.idle(recovered);
    await openInline(recovered);
    assert.ok((await wrapper(recovered, 'inline-seed').textContent()).includes('인라인 충돌 초안'), 'reopening displays the attempted annotation draft');
    const recoveryBanner = root(recovered).locator('.exam-inline-recovery');
    assert.equal(await recoveryBanner.isVisible(), true, 'recovered annotations have a persistent replacement notice');
    assert.match(await recoveryBanner.textContent(), /초안.*현재 라벨.*바꿉니다/);
    await waitLabel(recovered, stateUrl, first.figure.link, 'inline-seed', { text: '원본 라벨 동시 수정' });
    assert.deepEqual((await h.pictures(recovered))[0].figure, cropped.figure, 'recovery preview waits for explicit Apply');
    await recovered.screenshot({ path: path.join(evidence, name + '-recovery.png') });
    await button(recovered, 'close').click(); await root(recovered).waitFor({ state: 'hidden' }); await h.idle(recovered);
    const retained = await save(recovered, name + '-recovery-retained.5e');
    assert.deepEqual(retained.project.workspace.annotationDrafts.find(draft => draft.id === cropped.figure.id), recovery, 'closing a recovered preview retains its portable recovery data');
    await openInline(recovered); await button(recovered, 'apply').click(); await root(recovered).waitFor({ state: 'hidden' }); await h.idle(recovered);
    const resolved = (await h.pictures(recovered))[0];
    assert.equal(sourceObjects(resolved.figure).find(o => o.id === 'inline-seed').text, '인라인 충돌 초안', 'explicit Apply commits the displayed recovered draft');
    await waitLabel(recovered, stateUrl, first.figure.link, 'inline-seed', { text: '인라인 충돌 초안' });
    assert.deepEqual(background((await linkedDrawing(recovered, stateUrl, first.figure.link)).objects), draftBackground);
    const resolvedSave = await save(recovered, name + '-recovery-applied.5e');
    assert.equal(resolvedSave.project.workspace.annotationDrafts?.some(draft => draft.id === cropped.figure.id) || false, false, 'successful recovery Apply clears the pending recovery');
    assert.deepEqual(errors, [], 'all original and reopened pages are free of runtime errors');
    console.log(name + ': inline placement, fields, label/handle drags, local and native undo/redo, identical background pixels, fixed crop, background drafts, Original, conflicts/recovery and .5e roundtrips passed');
  } catch (error) {
    const failed = contexts.at(-1)?.pages().at(-1);
    if (failed && !failed.isClosed()) {
      await failed.screenshot({ path: path.join(evidence, name + '-failure.png') }).catch(() => {});
      const diagnostic = await failed.evaluate(() => {
        const svg = document.querySelector('#exam-inline-editor svg.exam-inline-canvas');
        const rect = svg?.getBoundingClientRect();
        return {
          status: document.querySelector('#exam-status')?.textContent,
          inlineVisible: document.querySelector('#exam-inline-editor')?.hidden === false,
          canvas: rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          viewBox: svg?.getAttribute('viewBox'),
          handles: [...(svg?.querySelectorAll('[data-inline-handle]') || [])].map(node => ({ point: node.dataset.inlineHandle, radius: node.getAttribute('r') })),
        };
      }).catch(() => null);
      console.error(name + ' failure diagnostic:', diagnostic);
    }
    throw error;
  } finally { for (const context of contexts.reverse()) await context.close(); }
}

h.withServer(async origin => {
  fs.mkdirSync(evidence, { recursive: true });
  for (const [engineName, engine] of Object.entries({ chromium, webkit }).filter(([name]) => !process.env.EXAM_ENGINE || name === process.env.EXAM_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const surface of ['', 'preview/'].filter(s => !process.env.EXAM_SURFACE || s === (process.env.EXAM_SURFACE === 'preview' ? 'preview/' : ''))) {
        await scenario(browser, origin, surface, engineName + (surface ? '-preview' : '-root'));
      }
    } finally { await browser.close(); }
  }
}).catch(error => { console.error(error); process.exitCode = 1; });
