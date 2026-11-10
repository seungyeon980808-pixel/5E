const test = require('node:test');
const assert = require('node:assert/strict');

const modulePromise = import('../js/ai-direct-label-plan.js');
const editablePromise = import('../js/ai-editable-image-labels.js?v=1.7.0-four-session-integration');

// 실제 AI 응답 발췌: ~/Work/2026-11-10_5E-label-redraw/round4/read-gpt-6.1-sol.json (c2_2023_04_04_1.png, rocket.png)
// round3/read-gpt-6.1-sol.json (p1_2022_09_09_1.png)의 항목을 그대로 옮겼다.
const FIXTURE_ROUND4_C2 = [
  { text: '¹H₂O(l)', kind: 'math', x: 0.007, y: 0.52, w: 0.242, h: 0.19,
    leader: { x1: 0.256, y1: 0.599, x2: 0.373, y2: 0.599 } },
  { text: '¹H₂O(s)', kind: 'math', x: 0.749, y: 0.321, w: 0.246, h: 0.199,
    leader: { x1: 0.734, y1: 0.398, x2: 0.625, y2: 0.457 } },
  { text: '²H₂O(s)', kind: 'math', x: 0.751, y: 0.733, w: 0.247, h: 0.195,
    leader: { x1: 0.736, y1: 0.819, x2: 0.618, y2: 0.787 } },
];
const FIXTURE_ROUND4_ROCKET = [
  { text: '운동 방향', kind: 'ko', x: 0.616, y: 0.102, w: 0.225, h: 0.08, leader: null },
  { text: '광원', kind: 'ko', x: 0.175, y: 0.43, w: 0.09, h: 0.076, leader: null },
  { text: 'A', kind: 'en', x: 0.24, y: 0.642, w: 0.045, h: 0.075, leader: null },
  { text: 'B', kind: 'en', x: 0.868, y: 0.643, w: 0.042, h: 0.074, leader: null },
];
// round3 응답에는 kind가 없어 현재 규격(kind 필수)에서는 버려진다. 상자 높이 확인용으로 kind만 넣었다.
const FIXTURE_ROUND3_P1 = [
  { text: '진행 방향', kind: 'ko', x: 0.398, y: 0.142, w: 0.293, h: 0.098, leader: null },
  { text: '매질 A', kind: 'ko', x: 0.749, y: 0.377, w: 0.224, h: 0.098, leader: null },
  { text: '매질 B', kind: 'ko', x: 0.751, y: 0.507, w: 0.218, h: 0.095, leader: null },
];

test('prompt is the round-4 ASK text plus the no-spelling-fix sentence', async () => {
  const { LABEL_READ_PROMPT } = await modulePromise;
  // 11-10: 맞춤법 보존 규칙을 맨 앞에 두고, 구체 예(스타이로폼)를 붙인다.
  assert.ok(LABEL_READ_PROMPT.startsWith('최우선 규칙: 글자는 그림에 보이는 그대로 옮긴다. 「스타이로폼」을 「스티로폼」으로 고치지 않는 것처럼, 맞춤법·띄어쓰기·외래어 표기를 절대 바꾸지 않는다.\n이 시험 그림 속 글자 묶음을 모두 찾아 JSON 배열로만 답해. 다른 말은 쓰지 마.\n각 항목: {"text"'));
  assert.ok(LABEL_READ_PROMPT.includes('「스타이로폼」을 「스티로폼」으로 고치지 않는 것처럼'));
  assert.ok(LABEL_READ_PROMPT.includes('길이·각도를 나타내는 치수선이나 각도 호는 지시선이 아니다.'));
  assert.equal(LABEL_READ_PROMPT.split('맞춤법').length - 1, 1);
});

test('parseLabelRead strips json fences and trailing prose', async () => {
  const { parseLabelRead } = await modulePromise;
  const text = '```json\n' + JSON.stringify(FIXTURE_ROUND4_C2) + '\n```\n참고로 세 개입니다.';
  const items = parseLabelRead(text);
  assert.equal(items.length, 3);
  assert.equal(items[0].text, '¹H₂O(l)');
  assert.deepEqual(items[0].leader, { x1: 0.256, y1: 0.599, x2: 0.373, y2: 0.599 });
});

