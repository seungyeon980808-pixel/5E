// 1.7.3(E) 여러 장 칸 그림 고침 — 큰 검은 칠 연회색·선 두께를 지키는 키우기·투명 없애기·칸 그림 지시. 가짜 ai만 쓴다(실제 AI 없음).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { softenSolidFillsRgba, upscaleLineRgba, upscaleCleanRgba, makePanelTools, panelSheetRequest, wantsBlackFill } from '../js/ai-figure-panels.js';
import { createEngine, makeIndex } from '../js/ai-figure/index.js';

const toUrl = (p) => 'data:image/png;base64,' + PNG.sync.write(p).toString('base64');
const fromUrl = (u) => PNG.sync.read(Buffer.from(u.split(',')[1], 'base64'));
const dec = async (u) => { const p = fromUrl(u); return { data: new Uint8ClampedArray(p.data), width: p.width, height: p.height }; };
const enc = async (d, w, h) => { const p = new PNG({ width: w, height: h }); p.data.set(d); return toUrl(p); };
const tools = makePanelTools({ decode: dec, encode: enc });
const px = (p, x, y) => p.data[(y * p.width + x) * 4];

/** 칸 n개: 칸마다 반은 검게 칠한 원(달) + 가는 테두리 + 작은 검은 점(입자) + 굵은 글자 획 흉내. */
function moonSheet(n, { W = 300 * n + 120, H = 400, alpha = 255 } = {}) {
  const p = new PNG({ width: W, height: H });
  for (let i = 0; i < p.data.length; i += 4) { p.data[i] = p.data[i + 1] = p.data[i + 2] = 255; p.data[i + 3] = alpha; }
  const set = (x, y) => { const k = (y * W + x) * 4; p.data[k] = p.data[k + 1] = p.data[k + 2] = 0; p.data[k + 3] = 255; };
  for (let c = 0; c < n; c++) {
    const cx = 120 + c * 300 + 90, cy = 180, R = 90;
    for (let y = cy - R - 3; y <= cy + R + 3; y++) for (let x = cx - R - 3; x <= cx + R + 3; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if ((d <= R + 2 && d >= R - 1) || (d < R && x < cx)) set(x, y);
    }
    for (let y = 330; y < 344; y++) for (let x = cx - 6; x < cx + 6; x++) if (Math.hypot(x - cx, y - 337) < 6) set(x, y); // 작은 입자
    for (let y = 300; y < 360; y++) for (let x = cx + 40; x < cx + 46; x++) set(x, y); // 굵은 글자 획(폭 6)
  }
  return p;
}

test('softenSolidFillsRgba: 넓은 검은 칠만 연회색, 테두리·작은 입자·글자 획은 검게 남음', () => {
  const p = moonSheet(2); const W = p.width, H = p.height;
  const data = new Uint8ClampedArray(p.data);
  const n = softenSolidFillsRgba(data, W, H);
  const at = (x, y) => data[(y * W + x) * 4];
  assert.ok(n > 5000, `바뀐 화소 ${n}`);
  assert.equal(at(120 + 90 - 45, 180), 190, '달 어두운 쪽 안쪽은 연회색');
  assert.equal(at(120 + 90 + 45, 180), 255, '밝은 쪽은 흰색');
  assert.equal(at(120 + 90, 180 - 91), 0, '바깥 테두리는 검게');
  assert.equal(at(120 + 90 - 91, 180), 0, '칠한 쪽 가장자리도 검은 테두리');
  assert.equal(at(120 + 90, 337), 0, '작은 입자는 검게');
  assert.equal(at(120 + 90 + 43, 330), 0, '글자 획은 검게');
});

test('softenSolidFillsRgba: 넓은 검은 칠이 없으면 하나도 안 바꿈', () => {
  const p = moonSheet(1); const W = p.width;
  // 칠을 지우고 테두리만
  for (let y = 0; y < p.height; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x - 210, y - 180); if (d < 88) { const k = (y * W + x) * 4; p.data[k] = p.data[k + 1] = p.data[k + 2] = 255; } }
  assert.equal(softenSolidFillsRgba(new Uint8ClampedArray(p.data), W, p.height), 0);
});

