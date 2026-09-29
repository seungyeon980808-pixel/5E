const assert = require('node:assert/strict');
const test = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const modulePromise = import('../preview/js/ai-editable-image-labels.js');

test('source-label option remains visible outside collapsed conversion and hidden preparation stages', () => {
  const html = readFileSync(path.join(__dirname, '../preview/index.html'), 'utf8');
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
  assert.match(withEditableImageLabelPlan('그림을 그려 줘', enabled), /sourceKind를 reference/);
  assert.match(withEditableImageLabelPlan('그림을 그려 줘', { ...enabled, preserveSourceLabels: false }), /원본 이미지의 글자를 전사하지 않는다/);
});

test('receives the label plan before image generation auto-finalizes its turn', async () => {
  const { parseAiEvent } = await import('../preview/js/ai-events.js');
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
  const objects = createEditableImageLabelObjects({
    labels: [{
      text: '+', evidence: '+ 극성', mode: 'text', labelType: 'label', contentMode: 'plain',
      anchor: { x: 1, y: 0.5 }, position: { x: 1, y: 0.5 },
    }],
    image: { id: 'image-2', x: 0, y: 0, w: 100, h: 40, rotation: 90 },
    metadata: {},
    idFactory: () => 'label-2',
  });

  assert.ok(Math.abs(objects[0].p1.x - 50) < 1e-9);
  assert.ok(Math.abs(objects[0].p1.y - 70) < 1e-9);
  assert.deepEqual(objects[0].p1, objects[0].p2);
});

test('malformed plans fail closed without blocking the generated image', async () => {
  const { parseEditableImageLabelPlan } = await modulePromise;

  const plan = parseEditableImageLabelPlan('이미지 생성 완료', 'A 라벨');

  assert.equal(plan.status, 'unavailable');
  assert.deepEqual(plan.labels, []);
  assert.equal(plan.reviewRequired, true);
});

test('keeps the structured editable-label contract through an automatic correction turn', async () => {
  const { createAiImageReviewController } = await import('../preview/js/ai-image-review.js');
  const { parseEditableImageLabelPlan, withEditableImageLabelPlan } = await modulePromise;
  const payloads = [];
  const turns = [];
  const correctedCandidate = { id: 'corrected-1', name: '교정 결과', data: 'data:image/png;base64,AA==' };
  const settle = () => new Promise(resolve => setImmediate(resolve));
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
      return { turnId };
    },
  };
  const controller = createAiImageReviewController({ transport });

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

  controller.handleEvent({ kind: 'assistant', turnId: turns[0], text: report('fail') });
  controller.handleEvent({ kind: 'done', turnId: turns[0], status: 'completed' });
  await settle();
  await settle();

  assert.equal(payloads.length, 2);
  assert.match(payloads[1].text, /<5e-editable-labels>/);

  const labelResponse = '<5e-editable-labels>{"version":1,"reviewRequired":false,"labels":[{"text":"A","evidence":"물체 A에 라벨을 붙여 줘","mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.5,"y":0.5},"position":{"x":0.5,"y":0.4}}]}</5e-editable-labels>';
  controller.handleEvent({ kind: 'assistant', turnId: turns[1], text: labelResponse });
  controller.handleEvent({ kind: 'assistant', turnId: turns[1], text: '교정 이미지를 만들고 있습니다.' });
  controller.handleEvent({ kind: 'image', turnId: turns[1], src: 'data:image/png;base64,AQ==' });
  controller.handleEvent({ kind: 'done', turnId: turns[1], status: 'completed' });
  await settle();
  await settle();

  assert.equal(correctedCandidate.labelPlan.labels[0].text, 'A');
  assert.equal(payloads.length, 3);

  controller.handleEvent({ kind: 'assistant', turnId: turns[2], text: report('pass') });
  controller.handleEvent({ kind: 'done', turnId: turns[2], status: 'completed' });
  await settle();
  assert.equal(controller.getState().state, 'passed');
});

test('preserves the editable label plan in saved AI task snapshots', async () => {
  const { snapshotImageItem } = await import('../preview/js/ai-panel.js');
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
  const { insertEditableAssets } = await import('../preview/js/ai-editable-assets.js');
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

test('inserts and replaces the raster plus auto labels in one undoable state change', async () => {
  const previousImage = globalThis.Image;
  globalThis.Image = class FakeImage {
    constructor() { this.naturalWidth = 1000; this.naturalHeight = 500; }
    set src(_value) { queueMicrotask(() => this.onload?.()); }
  };
  try {
    const { insertImageFromSrc } = await import('../preview/js/image-paste.js');
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
    assert.deepEqual(value.objects.map(object => object.type), ['image', 'labeler']);
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

    const { migrate, serialize } = await import('../preview/js/project-io.js');
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
