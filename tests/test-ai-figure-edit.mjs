// 그림 엔진 「이 그림 고치기」(editFigure)·라벨 힌트(labelHintsFromRequest) 단위 검사 — 가짜 AI만 쓴다(실제 AI·네트워크 없음).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, editFigure, labelHintsFromRequest, labelHintsAfterEdit, EDIT_PHASES, makeIndex, defaultFigureModels } from '../js/ai-figure/index.js';

const png = (name) => 'data:image/png;base64,' + Buffer.from(name).toString('base64');
const nameOf = (url) => Buffer.from(String(url).split(',')[1] || '', 'base64').toString();
const fakeGray = async (d) => ({ data: d, applied: true, reason: null });
const PREV = png('prev');

// 가짜 AI: 지시문으로 단계를 알아본다. verify: 시도마다 돌려줄 확인 답(배열), images: 시도마다 그림 이름 또는 Error.
function fakeAi({ find = '{"targets":["T 라벨"],"keep":["A","B","줄"],"summary":"T만 지움"}', verify = ['{"done":true,"unwanted":[],"sentences":[]}'], images = ['edit-1', 'edit-2', 'edit-3'], strip = 'clean' } = {}) {
  const calls = { text: [], image: [] };
  let v = 0, im = 0;
  const ai = {
    async readText({ text, attachments, model }) {
      calls.text.push({ text, attachments, model });
      if (text.includes('교사가 이 그림에서 일부만')) { if (find instanceof Error) throw find; return find; }
      if (text.includes('첫 그림은 고치기 전')) { const a = verify[Math.min(v++, verify.length - 1)]; if (a instanceof Error) throw a; return a; }
      throw new Error('알 수 없는 지시문');
    },
    async generateImage({ text, attachments, model, signal }) {
      calls.image.push({ text, attachments, model });
      if (signal?.aborted) throw Object.assign(new Error('취소'), { name: 'AbortError' });
      if (text.includes('설명 문장만 깨끗이 지운')) return png(strip);
      const a = images[Math.min(im++, images.length - 1)];
      if (a instanceof Error) throw a;
      if (typeof a === 'function') return a({ signal });
      return png(a);
    },
  };
  return { ai, calls };
}
const engineOf = (ai, extra = {}) => createEngine({ ai, index: makeIndex({}), grayscale: fakeGray, retries: { text: 1, image: 1 }, ...extra });

test('editFigure: 앞 그림을 바탕으로 첨부하고 지시한 곳만 고친 결과를 생성과 같은 모양으로 준다', async () => {
  const { ai, calls } = fakeAi();
  const phases = [];
  const previous = { expanded: { type: '역학', scenes: ['막대'] }, scenes: [{ request: '막대 장면', image: PREV, refs: ['a', 'b', 'c'] }] };
  const r = await engineOf(ai).editFigure({ previousPng: PREV, instruction: 'T 라벨만 지워', originalRequest: '막대 끝 A, B와 줄 옆 ‘T’를 적어 줘', previous, onPhase: (e) => phases.push(e.phase) });
  assert.equal(r.ok, true);
  assert.equal(r.aborted, false);
  assert.equal(r.kind, 'edit');
  assert.equal(r.scenes.length, 1);
  assert.equal(nameOf(r.scenes[0].image), 'edit-1');
  assert.deepEqual(r.scenes[0].refs, ['a', 'b', 'c']);
  assert.equal(r.scenes[0].request, '막대 장면');
  assert.deepEqual(r.expanded, previous.expanded);
  assert.equal(r.edit.summary, 'T만 지움');
  assert.deepEqual(r.edit.targets, ['T 라벨']);
  assert.equal(r.edit.verify.passed, true);
  assert.deepEqual(r.labelHints, ['A', 'B']);
  // 그리기: 앞 그림 한 장만 바탕으로, 지시·그대로 둘 것·흑백·설명 문장 금지가 지시문에 있다
  assert.equal(calls.image.length, 1);
  assert.deepEqual(calls.image[0].attachments, [PREV]);
  assert.match(calls.image[0].text, /T 라벨만 지워/);
  assert.match(calls.image[0].text, /그대로 둘 것/);
  assert.match(calls.image[0].text, /흑백/);
  assert.match(calls.image[0].text, /설명 문장/);
  // 확인: 앞 그림과 고친 그림 둘을 견준다
  const vc = calls.text.find((c) => c.text.includes('첫 그림은 고치기 전'));
  assert.deepEqual(vc.attachments.map(nameOf), ['prev', 'edit-1']);
  assert.deepEqual([...new Set(phases)], ['edit-find', 'edit-apply', 'edit-verify', 'edit-finish']);
  assert.deepEqual(EDIT_PHASES.map((p) => p.title), ['고칠 곳 찾기', '그 부분 고치기', '나머지 그대로 확인', '마무리']);
});

