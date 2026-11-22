// LEADERFIX(11-22) 생성 그림 「확정하고 라벨 살리기」 자리 맞춤(화면 없는 조각).
// 사용자 지적(뇌 단면 그림): 살린 라벨 글자가 지시선 시작점 아래에 붙고(「시상하부」), 지시선 끝과 글자가 떨어졌다(「시상」).
// 원인: 생성 그림 경로는 AI가 읽은 대략의 자리(반 글자쯤 비켜 있곤 함)를 그대로 라벨 자리로 썼고,
// 지우기가 「확실하지 않음」으로 남긴 지시선은 픽셀에서 찾은 선을 버리고 AI가 읽은 끝점으로 되돌아갔다.
// 기출 변환 경로(labelsAtMeasuredGlyphs)처럼
//  1) 원본 그림의 실제 글자 잉크로 라벨 자리·크기를 맞추고(잉크를 못 찾으면 AI 자리),
//  2) 지시선은 픽셀에서 찾은 선(지우기는 못 믿어도 선 자체는 찾은 것)을 먼저, AI 끝점은 마지막에 쓰며,
//  3) 다시 그린 그림이 원본에서 밀렸는지 재어, 많이 밀렸으면 다시 그린 그림 대신 맥 안에서 지운 그림을 쓴다(실패로 끝내지 않음).
import { localTextSearchFromGlyphInk } from './ai-exam-label-removal.js?v=1.7.0-four-session-integration';
import { freezeLabelPlan } from './ai-editable-image-labels.js?v=1.7.0-four-session-integration';

const DARK = 170;

/** 반투명 점을 흰 바탕에 합친 사본(글자 찾기는 불투명 그림만 다룬다). */
function opaqueCopy(rgba) {
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3];
    if (a === 255) continue;
    const k = a / 255;
    out[i] = Math.round(out[i] * k + 255 * (1 - k)); out[i + 1] = Math.round(out[i + 1] * k + 255 * (1 - k)); out[i + 2] = Math.round(out[i + 2] * k + 255 * (1 - k)); out[i + 3] = 255;
  }
  return out;
}

/**
 * 읽은 글자 상자마다 원본 그림의 실제 글자 잉크를 찾는다(기출 변환과 같은 localTextSearchFromGlyphInk).
 * @param {Uint8ClampedArray} rgba 원본 그림(지우기 전)
 * @param {object[]} items parseLabelRead 결과(0~1 비율 상자)
 * @returns {object[]} 같은 순서의 항목. 찾았으면 glyph: {x,y,w,h}(0~1 비율 잉크 상자), 못 찾았으면 glyph: null.
 */
export function snapReadItemsToGlyphInk(rgba, W, H, items = []) {
  const data = opaqueCopy(rgba);
  const labels = items.map((item, i) => ({ id: 'S' + i, text: String(item?.text || ''), mode: 'text', typography: { bounds: { x: item.x, y: item.y, w: item.w, h: item.h } } }));
  return items.map((item, i) => {
    let glyph = null;
    try {
      const found = localTextSearchFromGlyphInk({ data, width: W, height: H, label: labels[i], plan: { labels } });
      const g = found?.glyphBounds;
      if (g && g.w > 0 && g.h > 0) glyph = { x: g.x, y: g.y, w: g.w, h: g.h };
    } catch { glyph = null; }
    return { ...item, glyph };
  });
}

