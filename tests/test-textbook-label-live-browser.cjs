const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/Users/parkseungyeon/Documents/Codex/2026-09-06/x20/5E/.omo/worktrees/5e-170-development/node_modules/playwright')); }

const worktree = path.resolve(__dirname, '..');
const evidence = process.env.TEXTBOOK_EVIDENCE_DIR || path.join(worktree, '.omo/evidence/textbook-label-live');
const candidatesPath = process.env.TEXTBOOK_CANDIDATES || '/Users/parkseungyeon/.codex/visualizations/2026/09/30/01a0f1d3-b288-75f0-9f2c-c279cdcf15ed/textbook-label-candidates-20261001/candidates.json';
const previewUrl = process.env.PREVIEW_URL || process.env.RELEASE_URL || 'http://127.0.0.1:8830/';
const moduleBase = process.env.APP_MODULE_BASE || '/js/';
const moduleQuery = process.env.APP_MODULE_QUERY ?? '?v=1.7.0-four-session-integration';
const canonical = object => object.rawSource ?? object.source ?? object.text ?? '';
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const writeJSON = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));

function responseText(raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return raw; }
  if (typeof parsed === 'string') return parsed;
  // This is a transport wrapper only: no model-returned label fields are repaired.
  if (Array.isArray(parsed?.labels)) return `<5e-editable-labels>${JSON.stringify(parsed)}</5e-editable-labels>`;
  if (typeof parsed?.response === 'string') return parsed.response;
  if (typeof parsed?.text === 'string') return parsed.text;
  throw new Error('Raw AI response must be a tagged response string or a production label-plan payload.');
}

function inputsFor(candidate) {
  const folders = [candidate.slug, String(candidate.id), String(candidate.id).padStart(2, '0'), `${String(candidate.id).padStart(2, '0')}-${candidate.slug}`];
  for (const folder of folders) {
    const dir = path.join(evidence, 'outputs', folder);
    const plan = path.join(dir, 'label-plan.raw.json');
    const image = path.join(dir, 'generated.png');
    if (fs.existsSync(plan) && fs.existsSync(image)) return { dir, plan, image };
  }
  return null;
}

