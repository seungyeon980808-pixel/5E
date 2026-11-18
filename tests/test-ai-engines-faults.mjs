// 1.8.0 E9 「실패로 끝나지 않게 다지기」 단위 검사: 고장 나눔·끊김 보호·로그인 없음·글 모델 대체·기출 Worker 시간 제한.
// 가짜 연결만 쓴다(실제 AI·네트워크 없음). 화면 흐름 전체는 tests/test-ai-engines-faults-browser.cjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAiError, createDesktopEngineAi } from '../js/ai-engines.js';
import { fetchFigure, collectReferenceImages, clearFigureCache } from '../js/ai-figure/reference-images.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const ipc = (text) => new Error(`Error invoking remote method 'codex:read-image-text': Error: ${text}`);
const okRaster = { calls: 0, async generate() { this.calls++; return { src: PNG }; } };

test('고장 나눔: IPC를 건너온 글로 로그인·연결 끊김·전송·모델을 가른다', () => {
  assert.equal(classifyAiError(ipc('Codex 로그인 정보가 없습니다.')), 'auth');
  assert.equal(classifyAiError(ipc('Codex 로그인이 만료되었거나 권한이 없습니다.')), 'auth');
  assert.equal(classifyAiError(ipc('Codex 서버에 연결하지 못했습니다.')), 'network');
  assert.equal(classifyAiError(ipc('Codex 응답 시간이 초과되었습니다.')), 'transport');
  assert.equal(classifyAiError(ipc('Codex 응답 오류(429)')), 'transport');
  assert.equal(classifyAiError(ipc('Codex 응답 오류(503)')), 'transport');
  assert.equal(classifyAiError(ipc('Codex 요청이 거절되었습니다(400)')), 'model');
  assert.equal(classifyAiError(ipc('결과가 비어 있습니다.')), 'other');
});

test('끊김 보호: main이 이미 다시 시도한 전송 고장이 두 번 이어지면 그 차례의 글 읽기는 더 부르지 않는다', async () => {
  let calls = 0;
  const ai = createDesktopEngineAi({ readImageText: async () => { calls++; throw ipc('Codex 응답 시간이 초과되었습니다.'); } }, okRaster);
  await assert.rejects(ai.readText({ model: 'm', text: 'a' }), /초과/);
  await assert.rejects(ai.readText({ model: 'm', text: 'b' }), /초과/);
  assert.equal(ai.health.textDown, true);
  await assert.rejects(ai.readText({ model: 'm', text: 'c' }), (e) => e.code === 'ENGINE_TEXT_DOWN');
  assert.equal(calls, 2);
  // 그림은 계속 그린다(글 단계는 모두 대체가 있음)
  assert.equal((await ai.generateImage({ model: 'gpt-6-luna', text: 'x' })).imageDataUrl, PNG);
});

test('끊김 보호: 중간에 한 번 성공하면 다시 센다', async () => {
  let n = 0;
  const ai = createDesktopEngineAi({ readImageText: async () => { if (++n === 2) return { text: 'ok' }; throw ipc('Codex 응답 오류(500)'); } }, okRaster);
  await assert.rejects(ai.readText({ model: 'm', text: 'a' }));
  assert.equal(await ai.readText({ model: 'm', text: 'b' }), 'ok');
  await assert.rejects(ai.readText({ model: 'm', text: 'c' }));
  assert.equal(ai.health.textDown, false);
});

test('로그인 없음: 한 번 걸리면 authRequired, 그 뒤 글·그림 모두 AI를 부르지 않는다', async () => {
  let calls = 0;
  const raster = { calls: 0, async generate() { this.calls++; return { src: PNG }; } };
  const ai = createDesktopEngineAi({ readImageText: async () => { calls++; throw ipc('Codex 로그인 정보가 없습니다.'); } }, raster);
  await assert.rejects(ai.readText({ model: 'm', text: 'a' }), (e) => e.code === 'ENGINE_AUTH');
  assert.equal(ai.health.authRequired, true);
  await assert.rejects(ai.readText({ model: 'm', text: 'b' }), (e) => e.code === 'ENGINE_AUTH');
  await assert.rejects(ai.generateImage({ model: 'gpt-6-luna', text: 'x' }), (e) => e.code === 'ENGINE_AUTH');
  assert.equal(calls, 1);
  assert.equal(raster.calls, 0);
});

