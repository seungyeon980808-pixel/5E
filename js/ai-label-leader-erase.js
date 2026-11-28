// LEADERFIX(11-20) 「확정하고 라벨 살리기」의 지시선 처리(화면 없는 조각, 그림은 다시 그리지 않음).
// 사용자 지적: 라벨을 살리면 그림 속 원래 지시선이 남아 5E 라벨 지시선과 두 줄이 되고, 라벨을 끄면 옛 지시선만 매달려 있다.
// 규칙(라벨 켬·끔 같은 그림): 글자 읽기가 알려 준 지시선(글자 쪽 끝 → 가리키는 끝)을 그림 픽셀에서 다시 찾아
//  - 글자 상자에서 나가는 가늘고 곧은 선이 확실하면: 그 선을 지우고, 실제로 찾은 두 끝으로 5E 지시선 라벨을 만든다.
//  - 확실하지 않으면(굽은 화살표·화살촉·끝 점·다른 선과 겹침·선을 못 찾음): 원래 선은 그대로 두고 5E 라벨은 지시선 없이(중복 없음).
// 다른 그림 선은 지우지 않는다: 선이 다른 획과 만나는 자리(교차·붙음)는 남기고, 지시선만 있는 자리만 지운다.
import { eraseGlyphsInBoxes } from './ai-create-chat.js?v=1.7.0-four-session-integration';

const DARK = 170;
const luminance = (rgba, i) => rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;

/** 반투명·투명 점을 흰 바탕 위에 합친다(제자리). */
export function flattenOnWhite(rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a === 255) continue;
    const k = a / 255;
    rgba[i] = Math.round(rgba[i] * k + 255 * (1 - k)); rgba[i + 1] = Math.round(rgba[i + 1] * k + 255 * (1 - k)); rgba[i + 2] = Math.round(rgba[i + 2] * k + 255 * (1 - k)); rgba[i + 3] = 255;
  }
}

function lumaOf(rgba, width, height) {
  const out = new Uint8Array(width * height);
  for (let k = 0, i = 0; k < out.length; k++, i += 4) out[k] = rgba[i + 3] < 40 ? 255 : Math.round(luminance(rgba, i));
  return out;
}

/** 한 점(실수 좌표)이 진한가 — 가장 가까운 픽셀. 그림 밖은 밝음. */
function darkAt(luma, W, H, x, y) {
  const ix = Math.round(x), iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return false;
  return luma[iy * W + ix] < DARK;
}

/** 선 위 한 점에서 수직 방향으로 진한 띠를 잰다: 가운데(±1) 진한 띠의 폭, 띠 바깥 8점 안에 다른 진한 점이 있는지. */
function profileAt(luma, W, H, cx, cy, nx, ny, reach = 8) {
  const d = [];
  for (let k = -reach; k <= reach; k++) d.push(darkAt(luma, W, H, cx + nx * k, cy + ny * k));
  const mid = reach;
  let seed = -1;
  for (const k of [0, -1, 1]) if (d[mid + k]) { seed = mid + k; break; }
  if (seed < 0) return { on: false, width: 0, other: false, lo: 0, hi: 0 };
  let lo = seed, hi = seed;
  while (lo > 0 && d[lo - 1]) lo--;
  while (hi < d.length - 1 && d[hi + 1]) hi++;
  let other = false;
  // 다른 획: 띠 가장자리에서 2~5점 안의 진한 점(지울 때 띠 ±3점만 칠하고 4~6점 바깥에서 바탕색을 재므로 그 안만 본다).
  for (let k = 0; k < d.length; k++) if (d[k] && ((k <= lo - 2 && k >= lo - 5) || (k >= hi + 2 && k <= hi + 5))) { other = true; break; }
  // 띠가 창 끝까지 이어지면(넓은 획·면) 폭을 모른다 → 넓은 것으로 본다.
  const width = (lo === 0 || hi === d.length - 1) ? 99 : hi - lo + 1;
  return { on: true, width, other, lo: lo - mid, hi: hi - mid };
}