test('parseLabelRead drops invalid items, clamps numbers and tolerates bad leaders', async () => {
  const { parseLabelRead } = await modulePromise;
  const raw = [
    { text: '광원', kind: 'ko', x: 0.9, y: 0.1, w: 0.3, h: 0.05, leader: null },        // w clamped to 0.1
    { text: '', kind: 'ko', x: 0.1, y: 0.1, w: 0.1, h: 0.1, leader: null },           // empty text
    { text: 'C', kind: 'other', x: 0.1, y: 0.1, w: 0.1, h: 0.1, leader: null },        // bad kind
    { text: 'D', kind: 'en', x: 0.1, y: 0.1, w: 0.1, leader: null },                  // missing h
    { text: 'E', kind: 'en', x: 0.1, y: 0.1, w: 0, h: 0.1, leader: null },            // zero width
    { text: 'F', kind: 'en', x: 0.2, y: 0.2, w: 0.1, h: 0.1, leader: { x1: 0.1 } },   // bad leader -> null
    { text: 'G', kind: 'qty', x: -0.5, y: 0.2, w: 0.1, h: 0.1, leader: null },        // x clamped to 0
  ];
  const items = parseLabelRead(JSON.stringify(raw));
  assert.deepEqual(items.map(i => i.text), ['광원', 'F', 'G']);
  assert.equal(items[0].x, 0.9);
  assert.ok(Math.abs(items[0].w - 0.1) < 1e-9);
  assert.equal(items[1].leader, null);
  assert.equal(items[2].x, 0);
});

test('parseLabelRead returns [] for non-JSON and caps at 128 items', async () => {
  const { parseLabelRead } = await modulePromise;
  assert.deepEqual(parseLabelRead('죄송합니다 읽지 못했습니다'), []);
  assert.deepEqual(parseLabelRead('[not json'), []);
  assert.deepEqual(parseLabelRead(null), []);
  const many = Array.from({ length: 200 }, (_, i) => ({ text: 'A' + i, kind: 'en', x: 0.1, y: 0.1, w: 0.1, h: 0.1, leader: null }));
  assert.equal(parseLabelRead(JSON.stringify(many)).length, 128);
});