/** 지우기용 상자: AI 상자와 잉크 상자를 합친 것(AI 상자가 비켜 있어도 글자 전체가 지울 창 안에 들어오게). */
export function eraseBoxOf(item) {
  const g = item?.glyph;
  if (!g) return { x: item.x, y: item.y, w: item.w, h: item.h };
  const x0 = Math.min(item.x, g.x), y0 = Math.min(item.y, g.y);
  const x1 = Math.max(item.x + item.w, g.x + g.w), y1 = Math.max(item.y + item.h, g.y + g.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * 라벨로 올릴 최종 항목. 글자 자리는 잉크 상자(없으면 AI 상자), 지시선은
 *  - 다시 그리지 않았으면: 지워서 5E 지시선으로 바꾼 것(erased.leader)은 그대로, 못 지운 것은 원래 선이 그림에 남으므로 5E 지시선 없음(두 줄 방지)
 *  - 다시 그린 그림(redrawn)이면: 픽셀에서 찾은 선(지운 선·erased.traced 가운데 읽은 끝점에 가까운 것) → 없으면 AI가 읽은 끝점
 * 지시선의 글자 쪽 끝은 그리는 쪽(labeler)이 늘 글자 상자 가장자리에 붙인다 — 그래서 글자 자리를 잉크에 맞추면 선과 글자가 만난다.
 */
export function finalLabelItems(snapped = [], erased = [], { redrawn = false } = {}) {
  return snapped.map((item, i) => {
    const done = erased[i];
    const box = item.glyph || { x: item.x, y: item.y, w: item.w, h: item.h };
    let leader = done?.leader || null;
    if (redrawn) {
      // 다시 그린 그림에는 원래 지시선이 없다: 픽셀에서 찾은 선(지운 선의 물체 쪽 끝 · 선이 실제로 끝나는 곳) 가운데 읽은 끝점에 가까운 쪽, 없으면 읽은 끝점.
      const options = [leader, done?.traced].filter(Boolean);
      const want = item.leader, far = l => (want ? Math.hypot(l.x2 - want.x2, l.y2 - want.y2) : 0);
      leader = options.sort((p, q) => far(p) - far(q))[0] || want || null;
    }
    const { glyph, ...rest } = item;
    return { ...rest, x: box.x, y: box.y, w: box.w, h: box.h, leader, glyphSnapped: Boolean(glyph) };
  });
}

/** 잉크에 맞춘 라벨은 원본에서 잰 글자 크기(measuredLabelSizes의 sizes, 그림 높이 비율)를 쓴다 — 잉크 상자 높이 × 1.05는 원본보다 작다. */
export function withGlyphLabelSizes(plan, items = [], sizes) {
  if (!plan?.labels?.length || !sizes?.size) return plan;
  const labels = plan.labels.map((label, i) => (items[i]?.glyphSnapped && sizes.get(label.id) > 0 ? { ...label, measuredSize: sizes.get(label.id) } : label));
  return freezeLabelPlan({ ...plan, labels });
}

/** 지시선의 글자 쪽 끝이 글자 상자에서 얼마나 떨어졌는지(픽셀) — 검사·기록용. */
export function leaderGapToBox(item, W, H) {
  const l = item?.leader;
  if (!l) return null;
  const x = l.x1 * W, y = l.y1 * H, x0 = item.x * W, y0 = item.y * H, x1 = (item.x + item.w) * W, y1 = (item.y + item.h) * H;
  return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1));
}

function inkMask(rgba, W, H) {
  const m = new Uint8Array(W * H);
  for (let k = 0, i = 0; k < m.length; k++, i += 4) {
    if (rgba[i + 3] < 40) continue;
    if (rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114 < DARK) m[k] = 1;
  }
  return m;
}
function dilate(mask, W, H, r) {
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask[y * W + x]) continue;
    for (let d = -r; d <= r; d++) { const xx = x + d; if (xx >= 0 && xx < W) tmp[y * W + xx] = 1; }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!tmp[y * W + x]) continue;
    for (let d = -r; d <= r; d++) { const yy = y + d; if (yy >= 0 && yy < H) out[yy * W + x] = 1; }
  }
  return out;
}

/**
 * 다시 그린 그림이 원본에서 얼마나 밀렸는지 잰다. 글자·지시선 자리(넉넉히)는 빼고 나머지 그림 잉크끼리 맞춰 본다.
 * 정수 이동(±maxShift)마다 원본 잉크 점이 다시 그린 잉크(±tolerance) 위에 있는 비율(되찾음)과 그 반대(정확도)의 조화평균을 잰다.
 * @returns {{ ok: boolean, dx: number, dy: number, score: number, zeroScore: number, reason?: string }}
 *   dx·dy: 다시 그린 그림을 이만큼 옮겨 그리면 원본에 맞는다. ok가 false면 다시 그린 그림을 쓰지 않는다.
 */
