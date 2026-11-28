// 11-22(1.7.2 밤샘 B): 그림 생성 대화와 그림 지시문 세 가지 — 가짜 자료만 쓴다(실제 AI·네트워크 없음).
// (a) 대화 AI가 「이 그림이 참고한 기출」을 안다: meta.refs + 색인 subject·year·desc → 대화 맥락 글. 비교 질문일 때만 그림 첨부.
// (b) 이온·원소·물질 기호(e⁻, Pᵢ, H⁺, O₂, ATP, P700 …)는 정자.
// (c) 「A와 B를 나란히/비교해 그려」는 한 장 안에 나란히(장면을 나누지 않음).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { figureRefLabel, figureRefIds, figureRefTags, figureRefContextText, wantsFigureRefImages } from '../js/ai-engines.js';
import { buildDiscussionPrompt } from '../js/ai-prompt.js';
import { buildFigurePrompt, expandPrompt } from '../js/ai-figure/prompt.js';
import { expand, wantsSideBySide, mergeSideBySide } from '../js/ai-figure/expand.js';
import { makeIndex } from '../js/ai-figure/retrieve.js';

const TAG = { id: 'b1_2021_09_03-1', subject: '생명과학Ⅰ', year: 2021, desc: '미토콘드리아 내막의 전자 전달계를 그렸다.', src: 'kice' };

test('(a) 참고 기출 id → 「과목 학년도 시험 번호 — 설명」', () => {
  assert.equal(figureRefLabel('b1_2021_09_03-1', TAG), '생명과학Ⅰ 2021학년도 9월 모의평가 3번 — 미토콘드리아 내막의 전자 전달계를 그렸다.');
  assert.equal(figureRefLabel('p1_2026_11_17-2'), '물리학Ⅰ 2026학년도 대학수학능력시험 17번 (그림 2)');
  assert.equal(figureRefLabel('c1_2027_07_12-선지2', { subject: '화학Ⅰ', src: 'hak' }), '화학Ⅰ 2027학년도 7월 학력평가 12번 (선지2)');
  assert.equal(figureRefLabel('이상한-id'), '이상한-id');
});

test('(a) 결과 meta.refs 꺼내기(최대 3개, 문자열만)', () => {
  assert.deepEqual(figureRefIds({ meta: { refs: ['a-1', 'b-1', null, 'c-1', 'd-1'] } }), ['a-1', 'b-1', 'c-1']);
  assert.deepEqual(figureRefIds({ meta: {} }), []);
  assert.deepEqual(figureRefIds(null), []);
});

test('(a) 색인에서 줄 찾기 — 엔진 색인(loadFigureIndex)을 그대로 쓰고, 못 읽어도 던지지 않는다', async () => {
  const index = makeIndex({ tags: [TAG] });
  const got = await figureRefTags(['b1_2021_09_03-1', '없는-1'], { loadEngine: async () => ({ loadFigureIndex: async () => index }) });
  assert.equal(got.get('b1_2021_09_03-1').desc, TAG.desc);
  assert.equal(got.has('없는-1'), false);
  const broken = await figureRefTags(['b1_2021_09_03-1'], { loadEngine: async () => { throw new Error('못 받음'); } });
  assert.equal(broken.size, 0);
});

test('(a) 대화 맥락 글: 「참고하지 않았다」고 답하지 않게, 지금 보는 결과 표시, 첨부 여부', () => {
  const tags = new Map([[TAG.id, TAG]]);
  const text = figureRefContextText([{ name: '생성 결과 1', refs: [TAG.id], selected: true }, { name: '생성 결과 2', refs: [] }], tags);
  assert.match(text, /생성 결과 1\(지금 보는 결과\):\n- 참고한 기출: 생명과학Ⅰ 2021학년도 9월 모의평가 3번 — 미토콘드리아/u);
  assert.doesNotMatch(text, /생성 결과 2/u);
  assert.match(text, /「참고하지 않았다」고 하지 말고/u);
  assert.match(text, /첨부되지 않았다/u);
  assert.match(figureRefContextText([{ name: 'x', refs: [TAG.id] }], tags, { attachedCount: 1 }), /기출 그림 1장을 「참고한 기출 · …」 이름으로 첨부했다/u);
  assert.equal(figureRefContextText([{ name: 'x', refs: [] }], tags), '');
});

test('(a) 그림을 직접 봐야 하는 질문만 기출 그림을 붙인다', () => {
  for (const t of ['기출이랑 비교해 줘', '참고한 그림이랑 어디가 달라?', '기출 그림 보여 줘', '비슷해?']) assert.equal(wantsFigureRefImages(t), true, t);
  for (const t of ['기출 참고한 거 맞아?', '어떤 기출 참고했어?', 'e⁻를 더 크게']) assert.equal(wantsFigureRefImages(t), false, t);
});

test('(a) 대화 지시문: 맥락이 없으면 옛 글과 같고, 있으면 「사용자 메시지」 바로 앞에 들어간다', () => {
  const base = buildDiscussionPrompt({ request: '기출 참고한 거 맞아?', creating: true });
  assert.equal(buildDiscussionPrompt({ request: '기출 참고한 거 맞아?', creating: true, context: '' }), base);
  const withRefs = buildDiscussionPrompt({ request: '기출 참고한 거 맞아?', creating: true, context: '[그림 결과가 참고한 기출]\n- 참고한 기출: X' });
  assert.match(withRefs, /- 참고한 기출: X\n사용자 메시지: 기출 참고한 거 맞아\?$/u);
});