test('kinds map to typography roles, including chemical and number detection', async () => {
  const { parseLabelRead, labelReadToEditablePlan } = await modulePromise;
  const items = parseLabelRead(JSON.stringify([
    { text: '운동 방향', kind: 'ko', x: 0.1, y: 0.1, w: 0.2, h: 0.1, leader: null },
    { text: 'A', kind: 'en', x: 0.1, y: 0.2, w: 0.1, h: 0.1, leader: null },
    { text: 'ρ₁', kind: 'qty', x: 0.1, y: 0.3, w: 0.1, h: 0.1, leader: null },
    { text: '¹H₂O(s)', kind: 'math', x: 0.1, y: 0.4, w: 0.1, h: 0.1, leader: null },
    { text: '0.5 m', kind: 'math', x: 0.1, y: 0.5, w: 0.1, h: 0.1, leader: null },
    { text: '22°C', kind: 'math', x: 0.1, y: 0.6, w: 0.1, h: 0.1, leader: null },
    { text: '3', kind: 'math', x: 0.1, y: 0.7, w: 0.1, h: 0.1, leader: null },
  ]));
  const { labels } = labelReadToEditablePlan(items);
  assert.deepEqual(labels.map(l => l.typography.role),
    ['text', 'name', 'quantity', 'chemical', 'unit', 'unit', 'number']);
  assert.deepEqual(labels.map(l => l.id), ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
});

test('leader items use the pointed object end as anchor and the label box centre as position', async () => {
  const { parseLabelRead, labelReadToEditablePlan } = await modulePromise;
  const { labels } = labelReadToEditablePlan(parseLabelRead(JSON.stringify(FIXTURE_ROUND4_C2)));
  const first = labels[0];
  assert.equal(first.mode, 'leader');
  assert.equal(first.scope, 'general');
  assert.equal(first.contentMode, 'text');
  assert.ok(Math.abs(first.position.x - (0.007 + 0.242 / 2)) < 1e-9);
  assert.ok(Math.abs(first.position.y - (0.52 + 0.19 / 2)) < 1e-9);
  assert.deepEqual(first.anchor, { x: 0.373, y: 0.599 });
  assert.deepEqual(first.typography.bounds, { x: 0.007, y: 0.52, w: 0.242, h: 0.19 });
});

test('text items without leader anchor on their own centre', async () => {
  const { parseLabelRead, labelReadToEditablePlan } = await modulePromise;
  const { labels } = labelReadToEditablePlan(parseLabelRead(JSON.stringify(FIXTURE_ROUND4_ROCKET)));
  assert.equal(labels[1].mode, 'text');
  assert.deepEqual(labels[1].anchor, labels[1].position);
  assert.equal(labels[1].typography.role, 'text');
  assert.equal(labels[2].typography.role, 'name');
});

test('labelSizeMm takes the median item height and clamps to 1.8..8 mm', async () => {
  const { parseLabelRead, labelSizeMm } = await modulePromise;
  const items = parseLabelRead(JSON.stringify(FIXTURE_ROUND3_P1));
  // 중앙값 0.098 × 그림 높이 40mm = 3.92mm
  assert.ok(Math.abs(labelSizeMm(items, 40) - 0.098 * 40) < 1e-9);
  assert.equal(labelSizeMm(items, 10), 1.8);
  assert.equal(labelSizeMm(items, 500), 8);
  assert.equal(labelSizeMm([], 40), null);
  assert.equal(labelSizeMm(items, 0), null);
});

test('labelReadToEditablePlan output is accepted by createEditableImageLabelObjects', async () => {
  const { parseLabelRead, labelReadToEditablePlan, labelSizeMm } = await modulePromise;
  const { createEditableImageLabelObjects } = await editablePromise;
  const items = parseLabelRead(JSON.stringify([...FIXTURE_ROUND4_C2, ...FIXTURE_ROUND4_ROCKET]));
  const { labels } = labelReadToEditablePlan(items);
  let n = 0;
  const objects = createEditableImageLabelObjects({
    labels,
    image: { id: 'img-1', x: 10, y: 20, w: 100, h: 50, rotation: 0 },
    labelSizeMm: labelSizeMm(items, 50),
    idFactory: () => 'o' + (++n),
  });
  assert.equal(objects.length, labels.length);
  for (const object of objects) {
    assert.equal(object.aiAutoLabel, true);
    assert.equal(object.aiParentImageId, 'img-1');
    const size = object.labelSize ?? object.fontSize; // 글자 객체(text)는 fontSize, 지시선 라벨은 labelSize
    assert.ok(size >= 1.8 && size <= 8, `label size ${size}`);
  }
  const leader = objects.find(o => o.aiSourceLabelId === 'L0');
  assert.equal(leader.type, 'labeler');
  assert.equal(leader.aiLabelRole, 'chemical');
});

// 11-10: 라벨마다 자기 글자 상자 높이로 크기를 정한다(「물」 같은 작은 글자가 중앙값 크기로 커지지 않게).
test('each read label carries its own box-height font size (box h × 0.85), not a shared median', async () => {
  const { parseLabelRead, labelReadToEditablePlan, LABEL_BOX_FONT_RATIO } = await modulePromise;
  const { createEditableImageLabelObjects } = await editablePromise;
  const items = parseLabelRead(JSON.stringify([
    { text: '물', kind: 'ko', x: 0.1, y: 0.1, w: 0.05, h: 0.03, leader: null },
    { text: '22°C', kind: 'math', x: 0.3, y: 0.3, w: 0.2, h: 0.12, leader: null },
  ]));
  const { labels } = labelReadToEditablePlan(items);
  assert.ok(Math.abs(labels[0].measuredSize - 0.03 * LABEL_BOX_FONT_RATIO) < 1e-12);
  assert.ok(Math.abs(labels[1].measuredSize - 0.12 * LABEL_BOX_FONT_RATIO) < 1e-12);
  assert.equal(labels[0].sizeFromBox, true);
  let n = 0;
  // 그림 높이 100mm: 「물」 0.85×3mm=2.55mm, 「22°C」 0.85×12mm=10.2mm → 8mm로 자른다.
  const objects = createEditableImageLabelObjects({ labels, image: { id: 'img', x: 0, y: 0, w: 100, h: 100, rotation: 0 }, labelSizeMm: 3.7, idFactory: () => 'o' + (++n) });
  const water = objects.find(o => o.text === '물'), temp = objects.find(o => o.text === '22°C');
  assert.ok(Math.abs(water.fontSize - 0.03 * LABEL_BOX_FONT_RATIO * 100) < 1e-9, String(water.fontSize));
  assert.equal(temp.fontSize, 8);
  assert.ok(water.fontSize < temp.fontSize);
});

test('sizeFromBox labels clamp to 1.8 mm at the small end; plain measured sizes keep the old 0.5 mm floor', async () => {
  const { createEditableImageLabelObjects } = await editablePromise;
  const base = { id: 'a', text: '물', evidence: '물', sourceKind: 'reference', sourceRef: 1, mode: 'text', labelType: 'label', contentMode: 'plain', anchor: { x: 0.5, y: 0.5 }, position: { x: 0.5, y: 0.5 } };
  const image = { id: 'img', x: 0, y: 0, w: 60, h: 20, rotation: 0 };
  let n = 0;
  const [boxed] = createEditableImageLabelObjects({ labels: [{ ...base, measuredSize: 0.02, sizeFromBox: true }], image, labelSizeMm: 3.7, idFactory: () => 'l' + ++n });
  assert.equal(boxed.fontSize, 1.8);
  const [plain] = createEditableImageLabelObjects({ labels: [{ ...base, measuredSize: 0.02 }], image, labelSizeMm: 3.7, idFactory: () => 'l' + ++n });
  assert.equal(plain.fontSize, 0.5); // 0.02 × 20mm = 0.4mm → 기존 0.5mm 하한
});
