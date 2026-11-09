const assert = require('node:assert/strict');
const {EventEmitter,once}=require('node:events');
const test = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const modulePromise = import('../js/ai-editable-image-labels.js');

test('version 2 typography preserves source lines, roles and bounds without accepting CSS', async () => {
  const { parseEditableImageLabelPlan, createEditableImageLabelObjects } = await modulePromise;
  const text = 'Na^+의 몰\n농도(M)';
  const label = { text, sourceKind: 'reference', mode: 'text', labelType: 'label', contentMode: 'formula',
    position: { x: 0.2, y: 0.3 }, typography: { role: 'text', bounds: { x: 0.1, y: 0.2, w: 0.2, h: 0.2 },
      fontFamily: 'invented-font', runs: [{ text: 'Na^+', role: 'chemical', contentMode: 'formula' },
        { text: '의 몰\n농도', role: 'text', contentMode: 'plain' }, { text: '(M)', role: 'unit', contentMode: 'plain' }] } };
  const plan = parseEditableImageLabelPlan(`<5e-editable-labels>${JSON.stringify({ version: 2, reviewRequired: false, labels: [label] })}</5e-editable-labels>`,
    { preserveSourceLabels: true, referenceCount: 1 });
  assert.equal(plan.labels[0].text, text);
  assert.equal(plan.labels[0].typography.runs.map(r => r.text).join(''), text);
  assert.equal(plan.labels[0].typography.fontFamily, undefined);
  const objects = createEditableImageLabelObjects({ labels: plan.labels, image: { id: 'i', x: 0, y: 0, w: 100, h: 50 }, idFactory: () => 'l' });
  assert.equal(objects[0].labelRuns.length, 3);
  assert.equal(objects[0].labelTypographyVersion, 1);
});

test('invalid optional typography keeps evidence text and requests review', async () => {
  const { parseEditableImageLabelPlan } = await modulePromise;
  const label = { text: 'A', evidence: 'A', sourceKind: 'request', mode: 'text', position: { x: 0.5, y: 0.5 },
    typography: { role: 'unknown', rotation: Infinity, bounds: { x: 0.9, y: 0.1, w: 1, h: 0.1 },
      runs: [{ text: 'invented', role: 'name', contentMode: 'plain' }] } };
  const plan = parseEditableImageLabelPlan(`<5e-editable-labels>${JSON.stringify({ version: 2, reviewRequired: false, labels: [label] })}</5e-editable-labels>`, 'A');
  assert.equal(plan.labels[0].text, 'A');
  assert.equal(plan.rejectedCount, 0);
  assert.equal(plan.labels[0].typography.bounds, undefined);
  assert.equal(plan.labels[0].typography.runs, undefined);
  assert.equal(plan.status, 'review');
});

test('physical quantities and chemicals share installed math faces with distinct italic policies', async () => {
  const { createEditableImageLabelObjects } = await modulePromise;
  const { EQUATION_FONT_FAMILY, OBJECT_LABEL_TEXT_FONT_FAMILY } = await import('../js/state.js');
  let id = 0;
  const labels = [['m_B', 'quantity'], ['CO_2', 'chemical'], ['A', 'name'], ['100', 'number']].map(([text, role]) => ({
    text, mode: 'text', labelType: 'quantity', contentMode: 'formula', anchor: { x: 0.5, y: 0.5 }, position: { x: 0.5, y: 0.5 }, typography: { role },
  }));
  const objects = createEditableImageLabelObjects({ labels, image: { id: 'i', x: 0, y: 0, w: 100, h: 50 }, idFactory: () => `l${++id}` });
  assert.equal(objects[0].fontFamily, EQUATION_FONT_FAMILY);
  assert.equal(objects[0].italic, true);
  assert.equal(objects[1].fontFamily, EQUATION_FONT_FAMILY);
  assert.equal(objects[1].formulaUpright, true);
  assert.equal(objects[1].italic, false);
  // 11-07 사용자 결정(안 B): 한 글자 이름 A·B는 물체 라벨 도구와 같은 명조.
  assert.equal(objects[2].fontFamily, OBJECT_LABEL_TEXT_FONT_FAMILY);
  assert.equal(objects[3].italic, false);
});

