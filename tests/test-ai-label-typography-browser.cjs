// Fixed label source: 6e2c55012461859cdc8afb4d9596d3f08d5409b4; current-contract adaptations retain behavior oracles.
const { installLabelSourcePage } = require('./helpers/label-source-browser.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const evidence = process.env.EVIDENCE_DIR || path.resolve(__dirname, '../.omo/evidence/codex-continuation-20261010/label-current-contracts/ai-label-typography');

// Use the parent's running candidate; preserve its query when choosing an entry.
function entryUrl() {
  const supplied = process.env.RELEASE_URL || process.env.EXAM_URL || process.env.PREVIEW_URL;
  assert.ok(supplied, 'RELEASE_URL, EXAM_URL or PREVIEW_URL is required; this test never starts a server');
  const entry = new URL(supplied);
  if (process.env.APP_ENTRY) entry.pathname = process.env.APP_ENTRY;
  return entry.href;
}

test('general native typography preserves roles, bounds, rotation, pointer editing and save/load', { timeout: 60000 }, async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });await installLabelSourcePage(page);
    await page.addInitScript(() => localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true'));
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(entryUrl(), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#canvas');
    const result = await page.evaluate(async () => {
      const v = '?v=1.7.0-four-session-integration';
      const { state, DEFAULT_TEXT_FONT, DEFAULT_TEXT_SIZE_MM, EQUATION_FONT_FAMILY, TEXT_FONT_FAMILY } = await import('/js/state.js' + v);
      const { parseEditableImageLabelPlan } = await import('/js/ai-editable-image-labels.js' + v);
      const { insertImageFromSrc } = await import('/js/image-paste.js' + v);
      const { serialize, applyLoaded } = await import('/js/project-io.js' + v);
      const { undo, redo } = await import('/js/transform.js' + v);
      const { measureLabelTypography, labelTypographyText, nativePresentationForLabelTypography, nativeLabelCenter, positionNativeLabelAtCenter } = await import('/js/ai-label-typography.js' + v);
      const { getObjectBBox } = await import('/js/pick.js' + v);
      applyLoaded(state, { version: '0.17', pages: [{ id: 'qa', objects: [], artboard: { w: 90, h: 60 } }], activePageId: 'qa' });
      const specs = [
        ['m_B', 'quantity', 'formula', 0.15, 0.2, 0.09, 0.055],
        ['CO_2', 'chemical', 'formula', 0.35, 0.2, 0.1, 0.055],
        ['100', 'number', 'plain', 0.55, 0.2, 0.08, 0.05],
        ['A', 'name', 'plain', 0.75, 0.2, 0.04, 0.055],
        ['줄바꿈\n확인', 'text', 'plain', 0.15, 0.65, 0.16, 0.15],
        ['세포\n호흡', 'text', 'plain', 0.35, 0.65, 0.14, 0.15],
        ['200', 'number', 'plain', 0.55, 0.65, 0.09, 0.12],
        ['Na^+의 농도(M)', 'text', 'formula', 0.76, 0.65, 0.3, 0.07],
        ['세포 A', 'text', 'plain', 0.8, 0.9, 0.16, 0.065],
      ];
      const labels = specs.map(([text, role, contentMode, x, y, w, h], i) => ({ text, sourceKind: 'reference', sourceRef: 1,
        labelType: role === 'quantity' ? 'quantity' : 'label', contentMode, mode: 'text', scope: 'general', position: { x, y },
        typography: { role, bounds: { x: x - w / 2, y: y - h / 2, w, h }, orientation: 'horizontal', rotation: i === 6 ? -30 : 0,
          ...(i === 4 ? { font: 'Noto Sans KR', fontWeight: 'bold', letterSpacing: 0.1, lineHeight: 1.6 } : {}),
          ...(i === 0 ? { scriptStyles: [{ start: 2, end: 3, kind: 'sub', role: 'name' }] } : {}),
          ...(i === 8 ? { italic: true, runs: [{ text: '세포 ', role: 'text', contentMode: 'plain' }, { text: 'A', role: 'name', contentMode: 'plain' }] } : {}),
          ...(i === 7 ? { runs: [{ text: 'Na^+', role: 'chemical', contentMode: 'formula' },
            { text: '의 농도', role: 'text', contentMode: 'plain' }, { text: '(M)', role: 'unit', contentMode: 'plain' }] } : {}) } }));
      // Graph-owned labels and nongraph vertical writing are retained in the
      // source image; neither belongs in this general-label object fixture.
      labels.push({ ...labels[7], text: '그래프 축', scope: 'graph', typography: { role: 'text' } },
        { ...labels[4], text: '생명 활동', typography: { role: 'text', orientation: 'vertical' } });
      const plan = parseEditableImageLabelPlan(`<5e-editable-labels>${JSON.stringify({ version: 2, reviewRequired: true, labels })}</5e-editable-labels>`, { preserveSourceLabels: true, referenceCount: 1 });
      const c = document.createElement('canvas'); c.width = 1000; c.height = 500;
      const ctx = c.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, c.width, c.height);
      const imageId = await insertImageFromSrc(state, c.toDataURL(), { preserveBytes: true, centerArtboard: true, editableLabelPlan: plan });
      await document.fonts.ready;
      const defaults = state.get().objects.filter(o => o.aiAutoLabel).map(o => ({
        text: labelTypographyText(o), fontSize: o.fontSize, fontFamily: o.fontFamily,
        weight: o.fontWeight, italic: o.italic, tracking: o.letterSpacing, lineHeight: o.labelLineHeight,
        sourceBounds: structuredClone(o.aiLabelSourceBounds), rotation: o.rotation,
      }));
      // Cosmetic source observations must not set display styles. Separately
      // seed explicit saved user styles so their rendering/edit/roundtrip
      // oracles remain covered, including mixed-run italic overrides.
      state.update(s => {
        const native = s.objects.filter(o => o.aiAutoLabel);
        for (const index of [4, 8]) {
          const center = nativeLabelCenter(native[index]);
          Object.assign(native[index], nativePresentationForLabelTypography(plan.labels[index].typography));
          positionNativeLabelAtCenter(native[index], center);
        }
      });
      await document.fonts.ready;
      const saved = serialize(state.get());
      const before = state.get().objects.filter(o => o.aiAutoLabel).map(o => structuredClone(o));
      undo(state); const undone = state.get().objects.length === 0;
      redo(state); const redone = state.get().objects.length === 10;
      applyLoaded(state, structuredClone(saved));
      const after = state.get().objects.filter(o => o.aiAutoLabel);
      const image = state.get().objects.find(o => o.id === imageId);
      const metrics = after.map(o => { const m = measureLabelTypography(o); const bbox = getObjectBBox(o);
        return { id: o.id, text: labelTypographyText(o), type: o.type, presentation: { weight: o.fontWeight, tracking: o.letterSpacing, lineHeight: o.labelLineHeight }, baselines: m.lines.map(l => l.baseline), w: m.rotatedW, h: m.rotatedH, maxW: o.aiLabelSourceBounds.w * image.w,
          maxH: o.aiLabelSourceBounds.h * image.h, bboxW: bbox.w, bboxH: bbox.h, fontSize: o.fontSize, sourceBounds: o.aiLabelSourceBounds, expectedSourceBounds: plan.labels[after.indexOf(o)].typography.bounds,
          fonts: [...document.querySelectorAll(`#canvas [data-id="${o.id}"] text`)].map(t => ({ text: t.textContent, family: t.getAttribute('font-family'), style: t.getAttribute('font-style'), weight: t.getAttribute('font-weight'), tracking: t.getAttribute('letter-spacing') })) }; });
      window.__typographyQA = { state, titleId: after[4].id, mixedId: after[7].id, quantityId: after[0].id, italicId: after[8].id };
      state.update(s => { s.activeTool = 'V'; s.selectedIds = []; });
      return { defaults, standardFont: DEFAULT_TEXT_FONT, standardSize: DEFAULT_TEXT_SIZE_MM, undone, redone, roundtrip: JSON.stringify(before) === JSON.stringify(after), metrics,
        acceptedCount: plan.labels.length, excludedScopes: plan.excludedLabels.map(label => label.scope),
        rejectedCount: plan.rejectedCount, equationFont: EQUATION_FONT_FAMILY, textFont: TEXT_FONT_FAMILY };
    });
    await page.waitForFunction(metrics => {
      const texts = id => [...document.querySelectorAll(`#scene [data-id="${id}"]:not([data-ui]) text`)];
      return metrics.every(m => texts(m.id).some(t => t.getBoundingClientRect().width > 0))
        && texts(metrics[4].id).every(t => t.getAttribute('font-weight') === 'bold')
        && texts(metrics[8].id).every(t => t.getAttribute('font-style') === 'italic');
    }, result.metrics);
    for (const m of result.metrics) m.fonts = await page.locator(`#scene [data-id="${m.id}"]:not([data-ui]) text`).evaluateAll(nodes => nodes.map(t => ({ text:t.textContent, family:t.getAttribute('font-family'), style:t.getAttribute('font-style'), weight:t.getAttribute('font-weight'), tracking:t.getAttribute('letter-spacing') })));
    assert.ok(result.undone && result.redone && result.roundtrip);
    assert.equal(result.acceptedCount, 9);
    assert.deepEqual(result.excludedScopes, ['graph', 'non_graph_vertical_deferred']);
    assert.equal(result.rejectedCount, 0);
    assert.equal(result.standardSize, 3.7);
    for (const [index, native] of result.defaults.entries()) {
      assert.equal(native.fontSize, 3.7, 'source bounds never shrink the approved native size');
      assert.equal(native.weight, 'normal');
      assert.equal(native.tracking, undefined);
      assert.equal(native.lineHeight, undefined);
      assert.equal(native.rotation, index === 6 ? -30 : 0);
      if ([3, 4, 5, 8].includes(index)) assert.equal(native.fontFamily, result.standardFont);
    }
    assert.equal(result.defaults[8].italic, false, 'source cosmetic italic is an observation');
    for (const m of result.metrics) {
      assert.ok(['text', 'formula'].includes(m.type), JSON.stringify(m));
      assert.deepEqual(m.sourceBounds, m.expectedSourceBounds, 'source removal/position bounds survive without fitting display text');
      assert.ok(m.w > 0 && m.h > 0 && m.maxW > 0 && m.maxH > 0, JSON.stringify(m));
      assert.equal(m.fontSize, 3.7);
      assert.ok(Math.abs(m.bboxW - m.w) < 1e-6 && Math.abs(m.bboxH - m.h) < 1e-6, JSON.stringify(m));
      assert.ok(Number.isFinite(m.fontSize) && m.fontSize > 0, JSON.stringify(m));
    }
    assert.ok(result.metrics.some(m => m.w > m.maxW + 0.05 || m.h > m.maxH + 0.05), 'small source boxes must not silently shrink native typography');
    assert.equal(result.metrics[0].fonts[0].style, 'italic');
    assert.ok(result.metrics[1].fonts.every(f => f.style === 'normal'));
    assert.equal(result.metrics[2].fonts[0].style, 'normal');
    assert.equal(result.metrics[0].fonts.find(f => f.text === 'B').style, 'normal');
    assert.equal(result.metrics[4].fonts.length, 2);
    assert.deepEqual(result.metrics[4].presentation, { weight: 'bold', tracking: 0.1, lineHeight: 1.6 });
    assert.ok(result.metrics[4].fonts.every(f => f.weight === 'bold' && f.family.includes('Noto Sans KR') && Number(f.tracking) > 0));
    assert.ok(Math.abs(result.metrics[4].baselines[1] - result.metrics[4].baselines[0] - result.metrics[4].fontSize * 1.6) < 1e-8);
    assert.equal(result.metrics[5].fonts.length, 2);
    assert.ok(result.metrics[7].fonts.some(f => f.family === result.equationFont));
    assert.ok(result.metrics[7].fonts.some(f => f.family === result.textFont));
    assert.ok(result.metrics[8].fonts.length === 2 && result.metrics[8].fonts.every(f => f.style === 'italic'));
    await page.evaluate(() => window.__typographyQA.state.update(s => { s.selectedIds = []; }));
    await page.screenshot({ path: path.join(evidence, 'native-typography.png') });
    const editor = page.locator('.unified-text-editor');
    const pointerEdits = [];
    async function openByGlyphCenter(idKey, inlineCommitText) {
      await page.evaluate(() => window.__typographyQA.state.update(s => { s.activeTool = 'V'; s.selectedIds = []; s.targetedId = null; }));
      const snapshot = () => page.evaluate(key => {
        const qa = window.__typographyQA, value = qa.state.get();
        return { object: structuredClone(value.objects.find(o => o.id === qa[key])), undo: value.undoStack.length, redo: value.redoStack.length };
      }, idKey);
      const before = await snapshot();
      const target = await page.evaluate(key => {
        const qa = window.__typographyQA;
        const object = qa.state.get().objects.find(o => o.id === qa[key]);
        const glyphs = [...document.querySelectorAll(`#canvas [data-id="${object.id}"] text`)]
          .map(node => node.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
        if (!glyphs.length) throw new Error(`No visible native glyphs for ${object.id}`);
        const left = Math.min(...glyphs.map(r => r.left)), right = Math.max(...glyphs.map(r => r.right));
        const top = Math.min(...glyphs.map(r => r.top)), bottom = Math.max(...glyphs.map(r => r.bottom));
        return { id: object.id, text: object.rawSource ?? object.source ?? object.text, x: (left + right) / 2, y: (top + bottom) / 2 };
      }, idKey);
      await page.mouse.click(target.x, target.y);
      await page.waitForFunction(id => {
        const selected = window.__typographyQA.state.get().selectedIds;
        return selected.length === 1 && selected[0] === id;
      }, target.id);
      assert.equal(await page.locator('.ai-inline-label-editor').count(), 0, 'first glyph click selects');
      assert.equal(await editor.count(), 0, 'selection does not open a detailed dialog');
      assert.deepEqual(await snapshot(), before, 'selection preserves object and history');
      await page.mouse.click(target.x, target.y);
      const inline = page.locator('.ai-inline-label-editor');
      await inline.waitFor({ state: 'visible' });
      assert.equal(await inline.inputValue(), target.text, 'second click opens the whole canonical source inline');
      assert.equal(await editor.count(), 0);
      const inlineBounds = await inline.boundingBox();
      assert.ok(inlineBounds && inlineBounds.width > 0 && inlineBounds.height > 0);
      await inline.fill(target.text + ' 임시 변경');
      await page.keyboard.press('Escape');
      await inline.waitFor({ state: 'detached' });
      assert.deepEqual(await snapshot(), before, 'inline cancellation preserves semantic metadata and history');
      let inlineCommit;
      if (inlineCommitText !== undefined) {
        await page.mouse.click(target.x, target.y);
        await inline.waitFor({ state:'visible' });
        assert.ok(inlineCommitText.startsWith(target.text));
        await inline.focus();
        await inline.evaluate(input => input.setSelectionRange(input.value.length,input.value.length));
        await page.keyboard.insertText(inlineCommitText.slice(target.text.length));
        assert.equal(await inline.inputValue(),inlineCommitText);
        await page.keyboard.press('Enter');
        await inline.waitFor({ state:'detached' });
        const committed = await snapshot();
        assert.equal(committed.object.rawSource ?? committed.object.source ?? committed.object.text, inlineCommitText);
        assert.equal(committed.undo, before.undo + 1, 'inline confirmation commits one history entry');
        for (const field of ['aiLabelSourceBounds','aiParentImageId','aiTaskId','aiCandidateId','fontFamily','fontSize','fontWeight','letterSpacing','labelLineHeight','labelScriptStyles']) assert.deepEqual(committed.object[field],before.object[field],`inline edit preserves ${field}`);
        if (before.object.labelRuns) assert.deepEqual(committed.object.labelRuns.slice(0,2),before.object.labelRuns.slice(0,2),'unchanged semantic runs survive inline commit');
        await page.evaluate(async () => { const {undo}=await import('/js/transform.js?v=1.7.0-four-session-integration');undo(window.__typographyQA.state); });
        assert.deepEqual((await snapshot()).object,before.object,'inline undo restores the complete source object');
        await page.evaluate(async () => { const {redo}=await import('/js/transform.js?v=1.7.0-four-session-integration');redo(window.__typographyQA.state); });
        assert.deepEqual((await snapshot()).object,committed.object,'inline redo restores the entire edit');
        await page.evaluate(async () => { const {undo}=await import('/js/transform.js?v=1.7.0-four-session-integration');undo(window.__typographyQA.state); });
        assert.deepEqual((await snapshot()).object,before.object);
        inlineCommit=committed;
      }
      const panelToggle = page.locator('#drawer-right-toggle');
      if (await panelToggle.getAttribute('aria-expanded') === 'false') await panelToggle.click();
      await page.waitForFunction(() => document.querySelector('.panel-right').getBoundingClientRect().right <= innerWidth + 1);
      const detail = page.locator('#inspector [data-text-detail-edit]:visible');
      assert.equal(await detail.count(), 1);
      assert.equal(await detail.getAttribute('aria-label'), '텍스트 상세 편집');
      await detail.click();
      await editor.waitFor({ state: 'visible' });
      assert.equal(await inline.count(), 0);
      assert.equal(await editor.locator('textarea').inputValue(), target.text);
      pointerEdits.push({ ...target, entry: 'first selection, second inline, cancelled draft, explicit details icon', inlineBounds, inlineCommit });
    }
    const italicPreviews = [];
    for (let reopen = 0; reopen < 2; reopen++) {
      await openByGlyphCenter('italicId');
      const styles = await editor.locator('.formula-preview-svg text').evaluateAll(nodes => nodes.map(n => n.getAttribute('font-style')));
      assert.deepEqual(styles, ['italic', 'italic'], 'mixed text/name italic must survive editor reopening');
      italicPreviews.push(styles);
      await editor.getByRole('button', { name: '확인', exact: true }).click();
    }
    await openByGlyphCenter('mixedId', 'Na^+의 농도(M) + 1');
    await editor.getByRole('button', { name:'확인', exact:true }).click();
    await openByGlyphCenter('titleId', '줄바꿈\n확인 검수');
    await editor.getByRole('button', { name:'확인', exact:true }).click();
    // Every editor entry uses real pointer presses on the native glyph block.
    const beforeNoOp = await page.evaluate(() => ({ undoCount: window.__typographyQA.state.get().undoStack.length,
      object: structuredClone(window.__typographyQA.state.get().objects.find(o => o.id === window.__typographyQA.mixedId)) }));
    await openByGlyphCenter('mixedId');
    await editor.getByRole('button', { name: '확인', exact: true }).click();
    const afterNoOp = await page.evaluate(() => ({ undoCount: window.__typographyQA.state.get().undoStack.length,
      object: structuredClone(window.__typographyQA.state.get().objects.find(o => o.id === window.__typographyQA.mixedId)) }));
    assert.equal(afterNoOp.undoCount, beforeNoOp.undoCount, 'confirming unchanged content must not consume undo history');
    assert.deepEqual(afterNoOp.object, beforeNoOp.object);
    const runs = await page.evaluate(() => window.__typographyQA.state.get().objects.find(o => o.id === window.__typographyQA.mixedId).labelRuns);
    assert.equal(runs?.length, 3);
    await openByGlyphCenter('mixedId');
    await editor.locator('.unified-style-controls select').nth(1).selectOption('12');
    await editor.getByRole('button', { name: '확인', exact: true }).click();
    const resized = await page.evaluate(() => window.__typographyQA.state.get().objects.find(o => o.id === window.__typographyQA.mixedId));
    assert.equal(resized.labelRuns?.length, 3);
    assert.ok(Math.abs(resized.fontSize - 12 * 25.4 / 72) < 1e-9);
    await openByGlyphCenter('mixedId');
    await editor.screenshot({ path: path.join(evidence, 'mixed-editor.png') });
    // Delete only the Korean particle; select-all replacement would represent
    // entirely new content and intentionally inherit one insertion style.
    await editor.locator('textarea').focus();
    await editor.locator('textarea').evaluate(input => input.setSelectionRange(4, 5));
    await page.keyboard.press('Backspace');
    assert.equal(await editor.locator('textarea').inputValue(), 'Na^+ 농도(M)');
    await editor.getByRole('button', { name: '확인', exact: true }).click();
    const edited = await page.evaluate(() => window.__typographyQA.state.get().objects.find(o => o.id === window.__typographyQA.mixedId));
    assert.equal(edited.text, 'Na^+ 농도(M)');
    assert.deepEqual(edited.labelRuns, [{ text: 'Na^+', role: 'chemical', contentMode: 'formula' },
      { text: ' 농도', role: 'text', contentMode: 'plain' }, { text: '(M)', role: 'unit', contentMode: 'plain' }]);
    // A user-selected font replaces the automatic run/font policy.
    await openByGlyphCenter('quantityId');
    await editor.locator('.unified-style-controls select').first().selectOption(result.textFont);
    await editor.getByRole('button', { name: '확인', exact: true }).click();
    const fontOverride = await page.evaluate(() => window.__typographyQA.state.get().objects.find(o => o.id === window.__typographyQA.quantityId));
    assert.equal(fontOverride.fontFamily, result.textFont);
    assert.equal(fontOverride.italic, false);
    assert.equal(fontOverride.labelScriptStyles, undefined);
    await openByGlyphCenter('titleId');
    const titlePreview = await editor.locator('.formula-preview-svg text').evaluateAll(nodes => nodes.map(n => ({ weight: n.getAttribute('font-weight'), tracking: n.getAttribute('letter-spacing'), family: n.getAttribute('font-family') })));
    assert.ok(titlePreview.length && titlePreview.every(n => n.weight === 'bold' && Number(n.tracking) > 0 && n.family.includes('Noto Sans KR')));
    await editor.locator('.unified-style-controls select').nth(1).selectOption('12');
    await editor.locator('textarea').fill('설명 제목\n두 번째 줄');
    await editor.screenshot({ path: path.join(evidence, 'styled-title-editor.png') });
    await editor.getByRole('button', { name: '확인', exact: true }).click();
    const titleAfterEdit = await page.evaluate(async () => {
      const qa = window.__typographyQA;
      const { serialize, applyLoaded } = await import('/js/project-io.js?v=1.7.0-four-session-integration');
      const { undo, redo } = await import('/js/transform.js?v=1.7.0-four-session-integration');
      const edited = structuredClone(qa.state.get().objects.find(o => o.id === qa.titleId));
      undo(qa.state); const before = structuredClone(qa.state.get().objects.find(o => o.id === qa.titleId));
      redo(qa.state); const redone = structuredClone(qa.state.get().objects.find(o => o.id === qa.titleId));
      applyLoaded(qa.state, structuredClone(serialize(qa.state.get())));
      return { edited, before, redone, loaded: qa.state.get().objects.find(o => o.id === qa.titleId) };
    });
    assert.equal(titleAfterEdit.edited.text, '설명 제목\n두 번째 줄');
    assert.equal(titleAfterEdit.edited.fontWeight, 'bold');
    assert.equal(titleAfterEdit.edited.letterSpacing, 0.1);
    assert.equal(titleAfterEdit.edited.labelLineHeight, 1.6);
    assert.ok(Math.abs(titleAfterEdit.edited.fontSize - 12 * 25.4 / 72) < 1e-9);
    assert.equal(titleAfterEdit.before.text, '줄바꿈\n확인');
    assert.deepEqual(titleAfterEdit.redone, titleAfterEdit.edited);
    assert.deepEqual(titleAfterEdit.loaded, titleAfterEdit.edited);
    await openByGlyphCenter('titleId');
    await editor.getByRole('button', { name: '확인', exact: true }).click();
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ ...result, pointerEdits, noOpUndoCount: afterNoOp.undoCount,
      resized, edited, fontOverride, titlePreview, titleAfterEdit, italicPreviews, errors }, null, 2));
  } finally { await browser.close(); }
});
