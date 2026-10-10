// Fixed label source: 6e2c55012461859cdc8afb4d9596d3f08d5409b4; assertions and fixtures retained.
const { installLabelSourcePage, armSelection, selectionArrived } = require('./helpers/label-source-browser.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, choose, finish, verifiedPlan } = require('./helpers/label-source-browser.cjs');
const baseline = require('./fixtures/rhwp-approved-first-contract.json');
const evidence = process.env.EVIDENCE_DIR || path.resolve(__dirname, '../.omo/evidence/rhwp-image-harness-alignment-20261009/browser');

for (const engine of ['chromium', 'webkit']) {
  for (const labelResult of ['remove', 'restore-editable']) {
    test(`${engine} ${labelResult}: RHWP generation payload and native Gothic rendering`, { timeout: 90000 }, async t => {
      process.env.TASK2_ENGINE = engine;
      const dir = path.join(evidence, engine, labelResult);
      fs.mkdirSync(dir, { recursive: true });
      const { page, errors } = await fixture(t, 1, dir);
      await choose(page, 'general', labelResult);
      await page.locator('#ai-image-panel [data-ai-input]').fill('선택한 원본을 변환해 주세요');
      const plan = structuredClone(verifiedPlan);
      plan.labels[0].typography.role = 'name';
      plan.labels[0].typography.runs = [{ text: '전자', role: 'name', contentMode: 'plain' }];
      await page.locator('#ai-image-panel [data-ai-send]').click();
      await finish(page, { sourcePlan: plan });
      const result = await page.evaluate(async baseline => {
        const v = '?v=1.7.0-four-session-integration';
        const { approvedFirstRequestText, prepareApprovedFirstAttachment, APPROVED_FIRST_PROMPT } = await import('/js/ai-approved-first-png.js' + v);
        const { imageLabelDigest } = await import('/js/ai-image-label-run.js' + v);
        const q = window.__task2;
        const imageCalls = q.sends.filter(s => s.payload.purpose === 'image');
        const actual = imageCalls[0].payload;
        const expectedInput = await prepareApprovedFirstAttachment({ data: q.original });
        const candidates = (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w => w.tabs).flatMap(t => t.generated);
        const candidate = candidates.at(-1);
        // Exercise RHWP's unchanged preparation with a real oversized source too.
        const c = document.createElement('canvas'); c.width = 2304; c.height = 768;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 100, 100);
        const original = c.toDataURL('image/png');
        const large = { data: original };
        const prepared = await prepareApprovedFirstAttachment(large);
        const img = new Image(); img.src = prepared.data; await img.decode();
        return { actual, expectedText: approvedFirstRequestText({ instructions: '선택한 원본을 변환해 주세요' }),
          expectedInput, count: imageCalls.length, promptSha256: await imageLabelDigest(APPROVED_FIRST_PROMPT),
          candidateDataUnchanged: candidate.data === q.modified,
          generationHarness: candidate.workflowMetrics.generationHarness,
          sourceBoundToOriginal: candidate.sourceSha256 === await imageLabelDigest(q.original),
          preparation: { width: img.naturalWidth, height: img.naturalHeight, originalUnchanged: large.data === original, name: prepared.name },
          analyzedOriginal: q.sends.find(s => s.payload.text.includes('입력 원본 라벨 관찰')).payload.attachments[0].data === q.original,
          legacyStyleRequestInjected: q.sends.filter(s => s.payload.purpose === 'scene').some(s => s.payload.text.includes('그라데이션, 그림자, 음영 효과, 조명')) };
      }, baseline);
      assert.equal(result.count, 1);
      assert.equal(result.actual.text, result.expectedText);
      assert.equal(result.promptSha256, baseline.promptSha256);
      assert.deepEqual(result.actual.attachments, [result.expectedInput]);
      assert.equal(result.actual.conversationId, null);
      assert.equal(result.actual.resetConversation, false);
      assert.equal(result.actual.ephemeralRender, true);
      assert.equal(result.actual.serviceTier, 'priority');
      assert.equal(result.candidateDataUnchanged, true);
      assert.equal(result.sourceBoundToOriginal, true);
      assert.equal(result.analyzedOriginal, true);
      assert.equal(result.legacyStyleRequestInjected, false);
      assert.equal(result.generationHarness.id, 'rhwp-approved-first-v1');
      assert.deepEqual(result.preparation, { width: 1536, height: 512, originalUnchanged: true, name: 'INPUT_SOURCE.png' });
      assert.doesNotMatch(result.actual.text, /SOURCE-GRID-TRACING|5e-source-tracing|5e-kice-flat-style/);
      await page.screenshot({ path: path.join(dir, 'workbench.png') });

      if (labelResult === 'restore-editable') {
        await page.locator('#ai-image-panel [data-ai-insert-selected]').click();
        await page.waitForFunction(() => document.querySelector('#ai-image-panel').hidden);
        await page.evaluate(async () => {
          const v = '?v=1.7.0-four-session-integration';
          const { state, DEFAULT_TEXT_FONT } = await import('/js/state.js' + v);
          const { serialize, applyLoaded } = await import('/js/project-io.js' + v);
          window.fontQA = { state, serialize, applyLoaded, DEFAULT_TEXT_FONT };
          state.update(s => { s.selectedIds = []; s.activeTool = 'V'; });
          await document.fonts.ready;
        });
        const rendered = async () => page.evaluate(() => {
          const q = fontQA, object = q.state.get().objects.find(o => o.aiAutoLabel);
          const group = document.querySelector(`#scene [data-id="${object.id}"]:not([data-ui])`);
          return { object: structuredClone(object), fonts: [...group.querySelectorAll('text')].map(t => t.getAttribute('font-family')), expected: q.DEFAULT_TEXT_FONT };
        });
        const initial = await rendered();
        assert.equal(initial.object.fontFamily, initial.expected);
        assert.deepEqual(initial.fonts, [initial.expected]);
        assert.equal(initial.object.labelFontOverride, true);
        // WebKit's SVG text bounding box includes extra font-space offsets.
        // Project the shared native text center used by picking and rendering.
        const centerPoint = async () => page.evaluate(async id => {
          const { worldToScreen } = await import('/js/viewport.js?v=1.7.0-four-session-integration');
          const s = fontQA.state.get(), o = s.objects.find(o => o.id === id);
          return worldToScreen(document.querySelector('#canvas'), s.viewBox, o.p2.x, o.p2.y);
        }, initial.object.id);
        await armSelection(page, initial.object.id);
        const point = await centerPoint();
        await page.mouse.click(point.x, point.y);
        assert.deepEqual(await page.evaluate(() => fontQA.state.get().selectedIds), [initial.object.id]);
        // Distinct single clicks: first select the actual rendered glyph, then edit.
        await selectionArrived(page);
        const selectedPoint = await centerPoint();
        await page.mouse.click(selectedPoint.x, selectedPoint.y);
        const inline = page.locator('.ai-inline-label-editor');
        await inline.waitFor({ state: 'visible' });
        await inline.fill('전류 센서'); await inline.press('Enter');
        const edited = await rendered();
        assert.equal(edited.object.text, '전류 센서');
        assert.ok(edited.fonts.every(f => f === edited.expected));
        await page.evaluate(() => {
          const q = fontQA;
          q.applyLoaded(q.state, JSON.parse(JSON.stringify(q.serialize(q.state.get()))));
          q.state.update(s => { s.selectedIds = []; s.activeTool = 'V'; });
        });
        const reopened = await rendered();
        assert.equal(reopened.object.text, '전류 센서');
        assert.ok(reopened.fonts.every(f => f === reopened.expected));
        // Old saved AI objects lack the explicit flag; their stored font still wins.
        await page.evaluate(() => fontQA.state.update(s => { delete s.objects.find(o => o.aiAutoLabel).labelFontOverride; }));
        assert.ok((await rendered()).fonts.every(f => f === initial.expected));
        await page.screenshot({ path: path.join(dir, 'gothic-edited-reopened.png') });
        const custom = await page.evaluate(() => {
          const q = fontQA;
          q.state.update(s => { const o = s.objects.find(o => o.aiAutoLabel); o.fontFamily = 'Arial, sans-serif'; o.labelFontOverride = true; });
          const saved = q.serialize(q.state.get()); q.applyLoaded(q.state, JSON.parse(JSON.stringify(saved)));
          return q.state.get().objects.find(o => o.aiAutoLabel).fontFamily;
        });
        assert.equal(custom, 'Arial, sans-serif');
        const selected = await rendered();
        assert.ok(selected.fonts.every(f => f === custom));
        result.fonts = { initial, edited, reopened, custom };
      }
      assert.deepEqual(errors, []);
      fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2));
    });
  }
}