test('그림 차례가 로그인 오류로 끝나면 반대 모델로 또 그리지 않는다', async () => {
  const raster = { models: [], async generate(p) { this.models.push(p.model); throw new Error('Codex 로그인이 필요합니다.'); } };
  const ai = createDesktopEngineAi({ readImageText: async () => ({ text: '' }) }, raster);
  await assert.rejects(ai.generateImage({ model: 'gpt-6.1-sol', text: 'x' }), (e) => e.code === 'ENGINE_AUTH');
  assert.deepEqual(raster.models, ['gpt-6.1-sol']);
});

test('연결 끊김이 두 번이면 offline — 호출 쪽이 옛 길 대신 연결 안내로 간다', async () => {
  const ai = createDesktopEngineAi({ readImageText: async () => { throw ipc('Codex 서버에 연결하지 못했습니다.'); } }, okRaster);
  await assert.rejects(ai.readText({ model: 'm', text: 'a' }));
  assert.equal(ai.health.offline, false);
  await assert.rejects(ai.readText({ model: 'm', text: 'b' }));
  assert.equal(ai.health.offline, true);
});

test('글 모델 대체: 고른 글 모델이 거절(400)되면 다음 글 모델로 한 번 더', async () => {
  const seen = [];
  const ai = createDesktopEngineAi({ readImageText: async ({ model }) => { seen.push(model); if (model === 'gpt-6.1-sol') throw ipc('Codex 요청이 거절되었습니다(400)'); return { text: 'ok:' + model }; } }, okRaster,
    { textModels: ['gpt-6.1-sol', 'gpt-6-luna'] });
  assert.equal(await ai.readText({ model: 'gpt-6.1-sol', text: 'a' }), 'ok:gpt-6-luna');
  assert.deepEqual(seen, ['gpt-6.1-sol', 'gpt-6-luna']);
});

test('취소는 그대로 AbortError(고장으로 세지 않음)', async () => {
  const ctl = new AbortController();
  const ai = createDesktopEngineAi({ readImageText: () => new Promise(() => {}) }, okRaster);
  const p = ai.readText({ model: 'm', text: 'a', signal: ctl.signal });
  ctl.abort();
  await assert.rejects(p, (e) => e.name === 'AbortError');
  assert.equal(ai.health.textStreak, 0);
});

test('기출 Worker가 응답하지 않으면 시간 제한 뒤 건너뛰고, 남은 후보는 묻지 않는다', async () => {
  clearFigureCache();
  let calls = 0;
  const hang = (url, { signal }) => { calls++; return new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))); };
  const t0 = Date.now();
  await assert.rejects(fetchFigure('p1_2027_06_17-1', { fetch: hang, timeoutMs: 80, cache: false }), (e) => e.code === 'REFERENCE_TIMEOUT');
  assert.equal(calls, 1, '시간 초과면 학평 쪽까지 또 묻지 않음');
  calls = 0;
  const got = await collectReferenceImages(['a_1-1', 'b_1-1', 'c_1-1', 'd_1-1', 'e_1-1'], { fetch: hang, timeoutMs: 80 });
  assert.equal(got.ids.length, 0);
  assert.equal(calls, 3, '첫 묶음 3장만 묻고 멈춤');
  assert.ok(Date.now() - t0 < 2000);
});

test('사용자 취소는 시간 초과가 아니라 AbortError로 끝난다', async () => {
  clearFigureCache();
  const ctl = new AbortController();
  const hang = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const p = fetchFigure('p1_2027_06_18-1', { fetch: hang, signal: ctl.signal, timeoutMs: 5000, cache: false });
  ctl.abort();
  await assert.rejects(p, (e) => e.name === 'AbortError');
});

