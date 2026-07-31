/* ===== RENDER/CHEMMODEL: 원자·모형 가족 (크기박스 계열) =====
 *
 * 규격은 docs/CHEM_PARTS_SPEC.md §0 + §2. 그림의 정본은
 * docs/chem-parts-proposal.html 의 atomSVG · shellSVG · crystBallStick/crystCut/
 * graphiteSVG · MOLS/bondLines/molSVG · VALENCE/lewisSVG 다.
 *
 * ── 좌표 (가장 중요) ──────────────────────────────────────────────
 * 시안은 40×40(분자만 40×42) 고정 좌표계로 그려져 있다. 이 파일은 그 좌표를
 * **크기박스 안에 균등(uniform) 배율로 끼워 넣는다**:
 *
 *   k  = min(w / VBw, h / VBh)          ← 가로·세로를 따로 늘리지 않는다
 *   ox = x + w/2 - VBw/2 * k            ← 남는 쪽은 여백으로 두고 가운데 맞춤
 *
 * 가로·세로를 따로 늘리면 **원자 구슬이 타원이 되고 글자가 찌그러진다**. 그래서
 * 상자가 정사각이 아니면 그림은 짧은 변에 맞춰 들어가고 나머지는 여백이 된다.
 * bbox 는 그래도 상자 그대로다(선택·이동은 상자 기준).
 *
 * ── 선 굵기 ───────────────────────────────────────────────────────
 * 거리(반지름·간격)는 k 로 스케일하지만 **선 굵기는 스케일하지 않는다.** 시안의
 * 굵기 값들(0.4 / 0.35 / 0.28 / 0.25 / 0.22 / 0.2)은 기본 굵기 0.35 를 기준으로
 * 잡힌 값이므로, 여기서는 전부 `sw * (시안값 / 0.35)` 로 환산한다.
 * 그래서 obj.strokeWidth 를 올리면 그림 전체가 같은 비율로 굵어진다.
 * 결합선은 명세대로 0.28 → sw * 0.8, 다중결합 간격 1.3(시안 좌표) → 1.3 * k.
 *
 * ── 글자 ──────────────────────────────────────────────────────────
 * 전부 renderGraphLabel 로 그린다(아래첨자·위첨자 자동). 변환 <g> 안에 넣지 않고
 * **절대 좌표로 계산해서** 넣기 때문에 상자를 어떻게 늘려도 글자가 안 찌그러진다.
 *
 * ── 음영 구슬의 gradient id ───────────────────────────────────────
 * 한 화면에 같은 부품이 여러 개 놓이므로 <radialGradient> id 는 반드시 obj.id 로
 * 유니크하게 만든다. 고정 id 를 쓰면 나중에 그려진 것이 앞의 것을 덮어써서
 * 서로 뭉개진다(문서 전역 id 이므로).
 */

import { SVG_NS, grayHex } from "./core.js?v=1.3.0";
import { renderGraphLabel } from "./graph-label.js?v=1.3.0";

export const CHEMMODEL_KINDS = ["atom", "shell", "lattice", "molecule", "lewis"];

/* ----- 분자 20종 (시안 MOLS 그대로) -----
 *   geo  di(2원자) | linear | bent | trig | pyr | tet
 *   c    중심 원자 기호 · l[] 리간드 { s: 기호, o: 결합차수 } · ang 기본 결합각
 */