function boxDistance(px, py, box) {
  const dx = Math.max(box.x0 - px, 0, px - box.x1), dy = Math.max(box.y0 - py, 0, py - box.y1);
  return Math.hypot(dx, dy);
}
const insideBox = (px, py, box, grow = 0) => px >= box.x0 - grow && px <= box.x1 + grow && py >= box.y0 - grow && py <= box.y1 + grow;
const median = values => { const v = values.slice().sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 0; };

/**
 * 읽은 지시선 하나를 그림에서 찾는다(곧은 선만). 순수 함수.
 * @returns {{ ok: true, start: {x,y}, end: {x,y}, ux, uy, nx, ny, t0, t1, samples: {t,x,y,lo,hi,erase}[], width } | { ok: false, reason: string }}
 */
export function traceLeaderLine(luma, W, H, item, opts = {}) {
  const leader = item?.leader;
  if (!leader) return { ok: false, reason: 'no-leader' };
  const box = { x0: item.x * W, y0: item.y * H, x1: (item.x + item.w) * W, y1: (item.y + item.h) * H };
  const textH = Math.max(4, box.y1 - box.y0);
  const p1 = { x: leader.x1 * W, y: leader.y1 * H }, p2 = { x: leader.x2 * W, y: leader.y2 * H };
  const len0 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (!(len0 >= 8)) return { ok: false, reason: 'too-short' };
  const theta0 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const R = Math.max(10, Math.min(40, Math.round(textH * 0.6)));
  // 1) 방향(±15°)·수직 위치(±R)를 바꿔 가며 AI 선분 구간에 진한 점이 가장 많은 곧은 선을 고른다.
  let best = null;
  for (let a = -15; a <= 15; a += 0.5) {
    const th = theta0 + a * Math.PI / 180, ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux;
    for (let off = -R; off <= R; off++) {
      const ox = p1.x + nx * off, oy = p1.y + ny * off;
      let hit = 0;
      for (let t = 0; t <= len0; t += 1) {
        const x = ox + ux * t, y = oy + uy * t;
        if (darkAt(luma, W, H, x, y) || darkAt(luma, W, H, x + nx, y + ny) || darkAt(luma, W, H, x - nx, y - ny)) hit++;
      }
      if (!best || hit > best.hit) best = { hit, ox, oy, ux, uy, nx, ny };
    }
  }
  if (!best || best.hit < Math.max(8, len0 * 0.5)) return { ok: false, reason: 'not-found' };
  const { ox, oy, ux, uy, nx, ny } = best;
  // 2) 선을 따라 앞뒤로 걸어 실제 선 구간(틈 3점까지 허용)을 찾는다. 뒤쪽은 글자 상자에 닿으면 멈춘다.
  const on = t => { const x = ox + ux * t, y = oy + uy * t; return darkAt(luma, W, H, x, y) || darkAt(luma, W, H, x + nx, y + ny) || darkAt(luma, W, H, x - nx, y - ny); };
  let center = -1;
  for (let t = Math.round(len0 * 0.5), k = 0; k <= len0 * 0.5; k++) { for (const s of [t + k, t - k]) if (s >= 0 && s <= len0 && on(s)) { center = s; break; } if (center >= 0) break; }
  if (center < 0) return { ok: false, reason: 'not-found' };
  const limitBack = -Math.max(R, textH) * 2, limitFwd = len0 + R * 3;
  let t0 = center, gap = 0;
  for (let t = center - 1; t >= limitBack; t--) {
    const x = ox + ux * t, y = oy + uy * t;
    if (insideBox(x, y, box, 1)) break;
    if (on(t)) { t0 = t; gap = 0; } else if (++gap > 3) break;
  }
  let t1 = center; gap = 0;
  for (let t = center + 1; t <= limitFwd; t++) {
    const x = ox + ux * t, y = oy + uy * t;
    if (x < 0 || y < 0 || x >= W || y >= H) break;
    if (on(t)) { t1 = t; gap = 0; } else if (++gap > 3) break;
  }
  const runLen = t1 - t0;
  const start = { x: ox + ux * t0, y: oy + uy * t0 }, rawEnd = { x: ox + ux * t1, y: oy + uy * t1 };
  if (runLen < Math.max(8, len0 * 0.5)) return { ok: false, reason: 'short-run' };
  // 끝이 AI 끝보다 한참 더 이어지면 지시선이 아니라 그림 속 곧은 획(책상 모서리 등)일 수 있다.
  if (t1 >= limitFwd - 1) return { ok: false, reason: 'runs-on' };
  // 글자 쪽 끝은 글자 상자 가까이에서 시작해야 한다.
  if (boxDistance(start.x, start.y, box) > Math.max(14, textH)) return { ok: false, reason: 'far-from-text' };
  // 가리키는 끝이 글자 쪽 끝보다 글자 상자에 더 가까우면 방향이 틀렸다.
  if (boxDistance(rawEnd.x, rawEnd.y, box) <= boxDistance(start.x, start.y, box)) return { ok: false, reason: 'wrong-direction' };
  // 3) 선을 따라 수직 띠를 잰다: 폭(가늘기), 다른 획과 만나는지.
  const samples = [];
  let dark = 0;
  for (let t = t0; t <= t1; t++) {
    const x = ox + ux * t, y = oy + uy * t;
    const p = profileAt(luma, W, H, x, y, nx, ny);
    if (p.on) dark++;
    samples.push({ t, x, y, ...p });
  }
  if (dark / samples.length < 0.85) return { ok: false, reason: 'sparse' };
  const width = median(samples.filter(s => s.on && s.width < 99).map(s => s.width));
  if (!(width > 0) || width > Math.max(5, textH * 0.2)) return { ok: false, reason: 'thick' };
  const wide = s => s.on && s.width > width * 2 + 1;
  // 화살촉·끝 점: 양 끝 30점 안에서 넓은 띠가 5점 넘게 이어지면(획이 스치는 것은 3점 안팎) 지시선이 아니라 화살표·점 표시로 본다.
  const edge = Math.min(30, Math.floor(samples.length / 3));
  const runOfWide = list => { let longest = 0, cur = 0; for (const s of list) { cur = wide(s) ? cur + 1 : 0; longest = Math.max(longest, cur); } return longest; };
  // LEADERFIX(11-22): 여기부터의 「확실하지 않음」은 지우기만 못 믿는 것이다 — 찾은 선(line: 글자 쪽 끝 → 진한 점이 끝나는 곳)은 돌려줘
  // 다시 그린 그림의 5E 지시선에 쓴다(빗금 속에서 끝나는 선은 처음 닿는 물체 선이 아니라 실제 선 끝이 가리키는 끝).
  const line = { start, end: rawEnd };
  // 실험(11-22 변환 갈래, 선택 옵션): 기출 그림은 화살촉 달린 지시선이 드물다 — opts.allowTextBlob이면 글자 쪽 끝 넓은 띠(글자 획과 붙음)를,
  // opts.allowTargetBlob이면 가리키는 끝 넓은 띠(굵은 Z선·피스톤 띠 같은 물체)를 화살촉으로 보지 않고 아래 「처음 닿는 물체」 다듬기에 맡긴다. 기본값은 그대로.
  if (!opts.allowTextBlob && runOfWide(samples.slice(0, edge)) >= 5) return { ok: false, reason: 'arrow-or-dot-at-text' };
  if (!opts.allowTargetBlob && runOfWide(samples.slice(-edge)) >= 5) return { ok: false, reason: 'arrow-or-dot-at-target', line };
  // 글자 쪽 끝은 비어 있어야 한다: 끝 너머(글자 상자 밖)에 진한 점이 이어지면 굽은 화살표·다른 획의 일부다
  // (실제 읽기에서 「산소」「NADP⁺」로 가는 굽은 과정 화살표의 곧은 부분을 지시선으로 잡았던 것).
  {
    const reach = Math.max(8, Math.round(width * 2 + 4));
    let beyond = 0;
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      if (dx * dx + dy * dy > reach * reach) continue;
      const along = dx * ux + dy * uy, side = Math.abs(-dx * uy + dy * ux);
      if (along > -2) continue; // 끝 너머(글자 쪽)만
      if (along > -4 && side <= width / 2 + 1) continue; // 선 끝의 둥근 마무리
      const x = start.x + dx, y = start.y + dy;
      if (insideBox(x, y, box, 2)) continue;
      if (darkAt(luma, W, H, x, y)) beyond++;
    }
    if (beyond >= 4) return { ok: false, reason: 'continues-at-text' };
  }
  // 지울 자리: 지시선만 있는 점(다른 획이 옆에 없고 띠가 가는 곳). 만나는 자리와 그 둘레 1점은 남긴다.
  const keep = samples.map(s => !s.on || s.other || wide(s));
  const keepNear = keep.map((_, i) => keep.slice(Math.max(0, i - 1), i + 2).some(Boolean));
  samples.forEach((s, i) => { s.erase = s.on && !keepNear[i]; });
  // 가리키는 끝 다듬기: 지시선만 있는 점이 8개 넘게 이어진 마지막 구간까지가 지시선이다. 그 뒤(물체 선에 닿은 뒤 물체 속 잎맥·겹벽 등)는
  // 지시선이 아닐 수 있으므로 지우지 않고(끝 묶음은 다른 획을 피해 조심해서만 칠함), 5E 지시선 끝은 처음 물체에 닿는 자리로 둔다.
  let last = -1;
  for (let i = samples.length - 1, run = 0; i >= 0; i--) { run = samples[i].erase ? run + 1 : 0; if (run >= 8) { last = i + run - 1; break; } }
  if (last < 0) return { ok: false, reason: 'no-clean-run', line };
  for (let i = last + 1; i < samples.length; i++) samples[i].erase = false;
  const touch = samples.slice(last + 1).find(q => q.on && (q.other || wide(q))) || samples[last];
  const end = { x: touch.x, y: touch.y };
  samples.length = Math.min(samples.length, samples.indexOf(touch) + 1);
  // 다른 획과 겹친 곳이 너무 많으면(빗금 면을 지나는 선 등) 반쯤 지운 선이 남으므로 아예 건드리지 않는다.
  const erasable = samples.filter(s => s.erase).length;
  if (erasable < samples.length * 0.7) return { ok: false, reason: 'crowded', line };
  // 한 번에 길게(10점 넘게) 다른 획과 겹치는 자리(점 무늬 띠·겹선 사이를 지나는 선)는 그 토막이 남으므로 건드리지 않는다.
  let longest = 0;
  for (let i = 0, run = 0; i <= last; i++) { run = samples[i].erase ? 0 : run + 1; longest = Math.max(longest, run); }
  if (longest > 10) return { ok: false, reason: 'crowded-crossing', line };
  return { ok: true, start, end, ux, uy, nx, ny, t0, t1, samples, width };
}