test('source bounds preserve rotation and evidence without resizing the standard native typography', async () => {
  const { createEditableImageLabelObjects } = await modulePromise;
  const { DEFAULT_TEXT_SIZE_MM } = await import('../js/state.js');
  const label = { text: '생명 활동', mode: 'text', contentMode: 'plain', anchor: { x: 0.5, y: 0.5 }, position: { x: 0.5, y: 0.5 },
    typography: { role: 'text', rotation: -15, bounds: { x: 0.4, y: 0.2, w: 0.1, h: 0.4 } } };
  const make = scale => createEditableImageLabelObjects({ labels: [label], image: { id: 'i', x: 0, y: 0, w: 30 * scale, h: 15 * scale }, idFactory: () => 'l' })[0];
  assert.equal(make(1).type, 'text');
  assert.equal(make(1).rotation, -15);
  assert.equal(make(1).fontSize, DEFAULT_TEXT_SIZE_MM);
  assert.equal(make(2).fontSize, DEFAULT_TEXT_SIZE_MM);
  assert.deepEqual(make(2).aiLabelSourceBounds, label.typography.bounds);
});

test('source-label option remains visible outside collapsed conversion and hidden preparation stages', () => {
  const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const conversation = html.indexOf('<section class="ai-conversation"');
  const option = html.indexOf('data-ai-preserve-source-labels');
  const processing = html.indexOf('<section class="ai-output-processing"', conversation);
  const preparation = html.indexOf('<section class="ai-preparation"', conversation);
  assert.ok(conversation >= 0 && option > conversation && option < processing,
    '원본 라벨 옵션이 접힌 변환 옵션이나 단계별로 숨겨지는 준비 영역 밖에 있어야 합니다.');
  assert.ok(processing < preparation);
});

test('parses verified editable labels and rejects invented text', async () => {
  const { parseEditableImageLabelPlan } = await modulePromise;
  const response = `<5e-editable-labels>{"version":1,"reviewRequired":false,"labels":[{"text":"A","evidence":"물체 A에 라벨을 붙여 줘","mode":"leader","labelType":"label","contentMode":"plain","anchor":{"x":0.4,"y":0.6},"position":{"x":0.25,"y":0.35}},{"text":"B","evidence":"물체 B","mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.7,"y":0.6},"position":{"x":0.7,"y":0.4}}]}</5e-editable-labels>`;

  const plan = parseEditableImageLabelPlan(response, '왼쪽 물체 A에 라벨을 붙여 줘');

  assert.equal(plan.status, 'review');
  assert.equal(plan.labels.length, 1);
  assert.equal(plan.labels[0].text, 'A');
  assert.equal(plan.rejectedCount, 1);
});

test('source image labels are opt-in drafts that always require review', async () => {
  const { parseEditableImageLabelPlan, withEditableImageLabelPlan } = await modulePromise;
  const label = { text: '좌심실', evidence: '좌심실', sourceKind: 'reference', sourceRef: 1,
    mode: 'leader', labelType: 'label', contentMode: 'plain',
    anchor: { x: 0.5, y: 0.6 }, position: { x: 0.8, y: 0.4 } };
  const response = `<5e-editable-labels>${JSON.stringify({ version: 1, reviewRequired: false, labels: [label] })}</5e-editable-labels>`;
  const enabled = { text: '심장 그림을 선화로 변환해 줘', preserveSourceLabels: true, referenceCount: 1 };
  const accepted = parseEditableImageLabelPlan(response, enabled);
  const disabled = parseEditableImageLabelPlan(response, { ...enabled, preserveSourceLabels: false });
  const wrongSource = parseEditableImageLabelPlan(response, { ...enabled, referenceCount: 0 });

  assert.equal(accepted.labels[0].text, '좌심실');
  assert.equal(accepted.labels[0].sourceRef, 1);
  assert.equal(accepted.status, 'review');
  assert.equal(accepted.reviewRequired, true);
  assert.equal(disabled.labels.length, 0);
  assert.equal(wrongSource.labels.length, 0);
  for (const analysisOnly of [false, true]) {
    const prompt = withEditableImageLabelPlan('그림을 그려 줘', enabled, { analysisOnly });
    assert.match(prompt, /sourceKind를 reference/);
  }
  assert.match(withEditableImageLabelPlan('그림을 그려 줘', { ...enabled, preserveSourceLabels: false }), /원본 이미지의 글자를 전사하지 않는다/);
});