export const MOLECULES = {
  H2:   { geo: "di", c: "H", l: [{ s: "H", o: 1 }], ko: "수소" },
  O2:   { geo: "di", c: "O", l: [{ s: "O", o: 2 }], ko: "산소" },
  N2:   { geo: "di", c: "N", l: [{ s: "N", o: 3 }], ko: "질소" },
  HF:   { geo: "di", c: "F", l: [{ s: "H", o: 1 }], ko: "플루오린화 수소" },
  HCl:  { geo: "di", c: "Cl", l: [{ s: "H", o: 1 }], ko: "염화 수소" },
  CO:   { geo: "di", c: "C", l: [{ s: "O", o: 3 }], ko: "일산화 탄소" },
  CO2:  { geo: "linear", c: "C", l: [{ s: "O", o: 2 }, { s: "O", o: 2 }], ang: 180, ko: "이산화 탄소" },
  BeF2: { geo: "linear", c: "Be", l: [{ s: "F", o: 1 }, { s: "F", o: 1 }], ang: 180, ko: "플루오린화 베릴륨" },
  HCN:  { geo: "linear", c: "C", l: [{ s: "H", o: 1 }, { s: "N", o: 3 }], ang: 180, ko: "사이안화 수소" },
  H2O:  { geo: "bent", c: "O", l: [{ s: "H", o: 1 }, { s: "H", o: 1 }], ang: 104.5, ko: "물" },
  H2S:  { geo: "bent", c: "S", l: [{ s: "H", o: 1 }, { s: "H", o: 1 }], ang: 92, ko: "황화 수소" },
  SO2:  { geo: "bent", c: "S", l: [{ s: "O", o: 2 }, { s: "O", o: 2 }], ang: 119, ko: "이산화 황" },
  O3:   { geo: "bent", c: "O", l: [{ s: "O", o: 2 }, { s: "O", o: 1 }], ang: 117, ko: "오존" },
  BF3:  { geo: "trig", c: "B", l: [{ s: "F", o: 1 }, { s: "F", o: 1 }, { s: "F", o: 1 }], ang: 120, ko: "삼플루오린화 붕소" },
  SO3:  { geo: "trig", c: "S", l: [{ s: "O", o: 2 }, { s: "O", o: 2 }, { s: "O", o: 2 }], ang: 120, ko: "삼산화 황" },
  NH3:  { geo: "pyr", c: "N", l: [{ s: "H", o: 1 }, { s: "H", o: 1 }, { s: "H", o: 1 }], ang: 107, ko: "암모니아" },
  NF3:  { geo: "pyr", c: "N", l: [{ s: "F", o: 1 }, { s: "F", o: 1 }, { s: "F", o: 1 }], ang: 102, ko: "삼플루오린화 질소" },
  CH4:  { geo: "tet", c: "C", l: [{ s: "H", o: 1 }, { s: "H", o: 1 }, { s: "H", o: 1 }, { s: "H", o: 1 }], ang: 109.5, ko: "메테인" },
  CCl4: { geo: "tet", c: "C", l: [{ s: "Cl", o: 1 }, { s: "Cl", o: 1 }, { s: "Cl", o: 1 }, { s: "Cl", o: 1 }], ang: 109.5, ko: "사염화 탄소" },
  C2H2: { geo: "linear", c: "C", l: [{ s: "C", o: 3 }, { s: "H", o: 1 }], ang: 180, ko: "아세틸렌(부분)" },
};

const GEO_KO = { di: "2원자", linear: "선형", bent: "굽은형", trig: "평면 삼각형", pyr: "삼각뿔형", tet: "사면체형" };

/* ----- 원자가 전자 수 H~Ar (시안 VALENCE 그대로) ----- */
export const VALENCE = {
  H: 1, He: 2, Li: 1, Be: 2, B: 3, C: 4, N: 5, O: 6, F: 7, Ne: 8,
  Na: 1, Mg: 2, Al: 3, Si: 4, P: 5, S: 6, Cl: 7, Ar: 8,
};

/* 결정 격자 투영 상수 (시안 CA/COX/COY) — 시안 40 좌표계 기준 */
const CA = 13, COX = 12, COY = 30;

/* 시안이 쓰는 기준 굵기. 모든 굵기는 이 값 대비 배율로 환산한다. */
const REF_SW = 0.35;

