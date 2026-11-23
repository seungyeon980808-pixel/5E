// 1.7.3 B: 손그림 → 평가원 수준 상세 그림(fix.sketchPlan, js/ai-figure/sketch.js). 가짜 ai만 쓴다(실제 AI 없음).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, makeIndex } from '../js/ai-figure/index.js';
import { normalizeSketchPlan, sketchPlanText, sketchClassification } from '../js/ai-figure/sketch.js';

const SK = 'data:image/png;base64,SKETCH';
const PLAN = JSON.stringify({
  target: '성층 화산 단면', subject: '지구과학Ⅰ', types: ['지질 단면도'], keywords: ['화산', '마그마'],
  layout: ['화산체: 가운데, 가로 33~67%', '마그마굄: 아래 가운데'], labels: ['「A」 → 마그마굄(지시선)', '「B」 → 화도(지시선)'],
  details: ['용암층·화산재층이 번갈아 쌓인 층리', '렌즈 모양 마그마굄'],
});
const index = () => makeIndex({ taxonomy: { types: ['지질 단면도', '기타'], styles: [] }, tags: [] });
const fakeAi = (planText = PLAN) => {
  const reads = [], draws = [];
  return { reads, draws, ai: {
    async readText({ text, attachments }) { reads.push({ text, attachments }); return planText; },
    async generateImage({ text, attachments }) { draws.push({ text, attachments }); return { imageDataUrl: 'data:image/png;base64,OUT' }; },
  } };
};
const engineOf = (ai) => createEngine({ ai, fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }), index: index(), grayscale: async (d) => ({ data: d, applied: true, reason: null }) });

test('손그림 상세 1: 손그림을 보는 글 AI 한 번(구체화 없이) → 배치·세부를 장면 글에, 손그림은 배치 안내로 붙여 그림', async () => {
  const f = fakeAi();
  const r = await engineOf(f.ai).makeFigureSet({ request: '손그림대로 화산 단면. 마그마굄에 A, 화도에 B.', userImages: [SK], userImageRole: ['sketch'], raw: true, refCount: 2, strip: false, baselineFix: true, classifyMode: 'expand', aiPick: false, fix: { userRoles: true, sketchPlan: 1 } });
  assert.equal(r.ok, true);
  assert.equal(f.reads.length, 1, '글 AI는 손그림 읽기 한 번뿐(구체화·분류·고르기 없음)');
  assert.deepEqual(f.reads[0].attachments, [SK], '손그림 읽기에 손그림을 붙임');
  assert.match(f.reads[0].text, /지질 단면도/, '검색용 그림 종류 목록을 줌');
  assert.equal(f.draws.length, 1);
  assert.equal(f.draws[0].attachments[0], SK, '그리기에도 손그림이 첫 첨부');
  assert.match(f.draws[0].text, /\[밑그림 명세/); assert.match(f.draws[0].text, /\[평가원 수준 세부/); assert.match(f.draws[0].text, /용암층·화산재층/);
  assert.match(f.draws[0].text, /배치 안내/, '손그림 역할은 배치 안내(sketchLayout)');
  assert.doesNotMatch(f.draws[0].text, /구도·물체의 위치·개수·연결 관계·라벨 위치를 정확히 그대로/, '깨끗이 베끼기 역할 문장은 쓰지 않음');
  assert.deepEqual(r.scenes[0].classify?.types, ['지질 단면도'], '손그림 읽기의 검색어로 기출 검색');
});

test('손그림 상세 2: 손그림은 그리기에 붙이지 않고 글 배치만', async () => {
  const f = fakeAi();
  await engineOf(f.ai).makeFigureSet({ request: '손그림대로 화산 단면', userImages: [SK], userImageRole: ['sketch'], raw: true, refCount: 0, strip: false, fix: { userRoles: true, sketchPlan: 2 } });
  assert.equal(f.draws.length, 1);
  assert.ok(!f.draws[0].attachments.includes(SK), '손그림을 붙이지 않음');
  assert.match(f.draws[0].text, /\[평가원 수준 세부/);
  assert.doesNotMatch(f.draws[0].text, /같은 종류 기출 참고/, '기출 0장이면 기출 참고 줄 없음');
});

test('손그림 읽기가 깨지면 보통 손그림 길로(실패로 끝내지 않음)', async () => {
  const f = fakeAi('이건 JSON이 아님');
  const r = await engineOf(f.ai).makeFigureSet({ request: '손그림대로 화산', userImages: [SK], userImageRole: ['sketch'], raw: true, refCount: 0, strip: false, fix: { userRoles: true, sketchPlan: 1, noRefFast: true } });
  assert.equal(r.ok, true);
  assert.equal(f.draws[0].attachments[0], SK);
  assert.doesNotMatch(f.draws[0].text, /\[평가원 수준 세부/);
});

test('sketch.js 도우미: 빈 계획은 null, 검색어 없으면 검색 조건 null', () => {
  assert.equal(normalizeSketchPlan({ target: 'x' }), null);
  assert.equal(normalizeSketchPlan([1, 2]), null);
  const p = normalizeSketchPlan({ layout: ['a'], subject: '엉뚱한 과목' });
  assert.equal(p.subject, '');
  assert.equal(sketchClassification(p, '물리학Ⅰ'), null);
  assert.equal(sketchPlanText(null), '');
  assert.match(sketchPlanText(p, { attached: false, refs: false }), /\[밑그림 명세/);
});