test('receives the label plan before image generation auto-finalizes its turn', async () => {
  const { parseAiEvent } = await import('../js/ai-events.js');
  const plan = '<5e-editable-labels>{"version":1,"reviewRequired":true,"labels":[]}</5e-editable-labels>';
  const event = parseAiEvent({ method: 'item/completed', params: {
    turnId: 'turn-1', item: { type: 'agentMessage', phase: 'commentary', text: plan },
  } });
  const other = parseAiEvent({ method: 'item/completed', params: {
    turnId: 'turn-1', item: { type: 'agentMessage', phase: 'commentary', text: '이미지를 생성합니다.' },
  } });
  assert.equal(event.kind, 'assistant');
  assert.equal(event.text, plan);
  assert.equal(other.kind, 'ignore');
});

test('accepts a dense anatomy label plan within the source limit', async () => {
  const { parseEditableImageLabelPlan } = await modulePromise;
  const labels = Array.from({ length: 40 }, (_, index) => ({
    text: `부위 ${index + 1}`, evidence: `부위 ${index + 1}`, sourceKind: 'reference', sourceRef: 1,
    mode: 'leader', labelType: 'label', contentMode: 'plain',
    anchor: { x: 0.5, y: 0.5 }, position: { x: 0.8, y: 0.4 },
  }));
  const plan = parseEditableImageLabelPlan(`<5e-editable-labels>${JSON.stringify({ version: 1, reviewRequired: false, labels })}</5e-editable-labels>`,
    { text: '', preserveSourceLabels: true, referenceCount: 1 });
  assert.equal(plan.labels.length, 40);
  assert.equal(plan.status, 'review');
});

test('keeps real-run source labels whose presentation fields drift from the contract', async () => {
  const { parseEditableImageLabelPlan } = await modulePromise;
  const labels = [
    { text: 'ㄱ', evidence: 'ㄱ', sourceKind: 'reference', sourceRef: 1, mode: 'leader', labelType: 'other', contentMode: 'text',
      anchor: { x: 0.5, y: 0.22 }, position: { x: 0.08, y: 0.07 } },
    { text: 'CO_2', mode: 'text', labelType: 'quantity', contentMode: 'formula', position: { x: 0.3, y: 0.9 } },
  ];
  const response = `<5e-editable-labels>${JSON.stringify({ version: 1, reviewRequired: false, labels })}</5e-editable-labels>`;

  const plan = parseEditableImageLabelPlan(response, { text: '', preserveSourceLabels: true, referenceCount: 1 });

  assert.equal(plan.rejectedCount, 0);
  assert.deepEqual(plan.labels.map(({ text, mode, labelType, contentMode, sourceRef }) => ({ text, mode, labelType, contentMode, sourceRef })), [
    { text: 'ㄱ', mode: 'leader', labelType: 'label', contentMode: 'plain', sourceRef: 1 },
    { text: 'CO_2', mode: 'text', labelType: 'quantity', contentMode: 'formula', sourceRef: 1 },
  ]);
  assert.deepEqual(plan.labels[1].anchor, plan.labels[1].position);
});

test('keeps source-label review visible when nothing is transcribed', async () => {
  const { parseEditableImageLabelPlan } = await modulePromise;
  const response = '<5e-editable-labels>{"version":1,"reviewRequired":false,"labels":[]}</5e-editable-labels>';
  const plan = parseEditableImageLabelPlan(response, { text: '', preserveSourceLabels: true, referenceCount: 1 });
  assert.equal(plan.status, 'review');
  assert.equal(plan.reviewRequired, true);
  assert.deepEqual(plan.labels, []);
});