function num(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function parseShells(str) {
  return String(str ?? "")
    .split(/[,\s]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 32)
    .slice(0, 7);
}

/* ===== 좌표 문맥 =====
 * 렌더러 전체가 이 하나만 쓴다. P(u,v) 로 시안 좌표를 mm 좌표로 옮긴다.
 */
function makeCtx(obj) {
  const kind = CHEMMODEL_KINDS.includes(obj.kind) ? obj.kind : "atom";
  const vbW = 40;
  const vbH = kind === "molecule" ? 42 : 40;   // 시안 sv-mol 만 viewBox 0 0 40 42
  const x = num(obj.x, 0), y = num(obj.y, 0);
  const w = Math.max(0.5, num(obj.w, 30)), h = Math.max(0.5, num(obj.h, 30));
  const k = Math.min(w / vbW, h / vbH);
  const ox = x + w / 2 - (vbW / 2) * k;
  const oy = y + h / 2 - (vbH / 2) * k;
  return {
    kind, x, y, w, h, k, ox, oy,
    color: grayHex(obj.strokeLevel ?? 0),
    sw: num(obj.strokeWidth, REF_SW),
    uid: String(obj.id || "x").replace(/[^A-Za-z0-9_-]/g, ""),
    PX: (u) => ox + u * k,
    PY: (v) => oy + v * k,
  };
}

/* 시안 굵기 값 → 실제 mm 굵기 */
const swOf = (c, proposalW) => (c.sw * proposalW) / REF_SW;

/* ----- 원시 도형 (좌표는 시안 40 좌표계) ----- */
function addLine(g, c, x1, y1, x2, y2, pw, dash) {
  const l = document.createElementNS(SVG_NS, "line");
  l.setAttribute("x1", c.PX(x1)); l.setAttribute("y1", c.PY(y1));
  l.setAttribute("x2", c.PX(x2)); l.setAttribute("y2", c.PY(y2));
  l.setAttribute("stroke", c.color);
  l.setAttribute("stroke-width", swOf(c, pw));
  l.setAttribute("stroke-linecap", "round");
  if (dash) l.setAttribute("stroke-dasharray", dash.map((v) => (v * c.k).toFixed(3)).join(" "));
  g.appendChild(l);
  return l;
}

function addCircle(g, c, cx, cy, r, fill, pw, dash) {
  const el = document.createElementNS(SVG_NS, "circle");
  el.setAttribute("cx", c.PX(cx)); el.setAttribute("cy", c.PY(cy));
  el.setAttribute("r", Math.max(0, r * c.k));
  el.setAttribute("fill", fill || "none");
  if (pw > 0) {
    el.setAttribute("stroke", c.color);
    el.setAttribute("stroke-width", swOf(c, pw));
    if (dash) el.setAttribute("stroke-dasharray", dash.map((v) => (v * c.k).toFixed(3)).join(" "));
  }
  g.appendChild(el);
  return el;
}

function addPath(g, c, d, pw) {
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", d);
  p.setAttribute("fill", "none");
  p.setAttribute("stroke", c.color);
  p.setAttribute("stroke-width", swOf(c, pw));
  p.setAttribute("stroke-linecap", "round");
  p.setAttribute("stroke-linejoin", "round");
  g.appendChild(p);
  return p;
}

/* 글자 — 시안 txt()/ko() 자리에 renderGraphLabel. y 는 시안과 같은 baseline. */
function addText(g, c, cx, cy, str, size, anchor = "middle") {
  if (str == null || String(str) === "") return;
  const node = renderGraphLabel(String(str), {
    x: c.PX(cx), y: c.PY(cy), size: Math.max(0.4, size * c.k),
    color: c.color, anchor, vAlign: "baseline", halo: false,
  });
  if (node) g.appendChild(node);
}

/* 음영 구슬용 radialGradient — id 는 obj.id 로 유니크하게(§핵심 요구) */
function addBallGradient(defs, id, midLevel, endLevel) {
  const grad = document.createElementNS(SVG_NS, "radialGradient");
  grad.setAttribute("id", id);
  grad.setAttribute("cx", "35%"); grad.setAttribute("cy", "32%"); grad.setAttribute("r", "72%");
  [["0%", grayHex(255)], ["55%", grayHex(midLevel)], ["100%", grayHex(endLevel)]].forEach(([off, col]) => {
    const s = document.createElementNS(SVG_NS, "stop");
    s.setAttribute("offset", off);
    s.setAttribute("stop-color", col);
    grad.appendChild(s);
  });
  defs.appendChild(grad);
  return `url(#${id})`;
}

/* ══════════ kind: atom — 원자 구슬 (시안 2-1) ══════════ */
function drawAtom(g, defs, c, obj) {
  const R = 9;                                     // 시안 aState.r
  const fill = obj.shade === false
    ? grayHex(226)                                 // 평면 회색 원 (#e2e2e2)
    : addBallGradient(defs, `chemAtomG_${c.uid}`, 216, 154);   // #d8d8d8 → #9a9a9a
  addCircle(g, c, 20, 20, R, fill, 0.4);
  addText(g, c, 20, 20 + R * 0.34, obj.symbol ?? "O", R * 0.8);
}

/* ══════════ kind: shell — 전자 껍질 (시안 2-2, 확정본이라 모양을 바꾸지 않는다) ══════════ */
function drawShell(g, defs, c, obj) {
  const shells = parseShells(obj.shells ?? "2,8,2");
  const dashed = obj.dashedShell !== false;
  addCircle(g, c, 20, 20, 3.2, grayHex(220), 0.4);   // 핵 (#dcdcdc)
  addText(g, c, 20, 21.1, obj.symbol ?? "Mg", 3.1);
  // 시안 간격은 6.4 + i*4.6. 껍질이 많아 상자를 넘칠 때만 간격을 줄인다(모양은 그대로).
  const n = shells.length;
  const step = n > 1 ? Math.min(4.6, (18.4 - 6.4) / (n - 1)) : 4.6;
  shells.forEach((cnt, i) => {
    const r = 6.4 + i * step;
    addCircle(g, c, 20, 20, r, "none", 0.22, dashed ? [1.2, 0.8] : null);
    for (let j = 0; j < cnt; j++) {
      const a = (j * 2 * Math.PI) / cnt - Math.PI / 2;
      addCircle(g, c, 20 + r * Math.cos(a), 20 + r * Math.sin(a), 0.85, c.color, 0);
    }
  });
}

/* ══════════ kind: lattice — 결정 격자 (시안 2-3) ══════════ */

/* 시안 CP() — 단위 격자 좌표 → 시안 40 좌표계 */
const CP = (x, y, z) => [COX + x * CA + z * CA * 0.42, COY - y * CA - z * CA * 0.30];

function drawBallStick(g, defs, c, obj) {
  const cell = obj.cell || "fcc";
  const ballR = Math.max(0.3, num(obj.ballRadius, 2.0));
  const ballFill = addBallGradient(defs, `chemCrystG_${c.uid}`, 208, 142);   // #d0d0d0 → #8e8e8e

  const corners = [];
  [0, 1].forEach((x) => [0, 1].forEach((y) => [0, 1].forEach((z) => corners.push([x, y, z]))));

  if (obj.showEdge !== false) {
    corners.forEach((cc) => {
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach((d) => {
        const nx = cc[0] + d[0], ny = cc[1] + d[1], nz = cc[2] + d[2];
        if (nx > 1 || ny > 1 || nz > 1) return;
        const A = CP(cc[0], cc[1], cc[2]), B = CP(nx, ny, nz);
        // 뒤쪽으로 가려지는 세 모서리만 점선(시안 hidden 판정 그대로)
        const hidden =
          (cc[2] === 1 && nz === 1 && cc[1] === 0 && ny === 0) ||
          (cc[0] === 0 && nx === 0 && cc[2] === 1 && nz === 1) ||
          (cc[0] === 0 && nx === 0 && cc[1] === 0 && ny === 0 && cc[2] !== nz);
        addLine(g, c, A[0], A[1], B[0], B[1], 0.25, hidden ? [1, 0.8] : null);
      });
    });
  }

  let pts = corners.slice();
  if (cell === "bcc") pts.push([0.5, 0.5, 0.5]);
  if (cell === "fcc") {
    pts = pts.concat([[0.5, 0.5, 0], [0.5, 0.5, 1], [0.5, 0, 0.5], [0.5, 1, 0.5], [0, 0.5, 0.5], [1, 0.5, 0.5]]);
  }
  // 뒤(z 큰 것) → 앞 순서로 그려야 앞 구슬이 위에 온다.
  pts.sort((p, q) => (q[2] - p[2]) || (q[1] - p[1]));
  pts.forEach((p) => {
    const [X, Y] = CP(p[0], p[1], p[2]);
    addCircle(g, c, X, Y, ballR, ballFill, 0.25);
  });
}

/* 잘린 보기 = 공간채움 절단면.
 * 보이는 면 3개(앞 z=0 · 위 y=1 · 오른쪽 x=1)를 각각 아핀 변환해서 단위 정사각을
 * 투영 평행사변형으로 만들고, 그 안에 단면 원을 그린 뒤 면 사각형으로 클립한다.
 * 구 반지름은 구조별로 구가 서로 닿는 값: sc = a/2 · bcc = √3a/4 · fcc = √2a/4.
 *
 * 변환 안에서는 stroke 도 같이 늘어나므로, 굵기를 행렬의 등가 배율
 * s = k * √|ad-bc| 로 나눠 준다(원하는 mm 굵기가 화면에 그대로 나오게).
 */
function drawCut(g, c, obj) {
  const cell = obj.cell || "fcc";
  const R = { sc: 0.5, bcc: Math.sqrt(3) / 4, fcc: Math.sqrt(2) / 4 }[cell] ?? 0.5;
  const faces = [
    /* front z=0 : (u,v) = (x,y) */
    { m: [CA, 0, 0, -CA, COX, COY], fill: grayHex(242), cut: grayHex(198) },
    /* top   y=1 : (u,v) = (x,z) */
    { m: [CA, 0, CA * 0.42, -CA * 0.30, COX, COY - CA], fill: grayHex(228), cut: grayHex(185) },
    /* right x=1 : (u,v) = (z,y) */
    { m: [CA * 0.42, -CA * 0.30, 0, -CA, COX + CA, COY], fill: grayHex(216), cut: grayHex(172) },
  ];

  faces.forEach((F, fi) => {
    const [a, b, cc, d, e, f] = F.m;
    // translate(ox,oy) · scale(k) · matrix(a,b,c,d,e,f)
    const mm = [a * c.k, b * c.k, cc * c.k, d * c.k, c.ox + e * c.k, c.oy + f * c.k];
    const sEff = c.k * Math.sqrt(Math.abs(a * d - cc * b)) || 1;
    const face = document.createElementNS(SVG_NS, "g");
    face.setAttribute("transform", `matrix(${mm.map((v) => v.toFixed(4)).join(",")})`);

    const clipId = `chemCut_${c.uid}_${fi}`;
    const clip = document.createElementNS(SVG_NS, "clipPath");
    clip.setAttribute("id", clipId);
    const clipRect = document.createElementNS(SVG_NS, "rect");
    clipRect.setAttribute("x", "0"); clipRect.setAttribute("y", "0");
    clipRect.setAttribute("width", "1"); clipRect.setAttribute("height", "1");
    clip.appendChild(clipRect);
    face.appendChild(clip);

    const bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("x", "0"); bg.setAttribute("y", "0");
    bg.setAttribute("width", "1"); bg.setAttribute("height", "1");
    bg.setAttribute("fill", F.fill);
    face.appendChild(bg);

    const inner = document.createElementNS(SVG_NS, "g");
    inner.setAttribute("clip-path", `url(#${clipId})`);
    const cutSW = swOf(c, 0.28) / sEff;
    const mkCut = (u, v) => {
      const el = document.createElementNS(SVG_NS, "circle");
      el.setAttribute("cx", u); el.setAttribute("cy", v);
      el.setAttribute("r", R);
      el.setAttribute("fill", F.cut);
      el.setAttribute("stroke", c.color);
      el.setAttribute("stroke-width", cutSW);
      inner.appendChild(el);
    };
    /* 꼭짓점 단면 — 사분원 4개 */
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([u, v]) => mkCut(u, v));
    /* 면심 단면 — fcc 만, 온전한 원 */
    if (cell === "fcc") mkCut(0.5, 0.5);
    face.appendChild(inner);

    const border = document.createElementNS(SVG_NS, "rect");
    border.setAttribute("x", "0"); border.setAttribute("y", "0");
    border.setAttribute("width", "1"); border.setAttribute("height", "1");
    border.setAttribute("fill", "none");
    border.setAttribute("stroke", c.color);
    border.setAttribute("stroke-width", swOf(c, 0.4) / sEff);
    face.appendChild(border);

    g.appendChild(face);
  });
}