async function makePage(browser) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await page.addInitScript(() => localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(previewUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#canvas');
  await page.evaluate(async ({ moduleBase, moduleQuery }) => {
    const v = moduleQuery;
    const { state } = await import(moduleBase + 'state.js' + v);
    const { serialize, applyLoaded } = await import(moduleBase + 'project-io.js' + v);
    const { insertImageFromSrc } = await import(moduleBase + 'image-paste.js' + v);
    const { parseEditableImageLabelPlan } = await import(moduleBase + 'ai-editable-image-labels.js' + v);
    const { prepareEditableLabelFonts, nativeLabelCenter } = await import(moduleBase + 'ai-label-typography.js' + v);
    const { undo, redo } = await import(moduleBase + 'transform.js' + v);
    window.__textbookQA = { state, serialize, applyLoaded, insertImageFromSrc, parseEditableImageLabelPlan, prepareEditableLabelFonts, nativeLabelCenter, undo, redo };
  }, { moduleBase, moduleQuery });
  return { page, errors };
}

async function cancelEditor(page) {
  const editor = page.locator('.unified-text-editor');
  if (await editor.isVisible()) await editor.getByRole('button', { name: '취소', exact: true }).click();
}

async function loadProject(page, project) {
  await cancelEditor(page);
  await page.evaluate(project => {
    const q = window.__textbookQA;
    q.applyLoaded(q.state, structuredClone(project));
    q.state.update(s => { s.activeTool = 'V'; s.selectedIds = []; s.draft = null; });
  }, project);
}

async function insertCase(page, candidate, input) {
  const response = responseText(fs.readFileSync(input.plan, 'utf8'));
  const src = 'data:image/png;base64,' + fs.readFileSync(input.image).toString('base64');
  return page.evaluate(async ({ candidate, response, src }) => {
    const q = window.__textbookQA;
    q.applyLoaded(q.state, { version: '0.17', pages: [{ id: candidate.slug, name: candidate.title, objects: [], artboard: { w: 90, h: 60 } }], activePageId: candidate.slug });
    const plan = q.parseEditableImageLabelPlan(response, { preserveSourceLabels: true, referenceCount: 1 });
    await q.prepareEditableLabelFonts(plan.labels);
    await q.insertImageFromSrc(q.state, src, { preserveBytes: true, centerArtboard: true, aiTaskId: 'textbook-live-ai', aiCandidateId: candidate.slug, editableLabelPlan: plan });
    await document.fonts.ready;
    q.state.update(s => { s.selectedIds = []; s.activeTool = 'V'; });
    const project = q.serialize(q.state.get());
    const image = q.state.get().objects.find(o => o.type === 'image');
    const labels = q.state.get().objects.filter(o => o.aiAutoLabel);
    return { plan: structuredClone(plan), project, image: structuredClone(image), labels: structuredClone(labels), positions: labels.map((o, index) => ({ index, id: o.id, text: o.rawSource ?? o.source ?? o.text, type: o.type, aiPosition: plan.labels[index]?.position, aiBounds: plan.labels[index]?.typography?.bounds, nativeCenter: o.type === 'labeler' ? o.p2 : q.nativeLabelCenter(o) })) };
  }, { candidate: { slug: candidate.slug, title: candidate.title }, response, src });
}

async function object(page, id) {
  return page.evaluate(id => structuredClone(window.__textbookQA.state.get().objects.find(o => o.id === id)), id);
}

async function glyphs(page, id) {
  return page.evaluate(id => {
    const root = document.querySelector(`#canvas [data-id="${id}"]`);
    const texts = root ? [...(root.matches('text') ? [root] : []), ...root.querySelectorAll('text')] : [];
    const boxes = texts.map(element => ({ element, rect: element.getBoundingClientRect() })).filter(item => item.rect.width && item.rect.height);
    if (!boxes.length) return null;
    // Click the center of a real rendered text element, never an editor API.
    const largest = boxes.reduce((a, b) => a.rect.width * a.rect.height >= b.rect.width * b.rect.height ? a : b);
    const rects = boxes.map(item => item.rect);
    return { point: { x: largest.rect.x + largest.rect.width / 2, y: largest.rect.y + largest.rect.height / 2 }, rect: { left: Math.min(...rects.map(r => r.left)), right: Math.max(...rects.map(r => r.right)), top: Math.min(...rects.map(r => r.top)), bottom: Math.max(...rects.map(r => r.bottom)) }, fonts: texts.map(e => ({ text: e.textContent, family: e.getAttribute('font-family') || getComputedStyle(e).fontFamily, style: e.getAttribute('font-style') || getComputedStyle(e).fontStyle, size: Number.parseFloat(e.getAttribute('font-size') || getComputedStyle(e).fontSize) })), svg: root.outerHTML };
  }, id);
}

async function openByGlyph(page, id, expected) {
  await page.evaluate(() => window.__textbookQA.state.update(s => { s.selectedIds = []; s.activeTool = 'V'; }));
  const render = await glyphs(page, id);
  assert.ok(render, `Missing rendered glyphs: ${id}`);
  await page.mouse.dblclick(render.point.x, render.point.y, { delay: 80 });
  const editor = page.locator('.unified-text-editor');
  await editor.waitFor({ state: 'visible', timeout: 1200 });
  const editingId = await page.evaluate(() => window.__textbookQA.state.get().draftText?.editingId);
  assert.equal(editingId, id, 'Pointer must open the requested object, including repeated labels');
  assert.equal(await editor.locator('textarea').inputValue(), expected, 'Pointer must open the entire canonical source');
  return { editor, render };
}

async function confirm(editor) {
  await editor.getByRole('button', { name: '확인', exact: true }).click();
}

async function roundtrip(page) {
  return page.evaluate(() => {
    const q = window.__textbookQA;
    const normalized = objects => objects.map(o => o.type === 'image' ? { recognized: false, ...o } : o);
    const before = structuredClone(q.state.get().objects);
    const saved = q.serialize(q.state.get());
    q.applyLoaded(q.state, JSON.parse(JSON.stringify(saved)));
    return { preserved: JSON.stringify(normalized(before)) === JSON.stringify(normalized(q.state.get().objects)), project: q.serialize(q.state.get()) };
  });
}

async function checkOriginalPlacement(page, project, label) {
  await loadProject(page, project);
  const result = { id: label.id, text: canonical(label), pass: false };
  try {
    const first = await openByGlyph(page, label.id, result.text);
    result.render = first.render;
    await confirm(first.editor);
    result.pass = true;
  } catch (error) { result.error = error.message; }
  await cancelEditor(page);
  return result;
}

async function exerciseNative(page, project, label, artifactDir, index) {
  // Keep the exact AI-produced target object and image. Removing other labels
  // separates native editing mechanics from actual-placement overlap failures,
  // which are reported independently above and never hidden.
  const isolated = structuredClone(project);
  isolated.pages[0].objects = isolated.pages[0].objects.filter(o => o.type === 'image' || o.id === label.id);
  await loadProject(page, isolated);
  const row = { id: label.id, text: canonical(label), type: label.type, pass: false, scope: 'isolated-native-object-with-original-AI-geometry' };
  try {
    row.before = await object(page, label.id);
    let opened = await openByGlyph(page, label.id, row.text);
    row.initialPointer = true; row.initialRender = opened.render;
    if (index === 0) await opened.editor.screenshot({ path: path.join(artifactDir, 'first-label-editor.png') });
    await confirm(opened.editor);
    row.noop = await object(page, label.id);
    assert.deepEqual(row.noop, row.before, 'No-op must retain the complete automatic label');
    opened = await openByGlyph(page, label.id, row.text);
    await opened.editor.locator('.unified-style-size').selectOption('14');
    await confirm(opened.editor);
    row.resized = await object(page, label.id);
    assert.ok(Math.abs((row.resized.fontSize ?? row.resized.labelSize) - 14 * 25.4 / 72) < 1e-8);
    assert.deepEqual(row.resized.labelRuns, row.before.labelRuns, 'Size-only edit must preserve semantic runs');
    assert.deepEqual(row.resized.labelScriptStyles, row.before.labelScriptStyles, 'Size-only edit must preserve script styles');
    const changed = row.text + (label.type === 'formula' || label.contentMode === 'formula' ? ' + 1' : ' 검수');
    opened = await openByGlyph(page, label.id, row.text);
    await opened.editor.locator('textarea').fill(changed);
    await confirm(opened.editor);
    row.edited = await object(page, label.id);
    assert.equal(canonical(row.edited), changed);
    row.undoRedo = await page.evaluate(({ id, original, changed }) => {
      const q = window.__textbookQA;
      const text = () => { const o = q.state.get().objects.find(x => x.id === id); return o.rawSource ?? o.source ?? o.text; };
      q.undo(q.state); const undone = text() === original;
      q.redo(q.state); return undone && text() === changed;
    }, { id: label.id, original: row.text, changed });
    assert.ok(row.undoRedo, 'Content edit must support undo and redo');
    row.roundtrip = (await roundtrip(page)).preserved;
    assert.ok(row.roundtrip, 'Production serialization must preserve every label field');
    opened = await openByGlyph(page, label.id, changed); row.reopenedPointer = true;
    const currentFamily = row.edited.fontFamily;
    const options = await opened.editor.locator('.unified-style-select option').evaluateAll(options => options.map(o => ({ label: o.textContent, value: o.value })));
    const desired = options.find(o => o.label === '한글 텍스트(돋움)' && o.value !== currentFamily) || options.find(o => o.label === '라벨' && o.value !== currentFamily);
    assert.ok(desired, 'A different existing product font must be available');
    await opened.editor.locator('.unified-style-select').selectOption(desired.value);
    await confirm(opened.editor);
    row.fontEdited = await object(page, label.id);
    assert.notEqual(row.fontEdited.fontFamily, currentFamily);
    assert.equal(canonical(row.fontEdited), changed);
    assert.ok(!row.fontEdited.labelRuns && !row.fontEdited.labelScriptStyles, 'Explicit font override must replace automatic partial styles');
    assert.ok((await roundtrip(page)).preserved);
    opened = await openByGlyph(page, label.id, changed);
    await opened.editor.locator('textarea').fill(row.text);
    await confirm(opened.editor);
    assert.equal(canonical(await object(page, label.id)), row.text, 'Saved object must support another real content edit');
    row.pass = true;
  } catch (error) {
    row.error = error.stack;
    try { await page.screenshot({ path: path.join(artifactDir, `label-${String(index + 1).padStart(2, '0')}-failure.png`) }); } catch {}
  }
  await cancelEditor(page);
  return row;
}

async function buildAndTest(options = {}) {
  const candidates = JSON.parse(fs.readFileSync(candidatesPath, 'utf8')).cases;
  const runId = options.runId || process.env.QA_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(evidence, 'browser-harness', runId);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const summary = { runId, generatedAt: new Date().toISOString(), inputContract: 'Actual AI output plans and generated PNGs only; no golden-label or position repair.', expectedCases: candidates.length, missingCases: [], rows: [], pageErrors: [], note: 'Actual-placement pointer checks and isolated native editing checks are separate. Native success does not establish extraction recall, source removal, exact font identity, or geometry fidelity.' };
  const pages = [];
  try {
    const { page, errors } = await makePage(browser);
    for (const candidate of candidates) {
      const input = inputsFor(candidate);
      if (!input) { summary.missingCases.push(candidate.slug); continue; }
      const artifactDir = path.join(out, candidate.slug);
      fs.mkdirSync(artifactDir, { recursive: true });
      fs.copyFileSync(candidate.image, path.join(artifactDir, 'source.png'));
      fs.copyFileSync(input.image, path.join(artifactDir, 'generated.png'));
      const row = { id: candidate.id, slug: candidate.slug, title: candidate.title, sourceSha256: sha256(candidate.image), planSha256: sha256(input.plan), generatedSha256: sha256(input.image), inputDirectory: input.dir };
      try {
        const inserted = await insertCase(page, candidate, input);
        row.planStatus = inserted.plan.status; row.rejectedCount = inserted.plan.rejectedCount; row.excludedCount = inserted.plan.excludedLabels?.length || 0;
        row.nativeLabelCount = inserted.labels.length; row.types = inserted.labels.reduce((types, label) => (types[label.type] = (types[label.type] || 0) + 1, types), {});
        row.canonicalLabels = inserted.labels.map(canonical);
        row.fullProjectRoundtrip = (await roundtrip(page)).preserved;
        const original = (await page.evaluate(() => window.__textbookQA.serialize(window.__textbookQA.state.get())));
        pages.push(original.pages[0]);
        await page.locator('#canvas').screenshot({ path: path.join(artifactDir, 'restored-labels.png') });
        writeJSON(path.join(artifactDir, 'parsed-plan.json'), inserted.plan);
        writeJSON(path.join(artifactDir, 'native-positions.json'), { image: { id: inserted.image.id, x: inserted.image.x, y: inserted.image.y, w: inserted.image.w, h: inserted.image.h }, labels: inserted.positions, note: 'AI source-normalized positions are applied without correction to the generated image. This data does not prove source/target geometry agreement.' });
        writeJSON(path.join(artifactDir, 'initial-native-objects.json'), inserted.labels);
        if (!options.buildOnly) {
          row.actualPlacement = [];
          row.nativeEditing = [];
          for (let index = 0; index < inserted.labels.length; index++) {
            const label = inserted.labels[index];
            row.actualPlacement.push(await checkOriginalPlacement(page, original, label));
            row.nativeEditing.push(await exerciseNative(page, original, label, artifactDir, index));
            writeJSON(path.join(artifactDir, 'interaction-results.json'), { actualPlacement: row.actualPlacement, nativeEditing: row.nativeEditing });
          }
          row.actualPlacementPass = row.actualPlacement.filter(r => r.pass).length;
          row.nativeEditingPass = row.nativeEditing.filter(r => r.pass).length;
          row.pass = row.nativeLabelCount > 0 && row.rejectedCount === 0 && row.fullProjectRoundtrip && row.actualPlacementPass === row.nativeLabelCount && row.nativeEditingPass === row.nativeLabelCount;
        }
      } catch (error) { row.pass = false; row.error = error.stack; }
      summary.rows.push(row);
      writeJSON(path.join(out, 'summary.json'), summary);
      console.log(JSON.stringify({ case: row.slug, labels: row.nativeLabelCount, actualPlacement: row.actualPlacementPass, nativeEditing: row.nativeEditingPass, pass: row.pass }));
    }
    summary.pageErrors = errors;
    summary.completedCases = summary.rows.length;
    summary.nativeLabelCount = summary.rows.reduce((n, r) => n + (r.nativeLabelCount || 0), 0);
    summary.actualPlacementPass = summary.rows.reduce((n, r) => n + (r.actualPlacementPass || 0), 0);
    summary.nativeEditingPass = summary.rows.reduce((n, r) => n + (r.nativeEditingPass || 0), 0);
    summary.pass = !options.buildOnly && summary.missingCases.length === 0 && errors.length === 0 && summary.rows.every(r => r.pass);
    if (pages.length) {
      await loadProject(page, { version: '0.17', pages, activePageId: pages[0].id });
      const project = await page.evaluate(() => window.__textbookQA.serialize(window.__textbookQA.state.get()));
      const projectPath = path.join(evidence, 'textbook-label-live.5e');
      fs.writeFileSync(projectPath, JSON.stringify(project));
      summary.project = projectPath; summary.projectPages = pages.length;
    }
    writeJSON(path.join(out, 'summary.json'), summary);
    writeJSON(path.join(evidence, 'browser-harness', 'latest-summary.json'), { ...summary, evidenceDirectory: out });
    return { summary, out };
  } finally { await browser.close(); }
}

module.exports = { buildAndTest, inputsFor, responseText };
if (require.main === module) {
  buildAndTest({ buildOnly: process.argv.includes('--build-only') }).then(({ summary, out }) => {
    console.log(JSON.stringify({ pass: summary.pass, completedCases: summary.completedCases, missingCases: summary.missingCases, labels: summary.nativeLabelCount, actualPlacementPass: summary.actualPlacementPass, nativeEditingPass: summary.nativeEditingPass, evidence: out }));
    if (!process.argv.includes('--build-only') && !process.argv.includes('--available') && !summary.pass) process.exitCode = 1;
  }).catch(error => { console.error(error); process.exitCode = 1; });
}
