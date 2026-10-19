// Retained source 6e2c55012461859cdc8afb4d9596d3f08d5409b4; current 1.4.0 synthetic protocol annotations.
// Original seed PNG bytes stay unchanged; mock classifications do not prove AI quality.
const { installLabelSourcePage, armSelection, selectionArrived } = require('./helpers/label-source-browser.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const evidenceRoot = process.env.EVIDENCE_DIR || path.join(root, '.omo/evidence/textbook-label-stage2/pipeline-browser');
const { adaptHarness, syntheticPipelineObservation, syntheticBatchPipelineObservation, verifySyntheticObservationContracts } = require('./helpers/label-source-pipeline-browser.cjs');
const { jointResponse } = require('./helpers/label-source-browser.cjs');
const source = fs.readFileSync("/Users/parkseungyeon/.codex/worktrees/5e-170-auto-labeler/5E/tests/test-ai-workspace-lifecycle-browser.cjs", 'utf8');
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
        approvedPrefix: request.text.startsWith(APPROVED_FIRST_PROMPT), approvedPromptSha256: await imageLabelDigest(APPROVED_FIRST_PROMPT) };
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
const sends = page => page.evaluate(() => window.__task2.sends.map(s => ({ purpose: s.payload.purpose, model: s.payload.model, effort: s.payload.effort, text: s.payload.text, attachmentCount: s.payload.attachments.length })));
const imageSends = requests => requests.filter(request => request.purpose === 'image');

for (const verdict of ['pass', 'fail']) test(`source label UI: observe, freeze, generate once, review ${verdict}, insert and edit native leader`, { timeout: 60000 }, async t => {
  const evidence = path.join(evidenceRoot, verdict);
  fs.mkdirSync(evidence, { recursive: true });
  const { page, errors } = await fixture(t, 1, evidence, { initialGeneration: true });
  await page.locator('#ai-image-panel [data-ai-comments-apply]').click();
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
  const shown = () => page.locator('#ai-image-panel .ai-generated-card .ai-preview-stage > img').first().getAttribute('src');
  await page.waitForFunction(data => document.querySelector('#ai-image-panel .ai-generated-card .ai-preview-stage > img')?.src === data, state.finalLabelComposite);
  assert.equal(await included.getAttribute('aria-pressed'), 'true');
  assert.equal(await shown(), state.finalLabelComposite, 'Preview displays the exact final native overlay bound to its review');
  await diagram.click();
  await page.waitForFunction(data => document.querySelector('#ai-image-panel .ai-generated-card .ai-preview-stage > img')?.src === data, state.data);
  assert.equal(await diagram.getAttribute('aria-pressed'), 'true'); assert.equal(await shown(), state.data);
  await included.click();
  await page.waitForFunction(data => document.querySelector('#ai-image-panel .ai-generated-card .ai-preview-stage > img')?.src === data, state.finalLabelComposite);
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
    assert.equal(await page.locator('#ai-image-panel [data-ai-insert-selected]').isDisabled(), true, 'Failed review cannot use normal insertion');
  }
  await page.screenshot({ path: path.join(evidence, 'review-result.png') });
  await page.locator(verdict === 'pass' ? '#ai-image-panel [data-ai-insert-selected]' : '#ai-image-panel [data-ai-edit-review-draft]').click();
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
  assert.equal(background.src, state.data); assert.equal(background.imageSelectionLocked, true);
  assert.equal(state.data, await page.evaluate(() => window.__task2.modified), 'Insertion and editing preserve the original controlled RAW bytes');
  await page.screenshot({ path: path.join(evidence, 'edited-native-leader.png') });
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ verdict, sends: await sends(page), state, inserted, roundtrip, errors }, null, 2));
});

test('source label UI: cancellation during analysis sends no image request and ignores late observer result', { timeout: 30000 }, async t => {
  const evidence = path.join(evidenceRoot, 'cancel'); fs.mkdirSync(evidence, { recursive: true });
  const { page, errors } = await fixture(t, 1, evidence, { initialGeneration: true });
  await page.locator('#ai-image-panel [data-ai-comments-apply]').click(); await page.waitForFunction(() => window.__task2.sends.length === 1);
  await page.locator('#ai-image-panel [data-ai-interrupt]').click();
  await page.evaluate(plan => { window.__task2.emit(0, 'assistant', plan); window.__task2.emit(0, 'done'); }, plan);
  await page.waitForFunction(() => document.querySelector('#ai-image-panel').dataset.aiBusy === 'false');
  assert.equal((await sends(page)).length, 1); assert.deepEqual(errors, []);
  assert.equal(imageSends(await sends(page)).length, 0);
  assert.equal(await page.evaluate(async () => (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs)[0].generated.length), 0);
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({cancelled:true,sends:await sends(page),errors},null,2));
});

