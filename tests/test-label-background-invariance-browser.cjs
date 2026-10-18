// Fixed label source: 6e2c55012461859cdc8afb4d9596d3f08d5409b4; assertions and fixtures retained.
const { installLabelSourcePage, armSelection, selectionArrived } = require('./helpers/label-source-browser.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, choose, finish, verifiedPlan, snapshot } = require('./helpers/label-source-browser.cjs');
const evidence = process.env.EVIDENCE_DIR || path.resolve(__dirname, '../.omo/evidence/label-background-invariance-20261010/browser');
const panel = '#ai-image-panel';

for (const engine of ['chromium', 'webkit']) for (const initial of ['remove', 'restore-editable']) {
  test(`${engine}: ${initial} and opposite label choice preserve identical RAW through reload and native editing`, { timeout: 120000 }, async t => {
    process.env.TASK2_ENGINE = engine;
    const dir = path.join(evidence, engine, initial); fs.mkdirSync(dir, { recursive: true });
    const { page, errors } = await fixture(t, 4, dir);
    const convert = async (task, labels, request = '장치 연결을 보존해 변환해 주세요') => {
      const selector = `${panel} .ai-task-tab[data-tab-id="task-${task}"] .ai-task-tab-select`;
      await page.locator(selector).click();
      await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'true', selector);
      await choose(page, 'general', labels);
      await page.locator(`${panel} [data-ai-input]`).fill(request);
      const startIndex = await page.evaluate(() => __task2.sends.length);
      await page.locator(`${panel} [data-ai-comments-apply]`).click();
      await finish(page, { sourcePlan: verifiedPlan, startIndex });
      const tabs = await snapshot(page);
      return tabs.find(tab => tab.id === `task-${task}`).generated.at(-1);
    };
    const imagesSent = () => page.evaluate(() => __task2.sends.filter(s => s.payload.purpose === 'image').length);
    const first = await convert(0, initial);
    const opposite = initial === 'remove' ? 'restore-editable' : 'remove';
    const second = await convert(1, opposite);
    assert.equal(await imagesSent(), 1, 'opposite label setting must not create a second picture');
    assert.equal(first.data, second.data, 'full PNG data URL is byte-identical');
    assert.equal(first.candidateSha256, second.candidateSha256);
    assert.equal(second.workflowMetrics.calls.fullGeneration, 0);
    assert.equal(second.workflowMetrics.backgroundReused, 'storage');
    assert.equal(first.labelPlan?.labels.length || 0, initial === 'remove' ? 0 : 1);
    assert.equal(second.labelPlan?.labels.length || 0, opposite === 'remove' ? 0 : 1);
    await page.screenshot({ path: path.join(dir, 'opposite-option.png') });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#ai-image-install-open').click();
    await page.waitForFunction(() => window.__task2Manager);
    const reopened = await snapshot(page);
    assert.equal(reopened.find(tab => tab.id === 'task-0').generated.at(-1).data, first.data);
    const restored = await convert(2, 'restore-editable');
    assert.equal(await imagesSent(), 0, 'persistent RAW is reused after reload in another task');
    assert.equal(restored.data, first.data); assert.equal(restored.labelPlan.labels.length, 1);
    assert.equal(restored.workflowMetrics.backgroundReused, 'storage');
    await page.locator(`${panel} [data-ai-insert-selected]`).click();
    await page.waitForFunction(() => document.querySelector('#ai-image-panel').hidden);
    const native = await page.evaluate(async () => {
      const v = '?v=1.7.0-four-session-integration';
      const { state } = await import('/js/state.js' + v);
      const { serialize, applyLoaded } = await import('/js/project-io.js' + v);
      window.backgroundQA = { state, serialize, applyLoaded };
      const objects = state.get().objects;
      return { image: objects.find(o => o.type === 'image'), labels: objects.filter(o => o.aiAutoLabel) };
    });
    assert.equal(native.image.src, first.data); assert.equal(native.image.imageSelectionLocked, true);
    assert.equal(native.labels.length, 1); assert.ok(!native.labels[0].locked);
    const center = () => page.evaluate(async id => {
      const { worldToScreen } = await import('/js/viewport.js?v=1.7.0-four-session-integration');
      const s = backgroundQA.state.get(), o = s.objects.find(o => o.id === id);
      return worldToScreen(document.querySelector('#canvas'), s.viewBox, o.p2.x, o.p2.y);
    }, native.labels[0].id);
    await armSelection(page, native.labels[0].id);
    let point = await center(); await page.mouse.click(point.x, point.y);
    await selectionArrived(page);
    point = await center(); await page.mouse.click(point.x, point.y);
    const inline = page.locator('.ai-inline-label-editor'); await inline.waitFor({ state: 'visible' });
    await inline.fill('수정된 라벨'); await inline.press('Enter');
    const saved = await page.evaluate(() => {
      const q = backgroundQA;
      const before = q.state.get().objects.find(o => o.aiAutoLabel);
      q.applyLoaded(q.state, JSON.parse(JSON.stringify(q.serialize(q.state.get()))));
      return { text: before.text, image: q.state.get().objects.find(o => o.type === 'image').src,
        reopenedText: q.state.get().objects.find(o => o.aiAutoLabel).text };
    });
    assert.equal(saved.text, '수정된 라벨'); assert.equal(saved.reopenedText, saved.text); assert.equal(saved.image, first.data);
    await page.screenshot({ path: path.join(dir, 'same-background-native-edited.png') });
    await page.locator('#ai-image-install-open').click();
    // A content change remains a real new image request. Return a different
    // controlled PNG so accidental reuse is observable rather than hidden.
    await page.evaluate(() => {
      const emit = __task2.emit;
      __task2.emit = (index, kind, text) => emit(index, kind, kind === 'image' ? __task2.original : text);
    });
    const changed = await convert(3, 'remove', '장치 연결을 보존하고 왼쪽 부품만 수정해 주세요');
    assert.equal(await imagesSent(), 1);
    assert.notEqual(changed.data, first.data);
    assert.notEqual(changed.workflowMetrics.generationHarness.key, first.workflowMetrics.generationHarness.key);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ engine, initial,
      initialImageCalls: 1, oppositeImageCalls: second.workflowMetrics.calls.fullGeneration,
      afterReloadImageCalls: restored.workflowMetrics.calls.fullGeneration, changedRequestImageCalls: changed.workflowMetrics.calls.fullGeneration,
      byteIdentical: first.data === second.data && first.data === restored.data,
      rawSha256: first.candidateSha256, nativeLabelCount: native.labels.length, editedText: saved.reopenedText,
      backgroundPreservedAfterEditing: saved.image === first.data, paidCalls: 0 }, null, 2));
  });
}