test('bounds an overlong source-label plan without discarding all labels', async () => {
  const { parseEditableImageLabelPlan } = await modulePromise;
  const labels = Array.from({ length: 130 }, (_, index) => ({
    text: `부위 ${index + 1}`, evidence: `부위 ${index + 1}`, sourceKind: 'reference', sourceRef: 1,
    mode: 'leader', labelType: 'label', contentMode: 'plain',
    anchor: { x: 0.5, y: 0.5 }, position: { x: 0.8, y: 0.4 },
  }));
  const response = `<5e-editable-labels>${JSON.stringify({ version: 1, reviewRequired: false, labels })}</5e-editable-labels>`;
  const plan = parseEditableImageLabelPlan(response, { text: '', preserveSourceLabels: true, referenceCount: 1 });
  assert.equal(plan.labels.length, 128);
  assert.equal(plan.rejectedCount, 2);
  assert.equal(plan.status, 'review');
});

test('maps normalized labels to independent native labeler objects', async () => {
  const { createEditableImageLabelObjects } = await modulePromise;
  const labels = [{
    text: 'm_A', evidence: '질량 m_A', mode: 'leader', labelType: 'quantity', contentMode: 'formula',
    anchor: { x: 0.75, y: 0.5 }, position: { x: 0.9, y: 0.25 },
  }];

  const objects = createEditableImageLabelObjects({
    labels,
    image: { id: 'image-1', x: 10, y: 20, w: 100, h: 40, rotation: 0 },
    metadata: { aiTaskId: 'task-1', aiCandidateId: 'candidate-1' },
    idFactory: () => 'label-1',
  });

  assert.deepEqual(objects.map(({ id, type, p1, p2, text, contentMode, source, aiParentImageId }) => ({ id, type, p1, p2, text, contentMode, source, aiParentImageId })), [{
    id: 'label-1', type: 'labeler', p1: { x: 85, y: 40 }, p2: { x: 100, y: 30 }, text: 'm_A',
    contentMode: 'formula', source: 'm_A', aiParentImageId: 'image-1',
  }]);
  assert.equal(objects[0].aiAutoLabel, true);
  assert.equal(objects[0].groupId, null);
});

test('rotates label coordinates with a replaced image and keeps text labels leader-free', async () => {
  const { createEditableImageLabelObjects } = await modulePromise;
  const { nativeLabelCenter } = await import('../js/ai-label-typography.js');
  const objects = createEditableImageLabelObjects({
    labels: [{
      text: '+', evidence: '+ 극성', mode: 'text', labelType: 'label', contentMode: 'plain',
      anchor: { x: 1, y: 0.5 }, position: { x: 1, y: 0.5 },
    }],
    image: { id: 'image-2', x: 0, y: 0, w: 100, h: 40, rotation: 90 },
    metadata: {},
    idFactory: () => 'label-2',
  });

  const center = nativeLabelCenter(objects[0]);
  assert.ok(Math.abs(center.x - 50) < 1e-9);
  assert.ok(Math.abs(center.y - 70) < 1e-9);
  assert.equal(objects[0].type, 'text');
  assert.equal(objects[0].p1, undefined);
  assert.equal(objects[0].p2, undefined);
});

test('malformed plans fail closed without blocking the generated image', async () => {
  const { parseEditableImageLabelPlan } = await modulePromise;

  const plan = parseEditableImageLabelPlan('이미지 생성 완료', 'A 라벨');

  assert.equal(plan.status, 'unavailable');
  assert.deepEqual(plan.labels, []);
  assert.equal(plan.reviewRequired, true);
});

