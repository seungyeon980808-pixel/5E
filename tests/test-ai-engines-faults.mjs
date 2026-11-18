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