test('upscaleLineRgba: 가로 1000px 이상으로(최대 4배)·불투명·선 두께 유지·가장자리 번짐이 옛 키우기보다 좁음', () => {
  const p = moonSheet(1, { W: 420, H: 400 });
  const u = upscaleLineRgba(p.data, p.width, p.height, 2);
  assert.equal(u.factor, 3); assert.equal(u.width, 1260);
  const o = upscaleCleanRgba(p.data, p.width, p.height, 3);
  let alpha = 0, inkU = 0, inkO = 0, midU = 0, midO = 0;
  for (let i = 0; i < u.data.length; i += 4) {
    if (u.data[i + 3] !== 255) alpha++;
    if (u.data[i] < 128) inkU++; if (o.data[i] < 128) inkO++;
    if (u.data[i] > 40 && u.data[i] < 215) midU++; if (o.data[i] > 40 && o.data[i] < 215) midO++;
  }
  assert.equal(alpha, 0);
  assert.ok(Math.abs(inkU / inkO - 1) < 0.03, `선 잉크 비 ${(inkU / inkO).toFixed(3)}`);
  assert.ok(midU < midO * 0.8, `중간 회색(번짐) ${midU} < ${midO}`);
  assert.equal(upscaleLineRgba(new Uint8ClampedArray(4 * 200 * 10).fill(255), 200, 10, 2).factor, 4, '아주 작으면 4배까지');
});

test('makePanelTools.splitPanels: 투명 바탕을 흰 종이에 얹고, softenFills면 칸마다 달 어두운 쪽이 연회색', async () => {
  const sheet = moonSheet(3, { alpha: 0 }); // 바탕 투명(알파 0, 검게 보일 수 있던 경우)
  const parts = await tools.splitPanels(toUrl(sheet), 3, { softenFills: true });
  assert.equal(parts.length, 3);
  for (const u of parts) {
    const p = fromUrl(u); let a = 0, gray = 0;
    for (let i = 0; i < p.data.length; i += 4) { if (p.data[i + 3] !== 255) a++; if (p.data[i] === 190) gray++; }
    assert.equal(a, 0, '투명 화소 없음'); assert.ok(gray > 3000, '연회색 칠');
    assert.equal(px(p, 2, 2), 255, '바탕은 흰색');
  }
  const keep = await tools.splitPanels(toUrl(moonSheet(3)), 3);
  assert.ok(!keep.some((u) => { const p = fromUrl(u); for (let i = 0; i < p.data.length; i += 4) if (p.data[i] === 190) return true; return false; }), 'softenFills 없으면 그대로');
});

test('panelSheetRequest·wantsBlackFill: 칸 가득·작은 글자·어두운 면 연회색·장면 이름 금지, 검은 칠 바람 판정', () => {
  const t = panelSheetRequest(['초승달', '상현달']);
  assert.match(t, /2개 그림/); assert.match(t, /1번째 칸\(왼쪽부터\): 초승달/); assert.match(t, /2번째 칸\(왼쪽부터\): 상현달/);
  assert.match(t, /칸 폭의 85%/); assert.match(t, /4~5%/); assert.match(t, /연회색 평면/); assert.match(t, /장면 이름/);
  assert.equal(wantsBlackFill('입자는 작은 검은 원'), true); assert.equal(wantsBlackFill('달 모양 다섯 개'), false);
});

test('엔진 여러 장: 새 칸 지시를 보내고, 요청이 검은 칠을 바라면 softenFills를 끈다', async () => {
  const run = async (request) => {
    const images = [], splitOpts = [];
    const ai = {
      async readText({ text }) {
        if (text.includes('그림 담당')) return JSON.stringify({ type: '기타', graph: false, scenes: ['초승달', '상현달', '보름달'], keyValues: '', notes: '', search: { subject: '', types: [], keywords: [] } });
        return '{"has":false,"texts":[]}';
      },
      async generateImage({ text }) { images.push(text); return { imageDataUrl: toUrl(moonSheet(3)) }; },
    };
    const eng = createEngine({ ai, fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }), index: makeIndex({ taxonomy: { types: ['기타'], styles: [] }, tags: [] }), grayscale: async (d) => ({ data: d, applied: true, reason: null }),
      splitPanels: (u, n, o) => { splitOpts.push(o); return tools.splitPanels(u, n, o); }, upscale: (u, f, o) => tools.upscale(u, f, o), flatten: async (d) => d });
    const r = await eng.makeFigureSet({ request, strip: false, refCount: 0, fix: { multiCombined: true, multiUpscale: 2 } });
    return { r, images, splitOpts };
  };
  const a = await run('달 모양 세 개를 따로');
  assert.equal(a.images.length, 1); assert.equal(a.r.scenes.length, 3);
  assert.ok(a.images[0].includes('연회색 평면'), '새 칸 지시');
  assert.deepEqual(a.splitOpts, [{ softenFills: true }]);
  assert.ok(fromUrl(a.r.scenes[0].image).width >= 4 * 200, `장면을 4배까지 키움(${fromUrl(a.r.scenes[0].image).width}, ${JSON.stringify(a.r.errors)})`);
  const b = await run('검은 원 입자를 세 장으로');
  assert.deepEqual(b.splitOpts, [{ softenFills: false }]);
});
