// GENSPEED(11-20) 「이 그림 고치기」의 글자만 고치는 빠른 길(화면 쪽, 캔버스): 그림을 AI로 다시 그리지 않고
// 고칠 곳 찾기가 알려 준 글자 상자 안의 글자만 지우고(eraseGlyphsInBoxes, 라벨 살리기와 같은 조각),
// 바꾸기면 그 자리에 새 글자를 5E 라벨 글꼴로 그려 넣는다. 엔진(js/ai-figure/edit.js)이 ctx.localEdit로 부른다.
import { eraseGlyphsInBoxes } from './ai-create-chat.js?v=1.7.0-four-session-integration';
import { EQUATION_FONT_FAMILY, OBJECT_LABEL_TEXT_FONT_FAMILY } from './state.js?v=1.7.0-four-session-integration';

/** 글자 종류 → 글꼴(라벨 살리기와 같은 짝: 물리량 기울임 수식 글꼴, 숫자·단위·화학식 바로 선 수식 글꼴, 이름·한글 명조). */
export function localEditFont(kind) {
  if (kind === 'qty') return { family: EQUATION_FONT_FAMILY, italic: true };
  if (kind === 'math') return { family: EQUATION_FONT_FAMILY, italic: false };
  return { family: OBJECT_LABEL_TEXT_FONT_FAMILY, italic: false };
}

/** 「m_A」「v_{0}」「n_유리」 → [{ text, sub }] 조각(아래첨자 하나까지). 위첨자·복잡한 식은 그대로 한 조각. */
export function splitSubscript(text) {
  const m = String(text).match(/^(.*?)_(\{([^}]*)\}|(.))(.*)$/u);
  if (!m) return [{ text: String(text), sub: false }];
  const out = [];
  if (m[1]) out.push({ text: m[1], sub: false });
  out.push({ text: m[3] ?? m[4], sub: true });
  if (m[5]) out.push(...splitSubscript(m[5]));
  return out;
}

async function decode(dataUrl, doc) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = doc.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0);
  return { c, g };
}

function inkColor(rgba, width, box, W, H) {
  // 지우기 전 상자 안 가장 진한 점들의 평균(보통 검정에 가까운 회색) — 새 글자를 같은 진하기로.
  const x0 = Math.max(0, Math.floor(box.x * W)), y0 = Math.max(0, Math.floor(box.y * H));
  const x1 = Math.min(W - 1, Math.ceil((box.x + box.w) * W)), y1 = Math.min(H - 1, Math.ceil((box.y + box.h) * H));
  let best = 255;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * width + x) * 4;
    best = Math.min(best, Math.round(rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114));
  }
  const v = Math.min(60, best);
  return `rgb(${v},${v},${v})`;
}

function drawRuns(g, runs, font, sizePx0, cx, cy, color, align = 'center', maxWidth = Infinity, strokePx = 0) {
  // 아래첨자는 바로 선 작은 글자(5E 라벨 규칙: 첨자는 바로 선 글자).
  const fontOf = (r, px) => `${!r.sub && font.italic ? 'italic ' : ''}${r.sub ? Math.round(px * 0.62) : px}px ${font.family}`;
  const widthAt = (px) => runs.reduce((a, r) => { g.font = fontOf(r, px); return a + g.measureText(r.text).width; }, 0);
  // 새 글자가 옛 글자 폭보다 넓으면 먼저 가로만 조금(최대 12%) 좁히고, 그래도 넓으면 크기를 줄인다
  // (11-20 심사: 「Mg가 전극 테두리와 겹침」, 크기를 줄이니 「숫자가 원본보다 작아짐」).
  let sizePx = sizePx0, squeeze = 1;
  const w0 = widthAt(sizePx);
  if (w0 > maxWidth) {
    squeeze = Math.max(0.88, maxWidth / w0);
    if (w0 * squeeze > maxWidth) sizePx = Math.max(8, Math.floor(sizePx * maxWidth / (w0 * squeeze)));
  }
  const total = widthAt(sizePx) * squeeze;
  const left = align === 'left' ? cx : cx - total / 2;
  g.save();
  g.translate(left, cy);
  g.scale(squeeze, 1);
  g.fillStyle = color; g.strokeStyle = color; g.lineJoin = 'round'; g.textBaseline = 'middle'; g.textAlign = 'left';
  let x = 0;
  for (const r of runs) {
    g.font = fontOf(r, sizePx);
    const y = r.sub ? sizePx * 0.32 : 0;
    g.fillText(r.text, x, y);
    if (strokePx > 0) { g.lineWidth = strokePx; g.strokeText(r.text, x, y); }
    x += g.measureText(r.text).width;
  }
  g.restore();
  return { x0: Math.floor(left), x1: Math.ceil(left + total), sizePx };
}