/* 흑연 층상 구조 (시안 graphiteSVG) */
function drawGraphite(g, defs, c, obj) {
  const ballR = Math.min(Math.max(0.3, num(obj.ballRadius, 2.0)), 1.35);
  const ballFill = addBallGradient(defs, `chemCrystG_${c.uid}`, 208, 142);
  const a = 3.1, gox = 8, goy = 30;
  const P = (cx, cy, L) => [gox + cx * a + cy * a * 0.45, goy - cy * a * 0.30 - L * 7.5];
  const cells = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) cells.push([i, j]);

  [0, 1, 2].forEach((L) => {
    cells.forEach(([i, j]) => {
      const A = P(i, j, L), B = P(i + 1, j, L), C = P(i, j + 1, L);
      addLine(g, c, A[0], A[1], B[0], B[1], 0.22);
      addLine(g, c, A[0], A[1], C[0], C[1], 0.22);
    });
  });
  [0, 1, 2].forEach((L) => {
    cells.forEach(([i, j]) => {
      const A = P(i, j, L);
      addCircle(g, c, A[0], A[1], ballR, ballFill, 0.2);
    });
  });
  // 층 사이를 잇는 세로 점선(층간 거리)
  [[0, 0], [3, 0], [0, 2], [3, 2]].forEach(([i, j]) => {
    const A = P(i, j, 0), B = P(i, j, 2);
    addLine(g, c, A[0], A[1], B[0], B[1], 0.2, [1, 0.8]);
  });
}

