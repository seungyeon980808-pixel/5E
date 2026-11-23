// 그림 엔진 그린 뒤 검사(1.7.3 그림 고침 C): 장면 글(구체화가 정한 대상·개수·방향)과 그린 그림을 대조한다.
// - AI 읽기 1번: 수가 적힌 대상을 하나씩 짚어 좌표와 함께 세고, 방향·위상·위치·층 순서, 라벨을 가르는 선·허공 지시선을 본다.
// - 픽셀 세기(AI 없음): AI가 「따로 떨어진 작은 도형」이라고 한 대상은 그 영역의 닫힌 도형 덩어리를 코드로 다시 센다(같은 크기끼리).
// - 틀리면 무엇이 틀렸는지 적어 그 장면만 한 번 다시 그린다. 두 번째도 틀리면 덜 틀린 쪽을 남기고 경고를 단다.
// 원칙: 실패로 끝내지 않는다 — 검사 AI가 답을 못 주거나 그림을 못 읽으면 검사 없이 처음 그림을 쓴다.
// 꺼짐: makeFigure 옵션 fix.verify === false.

const isAbort = (error) => error?.name === 'AbortError';
const clip = (s, n = 160) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// 지시문 첫머리는 다른 단계(「시험 문항 그림이다」 설명 지우기 확인 등)와 겹치지 않게 둔다 — 실험 실행기·검사가 첫머리로 단계를 가른다.
export const VERIFY_PROMPT = ({ request, sketch = false }) => `[그린 뒤 검사] 첫 첨부는 AI가 시험 문항용으로 그린 그림이다.${sketch ? ' 둘째 첨부는 교사가 손으로 그린 밑그림(물체 수·위치·방향의 기준)이다.' : ''}
아래 [장면 글]은 이 그림이 따라야 할 내용이다. 장면 글에 분명히 적힌 것만 그림과 대조한다(적히지 않은 것은 따지지 않는다). 화풍·글꼴·선 굵기·작은 모양 차이는 보지 않는다.

[장면 글]
${request}

검사할 것:
1. 개수 — 장면 글에 수가 적힌 작은 대상(분자·입자·이온 종류별 수, 자석·전하·물체 수, 층 수, 칸 수 등). 그림에서 하나씩 짚어 세고 각각의 가운데 좌표를 적는다. 범례·견본 칸 안의 견본 도형은 세지 않는다. 여러 용기·칸이 있으면 용기·칸마다 따로 적는다. 그릇·틀처럼 하나뿐인 큰 대상과 「모두 합친 수」 줄은 적지 않는다.
2. 내용 — 장면 글이 정한 방향(화살표·빛·힘·흐름·회전), 달의 위상과 밝은 쪽, 왼쪽·오른쪽·위·아래 위치 관계, 층의 위아래 순서, 연결 관계만(모양·화풍·배치의 고름은 적지 않는다). 반대거나 다르면 틀림. 높이·길이·간격 같은 크기 비율은 장면 글과 눈에 띄게(1.5배 넘게) 다를 때만 틀림으로 적는다.
3. 선과 글자 — 선(지시선·점선·치수선·물체 윤곽·화살표)이 라벨 글자 위를 지나가 글자를 가르거나 겹친 곳, 끝이 아무 대상에도 닿지 않고 허공에서 끝난 지시선, 가리키는 대상이 없는 라벨. 없으면 빈 배열.

좌표는 그림 왼쪽 위가 (0,0), 오른쪽 아래가 (1000,1000)인 정수다.
JSON만 답한다:
{"counts":[{"what":"(가) 용기 속 분자","expected":6,"found":6,"items":[[120,300],[250,410]],"box":[40,80,480,700],"separate":true}],
 "content":[{"what":"상현달의 밝은 쪽","expected":"오른쪽 반","found":"오른쪽 반","ok":true}],
 "lines":[{"what":"점선 O가 글자 x를 가름","where":[500,620]}]}
- box: 그 대상들이 모두 들어 있는 영역(범례 칸은 빼고). separate: 그 대상이 서로 떨어진 작은 원·네모 같은 닫힌 도형이면 true(층·띠·이어진 선이면 false).
- what·expected·found는 짧게(15자 안팎). 장면 글에 수가 없으면 counts는 빈 배열, 방향·위치가 없으면 content는 빈 배열.`;