const darkCount = (data, W, x0, y0, x1, y1) => {
  let n = 0;
  for (let y = Math.max(0, y0); y <= y1; y++) for (let x = Math.max(0, x0); x <= x1; x++) {
    const i = (y * W + x) * 4;
    if (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 < 128) n++;
  }
  return n;
};

/** 지운 자리 메우기(11-20 심사: 흰색으로 평평하게 메우면 둘레의 옅은 종이 결과 달라 글자 모양이 희미하게 보임).
 *  지운 점과 그 둘레 번짐(종이보다 어두운 점, 최대 9점)을 바로 옆의 깨끗한 종이 조각을 옮겨 메운다(종이 결까지 맞음).
 *  옆에 깨끗한 조각이 없으면 둘레 종이의 가운데값 한 색으로 칠한다.
 *  지우지 않은 진한 점(남길 선)과 그 바로 옆 점은 건드리지 않는다. */
function blendErased(before, rgba, W, H, op) {
  const pad = 0.3;
  const x0 = Math.max(0, Math.floor((op.x - op.w * pad) * W)), y0 = Math.max(0, Math.floor((op.y - op.h * pad) * H));
  const x1 = Math.min(W - 1, Math.ceil((op.x + op.w * (1 + pad)) * W)), y1 = Math.min(H - 1, Math.ceil((op.y + op.h * (1 + pad)) * H));
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const at = (x, y) => (y * W + x) * 4;
  const lum = (a, i) => a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114;
  const changed = new Uint8Array(w * h);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = at(x, y);
    if (Math.abs(before[i] - rgba[i]) + Math.abs(before[i + 1] - rgba[i + 1]) + Math.abs(before[i + 2] - rgba[i + 2]) > 6) changed[(y - y0) * w + (x - x0)] = 1;
  }
  // 남길 선: 지우지 않은 진한 점
  const keepDark = (lx, ly) => !changed[ly * w + lx] && lum(rgba, at(lx + x0, ly + y0)) < 170;
  const nearKeep = (lx, ly) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = lx + dx, ny = ly + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && keepDark(nx, ny)) return true; } return false; };
  const mask = changed.slice();
  for (let pass = 0; pass < 3; pass++) {
    const grow = [];
    for (let ly = 0; ly < h; ly++) for (let lx = 0; lx < w; lx++) {
      const k = ly * w + lx;
      if (mask[k] || nearKeep(lx, ly)) continue;
      if ((lx > 0 && mask[k - 1]) || (lx < w - 1 && mask[k + 1]) || (ly > 0 && mask[k - w]) || (ly < h - 1 && mask[k + w])) grow.push(k);
    }
    for (const k of grow) mask[k] = 1;
  }
  // 바탕 견본: 메울 곳에서 3~8점 떨어진 고리의 밝은 점(글자 번짐을 피함).
  const ringOf = () => {
    const out = [];
    for (let ly = 0; ly < h; ly++) for (let lx = 0; lx < w; lx++) {
      const k = ly * w + lx;
      if (mask[k]) continue;
      let dmin = 99;
      for (let dy = -8; dy <= 8 && dmin > 2; dy++) for (let dx = -8; dx <= 8; dx++) {
        const nx = lx + dx, ny = ly + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || !mask[ny * w + nx]) continue;
        dmin = Math.min(dmin, Math.max(Math.abs(dx), Math.abs(dy)));
      }
      if (dmin < 3 || dmin > 8) continue;
      const i = at(lx + x0, ly + y0);
      if (lum(rgba, i) < 170 || nearKeep(lx, ly)) continue;
      out.push(i);
    }
    return out;
  };
  let ring = ringOf();
  if (ring.length < 12) return;
  const median = (arr) => { const v = arr.slice().sort((a, b) => a - b); return v[v.length >> 1]; };
  const paper = median(ring.map((i) => lum(rgba, i)));
  // 글자 둘레의 옅은 번짐(종이보다 조금 어둡거나, 회색 면 위에서는 조금 밝은 테)은 6점 더 메울 곳에 넣는다 — 남은 번짐이 글자 윤곽으로 보였음(11-20 심사).
  for (let pass = 0; pass < 6; pass++) {
    const grow = [];
    for (let ly = 0; ly < h; ly++) for (let lx = 0; lx < w; lx++) {
      const k = ly * w + lx;
      if (mask[k] || nearKeep(lx, ly)) continue;
      if (!((lx > 0 && mask[k - 1]) || (lx < w - 1 && mask[k + 1]) || (ly > 0 && mask[k - w]) || (ly < h - 1 && mask[k + w]))) continue;
      const v = lum(rgba, at(lx + x0, ly + y0));
      if (v >= 170 && Math.abs(v - paper) > 2.5) grow.push(k);
    }
    if (!grow.length) break;
    for (const k of grow) mask[k] = 1;
  }
  // 메울 곳과 같은 모양의 깨끗한 종이 조각을 바로 옆(위·아래·왼·오른)에서 옮겨 온다 — 종이 결(얼룩 무늬)까지 맞는다.
  let mx0 = w, my0 = h, mx1 = -1, my1 = -1;
  for (let k = 0; k < mask.length; k++) if (mask[k]) { const lx = k % w, ly = (k - lx) / w; if (lx < mx0) mx0 = lx; if (lx > mx1) mx1 = lx; if (ly < my0) my0 = ly; if (ly > my1) my1 = ly; }
  const mw = mx1 - mx0 + 1, mh = my1 - my0 + 1;
  const shifts = [[0, -(mh + 6)], [0, mh + 6], [-(mw + 6), 0], [mw + 6, 0], [-(mw + 6), -(mh + 6)], [mw + 6, mh + 6]];
  for (const [sx, sy] of shifts) {
    let ok = true, sum = 0, n = 0;
    for (let k = 0; k < mask.length && ok; k++) {
      if (!mask[k]) continue;
      const gx = (k % w) + x0 + sx, gy = Math.floor(k / w) + y0 + sy;
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) { ok = false; break; }
      const v = lum(rgba, at(gx, gy));
      // 바탕만 있는 조각이어야 한다(선·글자·다른 회색 면이 섞이면 안 됨)
      if (Math.abs(v - paper) > 6) { ok = false; break; }
      sum += v; n++;
    }
    if (!ok || !n || Math.abs(sum / n - paper) > 1.5) continue;
    for (let k = 0; k < mask.length; k++) {
      if (!mask[k]) continue;
      const i = at(k % w + x0, Math.floor(k / w) + y0), j2 = at(k % w + x0 + sx, Math.floor(k / w) + y0 + sy);
      rgba[i] = rgba[j2]; rgba[i + 1] = rgba[j2 + 1]; rgba[i + 2] = rgba[j2 + 2]; rgba[i + 3] = 255;
    }
    return;
  }
  // 깨끗한 조각이 없으면(선이 빽빽하거나 좁은 회색 띠 위): 둘레 종이의 가운데값 한 색으로 칠한다
  // (점을 무작위로 옮기면 회색 면 위에서 희끗희끗한 얼룩이 됨 — 11-20 심사).
  ring = ringOf();
  const clean = ring.filter((i) => Math.abs(lum(rgba, i) - paper) <= 4);
  const pool = clean.length >= 12 ? clean : ring;
  if (!pool.length) return;
  const mid = (c) => { const v = pool.map((i) => rgba[i + c]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const r = mid(0), gg = mid(1), b = mid(2);
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k]) continue;
    const i = at(k % w + x0, Math.floor(k / w) + y0);
    rgba[i] = r; rgba[i + 1] = gg; rgba[i + 2] = b; rgba[i + 3] = 255;
  }
}