test('keeps the structured editable-label contract through an automatic correction turn', {timeout:5000}, async () => {
  const { createAiImageReviewController } = await import('../js/ai-image-review.js');
  const { parseEditableImageLabelPlan, withEditableImageLabelPlan } = await modulePromise;
  const payloads = [];
  const turns = [];
  const correctedCandidate = { id: 'corrected-1', name: '교정 결과', data: 'data:image/png;base64,AA==' };
  const events=new EventEmitter();
  const next=name=>once(events,name,{signal:AbortSignal.timeout(4000)});
  const checks = ['object-counts', 'inside-outside', 'liquid-occupancy', 'connections', 'composition-state', 'black-fill-meaning', 'presentation', 'request-scope'];
  const report = status => JSON.stringify({
    verdict: status === 'pass' ? 'pass' : 'fail',
    checks: checks.map(id => ({ id, label: id, status: id === 'composition-state' ? status : 'pass', detail: `${id} 확인` })),
    issues: status === 'pass' ? [] : [{ message: 'A 위치 교정', severity: 'major' }],
  });
  const transport = {
    send: async payload => {
      payloads.push(payload);
      const turnId = `turn-${payloads.length}`;
      turns.push(turnId);
      events.emit('sent');
      return { turnId };
    },
  };
  const controller = createAiImageReviewController({ transport, onState:detail=>events.emit(detail.state) });

  await controller.start({
    candidate: { id: 'initial-1', name: '첫 결과', data: 'data:image/png;base64,AA==' },
    request: '물체 A에 라벨을 붙여 줘',
    modelAvailable: true,
    model: 'fixture-model',
    effort: 'medium',
    models: [{ model: 'fixture-model', supportedReasoningEfforts: ['medium'], defaultReasoningEffort: 'medium', serviceTiers: [] }],
    prepareCandidateAttachment: async item => ({ name: item.name, data: item.data }),
    makeCorrectionPayload: async () => ({
      model: 'fixture-model',
      effort: 'medium',
      serviceTier: null,
      text: withEditableImageLabelPlan('그림에서 A 위치만 교정해 줘', '물체 A에 라벨을 붙여 줘'),
      attachments: [],
    }),
    acceptCorrectionImage: async () => correctedCandidate,
    acceptCorrectionAssistant: async (candidate, responseText) => {
      candidate.labelPlan = parseEditableImageLabelPlan(responseText, '물체 A에 라벨을 붙여 줘');
    },
  });

  const correctionSent=next('sent');
  controller.handleEvent({ kind: 'assistant', turnId: turns[0], text: report('fail') });
  controller.handleEvent({ kind: 'done', turnId: turns[0], status: 'completed' });
  await correctionSent;

  assert.equal(payloads.length, 2);
  assert.match(payloads[1].text, /<5e-editable-labels>/);

  const labelResponse = '<5e-editable-labels>{"version":1,"reviewRequired":false,"labels":[{"text":"A","evidence":"물체 A에 라벨을 붙여 줘","mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.5,"y":0.5},"position":{"x":0.5,"y":0.4}}]}</5e-editable-labels>';
  const reviewSent=next('sent');
  controller.handleEvent({ kind: 'assistant', turnId: turns[1], text: labelResponse });
  controller.handleEvent({ kind: 'assistant', turnId: turns[1], text: '교정 이미지를 만들고 있습니다.' });
  controller.handleEvent({ kind: 'image', turnId: turns[1], src: 'data:image/png;base64,AQ==' });
  controller.handleEvent({ kind: 'done', turnId: turns[1], status: 'completed' });
  await reviewSent;

  assert.equal(correctedCandidate.labelPlan.labels[0].text, 'A');
  assert.equal(payloads.length, 3);

  const passed=next('passed');
  controller.handleEvent({ kind: 'assistant', turnId: turns[2], text: report('pass') });
  controller.handleEvent({ kind: 'done', turnId: turns[2], status: 'completed' });
  await passed;
  assert.equal(controller.getState().state, 'passed');
});

