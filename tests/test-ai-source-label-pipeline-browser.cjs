// Retained source 6e2c55012461859cdc8afb4d9596d3f08d5409b4; current 1.4.0 synthetic protocol annotations.
// Original seed PNG bytes stay unchanged; mock classifications do not prove AI quality.
const { installLabelSourcePage, armSelection, selectionArrived } = require('./helpers/label-source-browser.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// 예전엔 다른 작업 폴더(5e-170-auto-labeler)의 파일을 직접 읽었다. 그 폴더가 정리돼 같은 내용을 git 커밋(6e2c5501)에서 읽고, 없으면 이 저장소 파일을 쓴다.
const labelerSource = file => { try { return require('node:child_process').execFileSync('git', ['show', `6e2c5501:tests/${file}`], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return fs.readFileSync(path.join(__dirname, file), 'utf8'); } };
const test = require('node:test');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const evidenceRoot = process.env.EVIDENCE_DIR || path.join(root, '.omo/evidence/textbook-label-stage2/pipeline-browser');
const { adaptHarness, syntheticPipelineObservation, syntheticBatchPipelineObservation, verifySyntheticObservationContracts } = require('./helpers/label-source-pipeline-browser.cjs');
const { jointResponse } = require('./helpers/label-source-browser.cjs');
const source = labelerSource('test-ai-workspace-lifecycle-browser.cjs');
const start = source.indexOf('function seedRequestWorkspaces('), end = source.indexOf('\nfor (const count of [1, 10, 30])', start);
const harness = source.slice(start, end)
  .replace('  let statusGate = null;', "  tabs[0].imageKind = 'general'; tabs[0].labelResult = 'restore-editable'; tabs[0].imageLabelWorkflow = { version:'1.0.0', imageKind:'general', labelResult:'restore-editable' }; tabs[0].preserveSourceLabels = true; tabs[0].input = '원본 도식을 변환해 주세요';\n  let statusGate = null;")
  .replace('emit(index, kind) {', 'emit(index, kind, text) {')
  .replace("if (kind === 'image') {", "if (kind === 'assistant') { method = 'item/completed'; params.item = { type: 'agentMessage', phase: 'final_answer', text }; }\n      else if (kind === 'image') {");
const fixture = new Function('require','root','fs','path','assert','chromium','webkit', adaptHarness(harness) + '; return requestBrowserFixture;')(require,root,fs,path,assert,chromium,webkit);
const plan = JSON.stringify(syntheticPipelineObservation());
async function assertApprovedGeneration(page, indices) {
  const requests = await page.evaluate(async indices => {
    const { APPROVED_FIRST_PROMPT } = await import('/js/ai-approved-first-png.js?v=1.7.0-four-session-integration');
    const { imageLabelDigest } = await import('/js/ai-image-label-run.js?v=1.7.0-four-session-integration');
    return Promise.all(indices.map(async index => {
      const request = window.__task2.sends[index].payload;
      return { purpose: request.purpose, attachmentNames: request.attachments.map(attachment => attachment.name),
        // 4dbdd0b8(10-13)부터 첫 이미지 요청은 원본 추적 머리말(buildSourceTracingPrompt) 뒤에 승인된 프롬프트 본문을 그대로 싣는다.
        approvedPrefix: request.text.startsWith((await import('/js/ai-source-tracing-contract.js?v=1.7.0-four-session-integration')).buildSourceTracingPrompt({ preserveStyle: true }).split('\n')[0]) && request.text.includes(APPROVED_FIRST_PROMPT), approvedPromptSha256: await imageLabelDigest(APPROVED_FIRST_PROMPT) };
    }));
  }, indices);
  for (const request of requests) {
    assert.equal(request.purpose, 'image'); assert.deepEqual(request.attachmentNames, ['INPUT_SOURCE.png']);
    assert.equal(request.approvedPrefix, true);
    assert.equal(request.approvedPromptSha256, '8d6180f311791d497469d93cbc0eff98919b0d376d84a958f2b391c475e14067', 'Latest documented RHWP approved prompt');
  }
}
async function completeVerification(page, indices, verdicts) {
  await page.waitForFunction(n => window.__task2.sends.length === n, Math.max(...indices) + 1);
  for (const [offset, index] of indices.entries()) {
    const request = await page.evaluate(i => window.__task2.sends[i].payload, index);
    assert.equal(request.purpose, 'scene'); assert.equal(request.model, 'gpt-6-luna'); assert.equal(request.effort, 'medium');
    assert.equal(request.attachments.length, 3); assert.match(request.text, /고정 후보: /);
    const response = JSON.parse(jointResponse(request.text));
    response.review = JSON.parse(report(verdicts[offset]));
    await page.evaluate(({ index, text }) => { window.__task2.emit(index, 'assistant', text); window.__task2.emit(index, 'done'); }, { index, text: JSON.stringify(response) });
  }
}
const ids = ['object-counts','inside-outside','liquid-occupancy','connections','composition-state','black-fill-meaning','presentation','request-scope','raster-label-removal','editable-label-coverage','leader-relations','label-overlay-alignment','label-typography','leader-overlay','kice-flat-style','flat-gray-regions'];
const report = verdict => JSON.stringify({ verdict, checks: ids.map(id => ({ id, label: id, status: verdict === 'fail' && id === 'raster-label-removal' ? 'fail' : 'pass', detail: id === 'raster-label-removal' && verdict === 'fail' ? '+ 기호가 원래 위치에 남아 있음' : 'Synthetic reviewer fixture; not an actual AI quality verdict' })), issues: verdict === 'fail' ? [{ message: '+ 기호 잔존', severity: 'major', bbox: { x: .2, y: .3, width: .1, height: .1 } }] : [] });
// 83201a54: 라벨 복원 기본값은 「끄기」다. 관찰(scene) 단계를 타려면 검사가 먼저 「켜기」를 누른다(숨은 단추도 같은 상태를 바꾸도록 click 이벤트).
const LEGACY = { beforeNavigate: p => p.addInitScript(() => { globalThis.__5eLegacyLabelPipeline = true; }) }; // 11-10(c9d1da3f): 예전 라벨 파이프라인(원본 관찰·계약 프롬프트) 계약을 보는 검사 — 내부 시험용 플래그
const labelsOn = async page => { await page.evaluate(() => { globalThis.__5eLegacyLabelPipeline = true; }); await page.locator('#ai-image-panel [data-ai-setting-key=kind] [data-ai-setting-value=general]').first().dispatchEvent('click'); await page.locator('#ai-image-panel [data-ai-setting-key=labels] [data-ai-setting-value=restore-editable]').dispatchEvent('click'); };
const sends = page => page.evaluate(() => window.__task2.sends.map(s => ({ purpose: s.payload.purpose, model: s.payload.model, effort: s.payload.effort, text: s.payload.text, attachmentCount: s.payload.attachments.length })));
const imageSends = requests => requests.filter(request => request.purpose === 'image');

for (const verdict of ['pass', 'fail']) test(`source label UI: observe, freeze, generate once, review ${verdict}, insert and edit native leader`, { timeout: 60000 }, async t => {
  const evidence = path.join(evidenceRoot, verdict);
  fs.mkdirSync(evidence, { recursive: true });
  const { page, errors } = await fixture(t, 1, evidence, { ...LEGACY, initialGeneration: true });
  await labelsOn(page); await page.locator('#ai-image-panel [data-ai-send][data-ai-comments-apply]').click();
  await page.waitForFunction(() => window.__task2.sends.length === 1);
  assert.equal((await sends(page))[0].purpose, 'scene');
  assert.equal((await sends(page))[0].model, 'gpt-6-luna'); assert.equal((await sends(page))[0].effort, 'medium');
  await page.evaluate(plan => { window.__task2.emit(0, 'assistant', plan); window.__task2.emit(0, 'done'); }, plan);
  await page.waitForFunction(() => window.__task2.sends.length === 2);
  const request = (await sends(page))[1];
  await assertApprovedGeneration(page, [1]);
  assert.ok(!request.text.includes(plan), 'Source observation must not overwrite the approved RHWP generation prompt');
  await page.evaluate(() => {
    // A late observer response and unsolicited replacement plan cannot change the frozen source.
    window.__task2.emit(0, 'assistant', '{"labels":[]}');
    window.__task2.emit(1, 'assistant', '<5e-editable-labels>{"version":3,"reviewRequired":false,"labels":[]}</5e-editable-labels>');
    window.__task2.emit(1, 'image'); window.__task2.emit(1, 'done');
  });
  await completeVerification(page, [2], [verdict]);
  await page.waitForFunction(() => document.querySelector('#ai-image-panel').dataset.aiBusy === 'false');
  const state = await page.evaluate(async () => (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w => w.tabs)[0].generated[0]);
  assert.equal(state.labelPlan.labels[0].text, '• 전자');
  assert.equal(state.labelPlan.frozen, true); assert.equal(state.labelPlan.qualityReview.verdict, verdict);
  assert.equal(state.labelPlan.qualityReview.labelReview.policy, '5e-standard-v1');
  assert.equal(state.labelPlan.qualityReview.labelReview.verdict, verdict);
  assert.match(await page.locator('[data-ai-label-review-summary]').textContent(), /라벨 내용·연결·가독성/);
  assert.equal(state.reviewState, verdict === 'pass' ? 'passed' : 'needs-attention');
  assert.equal(state.labelPlan.reviewRequired, verdict !== 'pass');
  assert.equal((await sends(page)).length, 3, 'One observation, one generation and one joint verification; no automatic correction');
  assert.equal(imageSends(await sends(page)).length, 1);
  assert.deepEqual(state.sourceLabelPlan.labels.map(label => label.text), ['• 전자']);
  const reviewedComposite = await page.evaluate(() => window.__task2.sends[2].payload.attachments[2].data);
  assert.equal(state.finalLabelComposite, reviewedComposite, 'Final overlay preserves the independently reviewed bytes');
  const included = page.locator('[data-ai-label-view-mode="included"]');
  const diagram = page.locator('[data-ai-label-view-mode="diagram"]');
  // 「그림만 / 라벨 포함」 두 단추는 숨은 상태 표시이고, 실제로 누르는 것은 「라벨 ON/OFF」 토글 하나다.
  const labelToggle = page.locator('#ai-image-panel [data-ai-label-toggle]');
  const shown = () => page.locator('#ai-image-panel .ai-generated-card .ai-preview-stage > img').first().getAttribute('src');
  // 11-19 E10 다시 씀: 4dbdd0b8(10-13)부터 미리보기 「라벨 ON」은 검수 때 묶인 합성 바이트(finalLabelComposite)를 그대로 쓰지 않고,
  // 지금 라벨 계획과 지금 출력 그림(resolveOutputVariant)으로 그 자리에서 다시 합성한다(js/ai-panel.js renderLabelPreview → createEditableLabelComposite).
  // 그래서 「미리보기 = 검수 합성 바이트」 대신: ON은 라벨이 그려진 다른 그림(같은 크기), OFF는 생성 원본 그대로, 다시 ON은 앞의 ON과 같은 그림.
  // 검수에 묶인 바이트가 바뀌지 않는다는 계약은 위 finalLabelComposite === 검수 첨부 단언이 그대로 본다.
  const previewSrc = () => page.evaluate(() => document.querySelector('#ai-image-panel .ai-generated-card .ai-preview-stage > img')?.src || '');
  const pngSize = src => page.evaluate(async src => { const image = new Image(); image.src = src; await image.decode(); return [image.naturalWidth, image.naturalHeight]; }, src);
  await page.waitForFunction(data => { const src = document.querySelector('#ai-image-panel .ai-generated-card .ai-preview-stage > img')?.src; return src?.startsWith('data:image/png') && src !== data; }, state.data);
  assert.equal(await included.getAttribute('aria-pressed'), 'true');
  const labelledPreview = await previewSrc();
  assert.notEqual(labelledPreview, state.data, 'Label ON preview draws the editable labels over the generated image');
  assert.deepEqual(await pngSize(labelledPreview), await pngSize(state.finalLabelComposite), 'Live label preview keeps the reviewed composite size');
  await labelToggle.click();
  await page.waitForFunction(data => document.querySelector('#ai-image-panel .ai-generated-card .ai-preview-stage > img')?.src === data, state.data);
  assert.equal(await diagram.getAttribute('aria-pressed'), 'true'); assert.equal(await shown(), state.data);
  await labelToggle.click();
  await page.waitForFunction(data => document.querySelector('#ai-image-panel .ai-generated-card .ai-preview-stage > img')?.src === data, labelledPreview);
  if (verdict === 'fail') {
    await page.locator('[data-ai-review-open]').click();
    const issues = page.locator('[data-ai-label-quality-issues]');
    assert.equal(await issues.isVisible(), true); assert.match(await issues.textContent(), /\+ 기호 잔존/);
    await issues.getByRole('button', { name: '+ 기호 잔존' }).click();
    await page.locator('[data-ai-review-dialog] [data-ai-info-close]').click();
    assert.equal(await page.locator('.ai-review-bbox').count(), 1);
    await page.locator('[data-ai-review-open]').click();
    await page.locator('[data-ai-label-correction-draft]').click();
    assert.match(await page.locator('[data-ai-input]').inputValue(), /raster-label-removal: \+ 기호가 원래 위치에 남아 있음/);
    assert.equal((await sends(page)).length,3,'Preparing correction must not dispatch another generation');
    await page.locator('[data-ai-review-dialog] [data-ai-info-close]').click();
    // 4dbdd0b8(10-13)부터 검토에 실패해도 넣을 수는 있고(따로 있던 「캔버스에서 편집」 단추는 영구히 숨김), 넣기 전에 라벨 확인을 요구한다.
    assert.match(await page.locator('#ai-image-panel [data-ai-insert-selected]').getAttribute('title'), /확인해 주세요/, 'Failed review asks for a label check before insertion');
  }
  await page.screenshot({ path: path.join(evidence, 'review-result.png') });
  await page.locator('#ai-image-panel [data-ai-insert-selected]').click();
  await page.waitForFunction(async () => (await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects.some(o => o.aiAutoLabel));
  await page.waitForFunction(() => document.querySelector('#ai-image-panel').hidden);
  const inserted = await page.evaluate(async () => {
    const { state } = await import('/js/state.js?v=1.7.0-four-session-integration');
    const { serialize, applyLoaded } = await import('/js/project-io.js?v=1.7.0-four-session-integration');
    const { undo, redo } = await import('/js/transform.js?v=1.7.0-four-session-integration');
    window.__sourceQA = { state, serialize, applyLoaded, undo, redo };
    state.update(s => { s.selectedIds = []; s.activeTool = 'V'; });
    const label = state.get().objects.find(o => o.aiAutoLabel);
    const svg = document.querySelector(`#canvas [data-id="${label.id}"]`);
    const text = svg.querySelector('text').getBoundingClientRect();
    return { label: structuredClone(label), arrowCount: svg.querySelectorAll('path[fill]:not([fill="none"])').length, routeCount: label.leaderRoutes.length,
      dashes: [...svg.querySelectorAll('path[stroke-dasharray]')].map(l => l.getAttribute('stroke-dasharray')), point: { x: text.x + text.width / 2, y: text.y + text.height / 2 } };
  });
  assert.equal(inserted.arrowCount, 2); assert.equal(inserted.routeCount, 2);
  assert.equal(inserted.dashes.length, 2); assert.ok(inserted.dashes.every(Boolean));
  await page.mouse.click(inserted.point.x, inserted.point.y, { button: 'right' });
  await page.locator('.text-ctx-menu').getByRole('button', { name: '텍스트 상세 편집', exact: true }).click();
  const editor = page.locator('.unified-text-editor'); await editor.waitFor({ state: 'visible' });
  assert.equal(await editor.locator('textarea').inputValue(), '• 전자');
  await editor.locator('textarea').fill('• 수정한 전자'); await editor.getByRole('button', { name: '확인', exact: true }).click();
  const roundtrip = await page.evaluate(id => {
    const q = window.__sourceQA, object = () => q.state.get().objects.find(o => o.id === id);
    const edited = structuredClone(object()); q.undo(q.state); const undone = object().text; q.redo(q.state); const redone = object().text;
    const project = q.serialize(q.state.get()); q.applyLoaded(q.state, JSON.parse(JSON.stringify(project)));
    return { edited, undone, redone, reopened: structuredClone(object()) };
  }, inserted.label.id);
  assert.equal(roundtrip.undone, '• 전자'); assert.equal(roundtrip.redone, '• 수정한 전자');
  assert.deepEqual(roundtrip.reopened.leaderRoutes, inserted.label.leaderRoutes);
  assert.ok(roundtrip.reopened.leaderRoutes.every(route => route.end === 'filled-arrow' && route.controls.length === 1));
  assert.equal(roundtrip.reopened.text, '• 수정한 전자');
  const background = await page.evaluate(() => window.__sourceQA.state.get().objects.find(object => object.type === 'image'));
  // 4dbdd0b8(10-13): 이미지+라벨 한 묶음, 이미지 선택 잠금은 풀린다.
  assert.equal(background.src, state.data); assert.equal(background.imageSelectionLocked, false); assert.equal(background.groupId, `${background.id}_image_labels`);
  assert.equal(state.data, await page.evaluate(() => window.__task2.modified), 'Insertion and editing preserve the original controlled RAW bytes');
  await page.screenshot({ path: path.join(evidence, 'edited-native-leader.png') });
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ verdict, sends: await sends(page), state, inserted, roundtrip, errors }, null, 2));
});