/** 지우기 전후로 바뀐 점들의 상자(px). 없으면 null. */
function changedBox(before, after, W, H, op) {
  const pad = 0.3;
  const x0 = Math.max(0, Math.floor((op.x - op.w * pad) * W)), y0 = Math.max(0, Math.floor((op.y - op.h * pad) * H));
  const x1 = Math.min(W - 1, Math.ceil((op.x + op.w * (1 + pad)) * W)), y1 = Math.min(H - 1, Math.ceil((op.y + op.h * (1 + pad)) * H));
  let bx0 = Infinity, by0 = Infinity, bx1 = -1, by1 = -1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * W + x) * 4;
    if (Math.abs(before[i] - after[i]) + Math.abs(before[i + 1] - after[i + 1]) + Math.abs(before[i + 2] - after[i + 2]) < 90) continue;
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
  }
  return bx1 < 0 ? null : { x0: bx0, y0: by0, x1: bx1, y1: by1 };
}

/** 옛 글자 상자 높이에 맞는 글자 크기(px): 옛 글자를 100px로 재어 비례. */
function fitSize(g, font, oldText, boxHpx) {
  g.font = `${font.italic ? 'italic ' : ''}100px ${font.family}`;
  const m = g.measureText(String(oldText).replace(/_\{?[^}]*\}?/u, '') || 'A');
  const hh = (m.actualBoundingBoxAscent || 70) + (m.actualBoundingBoxDescent || 0);
  return Math.max(8, Math.min(400, Math.round(100 * boxHpx / Math.max(20, hh))));
}