test('preserves the editable label plan in saved AI task snapshots', async () => {
  const { snapshotImageItem } = await import('../js/ai-panel.js');
  const source = {
    id: 'generated-1', name: '생성 결과 1', data: 'data:image/png;base64,AA==', kind: 'generated',
    labelPlan: { version: 1, status: 'ready', reviewRequired: false, rejectedCount: 0, labels: [{
      text: 'A', evidence: '라벨 A', mode: 'text', labelType: 'label', contentMode: 'plain',
      anchor: { x: 0.2, y: 0.3 }, position: { x: 0.2, y: 0.3 },
    }] },
  };

  const snapshot = snapshotImageItem(source);
  source.labelPlan.labels[0].text = 'changed';

  assert.equal(snapshot.labelPlan.labels[0].text, 'A');
  assert.equal(snapshot.labelPlan.status, 'ready');
});

test('inserts source labels alongside separated image regions in one undo step', async () => {
  const { insertEditableAssets } = await import('../js/ai-editable-assets.js');
  const value = {
    objects: [], groups: [], undoStack: [], redoStack: [], selectedIds: [], targetedId: null,
    activeTool: 'V', activeLayerId: 1, activePageId: 'page-1', artboard: { w: 100, h: 60 },
  };
  const state = { get: () => value, update: update => update(value) };
  const result = insertEditableAssets(state, {
    width: 1000, height: 500, labelsDisabled: true,
    assets: [{ id: 'heart', x: 250, y: 100, width: 500, height: 300,
      data: 'data:image/png;base64,AA==', label: '', labelMode: 'none' }],
  }, {
    isCurrent: () => true, aiTaskId: 'task-1', aiCandidateId: 'candidate-1',
    editableLabelPlan: { labels: [{
      text: '좌심실', evidence: '좌심실', sourceKind: 'reference', sourceRef: 1,
      mode: 'leader', labelType: 'label', contentMode: 'plain',
      anchor: { x: 0.5, y: 0.5 }, position: { x: 0.8, y: 0.4 },
    }] },
  });

  assert.equal(value.undoStack.length, 1);
  assert.equal(result.added, 2);
  assert.deepEqual(value.objects.map(object => object.type), ['image', 'labeler']);
  assert.equal(value.objects[1].text, '좌심실');
  assert.equal(value.objects[1].aiParentImageId, value.objects[0].id);
});

// 11-09: 라벨 편집 창·PNG 저장(labelEditObjects)도 캔버스 넣기와 같이 원본에서 잰 비율 × 그림 높이(1.8~8).
test('label editor and PNG export objects use the measured source label ratio like canvas insertion', async () => {
  const { labelEditObjects } = await import('../js/ai-label-edit-model.js');
  const label = { id: 'a', text: '좌심실', evidence: '좌심실', sourceKind: 'reference', sourceRef: 1, mode: 'text', labelType: 'label', contentMode: 'plain', anchor: { x: 0.5, y: 0.5 }, position: { x: 0.5, y: 0.5 } };
  const image = { id: 'label-editor-image', x: 0, y: 0, w: 90, h: 45, rotation: 0 };
  const [measured] = labelEditObjects({ measuredLabelSize: 0.05, labels: [label], relationGroups: [] }, image);
  assert.ok(Math.abs(measured.fontSize - 2.25) < 1e-9, String(measured.fontSize));
  const [plain] = labelEditObjects({ labels: [label], relationGroups: [] }, image);
  assert.equal(plain.fontSize, 3.7);
});

// 11-09: 기출 글자를 하나도 못 지운 결과(원본 글자가 남음)를 넣을 때 라벨을 원본 글자 위에 겹치지 않고 그림 옆 목록으로 둔다.
test('external-list exam drafts go beside the image on user output instead of over undeleted source text', async () => {
  const { userOutputLabelPlan } = await import('../js/ai-label-edit-model.js');
  const label = id => ({ id, text: id, evidence: id, sourceKind: 'reference', sourceRef: 1, scope: 'general', mode: 'text', labelType: 'label', contentMode: 'plain', position: { x: 0.5, y: 0.5 }, anchor: { x: 0.5, y: 0.5 } });
  const external = userOutputLabelPlan({ id: 'c1', labelPlan: null, reviewState: 'needs-attention',
    editableDraft: { version: 1, presentation: 'external-list', labelIds: ['a'] },
    sourceLabelPlan: { version: 4, frozen: true, labels: [label('a'), label('b')], relationGroups: [] } });
  assert.equal(external.reviewDraft.presentation, 'external-list');
  assert.deepEqual(external.labels.map(l => l.id), ['a']);
  const restored = userOutputLabelPlan({ id: 'c2', labelPlan: { version: 4, frozen: true, labels: [label('a')], relationGroups: [] } });
  assert.equal(restored.reviewDraft, undefined);
});

