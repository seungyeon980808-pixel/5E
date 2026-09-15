/* ===== RENDER/PEDIGREE: 가계도 (크기박스 계열) =====
 *
 * 규격은 docs/BIO_PARTS_SPEC.md §6. 남=네모, 여=원, 세대선은 직각 꺾임만.
 *
 * ── 배치의 불변식 ──────────────────────────────────────────────────
 * 그림 전체가 크기박스(x, y, w, h) **안에** 들어가야 한다. 그래서 좌표를 먼저
 * "쓸 수 있는 안쪽 띠"로 줄여 놓고 균등 분배한다:
 *   · 세로 여백 = 기호 반지름 + (번호를 켰으면) 번호 한 줄 높이
 *   · 가로 여백 = 기호 반지름
 * 세대 줄은 위 여백~아래 여백 사이를 균등으로 나누고(2세대만이면 2줄, 3세대까지면 3줄),
 * 형제는 남은 가로 폭을 균등으로 나눈다. 3세대는 부모 부부의 중점에 모으되, 상자를
 * 벗어나지 않도록 중심을 되밀어 넣는다(clamp).
 *
 * ── 번호 ──────────────────────────────────────────────────────────
 * 그리는 순서대로 1부터: 1세대 부부(1,2) → 2세대 자녀들 → (3세대가 있으면)
 * 2세대 배우자 → 3세대 자녀들. 홀수 번호 = 남(네모), 짝수 번호 = 여(원).
 * 다만 2세대 배우자만은 예외로 짝(3세대 부모)의 **반대 성**으로 둔다 — 부부가
 * 같은 기호로 나오면 가계도로서 틀린 그림이 되기 때문이다.
 *
 * ── 채우기 ────────────────────────────────────────────────────────
 * 무늬(hatch/cross)는 공용 makeFillPattern(js/render/fill.js)으로 만든다. 그 함수는
 * 객체 하나당 패턴 하나(id = pat_{obj.id})를 전제하는데 가계도는 발현·보인자 두 벌이
 * 필요하므로, id만 갈아 끼운 **대역 객체**를 넘겨 두 개를 받아 이 <g> 안의 <defs>에
 * 넣는다. 대역 객체의 type은 "ellipse"로 준다 — fill.js의 isFillable()이 통과시키는
 * 타입이어야 하고, ellipse가 이미 원에 패턴을 붙이는 검증된 경로다(shapes.js:62).
 */

import { SVG_NS, grayHex, cText } from "./core.js?v=1.4.0";
import { makeFillPattern } from "./fill.js?v=1.4.0";

const DEFAULT_SYMBOL_RADIUS = 2.6;
const GRAY_FILL = grayHex(217);   // #d9d9d9 — "gray" 채우기 (bilayer 단백질과 같은 값)