async function cropPair(beforeUrl, afterCanvas, ops, doc) {
  const W = afterCanvas.width, H = afterCanvas.height;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const o of ops) {
    const m = Math.max(48, Math.max(o.w * W, o.h * H) * 1.5);
    x0 = Math.min(x0, o.x * W - m); y0 = Math.min(y0, o.y * H - m);
    x1 = Math.max(x1, (o.x + o.w) * W + m); y1 = Math.max(y1, (o.y + o.h) * H + m);
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
  const w = x1 - x0, h = y1 - y0;
  if (!(w > 0 && h > 0)) return null;
  const { c: before } = await decode(beforeUrl, doc);
  const cut = (src) => { const k = doc.createElement('canvas'); k.width = w; k.height = h; k.getContext('2d').drawImage(src, x0, y0, w, h, 0, 0, w, h); return k.toDataURL('image/png'); };
  return { before: cut(before), after: cut(afterCanvas), box: { x: x0 / W, y: y0 / H, w: w / W, h: h / H } };
}

/**
 * @param {string} dataUrl 앞 그림(PNG data URL)
 * @param {{ op: 'remove'|'replace', text: string, to?: string, kind?: string, x: number, y: number, w: number, h: number }[]} ops
 * @returns {Promise<{ image: string, applied: boolean, erased: number[], crops: { before: string, after: string, box: object } | null }>} applied: 모든 상자에서 글자를 찾아 지웠는지
 */