for (const clearance of ['clear', 'overlap']) test(`two selected workspaces: ${clearance === 'clear' ? 'independent passed/failed reviews survive durable commit' : 'RAW overlap blocks both candidates despite a pass response'}`, { timeout: 60000 }, async t => {
  const original = fs.readFileSync("/Users/parkseungyeon/.codex/worktrees/5e-170-auto-labeler/5E/tests/test-ai-workspace-multiselect-browser.cjs", 'utf8');
  const a = original.indexOf('function seedRequestWorkspaces('), b = original.indexOf('\n\nconst active =', a);
  const code = original.slice(a, b)
    .replace("{ waitUntil: 'domcontentloaded' }", "{ waitUntil: 'domcontentloaded' }")
    .replace('  let statusGate = null, interruptGate = null;', "  for (const tab of tabs) { tab.imageKind = 'general'; tab.labelResult = 'restore-editable'; tab.imageLabelWorkflow = { version:'1.0.0', imageKind:'general', labelResult:'restore-editable' }; tab.preserveSourceLabels = true; tab.generated = []; tab.selectedCandidateId = null; }\n  let statusGate = null, interruptGate = null;")
    .replace('emit(index, kind) {', 'emit(index, kind, text) {')
    .replace("if (kind === 'image') {", "if (kind === 'assistant') { method = 'item/completed'; params.item = { type: 'agentMessage', phase: 'final_answer', text }; }\n      else if (kind === 'image') {");
  const batchFixture = new Function('require','root','fs','path','assert','chromium','webkit', adaptHarness(code) + '; return requestBrowserFixture;')(require,root,fs,path,assert,chromium,webkit);
  const evidence = path.join(evidenceRoot, clearance === 'clear' ? 'workspace-batch' : 'workspace-batch-overlap'); fs.mkdirSync(evidence, { recursive: true });
  const { page, errors } = await batchFixture(t, 2, evidence, { initialGeneration: true });
  await page.click('#ai-image-panel [data-tab-id="task-1"] .ai-task-tab-select', { modifiers: ['Meta'] });
  assert.equal(await page.locator('#ai-image-panel [data-ai-selection-count]').textContent(), '2개 선택');
  await page.click('#ai-image-panel [data-ai-comments-apply]');
  await page.waitForFunction(() => window.__task2.sends.length === 2);
  assert.ok((await sends(page)).every(s => s.purpose === 'scene'));
  const batchPlan = JSON.stringify(clearance === 'clear' ? syntheticBatchPipelineObservation() : syntheticPipelineObservation());
  await page.evaluate(plan => { for (const i of [0,1]) { window.__task2.emit(i, 'assistant', plan); window.__task2.emit(i, 'done'); } }, batchPlan);
  await page.waitForFunction(() => window.__task2.sends.length === 4);
  await assertApprovedGeneration(page, [2,3]);
  await page.evaluate(() => { for (const i of [2,3]) { window.__task2.emit(i, 'image'); window.__task2.emit(i, 'done'); } });
  await completeVerification(page, [4,5], ['pass','fail']);
  await page.waitForFunction(() => window.__task2Manager.workspaceBatchState().filter(job => ['completed','failed'].includes(job.state)).length === 2);
  const tasks = await page.evaluate(async () => (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w => w.tabs).map(tab => ({ id: tab.id, candidate: tab.generated.at(-1) })));
  assert.equal(tasks.length, 2); assert.ok(tasks.every(tab => tab.candidate.labelPlan.frozen && tab.candidate.labelPlan.labels[0].text === '• 전자'));
  assert.deepEqual(tasks.map(tab => tab.candidate.reviewState).sort(), clearance === 'clear' ? ['needs-attention','passed'] : ['needs-attention','needs-attention']);
  for (const task of tasks) {
    assert.equal(task.candidate.sourceLabelPlan.observationContractRevision, '1.4.0');
    assert.equal(task.candidate.sourceLabelPlan.labels[0].position.y, clearance === 'clear' ? .75 : .65, 'Source coordinates remain frozen');
    assert.equal(task.candidate.data, await page.evaluate(() => window.__task2.modified), 'Original batch RAW bytes remain unchanged');
  }
  const mechanical = await page.evaluate(() => window.__task2.sends.slice(4).map(send => {
    const lines = send.payload.text.split('\n');
    const proposals = JSON.parse(lines.find(line => line.startsWith('고정 후보: ')).slice('고정 후보: '.length));
    const auditLine = lines.find(line => line.startsWith('실제 네이티브 렌더러의 측정'));
    const audit = JSON.parse(auditLine.slice(auditLine.indexOf(': ') + 2));
    return { candidateCounts: proposals.map(group => group.candidates.length), finalPlacement: audit.finalPlacement };
  }));
  for (const result of mechanical) {
    if (clearance === 'clear') {
      assert.deepEqual(result.candidateCounts, [1]); assert.deepEqual(result.finalPlacement.issues, []);
    } else {
      assert.deepEqual(result.candidateCounts, [0]);
      assert.ok(result.finalPlacement.issues.some(issue => issue.code === 'raw-ink-occlusion' && issue.pixels > 0));
      assert.ok(result.finalPlacement.issues.some(issue => issue.code === 'unconfirmed-source-fallback'));
    }
  }
  assert.ok((await sends(page)).slice(4).every(s=>s.attachmentCount===3 && s.text.includes('고정 후보: ')));
  assert.equal((await sends(page)).length, 6); assert.equal(imageSends(await sends(page)).length, 2); assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ clearance, tasks, mechanical, sends: await sends(page), errors }, null, 2));
});


test('missing final overlay checks cannot promote a candidate to passed', {timeout:60000}, async t => {
  const evidence=path.join(evidenceRoot,'missing-composite-checks');fs.mkdirSync(evidence,{recursive:true});
  const {page,errors}=await fixture(t,1,evidence,{initialGeneration:true});
  await page.locator('#ai-image-panel [data-ai-comments-apply]').click();await page.waitForFunction(()=>window.__task2.sends.length===1);
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
  assert.equal(await page.locator('#ai-image-panel [data-ai-insert-selected]').isDisabled(),true);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(evidence,'review-rejected.png')});fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({candidate,sends:await sends(page),errors},null,2));
});

test('classified observation protocol: current positives, orphan ownership and malformed inputs fail closed', async () => {
  await verifySyntheticObservationContracts();
});