/** AI 답 → 정리된 검사 결과. 깨진 답이면 null(검사 못함). */
export function parseVerify(text) {
  const raw = String(text ?? '');
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j;
  try { j = JSON.parse(m[0]); } catch { return null; }
  if (!j || typeof j !== 'object') return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const pt = (p) => (Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every((v) => Number.isFinite(Number(v))) ? [Number(p[0]), Number(p[1])] : null);
  const counts = (Array.isArray(j.counts) ? j.counts : []).map((c) => {
    const items = (Array.isArray(c?.items) ? c.items : []).map(pt).filter(Boolean);
    const box = Array.isArray(c?.box) && c.box.length === 4 && c.box.every((v) => Number.isFinite(Number(v))) ? c.box.map(Number) : null;
    const expected = num(c?.expected);
    const found = num(c?.found) ?? (items.length || null);
    return { what: clip(c?.what, 80), expected, found, aiFound: found, items, box, separate: c?.separate === true };
  }).filter((c) => c.what && c.expected != null && c.expected >= 0 && c.expected <= 60);
  const content = (Array.isArray(j.content) ? j.content : []).map((c) => ({ what: clip(c?.what, 80), expected: clip(c?.expected, 60), found: clip(c?.found, 60), ok: c?.ok !== false }))
    .filter((c) => c.what);
  const lines = (Array.isArray(j.lines) ? j.lines : []).map((l) => ({ what: clip(typeof l === 'string' ? l : l?.what, 100), where: pt(l?.where) })).filter((l) => l.what);
  return { counts, content, lines };
}

// ── 픽셀 세기(AI 없음) ──────────────────────────────────────────────

/** data URL → { width, height, gray(Uint8Array, 흰 바탕 기준 밝기) }. 못 읽으면 null. */
export async function decodeImage(dataUrl) {
  try {
    if (typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function' && typeof fetch === 'function') {
      const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, bmp.width, bmp.height); g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
      const gray = new Uint8Array(bmp.width * bmp.height);
      for (let i = 0, k = 0; k < gray.length; i += 4, k++) gray[k] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      bmp.close?.();
      return { width: c.width, height: c.height, gray };
    }
    return await decodePng(dataUrl);
  } catch { return null; }
}

/** PNG(8비트 회색·RGB·RGBA·회색+알파, 비월 아님) 풀기 — 캔버스가 없는 곳(Node 실행기)용. */
async function decodePng(dataUrl) {
  const m = /^data:image\/png;base64,(.*)$/s.exec(String(dataUrl || ''));
  if (!m || typeof DecompressionStream !== 'function') return null;
  const bin = typeof atob === 'function' ? atob(m[1]) : '';
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const dv = new DataView(buf.buffer);
  let p = 8, width = 0, height = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = dv.getUint32(p); const type = String.fromCharCode(...buf.subarray(p + 4, p + 8));
    if (type === 'IHDR') { width = dv.getUint32(p + 8); height = dv.getUint32(p + 12); depth = buf[p + 16]; ctype = buf[p + 17]; interlace = buf[p + 20]; }
    else if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype];
  if (!width || !height || depth !== 8 || !ch || interlace) return null;
  const raw = new Uint8Array(await new Response(new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const stride = width * ch;
  const gray = new Uint8Array(width * height);
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]; const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = x * ch;
      let lum = ch <= 2 ? cur[o] : (cur[o] * 299 + cur[o + 1] * 587 + cur[o + 2] * 114) / 1000;
      const alpha = ch === 2 ? cur[o + 1] : ch === 4 ? cur[o + 3] : 255;
      gray[y * width + x] = 255 - ((255 - lum) * alpha) / 255; // 투명은 흰 종이로
    }
    [prev, cur] = [cur, prev];
  }
  return { width, height, gray };
}