export async function applyLocalTextEdits(dataUrl, ops = [], { document: doc = globalThis.document } = {}) {
  if (!doc) throw new Error('캔버스를 쓸 수 없습니다.');
  const { c, g } = await decode(dataUrl, doc);
  const W = c.width, H = c.height;
  const data = g.getImageData(0, 0, W, H);
  const erased = [], colors = [], inks = [];
  for (const op of ops) {
    colors.push(inkColor(data.data, W, op, W, H));
    const before = data.data.slice();
    const n = eraseGlyphsInBoxes(data.data, W, H, [op]).erasedPixels;
    erased.push(n);
    const ink = n && op.op === 'replace' ? changedBox(before, data.data, W, H, op) : null;
    // 옛 글자의 진하기(가로 한 점당 진한 점 수) — 새 글자 획 굵기를 맞출 때 쓴다.
    if (ink) ink.density = darkCount(before, W, ink.x0, ink.y0, ink.x1, ink.y1) / Math.max(1, ink.x1 - ink.x0 + 1);
    inks.push(ink);
    if (n) blendErased(before, data.data, W, H, op);
  }
  g.putImageData(data, 0, 0);
  const replaces = ops.filter((o) => o.op === 'replace');
  if (replaces.length && doc.fonts?.load) {
    await Promise.all(replaces.map((o) => { const f = localEditFont(o.kind); return doc.fonts.load(`${f.italic ? 'italic ' : ''}40px ${f.family}`, o.to).catch(() => null); }));
  }
  ops.forEach((op, i) => {
    if (op.op !== 'replace' || !erased[i]) return;
    const font = localEditFont(op.kind);
    // 크기·자리는 AI 상자가 아니라 실제로 지운 글자 잉크 상자에 맞춘다(AI 상자는 여유가 들쭉날쭉).
    const ink = inks[i] || { x0: op.x * W, y0: op.y * H, x1: (op.x + op.w) * W, y1: (op.y + op.h) * H };
    const size = fitSize(g, font, op.text, ink.y1 - ink.y0 + 1);
    // 왼쪽 끝을 옛 글자 왼쪽 끝에 맞춘다(지시선 끝에 붙은 라벨이 선을 덮지 않게).
    // 숫자와 단위 사이 띄어쓰기는 시험지처럼 좁은 칸(U+2009)으로.
    const runs = splitSubscript(op.kind === 'math' || op.kind === 'qty' ? op.to.replace(/ /g, '\u2009') : op.to), cy = (ink.y0 + ink.y1) / 2, maxW = (ink.x1 - ink.x0 + 1) * 1.08;
    // 획 굵기: 테두리 없이·얇게·조금·더 굵게 그려 보고 옛 글자 진하기에 가장 가까운 것을 쓴다(11-20 심사: 「Mg 획이 Cu보다 가늘다」).
    const ry0 = Math.max(0, Math.floor(ink.y0 - size)), ry1 = Math.min(H - 1, Math.ceil(ink.y1 + size));
    const rx0 = Math.max(0, Math.floor(ink.x0 - 2)), rx1 = Math.min(W - 1, Math.ceil(ink.x0 + maxW * 1.2 + 4));
    const saved = g.getImageData(rx0, ry0, rx1 - rx0 + 1, ry1 - ry0 + 1);
    let best = null;
    for (const k of ink.density ? [0, 0.025, 0.05, 0.075, 0.1] : [0]) {
      g.putImageData(saved, rx0, ry0);
      const box = drawRuns(g, runs, font, size, ink.x0, cy, colors[i], 'left', maxW, k * size);
      if (!ink.density) { best = { k }; break; }
      const now = g.getImageData(rx0, ry0, rx1 - rx0 + 1, ry1 - ry0 + 1);
      const dens = darkCount(now.data, now.width, box.x0 - rx0, 0, Math.min(now.width - 1, box.x1 - rx0), now.height - 1) / Math.max(1, box.x1 - box.x0 + 1);
      const err = Math.abs(dens - ink.density);
      if (!best || err < best.err) best = { k, err };
    }
    g.putImageData(saved, rx0, ry0);
    drawRuns(g, runs, font, size, ink.x0, cy, colors[i], 'left', maxW, best.k * size);
  });
  // 확인용 조각: 고친 자리 둘레만 잘라 고치기 전·뒤 두 장(그림 전체를 보이면 확인 AI가 먼 라벨이 사라졌다고 잘못 말함 — 11-20 실제 실행 3번 중 2번).
  const crops = cropPair(dataUrl, c, ops, doc);
  return { image: c.toDataURL('image/png'), applied: ops.length > 0 && erased.every((n) => n > 0), erased, crops: await crops };
}