// 11-09: 객체 분리로 넣어도 「한 장」 넣기와 같이 원본에서 잰 글자 비율 × 넣은 그림 전체 높이로 라벨 크기를 정한다.
test('separated insertion sizes source labels from the measured source ratio like single-image insertion', async () => {
  const { insertEditableAssets } = await import('../js/ai-editable-assets.js');
  const value = {
    objects: [], groups: [], undoStack: [], redoStack: [], selectedIds: [], targetedId: null,
    activeTool: 'V', activeLayerId: 1, activePageId: 'page-1', artboard: { w: 100, h: 60 },
  };
  const state = { get: () => value, update: update => update(value) };
  insertEditableAssets(state, {
    width: 1000, height: 500, labelsDisabled: true,
    assets: [{ id: 'heart', x: 250, y: 100, width: 500, height: 300, data: 'data:image/png;base64,AA==', label: '', labelMode: 'none' }],
  }, {
    isCurrent: () => true, aiTaskId: 'task-1', aiCandidateId: 'candidate-1',
    editableLabelPlan: { measuredLabelSize: 0.05, labels: [{
      text: '좌심실', evidence: '좌심실', sourceKind: 'reference', sourceRef: 1,
      mode: 'text', labelType: 'label', contentMode: 'plain', anchor: { x: 0.8, y: 0.4 }, position: { x: 0.8, y: 0.4 },
    }] },
  });
  // 넣은 그림 전체 높이 = 500 × min(100·0.9/1000, 60·0.9/500) = 45mm → 0.05 × 45 = 2.25mm
  const label = value.objects.find(object => object.aiAutoLabel);
  assert.equal(label.type, 'text');
  assert.ok(Math.abs(label.fontSize - 2.25) < 1e-9, String(label.fontSize));
});