/** 먹 덩어리(8방향 이어짐) 목록: { x0, y0, x1, y1, area }. */
export function inkComponents({ width, height, gray }, threshold = 140) {
  const seen = new Uint8Array(width * height);
  const out = [];
  const stack = new Int32Array(width * height);
  for (let s = 0; s < gray.length; s++) {
    if (seen[s] || gray[s] >= threshold) continue;
    let top = 0; stack[top++] = s; seen[s] = 1;
    let x0 = width, y0 = height, x1 = 0, y1 = 0, area = 0;
    while (top) {
      const i = stack[--top]; const x = i % width, y = (i / width) | 0;
      area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= width) continue;
          const j = yy * width + xx;
          if (!seen[j] && gray[j] < threshold) { seen[j] = 1; stack[top++] = j; }
        }
      }
    }
    if (area >= 12) out.push({ x0, y0, x1, y1, area });
  }
  return out;
}

/**
 * 영역(box, 0~1000) 안의 따로 떨어진 닫힌 도형을 센다. 같은 크기 무리만 세고(글자·벽 빼기), 다른 도형 안에 든 것(+·− 기호)은 뺀다.
 * @returns {{ count: number, reliable: boolean, sizes: number[] } | null}
 */
export function countShapes(img, comps, box, aiItems = []) {
  if (!img || !Array.isArray(box)) return null;
  const { width: W, height: H } = img;
  const bx0 = (box[0] / 1000) * W, by0 = (box[1] / 1000) * H, bx1 = (box[2] / 1000) * W, by1 = (box[3] / 1000) * H;
  const bw = Math.max(1, bx1 - bx0), bh = Math.max(1, by1 - by0);
  const minDim = Math.min(W, H);
  const pad = 0.03 * minDim;
  const inBox = comps.filter((c) => {
    const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    const asp = w / h;
    return cx >= bx0 - pad && cx <= bx1 + pad && cy >= by0 - pad && cy <= by1 + pad
      && Math.max(w, h) >= 0.012 * minDim && w <= 0.45 * bw && h <= 0.45 * bh && asp >= 0.6 && asp <= 1.67;
  });
  // 다른 후보 안에 든 덩어리(원 안의 +·− 기호, 고리 안 점)는 뺀다.
  const top = inBox.filter((c) => !inBox.some((o) => o !== c && o.x0 <= c.x0 && o.y0 <= c.y0 && o.x1 >= c.x1 && o.y1 >= c.y1));
  if (!top.length) return { count: 0, reliable: false, sizes: [] };
  const size = (c) => Math.max(c.x1 - c.x0, c.y1 - c.y0) + 1;
  // AI가 짚은 자리에 가장 가까운 덩어리들의 크기로 기준 크기를 정한다(없으면 가운데값).
  const near = aiItems.map(([x, y]) => {
    const px = (x / 1000) * W, py = (y / 1000) * H;
    let best = null, bd = Infinity;
    for (const c of top) { const d = Math.hypot((c.x0 + c.x1) / 2 - px, (c.y0 + c.y1) / 2 - py); if (d < bd) { bd = d; best = c; } }
    return best && bd < 0.06 * minDim ? best : null;
  }).filter(Boolean);
  const basis = (near.length ? near : top).map(size).sort((a, b) => a - b);
  const med = basis[(basis.length - 1) >> 1];
  const kept = top.filter((c) => size(c) >= 0.7 * med && size(c) <= 1.4 * med);
  // 믿을 만한가: 같은 크기 무리가 AI가 짚은 자리 대부분과 맞고, 크기가 다른 덩어리가 섞여 헷갈리지 않을 때.
  const matched = near.filter((c) => kept.includes(c)).length;
  // 11-23 시험: 무늬 칠(점·얼룩)이 같은 크기 덩어리로 쪼개져 달 1개를 6개로 센 일 — AI가 2개 이상 짚었고 AI 수와 2개 안쪽으로 맞을 때만 믿는다.
  const reliable = kept.length > 0 && aiItems.length >= 2 && Math.abs(kept.length - aiItems.length) <= 2 && ( matched >= Math.ceil(0.7 * Math.min(aiItems.length, kept.length))) && top.length - kept.length <= Math.max(1, Math.floor(kept.length / 3));
  return { count: kept.length, reliable, sizes: kept.map(size) };
}