function drawLattice(g, defs, c, obj) {
  if (obj.cell === "graphite") { drawGraphite(g, defs, c, obj); return; }
  if (obj.cut) { drawCut(g, c, obj); return; }
  drawBallStick(g, defs, c, obj);
}

/* ══════════ kind: molecule — 분자 모형 (시안 2-4) ══════════ */

/* 결합선 — 원자 표면에서 시작해 표면에서 끝난다(원자를 가로지르지 않는다).
 * 다중결합은 평행선, 간격 1.3(시안 좌표), 굵기 0.28(= sw * 0.8).
 * 결합각 호는 그리지 않는다.
 */
function bondLines(g, c, x1, y1, x2, y2, order, r1, r2) {
  const dx = x2 - x1, dy = y2 - y1;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  const ax = x1 + ux * (r1 + 0.35), ay = y1 + uy * (r1 + 0.35);
  const bx = x2 - ux * (r2 + 0.35), by = y2 - uy * (r2 + 0.35);
  const nx = -uy, ny = ux, gap = 1.3;
  const n = Math.max(1, Math.min(3, Math.round(order) || 1));
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * gap;
    addLine(g, c, ax + nx * off, ay + ny * off, bx + nx * off, by + ny * off, 0.28);
  }
}

function drawMolecule(g, defs, c, obj) {
  const key = MOLECULES[obj.molecule] ? obj.molecule : "H2O";
  const M = MOLECULES[key];
  const L = Math.max(3, num(obj.bondLength, 9));
  const ang = num(obj.bondAngle, M.ang || 180);
  const cy = 19, A = (ang * Math.PI) / 180;
  const cx = M.geo === "di" ? 20 - L * 0.5 : 20;

  let pos = [];
  if (M.geo === "di") pos = [[20 + L * 0.5, cy]];
  else if (M.geo === "linear") pos = [[cx - L, cy], [cx + L, cy]];
  else if (M.geo === "bent") {
    pos = [[cx - L * Math.sin(A / 2), cy + L * Math.cos(A / 2)],
           [cx + L * Math.sin(A / 2), cy + L * Math.cos(A / 2)]];
  } else if (M.geo === "trig") pos = [[cx, cy - L], [cx - L * 0.866, cy + L * 0.5], [cx + L * 0.866, cy + L * 0.5]];
  else if (M.geo === "pyr") pos = [[cx - L * 0.87, cy + L * 0.62], [cx, cy + L * 0.95], [cx + L * 0.87, cy + L * 0.62]];
  else if (M.geo === "tet") {
    pos = [[cx - L * 0.72, cy - L * 0.72], [cx + L * 0.72, cy - L * 0.72],
           [cx - L * 0.72, cy + L * 0.72], [cx + L * 0.72, cy + L * 0.72]];
  }

  const rC = 3.5, rL = 2.7;
  const ballFill = addBallGradient(defs, `chemMolG_${c.uid}`, 214, 150);   // #d6d6d6 → #969696

  // 결합선 먼저 → 구슬이 선의 끝을 덮는다.
  pos.forEach((p, i) => bondLines(g, c, cx, cy, p[0], p[1], M.l[i] ? M.l[i].o : 1, rC, rL));

  const ball = (bx, by, sym, r) => {
    addCircle(g, c, bx, by, r, ballFill, 0.35);
    addText(g, c, bx, by + r * 0.36, sym, r * 0.92);
  };
  pos.forEach((p, i) => ball(p[0], p[1], M.l[i] ? M.l[i].s : "", rL));
  ball(cx, cy, M.c, rC);

  addText(g, c, 20, 36.6, key, 3);
  if (obj.showGeoLabel !== false) addText(g, c, 20, 40.2, `${M.ko} · ${GEO_KO[M.geo]}`, 2.4);
}