test('source label UI: cancellation during analysis sends no image request and ignores late observer result', { timeout: 30000 }, async t => {
  const evidence = path.join(evidenceRoot, 'cancel'); fs.mkdirSync(evidence, { recursive: true });
  const { page, errors } = await fixture(t, 1, evidence, { ...LEGACY, initialGeneration: true });
  await labelsOn(page); await page.locator('#ai-image-panel [data-ai-send][data-ai-comments-apply]').click(); await page.waitForFunction(() => window.__task2.sends.length === 1);
  await page.locator('#ai-image-panel [data-ai-interrupt]').click();
  await page.evaluate(plan => { window.__task2.emit(0, 'assistant', plan); window.__task2.emit(0, 'done'); }, plan);
  await page.waitForFunction(() => document.querySelector('#ai-image-panel').dataset.aiBusy === 'false');
  assert.equal((await sends(page)).length, 1); assert.deepEqual(errors, []);
  assert.equal(imageSends(await sends(page)).length, 0);
  assert.equal(await page.evaluate(async () => (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs)[0].generated.length), 0);
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({cancelled:true,sends:await sends(page),errors},null,2));
});

for (const clearance of ['clear', 'overlap']) test(`two selected workspaces: ${clearance === 'clear' ? 'independent passed/failed reviews survive durable commit' : 'RAW overlap blocks both candidates despite a pass response'}`, { timeout: 60000 }, async t => {
  const original = labelerSource('test-ai-workspace-multiselect-browser.cjs');
  const a = original.indexOf('function seedRequestWorkspaces('), b = original.indexOf('\n\nconst active =', a);
  const code = original.slice(a, b)
    .replace("{ waitUntil: 'domcontentloaded' }", "{ waitUntil: 'domcontentloaded' }")
    .replace('  let statusGate = null, interruptGate = null;', "  globalThis.__5eLegacyLabelPipeline = true; /* 11-10(c9d1da3f): 예전 라벨 파이프라인 계약 */\n  for (const tab of tabs) { tab.imageKind = 'general'; tab.labelResult = 'restore-editable'; tab.imageLabelWorkflow = { version:'1.0.0', imageKind:'general', labelResult:'restore-editable' }; tab.preserveSourceLabels = true; tab.generated = []; tab.selectedCandidateId = null; }\n  let statusGate = null, interruptGate = null;")
    .replace('emit(index, kind) {', 'emit(index, kind, text) {')
    .replace("if (kind === 'image') {", "if (kind === 'assistant') { method = 'item/completed'; params.item = { type: 'agentMessage', phase: 'final_answer', text }; }\n      else if (kind === 'image') {")
    // 11-19 E10: 563e5063(11-08 ai-label-reframe)부터 새 그림은 「그림 영역이 원본 그림 영역 자리에 오도록」 다시 놓인다. 고정 자료의 생성 그림(modified)은
    // 원본에 없던 사각형이 더해져 그림 영역이 커서 약 0.65배로 줄어 놓였고, 그래서 라벨 겹침(y .65 = 오른쪽 사각형 아랫변) 상황이 사라졌다.
    // 겹침·비겹침 좌표가 뜻을 갖도록 생성 그림으로 원본과 같은 잉크 영역의 그림(original)을 돌려준다(다시 놓기가 그대로 둠).
    .replace("params.item = { type: 'imageGeneration', imageDataUrl: modified };", "params.item = { type: 'imageGeneration', imageDataUrl: original };");
  assert.ok(code.includes("imageDataUrl: original"), 'batch harness emits the source-extent image');
  const batchFixture = new Function('require','root','fs','path','assert','chromium','webkit', adaptHarness(code) + '; return requestBrowserFixture;')(require,root,fs,path,assert,chromium,webkit);
  const evidence = path.join(evidenceRoot, clearance === 'clear' ? 'workspace-batch' : 'workspace-batch-overlap'); fs.mkdirSync(evidence, { recursive: true });
  const { page, errors } = await batchFixture(t, 2, evidence, { initialGeneration: true });
  await page.click('#ai-image-panel [data-tab-id="task-1"] .ai-task-tab-select', { modifiers: ['Meta'] });
  assert.equal(await page.locator('#ai-image-panel [data-ai-selection-count]').textContent(), '2개 선택');
  await labelsOn(page);
  await page.click('#ai-image-panel [data-ai-send][data-ai-comments-apply]');
  // 11-19 E10 다시 씀: 여러 작업을 함께 보내면 그림 생성은 한 번에 한 작업씩 차례로 돈다(js/ai-panel.js BATCH_CONCURRENCY = 1).
  // 예전 검사는 두 작업의 관찰 요청 2개가 동시에 나간 뒤 그림 2개가 함께 나가길 기다렸다(고정 번호 0·1 / 2·3 / 4·5).
  // 지금은 요청 순서가 차례 실행에 따라 바뀌므로, 들어오는 요청을 목적(관찰·그림·검수)으로 가려 답한다. 검수 판정은 먼저 온 것 pass, 다음 fail.
  // 또 두 작업은 원본·설정이 같아 두 번째 작업은 앞 작업이 저장한 그림을 다시 쓰고(workflowMetrics.backgroundReused='storage', fullGeneration 0)
  // 그림 요청을 다시 보내지 않는다 — 관찰 2 · 그림 1 · 검수 2 = 요청 5개.
  const batchPlan = JSON.stringify(clearance === 'clear' ? syntheticBatchPipelineObservation() : syntheticPipelineObservation());
  const reviewIndices = [], imageIndices = [], observeIndices = [];
  for (let handled = 0; reviewIndices.length < 2; handled++) {
    await page.waitForFunction(n => window.__task2.sends.length > n, handled);
    const request = (await sends(page))[handled];
    if (request.purpose === 'image') {
      imageIndices.push(handled); await assertApprovedGeneration(page, [handled]);
      await page.evaluate(i => { window.__task2.emit(i, 'image'); window.__task2.emit(i, 'done'); }, handled);
    } else if (request.text.includes('고정 후보: ')) {
      reviewIndices.push(handled); await completeVerification(page, [handled], [reviewIndices.length === 1 ? 'pass' : 'fail']);
    } else {
      assert.equal(request.purpose, 'scene'); observeIndices.push(handled);
      await page.evaluate(({ plan, i }) => { window.__task2.emit(i, 'assistant', plan); window.__task2.emit(i, 'done'); }, { plan: batchPlan, i: handled });
    }
  }
  assert.deepEqual([observeIndices.length, imageIndices.length, reviewIndices.length], [2, 1, 2], 'two observations, one generation reused by the second task, two joint reviews');
  await page.waitForFunction(() => window.__task2Manager.workspaceBatchState().filter(job => ['completed','failed'].includes(job.state)).length === 2);
  const tasks = await page.evaluate(async () => (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w => w.tabs).map(tab => ({ id: tab.id, candidate: tab.generated.at(-1) })));
  assert.equal(tasks.length, 2); assert.ok(tasks.every(tab => tab.candidate.labelPlan.frozen && tab.candidate.labelPlan.labels[0].text === '• 전자'));
  assert.deepEqual(tasks.map(tab => tab.candidate.reviewState).sort(), clearance === 'clear' ? ['needs-attention','passed'] : ['needs-attention','needs-attention']);
  for (const task of tasks) {
    assert.equal(task.candidate.sourceLabelPlan.observationContractRevision, '1.4.0');
    assert.equal(task.candidate.sourceLabelPlan.labels[0].position.y, clearance === 'clear' ? .75 : .65, 'Source coordinates remain frozen');
  }
  // 11-19 E10: 다시 놓기가 그대로 두는 그림이라 RAW 바이트는 고정 자료가 돌려준 생성 PNG와 같다(두 번째 작업은 앞 작업이 저장한 같은 그림을 다시 씀).
  for (const task of tasks) assert.equal(task.candidate.data, await page.evaluate(() => window.__task2.original), 'Original batch RAW bytes remain unchanged');
  const mechanical = await page.evaluate(indices => indices.map(i => window.__task2.sends[i]).map(send => {
    const lines = send.payload.text.split('\n');
    const proposals = JSON.parse(lines.find(line => line.startsWith('고정 후보: ')).slice('고정 후보: '.length));
    const auditLine = lines.find(line => line.startsWith('실제 네이티브 렌더러의 측정'));
    const audit = JSON.parse(auditLine.slice(auditLine.indexOf(': ') + 2));
    return { candidateCounts: proposals.map(group => group.candidates.length), finalPlacement: audit.finalPlacement };
  }), reviewIndices);
  for (const result of mechanical) {
    if (clearance === 'clear') {
      assert.deepEqual(result.candidateCounts, [1]); assert.deepEqual(result.finalPlacement.issues, []);
    } else {
      assert.deepEqual(result.candidateCounts, [0]);
      assert.ok(result.finalPlacement.issues.some(issue => issue.code === 'raw-ink-occlusion' && issue.pixels > 0));
      assert.ok(result.finalPlacement.issues.some(issue => issue.code === 'unconfirmed-source-fallback'));
    }
  }
  { const all = await sends(page); assert.ok(reviewIndices.every(i => all[i].attachmentCount === 3 && all[i].text.includes('고정 후보: '))); }
  assert.equal((await sends(page)).length, 5); assert.equal(imageSends(await sends(page)).length, 1); assert.deepEqual(errors, []);
  assert.deepEqual(tasks.map(tab => tab.candidate.workflowMetrics?.calls?.fullGeneration).sort(), [0, 1], 'second identical task reuses the stored generation');
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ clearance, tasks, mechanical, sends: await sends(page), errors }, null, 2));
});