export function redrawAlignment(sourceRgba, redrawRgba, W, H, items = [], { maxShift = 12, tolerance = 3, minScore = 0.6, maxSamples = 24000 } = {}) {
  const src = inkMask(sourceRgba, W, H), drawn = inkMask(redrawRgba, W, H);
  // 글자·지시선 자리는 원래 다르다(지운 곳) — 비교에서 뺀다.
  const skip = new Uint8Array(W * H);
  const mark = (x0, y0, x1, y1) => { for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) skip[y * W + x] = 1; };
  for (const item of items) {
    for (const b of [item, item?.glyph].filter(Boolean)) {
      const pad = Math.max(6, b.h * H * 0.5);
      mark(b.x * W - pad, b.y * H - pad, (b.x + b.w) * W + pad, (b.y + b.h) * H + pad);
    }
    for (const l of [item?.leader, item?.traced].filter(Boolean)) {
      const ax = l.x1 * W, ay = l.y1 * H, bx = l.x2 * W, by = l.y2 * H, n = Math.ceil(Math.hypot(bx - ax, by - ay)), r = 7;
      for (let s = 0; s <= n; s++) { const x = ax + (bx - ax) * s / (n || 1), y = ay + (by - ay) * s / (n || 1); mark(x - r, y - r, x + r, y + r); }
    }
  }
  const pick = mask => { const list = []; for (let k = 0; k < mask.length; k++) if (mask[k] && !skip[k]) list.push(k); if (list.length <= maxSamples) return list; const step = list.length / maxSamples; return Array.from({ length: maxSamples }, (_, i) => list[Math.floor(i * step)]); };
  const a = pick(src), b = pick(drawn);
  if (a.length < 50 || b.length < 50) return { ok: false, dx: 0, dy: 0, score: 0, zeroScore: 0, reason: 'too-little-ink' };
  // 자리 찾기는 여유 없이(넉넉하면 여러 자리가 똑같이 맞아 보인다), 쓸지 말지는 tolerance 여유로 판단한다.
  const tight = { s: src, d: drawn }, loose = { s: dilate(src, W, H, tolerance), d: dilate(drawn, W, H, tolerance) };
  // 다시 그린 그림을 (dx,dy) 옮기면: 다시 그린 점 (x,y) → (x+dx,y+dy).
  const scoreAt = (dx, dy, m = tight) => {
    let hitA = 0, hitB = 0;
    for (const k of a) { const x = k % W - dx, y = (k / W | 0) - dy; if (x >= 0 && y >= 0 && x < W && y < H && m.d[y * W + x]) hitA++; }
    for (const k of b) { const x = k % W + dx, y = (k / W | 0) + dy; if (x >= 0 && y >= 0 && x < W && y < H && m.s[y * W + x]) hitB++; }
    const recall = hitA / a.length, precision = hitB / b.length;
    return recall + precision > 0 ? 2 * recall * precision / (recall + precision) : 0;
  };
  // 거친 찾기(2점 간격) 뒤 둘레 1점 다듬기. 같은 점수면 덜 옮기는 쪽.
  let best = { dx: 0, dy: 0, score: scoreAt(0, 0) };
  const better = (dx, dy, sc) => sc > best.score + 1e-9 || (Math.abs(sc - best.score) <= 1e-9 && Math.abs(dx) + Math.abs(dy) < Math.abs(best.dx) + Math.abs(best.dy));
  for (let dy = -maxShift; dy <= maxShift; dy += 2) for (let dx = -maxShift; dx <= maxShift; dx += 2) {
    if (!dx && !dy) continue;
    const sc = scoreAt(dx, dy); if (better(dx, dy, sc)) best = { dx, dy, score: sc };
  }
  const c = { ...best };
  for (let dy = c.dy - 1; dy <= c.dy + 1; dy++) for (let dx = c.dx - 1; dx <= c.dx + 1; dx++) {
    if (Math.abs(dx) > maxShift || Math.abs(dy) > maxShift || (dx === c.dx && dy === c.dy)) continue;
    const sc = scoreAt(dx, dy); if (better(dx, dy, sc)) best = { dx, dy, score: sc };
  }
  // 옮기는 것은 여유 없이 잰 맞춤이 뚜렷이 나아지고, 여유를 두고 잰 맞춤도 나빠지지 않을 때만(같은 자리에 그렸으면 그대로).
  const zeroScore = scoreAt(0, 0, loose), zeroTight = scoreAt(0, 0);
  const moved = best.score > zeroTight + 0.05;
  best.score = scoreAt(best.dx, best.dy, loose);
  if (!moved || best.score < zeroScore - 0.02) best = { dx: 0, dy: 0, score: zeroScore };
  const ok = best.score >= minScore;
  return { ok, dx: best.dx, dy: best.dy, score: Math.round(best.score * 1000) / 1000, zeroScore: Math.round(zeroScore * 1000) / 1000, ...(ok ? {} : { reason: 'misaligned' }) };
}