/* ----- "1,4,6" → Set{1,4,6} ----- */
function parseNums(str) {
  const out = new Set();
  String(str ?? "").split(",").forEach((s) => {
    const n = parseInt(s.trim(), 10);
    if (Number.isFinite(n) && n > 0) out.add(n);
  });
  return out;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ===== 배치 계산 =====
 * 렌더·bbox·(나중의) 클릭 판정이 모두 이 한 함수를 쓴다.
 * 반환 { symbols:[{n, cx, cy, male, fill, role}], lines:[{x1,y1,x2,y2}], r, numSize, rows }
 */
export function pedigreeLayout(obj) {
  const x = Number(obj.x) || 0;
  const y = Number(obj.y) || 0;
  const w = Math.max(1, Number(obj.w) || 1);
  const h = Math.max(1, Number(obj.h) || 1);

  const n2 = clamp(Math.round(Number(obj.gen2Kids ?? 3)) || 0, 1, 12);
  const n3 = clamp(Math.round(Number(obj.gen3Kids ?? 0)) || 0, 0, 12);
  const rows = n3 > 0 ? 3 : 2;

  const showNumbers = obj.showNumbers !== false;
  // 기호가 상자를 넘지 않게 반지름도 상자 크기로 한 번 조인다.
  const rWant = Number(obj.symbolRadius);
  let r = Number.isFinite(rWant) && rWant > 0 ? rWant : DEFAULT_SYMBOL_RADIUS;
  r = Math.min(r, w / (2 * (n2 + 1)) * 1.6, h / (rows * 3.2));
  r = Math.max(0.5, r);

  const numSize = Math.max(1.6, r * 0.95);
  const numGap = numSize * 1.2;                       // 기호 아래 번호가 차지하는 세로 폭
  const padY = r + (showNumbers ? numGap : 0);
  const padX = r;

  // 세대 줄 y — 위 여백 ~ 아래 여백 사이 균등
  const top = y + padY;
  const bot = y + h - padY;
  const rowY = [];
  for (let i = 0; i < rows; i += 1) rowY.push(rows === 1 ? (top + bot) / 2 : top + ((bot - top) * i) / (rows - 1));

  // 2세대 형제 x — 남은 가로 폭 균등
  const left = x + padX;
  const right = x + w - padX;
  const kidX = [];
  for (let j = 0; j < n2; j += 1) kidX.push(n2 === 1 ? (left + right) / 2 : left + ((right - left) * j) / (n2 - 1));

  const symbols = [];
  const lines = [];
  const affected = parseNums(obj.affected);
  const carrier = parseNums(obj.carrier);
  const affFill = obj.affectedFill || "hatch";
  const carFill = obj.carrierFill || "gray";

  const push = (n, cx, cy, male) => {
    let fill = "solid", role = "none";
    if (affected.has(n)) { fill = affFill; role = "affected"; }
    else if (carrier.has(n)) { fill = carFill; role = "carrier"; }
    symbols.push({ n, cx, cy, male, fill, role });
    return symbols[symbols.length - 1];
  };
  const hLine = (x1, x2, yy) => lines.push({ x1, y1: yy, x2, y2: yy });
  const vLine = (xx, y1, y2) => lines.push({ x1: xx, y1, x2: xx, y2 });

  /* ----- 1세대 부부 (1 = 남/네모, 2 = 여/원) ----- */
  const midX = (kidX[0] + kidX[n2 - 1]) / 2;
  let gap1 = clamp(r * 4, r * 2.6, Math.max(r * 2.6, w - 2 * padX));
  const husbandX = midX - gap1 / 2;
  const wifeX = midX + gap1 / 2;
  push(1, husbandX, rowY[0], true);
  push(2, wifeX, rowY[0], false);
  hLine(husbandX + r, wifeX - r, rowY[0]);           // 부부 수평선

  /* ----- 1세대 → 2세대: 중점 수직선 + 형제 수평선 + 자녀별 수직선 ----- */
  const bus1 = (rowY[0] + rowY[1]) / 2;
  vLine(midX, rowY[0], bus1);
  if (n2 > 1) hLine(kidX[0], kidX[n2 - 1], bus1);
  for (let j = 0; j < n2; j += 1) vLine(kidX[j], bus1, rowY[1] - r);

  /* ----- 2세대 자녀 (번호 3 …) ----- */
  const kidNum = [];
  for (let j = 0; j < n2; j += 1) {
    const n = 3 + j;
    kidNum.push(n);
    push(n, kidX[j], rowY[1], n % 2 === 1);
  }

  /* ----- 3세대 ----- */
  if (n3 > 0) {
    const pi = clamp(Math.round(Number(obj.gen3Parent ?? 0)) || 0, 0, n2 - 1);
    const parentX = kidX[pi];
    const parentMale = kidNum[pi] % 2 === 1;

    // 배우자는 오른쪽에 두되, 상자를 넘으면 왼쪽으로 붙인다.
    const gap2 = clamp(r * 3.4, r * 2.6, Math.max(r * 2.6, (right - left) / 2 || r * 2.6));
    let spouseX = parentX + gap2;
    if (spouseX > right) spouseX = parentX - gap2;
    spouseX = clamp(spouseX, left, right);

    const spouseN = 3 + n2;
    push(spouseN, spouseX, rowY[1], !parentMale);     // 부부는 서로 반대 성
    hLine(Math.min(parentX, spouseX) + r, Math.max(parentX, spouseX) - r, rowY[1]);

    // 3세대 자녀: 부부 중점에 모으고, 상자 안으로 되민다.
    const cMid = (parentX + spouseX) / 2;
    const span = right - left;
    const step = n3 > 1 ? Math.min(span / (n3 - 1), r * 4) : 0;
    const total = step * (n3 - 1);
    const c3 = total >= span ? (left + right) / 2 : clamp(cMid, left + total / 2, right - total / 2);
    const g3X = [];
    for (let j = 0; j < n3; j += 1) g3X.push(c3 - total / 2 + step * j);

    const bus2 = (rowY[1] + rowY[2]) / 2;
    vLine(cMid, rowY[1], bus2);
    if (n3 > 1) hLine(g3X[0], g3X[n3 - 1], bus2);
    for (let j = 0; j < n3; j += 1) vLine(g3X[j], bus2, rowY[2] - r);

    for (let j = 0; j < n3; j += 1) {
      const n = spouseN + 1 + j;
      push(n, g3X[j], rowY[2], n % 2 === 1);
    }
  }

  return { symbols, lines, r, numSize, numGap, rows, showNumbers, box: { x, y, w, h } };
}

/* 크기박스 계열이므로 bbox는 상자 그대로다(배치가 상자 안에 들어가도록 계산돼 있다). */
export function pedigreeBBox(obj) {
  const x = Number(obj.x) || 0;
  const y = Number(obj.y) || 0;
  const w = Math.max(0, Number(obj.w) || 0);
  const h = Math.max(0, Number(obj.h) || 0);
  return { x, y, w, h };
}

/* 무늬 채우기용 대역 객체 → 공용 makeFillPattern
 * 주의: makeFillPattern은 패턴 id를 스스로 `pat_${id}`로 짓는다. 그래서 여기엔
 * 접두사 없는 키(`{objId}_{style}`)를 넘기고, 참조는 `pat_{objId}_{style}`로 한다. */
function patternFor(obj, style, key, r) {
  if (!key) return null;
  const tile = Number.isFinite(obj.fillTile) ? obj.fillTile : Math.max(0.8, r * 0.9);
  return makeFillPattern({
    id: key,
    type: "ellipse",              // fill.js isFillable() 통과용 (원에 패턴이 붙는 검증된 경로)
    fillStyle: style,
    fillLevel: obj.fillLevel ?? 0,
    fillTile: tile,
  });
}

/* 채우기 스타일 → SVG fill 값 */
function fillValue(style, patIds) {
  if (style === "gray") return GRAY_FILL;
  if ((style === "hatch" || style === "cross") && patIds[style]) return `url(#${patIds[style]})`;
  return "#ffffff";               // "solid" 및 알 수 없는 값 = 흰색
}

export function renderPedigree(obj) {
  const stroke = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.35;
  const g = document.createElementNS(SVG_NS, "g");

  const L = pedigreeLayout(obj);

  /* ----- 무늬 정의: 이 그림에서 실제로 쓰는 것만 만든다 ----- */
  const used = new Set(L.symbols.map((s) => s.fill));
  const patIds = {};
  if (obj.id) {
    const defs = document.createElementNS(SVG_NS, "defs");
    for (const style of ["hatch", "cross"]) {
      if (!used.has(style)) continue;
      const key = `${obj.id}_${style}`;
      const pat = patternFor(obj, style, key, L.r);
      if (pat) { defs.appendChild(pat); patIds[style] = `pat_${key}`; }
    }
    if (defs.childNodes.length) g.appendChild(defs);
  }

  /* ----- 세대선 (직각 꺾임만) ----- */
  for (const ln of L.lines) {
    if (ln.x1 === ln.x2 && ln.y1 === ln.y2) continue;
    const el = document.createElementNS(SVG_NS, "line");
    el.setAttribute("x1", ln.x1); el.setAttribute("y1", ln.y1);
    el.setAttribute("x2", ln.x2); el.setAttribute("y2", ln.y2);
    el.setAttribute("stroke", stroke);
    el.setAttribute("stroke-width", sw);
    el.setAttribute("stroke-linecap", "square");
    g.appendChild(el);
  }

  /* ----- 기호 ----- */
  for (const s of L.symbols) {
    const fill = fillValue(s.fill, patIds);
    let el;
    if (s.male) {
      el = document.createElementNS(SVG_NS, "rect");
      el.setAttribute("x", s.cx - L.r);
      el.setAttribute("y", s.cy - L.r);
      el.setAttribute("width", L.r * 2);
      el.setAttribute("height", L.r * 2);
    } else {
      el = document.createElementNS(SVG_NS, "circle");
      el.setAttribute("cx", s.cx);
      el.setAttribute("cy", s.cy);
      el.setAttribute("r", L.r);
    }
    el.setAttribute("fill", fill);
    el.setAttribute("stroke", stroke);
    el.setAttribute("stroke-width", sw);
    g.appendChild(el);
  }

  /* ----- 번호: 기호 바로 아래 가운데 ----- */
  if (L.showNumbers) {
    for (const s of L.symbols) {
      cText(g, s.cx, s.cy + L.r + L.numSize * 0.72, String(s.n), L.numSize, stroke, null, null, "label");
    }
  }

  if (obj.rotation) {
    const b = pedigreeBBox(obj);
    g.setAttribute("transform", `rotate(${obj.rotation} ${b.x + b.w / 2} ${b.y + b.h / 2})`);
  }
  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
}