/** 검사 결과에 픽셀 세기를 얹는다: 믿을 만하면 픽셀 수를 그 대상의 수로 쓴다. */
async function addPixelCounts(result, image) {
  const inside = (b, o) => { const cx = (o[0] + o[2]) / 2, cy = (o[1] + o[3]) / 2; return cx > b[0] && cx < b[2] && cy > b[1] && cy < b[3]; };
  const all = result.counts.filter((c) => c.separate && c.box);
  // 그릇·틀(다른 대상 둘 이상을 품은 것)과 「모두 합친」 줄(나머지의 합)은 픽셀로 세지 않는다.
  const targets = all.filter((c) => all.filter((o) => o !== c && inside(c.box, o.box)).length < 2)
    .filter((c, _, arr) => !(arr.length > 2 && c.expected === arr.filter((o) => o !== c).reduce((s, o) => s + o.expected, 0)));
  if (!targets.length) return result;
  const img = await decodeImage(image);
  if (!img) return result;
  const comps = inkComponents(img);
  // 같은 영역에 여러 종류가 섞여 있으면(이온 네 종류가 한 비커에) 픽셀로는 종류를 못 가른다 → 그 무리는 합만 센다.
  const overlap = (a, b) => {
    const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    const area = (r) => Math.max(1, (r[2] - r[0]) * (r[3] - r[1]));
    return (ix * iy) / Math.min(area(a), area(b)) > 0.5;
  };
  const groups = [];
  for (const c of targets) { const g = groups.find((g) => g.some((o) => overlap(o.box, c.box))); if (g) g.push(c); else groups.push([c]); }
  for (const g of groups) {
    if (g.length === 1) {
      const c = g[0];
      const px = countShapes(img, comps, c.box, c.items);
      if (!px) continue;
      c.pixel = { count: px.count, reliable: px.reliable };
      if (px.reliable) c.found = px.count;
      continue;
    }
    const box = [Math.min(...g.map((c) => c.box[0])), Math.min(...g.map((c) => c.box[1])), Math.max(...g.map((c) => c.box[2])), Math.max(...g.map((c) => c.box[3]))];
    const px = countShapes(img, comps, box, g.flatMap((c) => c.items));
    if (!px) continue;
    const expected = g.reduce((s, c) => s + c.expected, 0), aiSum = g.reduce((s, c) => s + (c.aiFound ?? 0), 0);
    result.counts.push({ what: `${g.map((c) => c.what).join('·')} 모두 합친 수`, expected, found: px.reliable ? px.count : aiSum, aiFound: aiSum, items: [], box, separate: true, pixel: { count: px.count, reliable: px.reliable }, total: true });
  }
  return result;
}

/** 검사 결과 → 틀린 점 목록(사람이 읽는 글). */
export function problemsOf(result) {
  if (!result) return [];
  const out = [];
  for (const c of result.counts) {
    if (c.found != null && c.found !== c.expected) out.push({ kind: 'count', weight: 3 * Math.max(1, Math.abs(c.found - c.expected)), text: `${c.what}: ${c.found}개를 그렸다 → 정확히 ${c.expected}개` });
  }
  for (const c of result.content) if (!c.ok) out.push({ kind: 'content', weight: 3, text: `${c.what}: ${c.found || '다르게'} 그렸다 → ${c.expected}` });
  for (const l of result.lines) out.push({ kind: 'line', weight: 1, text: l.what });
  return out;
}

/** 다시 그릴 때 지시문 끝에 붙이는 글. */
export function redrawNote(problems) {
  return `\n\n[지난번 그림에서 틀린 곳 — 이번에는 반드시 바로잡을 것]\n${problems.map((p) => `- ${p.text}`).join('\n')}`
    + '\n개수는 그리면서 하나씩 세어 정확히 맞추고, 방향·위상·위치는 [내용] 글 그대로 그린다. 라벨 글자 위로는 어떤 선도 지나가지 않게 글자를 선에서 떼어 놓고, 지시선은 끝이 대상에 닿게 그린다. 그 밖의 구성은 그대로 둔다.';
}