test('missing final overlay checks cannot promote a candidate to passed', {timeout:60000}, async t => {
  const evidence=path.join(evidenceRoot,'missing-composite-checks');fs.mkdirSync(evidence,{recursive:true});
  const {page,errors}=await fixture(t,1,evidence,{...LEGACY,initialGeneration:true});
  await labelsOn(page); await page.locator('#ai-image-panel [data-ai-send][data-ai-comments-apply]').click();await page.waitForFunction(()=>window.__task2.sends.length===1);
  await page.evaluate(plan=>{window.__task2.emit(0,'assistant',plan);window.__task2.emit(0,'done');},plan);
  await page.waitForFunction(()=>window.__task2.sends.length===2);await page.evaluate(()=>{window.__task2.emit(1,'image');window.__task2.emit(1,'done');});
  await page.waitForFunction(()=>window.__task2.sends.length===3);
  const request=await page.evaluate(()=>window.__task2.sends[2].payload);
  assert.equal(request.attachments.length,3); assert.match(request.text,/고정 후보: /);
  const incomplete=JSON.parse(jointResponse(request.text));
  incomplete.review=JSON.parse(report('pass'));
  incomplete.review.checks=incomplete.review.checks.filter(check=>!['label-overlay-alignment','label-typography','leader-overlay'].includes(check.id));
  await page.evaluate(raw=>{window.__task2.emit(2,'assistant',raw);window.__task2.emit(2,'done');},JSON.stringify(incomplete));
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false');
  const candidate=await page.evaluate(async()=>(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w=>w.tabs)[0].generated[0]);
  assert.notEqual(candidate.reviewState,'passed');assert.equal(candidate.labelPlan.reviewRequired,true);assert.equal((await sends(page)).length,3);assert.equal(imageSends(await sends(page)).length,1);
  // 4dbdd0b8(10-13)부터 검토가 덜 끝난 후보도 넣을 수는 있되, 넣기 전에 라벨 확인을 요구한다(통과로 오르지 않는 것은 위에서 확인).
  assert.match(await page.locator('#ai-image-panel [data-ai-insert-selected]').getAttribute('title'),/확인해 주세요/);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(evidence,'review-rejected.png')});fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({candidate,sends:await sends(page),errors},null,2));
});

test('classified observation protocol: current positives, orphan ownership and malformed inputs fail closed', async () => {
  await verifySyntheticObservationContracts();
});