test('(a) 화면 연결: 대화(chat)일 때만 맥락을 만들고 비교 질문일 때만 그림을 붙인다(화면 표시는 그대로)', () => {
  const src = readFileSync(new URL('../js/ai-panel.js', import.meta.url), 'utf8');
  assert.match(src, /if \(type === 'chat' && isFigureCreate\(\)\) \{/u);
  assert.match(src, /shownRefs\.length && wantsFigureRefImages\(entered\)/u);
  assert.match(src, /buildDiscussionPrompt\(\{ request: annotatedRequest, mode: runInput\.mode, creating: isFigureCreate\(\), context: figureRefContext \}\)/u);
});

test('(b) 그리기 지시문: 이온·물질 기호 정자(첨자까지)', () => {
  const p = buildFigurePrompt({ request: '전자 전달계', subject: '생명과학Ⅰ' });
  assert.match(p, /전자 e⁻, 무기 인산 Pᵢ\(P와 첨자 i 모두 바로 선 글자\), H⁺, Na⁺/u);
  assert.match(p, /ATP, ADP, NADH, NADPH, FADH₂, P680, P700, 엽록소 a·엽록소 b의 a·b/u);
  assert.match(p, /숫자는 아래첨자가 아니라 P와 같은 줄 같은 크기의 바로 선 글자\(P700\)/u);
  assert.match(p, /반응식\(2H₂O → 4H⁺ \+ O₂ \+ 4e⁻ 등\)은 식 전체를 기울이지 않는다/u);
  assert.match(p, /3CO₂, 6NADPH, 2ATP\. 「3 CO₂」「6 NADPH」처럼 띄우면 틀린 것이다/u);
  assert.match(p, /물질·이온 기호\(e⁻, Pᵢ, H⁺, O₂, CO₂, ATP, NADH, P700\)는 모두 바로 선 글자/u);
});

test('(c) 구체화 지시문: 「나란히·비교해 그려」는 한 장면', () => {
  const p = expandPrompt({ request: 'A와 B를 나란히', types: ['x'] });
  assert.match(p, /「나란히」「한 그림\(한 장\)에」「A와 B를 비교해 그려」처럼 .*장면을 나누지 않는다: scenes에 하나만 쓰고/u);
});

test('(c) 교사 요청 판별: 나란히·한 장·두 줄·비교 그림은 합치고, (가)(나)로 따로 말한 비교는 합치지 않는다', () => {
  for (const t of ['루벤의 실험 장치 두 개를 나란히 그려 줘', '알코올 발효와 젖산 발효를 비교하는 그림을 두 줄로 그려 줘', '두 장면을 한 그림에 좌우로 나눠 그려 줘', '세포 네 개를 한 장에 그려 줘'])
    assert.equal(wantsSideBySide(t), true, t);
  for (const t of ['(가)와 (나)를 비교해 그려', '피스톤을 누르기 전 (가)와 누른 뒤 (나)', '세포 호흡 과정']) assert.equal(wantsSideBySide(t), false, t);
});

test('(c) 합치기: 왼쪽·오른쪽, 두 줄이면 윗줄·아랫줄', () => {
  const [lr] = mergeSideBySide(['플라스크 A', '플라스크 B'], '나란히');
  assert.match(lr, /^한 장의 그림 안에 다음 2부분을 왼쪽에서 오른쪽으로 나란히 그린다\. 두 그림으로 나누지 않는다\./u);
  assert.match(lr, /\n왼쪽: 플라스크 A\n오른쪽: 플라스크 B$/u);
  const [rows] = mergeSideBySide(['알코올', '젖산'], '두 줄로');
  assert.match(rows, /위에서 아래로[\s\S]*\n윗줄: 알코올\n아랫줄: 젖산$/u);
  assert.deepEqual(mergeSideBySide(['하나']), ['하나']);
});

test('(c) 구체화 결과가 두 장면으로 나뉘어도 「나란히」 요청이면 한 장면으로 합친다', async () => {
  const two = '```json\n{"type":"t","scenes":["플라스크 A","플라스크 B"],"keyValues":"","notes":""}\n```';
  const merged = await expand({ request: '루벤의 실험 장치 두 개를 나란히 그려 줘', taxonomy: { types: ['t'] }, readText: async () => two });
  assert.equal(merged.scenes.length, 1);
  assert.equal(merged.merged, true);
  const kept = await expand({ request: '피스톤을 누르기 전 (가)와 누른 뒤 (나)', taxonomy: { types: ['t'] }, readText: async () => two });
  assert.deepEqual(kept.scenes, ['플라스크 A', '플라스크 B']);
});

test('(c) 11-22 「다섯 개를 한번에 그려」는 여러 장 — 합치지 않고, 「한 장에·나란히」를 직접 쓰면 합친다', () => {
  for (const t of ['응 다섯개를 한번에 그려', '두 장 따로 그려줘', '세 가지를 각각 그려', '도식 5개를 모두 그려', '네 컷을 한꺼번에 그려'])
    assert.equal(wantsSideBySide(t), false, t);
  for (const t of ['세 개를 한 장에 나란히 그려', '두 개를 한번에 나란히 그려']) assert.equal(wantsSideBySide(t), true, t);
  const p = expandPrompt({ request: '다섯 개를 한번에 그려', types: [] });
  assert.match(p, /한번에\(한꺼번에·모두·각각·따로\) 그려」는 그림 여러 장/);
  assert.match(p, /교사가 직접 「한 장에」「나란히」라고 쓰지 않았으면 장면을 나눈다/);
});