test('editFigure: 다른 곳이 바뀌면 앞 그림을 바탕으로 한 번 더 고치고, 나은 쪽을 쓴다', async () => {
  const { ai, calls } = fakeAi({ verify: ['{"done":true,"unwanted":["B 라벨이 사라짐"],"sentences":[]}', '{"done":true,"unwanted":[],"sentences":[]}'] });
  const r = await engineOf(ai).editFigure({ previousPng: PREV, instruction: 'T 라벨만 지워' });
  assert.equal(r.ok, true);
  assert.equal(r.edit.attempts, 2);
  assert.equal(nameOf(r.scenes[0].image), 'edit-2');
  assert.deepEqual(calls.image[1].attachments, [PREV], '두 번째도 앞 그림을 바탕으로');
  assert.match(calls.image[1].text, /B 라벨이 사라짐/);
});

test('editFigure: 두 번 다 확인을 못 넘기면 덜 틀린 쪽을 쓰고 확인 결과를 남긴다(실패로 끝내지 않음)', async () => {
  const { ai } = fakeAi({ verify: ['{"done":false,"unwanted":[],"sentences":[]}', '{"done":true,"unwanted":["줄이 짧아짐"],"sentences":[]}'] });
  const r = await engineOf(ai).editFigure({ previousPng: PREV, instruction: 'T 라벨만 지워' });
  assert.equal(r.ok, true);
  assert.equal(nameOf(r.scenes[0].image), 'edit-2');
  assert.equal(r.edit.verify.passed, false);
  assert.deepEqual(r.edit.verify.unwanted, ['줄이 짧아짐']);
});

test('editFigure: 찾기·확인 AI가 실패해도 지시 글만으로 고친다', async () => {
  const { ai } = fakeAi({ find: new Error('글 읽기 실패'), verify: [new Error('글 읽기 실패')] });
  const r = await engineOf(ai).editFigure({ previousPng: PREV, instruction: 'T 라벨만 지워' });
  assert.equal(r.ok, true);
  assert.equal(nameOf(r.scenes[0].image), 'edit-1');
  assert.equal(r.edit.summary, 'T 라벨만 지워');
  assert.deepEqual(r.errors.map((e) => e.step), ['edit-find', 'edit-verify']);
});

test('editFigure: 새로 생긴 설명 문장은 마무리에서 지운다', async () => {
  const { ai } = fakeAi({ verify: ['{"done":true,"unwanted":[],"sentences":["마찰은 무시한다."]}'] });
  const r = await engineOf(ai).editFigure({ previousPng: PREV, instruction: 'T 라벨만 지워' });
  assert.equal(nameOf(r.scenes[0].image), 'clean');
  assert.equal(nameOf(r.scenes[0].beforeStrip), 'edit-1');
  assert.deepEqual(r.scenes[0].strippedTexts, ['마찰은 무시한다.']);
});

test('editFigure: 그리기가 끝내 실패하면 던지지 않고 앞 그림을 지킨다', async () => {
  const { ai } = fakeAi({ images: [new Error('그림 실패')] });
  const prev = { scenes: [{ request: '막대', image: PREV, refs: ['x'] }] };
  const r = await engineOf(ai).editFigure({ previousPng: PREV, instruction: 'T 라벨만 지워', previous: prev });
  assert.equal(r.ok, false);
  assert.equal(r.aborted, false);
  assert.equal(r.scenes[0].kept, true);
  assert.equal(r.scenes[0].image, PREV);
  assert.deepEqual(r.scenes[0].refs, ['x']);
  assert.match(r.scenes[0].error, /그림 실패/);
  assert.ok(r.errors.some((e) => e.step === 'edit-apply'));
});

test('editFigure: 취소하면 aborted와 앞 그림', async () => {
  const ctl = new AbortController();
  const { ai } = fakeAi({ images: [({ signal }) => { ctl.abort(); throw Object.assign(new Error('취소'), { name: 'AbortError' }); }] });
  const r = await engineOf(ai).editFigure({ previousPng: PREV, instruction: 'T 라벨만 지워', signal: ctl.signal });
  assert.equal(r.aborted, true);
  assert.equal(r.ok, false);
  assert.equal(r.scenes[0].image, PREV);
  const r2 = await engineOf(ai).editFigure({ previousPng: PREV, instruction: 'T 라벨만 지워', signal: AbortSignal.abort() });
  assert.equal(r2.aborted, true);
});