/**
 * 찾은 지시선을 지운다. 지시선만 있는 점마다 선 띠 + 둘레 번짐(3점)을, 그 자리 바로 양옆(4~6점 바깥) 바탕색으로 칠한다
 * — 흰 종이 위는 흰색, 회색 면 위는 회색, 경계를 따라가는 선은 양쪽 색을 반씩(11-20 「식물 잎」 선이 회색 액체 안에서 얼룩으로 남던 것).
 * 다른 획과 만나는 자리(엇갈림·물체 선에 닿는 끝)는 진한 점은 그대로 두고 옅은 번짐만 칠한다 — 다른 획을 끊지 않는다(11-20 비커 벽이 끊기던 것).
 * 그래서 만남 자리마다 지시선이 1~2점 남을 수 있다(라벨을 켜면 5E 지시선이 그 위를 지난다).
 */
export function eraseTracedLeader(rgba, W, H, trace) {
  const { samples, ux, uy, nx, ny, width } = trace;
  const original = rgba.slice();
  const written = new Uint8Array(W * H);
  const lumO = (x, y) => luminance(original, (y * W + x) * 4);
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const sideColor = (s, from, to) => {
    const r = [], g = [], b = [];
    for (let along = -1; along <= 1; along++) for (let k = from; k <= to; k++) {
      const x = Math.round(s.x + ux * along + nx * k), y = Math.round(s.y + uy * along + ny * k);
      if (!inside(x, y) || lumO(x, y) < DARK) continue;
      const i = (y * W + x) * 4; r.push(original[i]); g.push(original[i + 1]); b.push(original[i + 2]);
    }
    if (r.length < 3) return null;
    return [median(r), median(g), median(b)];
  };
  const lumOfColor = c => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  let count = 0;
  // 지시선 띠(부호 있는 수직 거리): 그 자리가 지시선만 있는 점이면 그 띠 ±1, 아니면(만남 자리) 지울 점들의 띠 가운데값 ± (반폭 + 1).
  // 그 밖의 진한 점은 다른 획이다. 곧은 선 맞춤이 1점쯤 어긋나도 지시선 자기 점을 다른 획으로 보지 않게 자리마다 잰 띠를 쓴다.
  const O = samples[0];
  const offLine = (x, y) => (x - O.x) * nx + (y - O.y) * ny;
  const alongLine = (x, y) => (x - O.x) * ux + (y - O.y) * uy;
  const centers = samples.filter(q => q.erase).map(q => (q.lo + q.hi) / 2);
  const c = centers.length ? median(centers) : 0;
  const bandAt = (x, y) => {
    const q = samples[Math.max(0, Math.min(samples.length - 1, Math.round(alongLine(x, y))))];
    if (q && q.erase) return [q.lo - 1, q.hi + 1];
    return [c - width / 2 - 1, c + width / 2 + 1];
  };
  // 둘레 3점 안에 지시선 띠 밖의 진한 점(다른 획)이 있으면 칠하지 않는다 — 지시선이 물체 선에 닿는 자리에서 그 선을 끊지 않게.
  const nearOther = (x, y) => {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const qx = x + dx, qy = y + dy;
      if (!inside(qx, qy) || lumO(qx, qy) >= DARK) continue;
      const k = offLine(qx, qy), [lo, hi] = bandAt(qx, qy);
      if (k < lo || k > hi) return true;
    }
    return false;
  };
  const paint = (s, lo, hi, colors, { lightOnly = false } = {}) => {
    const [a, b] = colors, same = Math.abs(lumOfColor(a) - lumOfColor(b)) <= 10;
    const mid = (lo + hi) / 2;
    for (const along of [-0.5, 0, 0.5]) for (let k = lo; k <= hi; k++) {
      const x = Math.round(s.x + ux * along + nx * k), y = Math.round(s.y + uy * along + ny * k);
      if (!inside(x, y)) continue;
      const key = y * W + x;
      if (written[key]) continue;
      if (lightOnly && lumO(x, y) < DARK) continue;
      if (nearOther(x, y)) continue;
      const fill = same ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] : (k <= mid ? a : b);
      const i = key * 4; rgba[i] = Math.round(fill[0]); rgba[i + 1] = Math.round(fill[1]); rgba[i + 2] = Math.round(fill[2]); rgba[i + 3] = 255;
      written[key] = 1; count++;
    }
  };
  const colorsOf = s => { const A = sideColor(s, s.lo - 6, s.lo - 4), B = sideColor(s, s.hi + 4, s.hi + 6); return A || B ? [A || B, B || A] : null; };
  const lastColors = new Array(samples.length).fill(null);
  samples.forEach((s, i) => {
    if (!s.erase) return;
    const colors = colorsOf(s);
    if (!colors) { s.erase = false; return; }
    lastColors[i] = colors;
    paint(s, s.lo - 3, s.hi + 3, colors);
  });
  // 만남 자리: 진한 점은 두고 지시선 둘레의 옅은 번짐만 칠한다.
  const colorsNear = q => { for (let r = 0; r <= 8; r++) for (const v of [q - r, q + r]) if (v >= 0 && v < samples.length && lastColors[v]) return lastColors[v]; return null; };
  samples.forEach((s, i) => {
    if (s.erase || !s.on) return;
    const colors = colorsNear(i);
    if (colors) paint(s, Math.floor(c - width / 2 - 3), Math.ceil(c + width / 2 + 3), colors);
  });
  return count;
}