test('inserts and replaces the raster plus auto labels in one undoable state change', async () => {
  const previousImage = globalThis.Image;
  globalThis.Image = class FakeImage {
    constructor() { this.naturalWidth = 1000; this.naturalHeight = 500; }
    set src(_value) { queueMicrotask(() => this.onload?.()); }
  };
  try {
    const { insertImageFromSrc } = await import('../js/image-paste.js');
    const value = {
      objects: [], undoStack: [], redoStack: [], selectedIds: [], targetedId: null, activeTool: 'V', activeLayerId: 1,
      artboard: { w: 100, h: 60 }, viewBox: { x: -50, y: -30, w: 100, h: 60 }, pages: [], activePageId: null,
    };
    const state = {
      get: () => value,
      update: change => change(value),
      subscribe: () => () => {},
    };
    const firstPlan = { version: 1, status: 'ready', reviewRequired: false, rejectedCount: 0, labels: [{
      text: 'A', evidence: '라벨 A', mode: 'text', labelType: 'label', contentMode: 'plain',
      anchor: { x: 0.2, y: 0.2 }, position: { x: 0.2, y: 0.2 },
    }] };

    const imageId = await insertImageFromSrc(state, 'data:image/png;base64,AA==', {
      preserveBytes: true, centerArtboard: true, aiTaskId: 'task-1', aiCandidateId: 'candidate-1', editableLabelPlan: firstPlan,
    });

    assert.equal(value.undoStack.length, 1);
    assert.deepEqual(value.objects.map(object => object.type), ['image', 'text']);
    assert.deepEqual(value.selectedIds, [imageId, `${imageId}_auto_label_1`]);

    value.selectedIds = [imageId];
    const secondPlan = { version: 1, status: 'review', reviewRequired: true, rejectedCount: 0, labels: [{
      text: 'B', evidence: '라벨 B', mode: 'leader', labelType: 'label', contentMode: 'plain',
      anchor: { x: 0.8, y: 0.7 }, position: { x: 0.9, y: 0.4 },
    }] };
    await insertImageFromSrc(state, 'data:image/png;base64,AQ==', {
      preserveBytes: true, centerArtboard: true, aiTaskId: 'task-1', aiCandidateId: 'candidate-2', replaceId: imageId,
      editableLabelPlan: secondPlan,
    });

    assert.equal(value.undoStack.length, 2);
    assert.equal(value.objects.length, 2);
    assert.equal(value.objects[0].id, imageId);
    assert.equal(value.objects[1].text, 'B');
    assert.equal(value.objects[1].aiParentImageId, imageId);
    assert.equal(value.objects[0].aiEditableLabelPlan.labels[0].text, 'B');
    assert.equal(value.objects[0].aiEditableLabelPlan.reviewRequired, true);
    assert.deepEqual(value.selectedIds, [imageId, `${imageId}_auto_label_1`]);

    const { migrate, serialize } = await import('../js/project-io.js');
    value.pages = [{
      id: 'page-1', name: '페이지 1', meta: { number: '', points: '' }, objects: value.objects,
      guides: [], layers: [{ id: 1, name: '레이어 1', visible: true, locked: false }], artboard: value.artboard,
    }];
    value.activePageId = 'page-1';
    value.guides = [];
    value.layers = value.pages[0].layers;
    const restored = migrate(JSON.parse(JSON.stringify(serialize(value))));
    const restoredLabel = restored.pages[0].objects.find(object => object.type === 'labeler');
    const restoredImage = restored.pages[0].objects.find(object => object.type === 'image');
    assert.equal(restoredLabel.text, 'B');
    assert.equal(restoredLabel.aiAutoLabel, true);
    assert.equal(restoredLabel.aiParentImageId, imageId);
    assert.equal(restoredImage.aiEditableLabelPlan.labels[0].text, 'B');
    assert.equal(restoredImage.aiEditableLabelPlan.reviewRequired, true);
  } finally {
    globalThis.Image = previousImage;
  }
});

// 11-09 라벨 안정화(규칙 5): 결과 명세 라벨에 원본 글자 크기(measuredSize)가 있으면 넣는 곳의 크기(1.8mm 하한이 걸린 값)보다 앞선다.
// 원본 명세 지문(대상 대응)은 이 값을 빼고 재므로 붙여도 깨지지 않는다.
test('per-label measured size beats the clamped insertion size and does not break the target placement binding', async () => {
  const { createEditableImageLabelObjects } = await import('../js/ai-editable-image-labels.js');
  const { labelBindingJson } = await import('../js/ai-label-target-placement.js');
  const label = { id: 'a', text: '파장', evidence: '파장', sourceKind: 'reference', sourceRef: 1, mode: 'text', labelType: 'label', contentMode: 'plain', anchor: { x: 0.5, y: 0.5 }, position: { x: 0.5, y: 0.5 } };
  const image = { id: 'img', x: 0, y: 0, w: 60, h: 20, rotation: 0 };
  let n = 0;
  const [sized] = createEditableImageLabelObjects({ labels: [{ ...label, measuredSize: 0.05 }], image, labelSizeMm: 1.8, idFactory: () => 'l' + ++n });
  assert.ok(Math.abs(sized.fontSize - 1.0) < 1e-9, String(sized.fontSize));
  const [plain] = createEditableImageLabelObjects({ labels: [label], image, labelSizeMm: 1.8, idFactory: () => 'l' + ++n });
  assert.equal(plain.fontSize, 1.8);
  assert.equal(labelBindingJson([{ ...label, measuredSize: 0.05 }]), JSON.stringify([label]));
});