test('editFigure: 입력이 잘못되면 TypeError, 한 번 쓰기는 adapter와 그림 모델 옵션(기본 Luna)을 쓴다', async () => {
  const { ai, calls } = fakeAi();
  await assert.rejects(() => engineOf(ai).editFigure({ previousPng: '', instruction: 'x' }), TypeError);
  await assert.rejects(() => engineOf(ai).editFigure({ previousPng: PREV, instruction: '  ' }), TypeError);
  const r = await editFigure({ adapter: ai, grayscale: fakeGray, previousPng: PREV, instruction: 'T 라벨만 지워' });
  assert.equal(r.ok, true);
  assert.equal(calls.image[0].model, 'gpt-6-luna');
  const sol = { getItem: (k) => (k === '5e.aiEngine.figureImageModel' ? 'sol' : null) };
  assert.equal(defaultFigureModels(sol).image, 'gpt-6.1-sol');
  assert.equal(defaultFigureModels({ getItem: () => null }).image, 'gpt-6-luna');
});

test('labelHintsFromRequest: 한국어 요청에서 라벨을 뽑는다', () => {
  assert.deepEqual(labelHintsFromRequest('A에는 m, B에는 2m을 표시해 줘'), ['A', 'm', 'B', '2m']);
  assert.deepEqual(labelHintsFromRequest('경사각 θ인 빗면 위 물체'), ['θ']);
  assert.deepEqual(labelHintsFromRequest('점 P와 Q 사이 거리 L'), ['P', 'Q', 'L']);
  assert.deepEqual(labelHintsFromRequest('질량 m_A, m_B인 두 물체, 속력 v₀, 굴절률 n_유리와 n_{공기}'), ['m_A', 'm_B', 'v₀', 'n_유리', 'n_{공기}']);
  assert.deepEqual(labelHintsFromRequest('속력 2 m/s로 30° 방향'), ['2 m/s', '30°']);
  assert.deepEqual(labelHintsFromRequest('㉠과 ㉡을 표시, x축은 시간'), ['㉠', '㉡', 'x']);
  assert.deepEqual(labelHintsFromRequest('막대에는 ‘6m’, 추에는 「2m」을 적어 줘'), ['6m', '2m']);
  assert.deepEqual(labelHintsFromRequest('PNG로 AI가 그린 그림'), []);
  assert.deepEqual(labelHintsFromRequest(''), []);
  assert.deepEqual(labelHintsFromRequest(null), []);
});

test('labelHintsFromRequest: E7 wp2-01 긴 요청(라벨 15개)', () => {
  const req = '길이 12a인 균일한 막대의 왼쪽 끝을 A, 오른쪽 끝을 B로 표시하고, A에서 오른쪽으로 4a인 지점 아래에 삼각형 받침 O를 놓아 줘; 막대에는 ‘6m’, A에서 a인 지점에 매단 추에는 ‘2m’, 11a인 지점에 매단 추에는 ‘m’을 적어 줘. 막대의 10a 지점 C와 벽면 고정점 D를 줄로 연결해 줄 옆에는 ‘T’를 적고, ‘a’, ‘4a’, ‘8a’를 표시';
  const h = labelHintsFromRequest(req);
  for (const v of ['12a', 'A', 'B', '4a', 'O', '6m', 'a', '2m', '11a', 'm', '10a', 'C', 'D', 'T', '8a']) assert.ok(h.includes(v), v);
  assert.equal(new Set(h).size, h.length);
  assert.ok(!labelHintsAfterEdit(req, 'T 라벨만 지워').includes('T'));
  assert.ok(labelHintsAfterEdit(req, 'E도 표시해').includes('E'));
});

test('makeFigureSet 결과에 labelHints가 실린다', async () => {
  const ai = {
    readText: async () => '{}',
    generateImage: async () => png('drawn'),
  };
  const r = await engineOf(ai).makeFigureSet({ request: '경사각 θ인 빗면 위 물체 A', raw: true });
  assert.deepEqual(r.labelHints, ['θ', 'A']);
});

test('위치별 코멘트의 좌표·머리 글은 라벨 후보가 아니다(11-25 밤샘 검수)', () => {
  const ins = '표시한 코멘트대로 고쳐 주세요.\n\n위치별 코멘트:\n'
    + '[선택 버전 생성 결과 2 · 라벨; 이미지ID generated-2] 박스 1 (x=3.5536458333333334%, y=15.3296875%, w=15.455729166666668%, h=66.578125%): 이 부분에 창문\n'
    + '[선택 버전 생성 결과 2 · 라벨; 이미지ID generated-2] 박스 2 (x=33.4671875%, y=67.43046875%, w=15.6%, h=18.1%): 점 P에 θ′ 표시';
  const hints = labelHintsAfterEdit('높이 H인 건물에서 v_0로 2R만큼', ins);
  assert.deepEqual(hints, ['H', 'v_0', '2R', 'P', 'θ′']);
  assert.ok(!hints.some((v) => /%|^[xywh]$/.test(v)));
});