test('Worker 404는 그 그림만 건너뛰고 다른 후보로 채운다', async () => {
  clearFigureCache();
  const body = { question: { blocks: [{ kind: 'figure', figure: { data: PNG } }] } };
  const fetchImpl = async (url) => (/a_1/.test(url) ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, status: 200, json: async () => body });
  const got = await collectReferenceImages(['a_1-1', 'b_1-1', 'c_1-1', 'd_1-1'], { fetch: fetchImpl });
  assert.deepEqual(got.ids, ['b_1-1', 'c_1-1', 'd_1-1']);
});

// ── E9b 차례 시계(화면 쪽): main이 끝을 알리지 못한 그림 차례·글 읽기를 끊고 다음 모델로
// 래스터 컨트롤러처럼 signal이 끊기면 AbortError로 끝나는 가짜(끊긴 차례 수를 셈)
const silentRaster = (okModels = []) => ({ models: [], interrupted: 0, generate(p, { signal } = {}) {
  this.models.push(p.model);
  if (okModels.includes(p.model)) return Promise.resolve({ src: PNG });
  return new Promise((_, reject) => signal?.addEventListener('abort', () => { this.interrupted++; reject(Object.assign(new Error('작업이 취소되었습니다.'), { name: 'AbortError' })); }, { once: true }));
} });

test('그림 차례 시계: 답 없는 차례는 끊고(interrupt) 반대 모델로 그린다', async () => {
  const raster = silentRaster(['gpt-6-luna']);
  const ai = createDesktopEngineAi({ readImageText: async () => ({ text: '' }) }, raster, { imageModels: ['gpt-6.1-sol', 'gpt-6-luna'], imageDeadlineMs: 40 });
  const t0 = Date.now();
  assert.equal((await ai.generateImage({ model: 'gpt-6.1-sol', text: 'x' })).imageDataUrl, PNG);
  assert.deepEqual(raster.models, ['gpt-6.1-sol', 'gpt-6-luna']);
  assert.equal(raster.interrupted, 1, '답 없는 차례를 끊음');
  assert.equal(classifyAiError(new Error('AI 그림 응답 시간이 초과되었습니다(1초 동안 답이 없어 끊었습니다).')), 'transport');
  assert.equal(ai.health.deadlines, 1);
  assert.equal(ai.health.imageDown, false, '한 번 성공하면 다시 셈');
  assert.ok(Date.now() - t0 < 1000);
});

test('그림 차례 시계: 두 모델 모두 답이 없으면 imageDown — 장면 재시도마다 또 기다리지 않는다', async () => {
  const raster = silentRaster();
  const ai = createDesktopEngineAi({ readImageText: async () => ({ text: '' }) }, raster, { imageModels: ['gpt-6.1-sol', 'gpt-6-luna'], imageDeadlineMs: 30 });
  await assert.rejects(ai.generateImage({ model: 'gpt-6.1-sol', text: 'x' }), (e) => e.code === 'ENGINE_DEADLINE');
  assert.equal(ai.health.imageDown, true);
  await assert.rejects(ai.generateImage({ model: 'gpt-6.1-sol', text: 'y' }), (e) => e.code === 'ENGINE_IMAGE_DOWN');
  assert.equal(raster.models.length, 2, '세 번째 차례는 보내지 않음');
});

test('그림 차례 시계: 사용자 취소는 시간 초과가 아니라 AbortError(다음 모델로 넘기지 않음)', async () => {
  const raster = silentRaster();
  const ctl = new AbortController();
  const ai = createDesktopEngineAi({ readImageText: async () => ({ text: '' }) }, raster, { imageModels: ['gpt-6.1-sol', 'gpt-6-luna'], imageDeadlineMs: 5000 });
  const p = ai.generateImage({ model: 'gpt-6.1-sol', text: 'x', signal: ctl.signal });
  setTimeout(() => ctl.abort(), 20);
  await assert.rejects(p, (e) => e.name === 'AbortError');
  assert.deepEqual(raster.models, ['gpt-6.1-sol']);
  assert.equal(ai.health.deadlines, 0);
});