/**
 * 라벨 살리기 한 번: 지시선 확인·지우기 → 글자 지우기. rgba는 제자리에서 바뀐다.
 * @param {object[]} items parseLabelRead 결과(0~1 비율 상자, leader)
 * @returns {{ items: object[], leaders: { text, status: 'erased'|'kept', reason?: string }[], erasedLeaderPixels: number, erasedGlyphPixels: number }}
 *   items: 지운 지시선은 찾은 실제 끝점으로 고친 leader, 확실하지 않은 지시선은 leader: null(원래 선을 그림에 남기고 5E 라벨은 글자만 — 두 줄 방지).
 */
export function eraseLabelsAndLeaders(rgba, W, H, items = [], traceOptions = {}) {
  // 투명한 바탕(PNG 알파)은 흰 종이로 편다 — 투명 점은 RGB가 검정이라 채우기가 검정·흰 줄 자국을 남겼다(시험지 그림은 흰 바탕).
  flattenOnWhite(rgba);
  const luma = lumaOf(rgba, W, H);
  const out = [], leaders = [];
  const traces = [];
  for (const item of items) {
    if (!item?.leader) { out.push({ ...item, leader: null }); continue; }
    let trace;
    try { trace = traceLeaderLine(luma, W, H, item, traceOptions); } catch { trace = { ok: false, reason: 'error' }; }
    const clamp = v => Math.min(1, Math.max(0, v));
    if (!trace.ok) {
      leaders.push({ text: item.text, status: 'kept', reason: trace.reason });
      // LEADERFIX(11-22): 지우지는 않지만 픽셀에서 찾은 선이 있으면 traced로 남긴다(다시 그린 그림의 5E 지시선은 AI 끝점보다 이것을 먼저 쓴다).
      const l = trace.line;
      out.push({ ...item, leader: null, ...(l ? { traced: { x1: clamp(l.start.x / W), y1: clamp(l.start.y / H), x2: clamp(l.end.x / W), y2: clamp(l.end.y / H) } } : {}) });
      continue;
    }
    traces.push(trace);
    leaders.push({ text: item.text, status: 'erased' });
    // LEADERFIX(11-22): 지운 선의 5E 끝은 처음 물체 선에 닿는 자리(그 뒤는 그림에 남김)다. 진한 점이 실제로 끝나는 곳이 더 멀면 traced로 남긴다
    // — 그림을 다시 그리면(남긴 토막도 사라짐) 그쪽이 맞을 수 있다(finalLabelItems가 읽은 끝점에 더 가까운 쪽을 고른다).
    const rawEnd = { x: trace.start.x + trace.ux * (trace.t1 - trace.t0), y: trace.start.y + trace.uy * (trace.t1 - trace.t0) };
    const further = Math.hypot(rawEnd.x - trace.end.x, rawEnd.y - trace.end.y) > 2;
    out.push({ ...item, leader: { x1: clamp(trace.start.x / W), y1: clamp(trace.start.y / H), x2: clamp(trace.end.x / W), y2: clamp(trace.end.y / H) },
      ...(further ? { traced: { x1: clamp(trace.start.x / W), y1: clamp(trace.start.y / H), x2: clamp(rawEnd.x / W), y2: clamp(rawEnd.y / H) } } : {}) });
  }
  // 모든 선을 먼저 찾은 뒤 지운다(앞 선을 지운 자리가 뒤 선 찾기에 영향을 주지 않게).
  let erasedLeaderPixels = 0;
  for (const trace of traces) erasedLeaderPixels += eraseTracedLeader(rgba, W, H, trace);
  const { erasedPixels } = eraseGlyphsInBoxes(rgba, W, H, out);
  return { items: out, leaders, erasedLeaderPixels, erasedGlyphPixels: erasedPixels };
}