/* ══════════ kind: lewis — 루이스 전자점식 (시안 2-5) ══════════ */
function drawLewis(g, c, obj) {
  const sym = obj.symbol ?? "O";
  const cx = 20, cy = 20, R = 5.6;
  const v = VALENCE[sym] !== undefined ? VALENCE[sym] : 4;
  // 위·아래·왼·오 네 자리에 하나씩 돌려 놓은 뒤 두 번째 바퀴에서 짝을 짓는다.
  const slots = [0, 0, 0, 0];
  for (let i = 0; i < v; i++) slots[i % 4]++;
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  addText(g, c, cx, cy + 1.5, sym, 4.6);
  slots.forEach((n, i) => {
    const [dx, dy] = dirs[i], px = -dy, py = dx;
    if (n === 1) addCircle(g, c, cx + dx * R, cy + dy * R, 0.62, c.color, 0);
    else if (n >= 2) {
      addCircle(g, c, cx + dx * R + px * 1.15, cy + dy * R + py * 1.15, 0.62, c.color, 0);
      addCircle(g, c, cx + dx * R - px * 1.15, cy + dy * R - py * 1.15, 0.62, c.color, 0);
    }
  });

  if (obj.bracket) {
    const bw = 10.6, bh = 10.6, t = 1.5;
    const X = (u) => c.PX(u), Y = (u) => c.PY(u);
    addPath(g, c,
      `M ${X(cx - bw + t)} ${Y(cy - bh)} L ${X(cx - bw)} ${Y(cy - bh)} ` +
      `L ${X(cx - bw)} ${Y(cy + bh)} L ${X(cx - bw + t)} ${Y(cy + bh)}`, 0.35);
    addPath(g, c,
      `M ${X(cx + bw - t)} ${Y(cy - bh)} L ${X(cx + bw)} ${Y(cy - bh)} ` +
      `L ${X(cx + bw)} ${Y(cy + bh)} L ${X(cx + bw - t)} ${Y(cy + bh)}`, 0.35);
    if (obj.charge) addText(g, c, cx + bw + 2.4, cy - bh + 2.4, obj.charge, 3);
  }
}

/* ===== bbox — 크기박스 계열이므로 상자를 정규화해서 그대로 돌려준다 ===== */
export function chemModelBBox(obj) {
  const x = num(obj.x, 0), y = num(obj.y, 0);
  const w = num(obj.w, 30), h = num(obj.h, 30);
  return {
    x: w < 0 ? x + w : x,
    y: h < 0 ? y + h : y,
    w: Math.abs(w),
    h: Math.abs(h),
  };
}

export function renderChemModel(obj) {
  const c = makeCtx(obj);
  const g = document.createElementNS(SVG_NS, "g");
  const defs = document.createElementNS(SVG_NS, "defs");
  g.appendChild(defs);

  if (c.kind === "atom") drawAtom(g, defs, c, obj);
  else if (c.kind === "shell") drawShell(g, defs, c, obj);
  else if (c.kind === "lattice") drawLattice(g, defs, c, obj);
  else if (c.kind === "molecule") drawMolecule(g, defs, c, obj);
  else if (c.kind === "lewis") drawLewis(g, c, obj);

  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  const rot = obj.rotation ?? 0;
  if (rot) g.setAttribute("transform", `rotate(${rot} ${cx} ${cy})`);
  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
}