test('글 읽기 시계: 답 없는 글 읽기는 시간 초과(transport)로 끊고, 두 번이면 그 차례 글 단계를 건너뛴다', async () => {
  let calls = 0;
  const ai = createDesktopEngineAi({ readImageText: () => { calls++; return new Promise(() => {}); } }, okRaster, { textDeadlineMs: 30 });
  await assert.rejects(ai.readText({ model: 'm', text: 'a' }), (e) => e.code === 'ENGINE_DEADLINE' && /시간이 초과/.test(e.message));
  await assert.rejects(ai.readText({ model: 'm', text: 'b' }), (e) => e.code === 'ENGINE_DEADLINE');
  assert.equal(ai.health.textDown, true);
  await assert.rejects(ai.readText({ model: 'm', text: 'c' }), (e) => e.code === 'ENGINE_TEXT_DOWN');
  assert.equal(calls, 2);
});

test('차례 시계 기본값은 main 한도(100초 × 2)보다 길다 — 정상 차례를 끊지 않음', async () => {
  const { ENGINE_IMAGE_DEADLINE_MS, ENGINE_TEXT_DEADLINE_MS } = await import('../js/ai-engines.js');
  assert.ok(ENGINE_IMAGE_DEADLINE_MS > 200_000 && ENGINE_IMAGE_DEADLINE_MS < 600_000);
  assert.ok(ENGINE_TEXT_DEADLINE_MS > 200_000);
});

// ── E9b 그래프 「그림으로 생성」: 설계를 못 받는 고장마다 엔진이 내는 결과(패널이 이것으로 길을 고른다)
test('그래프: 설계 AI가 로그인·연결·전송 고장이면 health로 가를 수 있고, 설계는 축만(minimal)', async () => {
  const { runGraphPicture } = await import('../js/ai-engines.js');
  const drawGraph = async () => ({ png: PNG, svg: '<svg/>', collisions: { n: 0, list: [] }, warnings: [] });
  for (const [msg, key] of [['Codex 로그인 정보가 없습니다.', 'authRequired'], ['Codex 서버에 연결하지 못했습니다.', 'offline'], ['Codex 응답 오류(503)', 'textDown']]) {
    let calls = 0;
    const ai = createDesktopEngineAi({ readImageText: async () => { calls++; throw ipc(msg); } }, okRaster);
    const r = await runGraphPicture({ ai, request: '가로축은 시간, 세로축은 속도', drawGraph, models: { text: 'm' } });
    assert.equal(r.fallback, 'minimal', msg);
    assert.equal(ai.health[key], true, msg);
    assert.ok(calls <= 2, `${msg}: 설계 호출 ${calls}번`);
  }
});

test('그래프: 다시 그리기(redrawGraphPicture)는 연결이 없어도 AI를 부르지 않는다', async () => {
  const { redrawGraphPicture } = await import('../js/ai-engines.js');
  let drew = 0;
  const drawGraph = async () => { drew++; return { png: PNG, svg: '<svg/>', collisions: { n: 0, list: [] }, warnings: [] }; };
  const plan = { xMin: 0, xMax: 4, yMin: 0, yMax: 6, labelX: '시간', labelY: '속도', xTicks: [], yTicks: [], series: [{ expr: '6-2*x', domain: [0, 3] }], keyText: '' };
  const r = await redrawGraphPicture({ graphPlan: plan, request: 'r' }, { drawGraph });
  assert.equal(r.png, PNG); assert.equal(r.fallback, null); assert.equal(drew, 1);
  const broken = await redrawGraphPicture({ graphPlan: { labelX: '시간', series: 'x' }, request: 'r' }, { drawGraph });
  assert.equal(broken.fallback, 'minimal');
});