/** 그림 하나 검사. 던지지 않는다(취소만). @returns {{ checked: boolean, result: object|null, problems: object[], ms: number, error?: string }} */
export async function verifyScene(ctx, { image, request, sketches = [] }) {
  const t0 = Date.now();
  try {
    const text = await ctx.readText(VERIFY_PROMPT({ request, sketch: sketches.length > 0 }), [image, ...sketches.slice(0, 1)]);
    const parsed = parseVerify(text);
    if (!parsed) return { checked: false, result: null, problems: [], ms: Date.now() - t0, error: '검사 답을 읽지 못함' };
    try { await addPixelCounts(parsed, image); } catch { /* 픽셀 세기 실패는 AI 결과만으로 */ }
    return { checked: true, result: parsed, problems: problemsOf(parsed), ms: Date.now() - t0 };
  } catch (error) {
    if (isAbort(error)) throw error;
    return { checked: false, result: null, problems: [], ms: Date.now() - t0, error: clip(error?.message || error, 200) };
  }
}

const score = (problems) => problems.reduce((s, p) => s + p.weight, 0);

/**
 * 그린 뒤 검사 + 틀리면 한 번 다시 그리기. 던지지 않는다(취소만).
 * @param {object} ctx  { readText, log, signal }
 * @param {{ image: string, request: string, sketches?: string[], redraw: (note: string) => Promise<string> }} args
 * @returns {Promise<{ image: string, verify: object }>}
 */
export async function verifyAndRedraw(ctx, { image, request, sketches = [], redraw }) {
  const log = ctx.log || (() => {});
  const t0 = Date.now();
  const first = await verifyScene(ctx, { image, request, sketches });
  const summary = (v) => ({ checked: v.checked, problems: v.problems.map((p) => p.text), counts: v.result?.counts?.map((c) => ({ what: c.what, expected: c.expected, found: c.found, ai: c.aiFound, pixel: c.pixel || null })) || [], ms: v.ms, ...(v.error ? { error: v.error } : {}) });
  if (!first.checked) { log('그림 검사 건너뜀: ' + (first.error || '')); return { image, verify: { ok: null, retried: false, first: summary(first), ms: Date.now() - t0 } }; }
  if (!first.problems.length) { log('그림 검사: 맞음'); return { image, verify: { ok: true, retried: false, first: summary(first), ms: Date.now() - t0 } }; }
  log('그림 검사: 틀림 — ' + first.problems.map((p) => p.text).join(' / ') + ' → 이 장면만 다시 그림');
  let second = null, image2 = null;
  try { image2 = await redraw(redrawNote(first.problems)); }
  catch (error) { if (isAbort(error)) throw error; log('다시 그리기 실패 — 처음 그림을 씀: ' + clip(error?.message || error)); }
  if (image2) second = await verifyScene(ctx, { image: image2, request, sketches });
  const secondOk = second && second.checked && !second.problems.length;
  // 둘 다 틀렸으면 덜 틀린 쪽(같으면 다시 그린 쪽 — 틀린 곳을 알고 그렸다). 두 번째를 검사하지 못했으면 처음 그림.
  const useSecond = !!(image2 && second && second.checked && (secondOk || score(second.problems) <= score(first.problems)));
  const kept = useSecond ? second : first;
  const warning = secondOk ? null : `그림 검사에서 맞지 않는 곳이 남았습니다 — ${kept.problems.map((p) => p.text).join(' / ')}. 확인해 주세요.`;
  if (warning) log('⚠ ' + warning);
  else log('그림 검사: 다시 그린 그림이 맞음');
  return {
    image: useSecond ? image2 : image,
    verify: { ok: !!secondOk, retried: true, picked: useSecond ? 2 : 1, warning, first: summary(first), second: second ? summary(second) : null, ...(image2 && !useSecond ? { other: image2 } : {}), ms: Date.now() - t0 },
  };
}
