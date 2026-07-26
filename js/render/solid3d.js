/* ===== RENDER/SOLID3D: 경사 투영(oblique projection) 입체 도형 =====
 *
 * 평가원 시험지 그림의 "입체"는 3D 렌더가 아니라 **소실점 없는 평행 투영**이다.
 * 뒤로 가는 선이 전부 같은 각도·같은 길이로 평행 이동한다(cabinet/oblique).
 * 그래서 카메라도 조명도 필요 없고, 각도 하나 + 깊이 하나로 면 3개를 만들면 끝난다.
 *
 * obj 스키마 (crop: 모든 kind 공통)
 *   {x,y,w,h}   bbox. **그려지는 도형 전체가 이 상자 안에 정확히 들어간다.**
 *               앞면은 bbox보다 깊이만큼 작다 — pick/resize/bbox를 그대로 물려받으려고
 *               이렇게 잡았다(깊이가 bbox 밖으로 튀어나가면 선택이 어긋난다).
 *   kind        "box" | "cylinder" | "wedge"
 *   depth       뒤로 뻗는 길이(mm). 없으면 짧은 변의 DEFAULT_DEPTH_RATIO.
 *   projAngle   투영각(도). 없으면 DEFAULT_PROJ_ANGLE(30°).
 *   shade       면 음영 0=선화(흰 면) · 1=옅게 · 2=기본
 *   axis        cylinder 전용: "v"(세로) | "h"(가로)
 *
 * 공통: obj.rotation(중심 기준), obj.opacity, obj.strokeLevel/strokeWidth, obj.label.
 * world 단위 = 1mm.
 */

import { SVG_NS, grayHex, makeArrowHead } from "./core.js?v=1.3.0";
import { withBoxLabel } from "./labels.js?v=1.3.0";

// slab(판·상판)은 box와 같은 그림이다 — 생성 시 깊이 기본값만 다르다(tools.js).
// 종류를 나눠 둬야 "판을 그렸다"는 의도가 저장돼 나중에 다시 편집할 때도 유지된다.
// axes3d(3차원 좌표축)도 여기 산다. 입체가 아니지만 **같은 투영각을 써야** 하는 것이
// 이 타입의 조건이고, 축이 다른 각도로 서 있으면 그림이 즉시 어긋난다. solid3d에 두면
// 인스펙터의 "이 각도를 모든 입체에 적용"이 축에도 그대로 걸린다.
export const SOLID3D_KINDS = ["box", "slab", "cylinder", "wedge", "desk", "axes3d", "plane"];
// 도. 기출 실측: 작은 블록·추 40° 안팎, 바닥판 58° 안팎 → 그 사이인 50°를 기본으로 쓴다.
// 30°는 윗면이 거의 안 보여서 시험지 그림으로 못 쓴다(2026-07-26 사용자 확인).
export const DEFAULT_PROJ_ANGLE = 50;
export const DEFAULT_DEPTH_RATIO = 0.35; // 깊이 = 짧은 변 × 이 값 (depth가 없는 옛 객체용)
export const DEFAULT_SHADE = 2;

/* 면 3단계 음영(gray 0~255). 윗면이 가장 밝고 옆면이 가장 어둡다 — 기출 그림의 관례.
 * shade 0은 "면을 칠하지 않는" 게 아니라 "흰색으로 칠한다". 뒤 물체가 비쳐 보이면
 * 입체로 안 읽히기 때문에, 선화 모드에서도 면은 불투명 흰색이어야 한다. */
const SHADES = [
  { top: 255, front: 255, side: 255 },
  { top: 255, front: 246, side: 234 },
  { top: 255, front: 232, side: 202 },
];

function shadeOf(obj) {
  const i = Number.isInteger(obj.shade) ? obj.shade : DEFAULT_SHADE;
  return SHADES[Math.max(0, Math.min(SHADES.length - 1, i))];
}

/* obj._outline: 팔레트 아이콘 전용(내부 플래그). 아이콘은 monochrome()이 모든 fill을
 * currentColor로 바꿔 버려서, 면을 칠하면 16px 안에서 새까만 덩어리가 된다. 이 플래그가
 * 켜지면 면을 비우고 가려지는 뒷면을 생략해 윤곽선만 남긴다. 저장 데이터에는 없는 값이다. */
const fillOf = (obj, level) => (obj._outline ? "none" : grayHex(level));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ----- 투영 벡터 -----
 * 깊이 d와 각 a에서 (dx, dy)를 뽑되, **bbox 안에 앞면이 남도록** 잘라낸다.
 * 앞면이 0이 되면(깊이가 상자보다 큼) 도형이 사라져 버리므로 최소 두께만 남긴다.
 *
 * 이 최소치는 "비율"이 아니라 "절대값(mm)"이어야 한다. 예전엔 각 축 80%로 잘랐는데,
 * 그러면 상판처럼 **얇고 깊은** 물체(두께 3mm · 깊이 40mm)가 원천적으로 불가능했다
 * — bbox 높이의 20%가 강제로 앞면 두께가 돼서 판이 늘 두꺼운 벽돌로 보였다.
 * dx/dy는 같은 비율 k로 줄이므로 투영각은 유지된다(각도가 틀어지면 다른 물체와 안 맞는다). */
const MIN_FRONT_MM = 0.8;   // 앞면(두께)으로 남겨 둘 최소 폭·높이

export function projectionOf(obj) {
  const w = Math.max(Number(obj.w) || 0, 0.001);
  const h = Math.max(Number(obj.h) || 0, 0.001);
  const deg = Number.isFinite(obj.projAngle) ? obj.projAngle : DEFAULT_PROJ_ANGLE;
  const a = (deg * Math.PI) / 180;
  const d = Number.isFinite(obj.depth) ? Math.abs(obj.depth) : Math.min(w, h) * DEFAULT_DEPTH_RATIO;
  let dx = Math.abs(d * Math.cos(a));
  let dy = Math.abs(d * Math.sin(a));
  const maxDx = Math.max(w - MIN_FRONT_MM, w * 0.05);
  const maxDy = Math.max(h - MIN_FRONT_MM, h * 0.05);
  const k = Math.min(dx > maxDx ? maxDx / dx : 1, dy > maxDy ? maxDy / dy : 1);
  return { dx: dx * k, dy: dy * k, angle: a };
}

/* ----- 면(폴리곤) 하나 ----- */
function face(obj, pts, fillLevel, stroke, sw) {
  const el = document.createElementNS(SVG_NS, "polygon");
  el.setAttribute("points", pts.map((p) => `${p[0]},${p[1]}`).join(" "));
  el.setAttribute("fill", fillOf(obj, fillLevel));
  el.setAttribute("stroke", stroke);
  el.setAttribute("stroke-width", sw);
  el.setAttribute("stroke-linejoin", "round");
  return el;
}

/* ===== BOX / SLAB — 직육면체 · 판 (블록 · 상판 · 실험대 다리) =====
 * 앞면은 bbox의 왼쪽 아래에 붙고, 깊이는 오른쪽 위로 뻗는다.
 * 그리는 순서 = 윗면 → 옆면 → 앞면. 앞면을 마지막에 얹어야 앞쪽 모서리가 깨끗하다. */
// 앞면 좌상단(x0,y0)·앞면 크기(fw,fh)·투영벡터(dx,dy)로 상자 하나를 g에 얹는다.
// 책상은 이걸 5번(상판 + 다리 4개) 부르므로 bbox 계산에서 분리해 뒀다.
//
// noTop: 윗면을 그리지 않는다. 책상 다리처럼 **윗면이 다른 물체에 맞닿아 붙어 있는**
// 상자에 쓴다. 다리 윗면을 그리면 상판 앞면 띠 위로 흰 사각형이 튀어나와, 상판이
// 파인 것처럼 보인다(2026-07-26 사용자 지적).
function pushBox(g, obj, x0, y0, fw, fh, dx, dy, sh, stroke, sw, noTop) {
  if (!noTop) {
    g.appendChild(face(obj, [[x0, y0], [x0 + fw, y0], [x0 + fw + dx, y0 - dy], [x0 + dx, y0 - dy]], sh.top, stroke, sw));
  }
  g.appendChild(face(obj, [[x0 + fw, y0], [x0 + fw + dx, y0 - dy], [x0 + fw + dx, y0 + fh - dy], [x0 + fw, y0 + fh]], sh.side, stroke, sw));
  g.appendChild(face(obj, [[x0, y0], [x0 + fw, y0], [x0 + fw, y0 + fh], [x0, y0 + fh]], sh.front, stroke, sw));
}

function drawBox(obj, proj, stroke, sw) {
  const { dx, dy } = proj;
  const g = document.createElementNS(SVG_NS, "g");
  pushBox(g, obj, obj.x, obj.y + dy, obj.w - dx, obj.h - dy, dx, dy, shadeOf(obj), stroke, sw);
  return g;
}

/* ===== DESK — 실험대 · 책상 (상판 + 다리 4) =====
 * 상판과 다리를 따로 놓지 않고 한 오브젝트로 그린다. 상판을 늘리면 다리가 따라와야 하고
 * 옮길 때 5개를 같이 잡을 이유가 없다 — 시험 그림에서 책상은 통째로 한 물건이다.
 *
 * 다리는 상판 윗면 네 귀퉁이에 두되 **뒤쪽 다리는 자기 굵기만큼 안으로 들여** 놓는다.
 * 그래야 다리의 뒷면이 상판 뒤 모서리와 딱 맞고, 그림 전체가 bbox 안에 남는다.
 * 그리는 순서 = 뒤 다리 → 상판 → 앞 다리. 상판이 뒤 다리 윗부분을 자연스럽게 가린다
 * (기출 p1_2026_06_16에서 다리가 3개만 보이는 그 모습).
 *
 * 추가 필드: topThickness(상판 두께) · legWidth(다리 굵기). 없으면 비율로 자동. */
function drawDesk(obj, proj, stroke, sw) {
  const { dx, dy } = proj;
  const sh = shadeOf(obj);
  const g = document.createElementNS(SVG_NS, "g");
  const x = obj.x, y0 = obj.y + dy;
  const fw = obj.w - dx;          // 상판 앞 모서리 길이
  const fh = obj.h - dy;          // 앞에서 본 전체 높이(상판 + 다리)
  const d = Math.hypot(dx, dy);   // 깊이(투영 길이)
  const ux = d ? dx / d : 0, uy = d ? dy / d : 0;  // 깊이 방향 단위벡터

  // 상판 두께와 다리 굵기: 값이 없으면 비율로, 있으면 그 값을 쓰되 항상 안전 범위로 자른다.
  const T = clamp(Number.isFinite(obj.topThickness) ? obj.topThickness : fh * 0.12, 0.6, fh * 0.6);
  const lwMax = Math.max(Math.min(fw, d) * 0.3, 0.6);
  const lw = clamp(Number.isFinite(obj.legWidth) ? obj.legWidth : fw * 0.045, 0.6, lwMax);
  const L = fh - T;               // 다리 길이
  const dxL = lw * ux, dyL = lw * uy;

  // [가로위치 X, 깊이위치 Z] — 뒤 다리(Z 큰 쪽)를 먼저 그려 앞 다리에 가려지게 한다.
  const legs = [
    [0, d - lw], [fw - lw, d - lw],   // 뒤 왼쪽 · 뒤 오른쪽
    [0, 0], [fw - lw, 0],             // 앞 왼쪽 · 앞 오른쪽
  ];
  // 다리 넷을 **모두 상판보다 먼저** 그린다. 다리는 전부 상판 아래에 붙으므로 상판보다
  // 앞설 일이 없고, 이렇게 해야 다리 옆면이 깊이만큼 위로 삐져나온 조각(y0+T보다 위)이
  // 상판 앞면에 자연스럽게 덮인다. 앞 다리를 상판 뒤에 그리면 그 조각이 상판을 뚫고 나온다.
  if (L > 0) {
    for (const [X, Z] of legs) {
      pushBox(g, obj, x + X + Z * ux, y0 + T - Z * uy, lw, L, dxL, dyL, sh, stroke, sw, true);
    }
  }
  pushBox(g, obj, x, y0, fw, T, dx, dy, sh, stroke, sw);             // 상판
  return g;
}

/* ===== WEDGE — 빗면 · 삼각기둥 =====
 * 앞면은 직각삼각형(직각이 오른쪽 아래). 빗변이 왼쪽 아래 → 오른쪽 위.
 * 좌우를 뒤집으려면 obj.flipX(인스펙터 반전)를 쓴다 — 아래에서 x를 미러링한다. */
function drawWedge(obj, proj, stroke, sw) {
  const { dx, dy } = proj;
  const x0 = obj.x, y0 = obj.y + dy;
  const fw = obj.w - dx, fh = obj.h - dy;
  const sh = shadeOf(obj);
  const bl = [x0, y0 + fh];              // 빗변 아래끝(왼쪽 아래)
  const br = [x0 + fw, y0 + fh];         // 직각 꼭짓점
  const tr = [x0 + fw, y0];              // 빗변 위끝
  const g = document.createElementNS(SVG_NS, "g");
  // 경사면(빗변을 깊이만큼 밀어낸 사각형) → 오른쪽 옆면 → 앞 삼각형
  g.appendChild(face(obj, [bl, tr, [tr[0] + dx, tr[1] - dy], [bl[0] + dx, bl[1] - dy]], sh.top, stroke, sw));
  g.appendChild(face(obj, [br, tr, [tr[0] + dx, tr[1] - dy], [br[0] + dx, br[1] - dy]], sh.side, stroke, sw));
  g.appendChild(face(obj, [bl, br, tr], sh.front, stroke, sw));
  return g;
}

/* ===== CYLINDER — 원기둥 (자석 · 추 · 받침 원판 · 스탠드 봉) =====
 * 타원의 납작한 정도가 곧 보는 각도다. ry/rx = sin(투영각) 으로 묶어 두면
 * 같은 화면의 직육면체와 원기둥이 같은 시점으로 보인다.
 *
 * 호(arc)의 sweep 플래그를 쓰지 않고 **타원 + 불투명 몸통으로 덮는** 방식을 쓴다.
 * 먼 쪽 타원을 먼저 그리고 몸통 사각형이 그 절반을 가리면 보이는 윤곽만 남는다.
 * 이게 arc flag를 손으로 맞추는 것보다 뒤집힘 사고가 없다. */
function ellipseEl(obj, cx, cy, rx, ry, fillLevel, stroke, sw) {
  const el = document.createElementNS(SVG_NS, "ellipse");
  el.setAttribute("cx", cx); el.setAttribute("cy", cy);
  el.setAttribute("rx", rx); el.setAttribute("ry", ry);
  el.setAttribute("fill", fillOf(obj, fillLevel));
  el.setAttribute("stroke", stroke);
  el.setAttribute("stroke-width", sw);
  return el;
}

function seg(x1, y1, x2, y2, stroke, sw) {
  const el = document.createElementNS(SVG_NS, "line");
  el.setAttribute("x1", x1); el.setAttribute("y1", y1);
  el.setAttribute("x2", x2); el.setAttribute("y2", y2);
  el.setAttribute("stroke", stroke);
  el.setAttribute("stroke-width", sw);
  return el;
}

function drawCylinder(obj, proj, stroke, sw) {
  const sh = shadeOf(obj);
  const g = document.createElementNS(SVG_NS, "g");
  const sinA = Math.abs(Math.sin(proj.angle)) || 0.5;

  if ((obj.axis || "v") === "h") {
    // 가로 원기둥: 양 끝이 타원. 가까운 쪽(오른쪽) 마개가 보인다.
    const cy = obj.y + obj.h / 2;
    const ry = obj.h / 2;
    const rx = Math.min(ry * sinA, obj.w * 0.35);
    const cxL = obj.x + rx, cxR = obj.x + obj.w - rx;
    // 먼 쪽 마개는 몸통에 절반이 가려진다. 윤곽선 모드(아이콘)에서는 몸통이 투명해
    // 가릴 수 없으므로 아예 그리지 않는다.
    if (!obj._outline) {
      g.appendChild(ellipseEl(obj, cxL, cy, rx, ry, sh.side, stroke, sw));
      const body = document.createElementNS(SVG_NS, "rect");
      body.setAttribute("x", cxL); body.setAttribute("y", obj.y);
      body.setAttribute("width", Math.max(cxR - cxL, 0)); body.setAttribute("height", obj.h);
      body.setAttribute("fill", grayHex(sh.front));
      body.setAttribute("stroke", "none");
      g.appendChild(body);
    }
    g.appendChild(seg(cxL, obj.y, cxR, obj.y, stroke, sw));
    g.appendChild(seg(cxL, obj.y + obj.h, cxR, obj.y + obj.h, stroke, sw));
    g.appendChild(ellipseEl(obj, cxR, cy, rx, ry, sh.top, stroke, sw));  // 가까운 쪽 마개
    return g;
  }

  // 세로 원기둥: 위아래가 타원. 윗면이 보인다.
  const cx = obj.x + obj.w / 2;
  const rx = obj.w / 2;
  const ry = Math.min(rx * sinA, obj.h * 0.35);
  const cyT = obj.y + ry, cyB = obj.y + obj.h - ry;
  if (!obj._outline) {
    g.appendChild(ellipseEl(obj, cx, cyB, rx, ry, sh.side, stroke, sw)); // 밑면(아래 반원만 남는다)
    const body = document.createElementNS(SVG_NS, "rect");
    body.setAttribute("x", obj.x); body.setAttribute("y", cyT);
    body.setAttribute("width", obj.w); body.setAttribute("height", Math.max(cyB - cyT, 0));
    body.setAttribute("fill", grayHex(sh.front));
    body.setAttribute("stroke", "none");
    g.appendChild(body);
  }
  g.appendChild(seg(obj.x, cyT, obj.x, cyB, stroke, sw));
  g.appendChild(seg(obj.x + obj.w, cyT, obj.x + obj.w, cyB, stroke, sw));
  g.appendChild(ellipseEl(obj, cx, cyT, rx, ry, sh.top, stroke, sw));    // 윗면
  return g;
}

/* ===== PLANE — 수평면 (두께 없는 평행사변형) =====
 *
 * 기출(p2_2024_11_13)의 "수평면"이다. 판(slab)과 다른 점은 **두께가 없다**는 것.
 * 판은 앞면 띠가 보이지만 수평면은 윤곽선만 있는 평행사변형이다.
 *
 * 깊이를 따로 두지 않는다: bbox 높이가 곧 깊이의 세로 성분이다(h = depth·sin α).
 * 그래서 드래그한 상자가 평면의 화면상 크기 그대로가 되고, 상자를 꽉 채운다.
 * 뒤 물체가 비쳐 보이면 바닥으로 안 읽히므로 면은 불투명 흰색이 기본이다. */
function drawPlane(obj, proj, stroke, sw) {
  const g = document.createElementNS(SVG_NS, "g");
  const a = ((Number.isFinite(obj.projAngle) ? obj.projAngle : DEFAULT_PROJ_ANGLE) * Math.PI) / 180;
  const tan = Math.tan(a) || 1;
  const dx = clamp(obj.h / tan, 0, obj.w * 0.9);   // 뒤로 밀리는 가로 성분
  const fw = obj.w - dx;                           // 앞 모서리 길이
  const yF = obj.y + obj.h, yB = obj.y;            // 앞·뒤 모서리의 y
  const sh = shadeOf(obj);
  g.appendChild(face(obj, [
    [obj.x, yF], [obj.x + fw, yF], [obj.x + fw + dx, yB], [obj.x + dx, yB],
  ], obj.shade === 0 ? 255 : sh.top, stroke, sw));
  return g;
}

/* ===== AXES3D — 3차원 좌표축 =====
 *
 * 원점은 bbox의 **왼쪽 아래**. x는 오른쪽, y는 위, z는 깊이 방향(오른쪽 위)이다.
 * z가 다른 입체의 깊이와 같은 각도로 가야 하므로 obj.projAngle을 그대로 쓴다.
 *
 * 축 길이: x = bbox 너비, y = bbox 높이, z = obj.depth. 셋 다 화살촉과 축 이름이
 * 들어갈 자리(pad)만큼 짧게 끝난다 — 그래야 그림 전체가 bbox 안에 남는다(이 파일의
 * 불변식). z는 화면상 가로·세로를 동시에 먹으므로 양쪽 모두에 대해 잘라 준다.
 */
export const DEFAULT_AXIS_LABEL_MM = 4;

function axisText(str, x, y, size, color) {
  const t = document.createElementNS(SVG_NS, "text");
  t.setAttribute("x", x);
  t.setAttribute("y", y);
  t.setAttribute("font-size", size);
  t.setAttribute("fill", color);
  t.setAttribute("font-family", "Times New Roman, serif");
  t.setAttribute("font-style", "italic");
  t.textContent = str;
  return t;
}

function drawAxes3d(obj, proj, stroke, sw) {
  const g = document.createElementNS(SVG_NS, "g");
  const size = Number.isFinite(obj.axisLabelSize) ? obj.axisLabelSize : DEFAULT_AXIS_LABEL_MM;
  const showNames = obj.axisLabels !== false;
  const pad = showNames ? size * 1.35 : sw * 6;   // 화살촉 + 이름 자리
  const ox = obj.x, oy = obj.y + obj.h;           // 원점 = 왼쪽 아래
  const minLen = Math.max(sw * 8, 1);

  const lx = Math.max(obj.w - pad, minLen);
  const ly = Math.max(obj.h - pad, minLen);

  // z 방향 단위벡터(화면). 깊이는 오른쪽 위로 간다.
  const dLen = Math.hypot(proj.dx, proj.dy) || 1;
  const ux = proj.dx / dLen, uy = -proj.dy / dLen;
  let lz = dLen;
  if (ux > 1e-6) lz = Math.min(lz, (obj.w - pad) / ux);
  if (uy < -1e-6) lz = Math.min(lz, (obj.h - pad) / -uy);
  lz = Math.max(lz, minLen);

  /* variant "ground" = 두 축이 **모두 바닥면에 눕는다**(기출 p2_2024_11_13의 배치).
   * 세로로 서는 축은 아예 그리지 않고, 깊이축을 왼쪽 아래(-z)로 보낸다.
   * 수평면 위에 x·y를 얹어야 하는 문항에서 3축 좌표계는 오히려 방해가 된다. */
  const axes = [];
  if ((obj.variant || "xyz") === "ground") {
    const ca = Math.cos(proj.angle), sa = Math.sin(proj.angle) || 0.5;
    // 깊이축이 세로로 h를, 가로로 run을 먹는다. run이 너무 커지면 오른쪽 축이 사라지므로 제한.
    let lenD = Math.max((obj.h - pad) / sa, minLen);
    lenD = Math.min(lenD, (obj.w * 0.6) / (ca || 1));
    const run = lenD * ca;
    const gx = obj.x + run, gy = obj.y;               // 원점 = 위쪽(깊이축이 왼아래로 내려간다)
    const lenR = Math.max(obj.x + obj.w - gx - pad, minLen);
    axes.push({ o: [gx, gy], tip: [gx + lenR, gy], dir: [1, 0], name: obj.labelY ?? "y" });
    axes.push({ o: [gx, gy], tip: [gx - run, gy + lenD * sa], dir: [-ca, sa], name: obj.labelX ?? "x" });
  } else {
    axes.push({ o: [ox, oy], tip: [ox + lx, oy], dir: [1, 0], name: obj.labelX ?? "x" });
    axes.push({ o: [ox, oy], tip: [ox, oy - ly], dir: [0, -1], name: obj.labelY ?? "y" });
    axes.push({ o: [ox, oy], tip: [ox + ux * lz, oy + uy * lz], dir: [ux, uy], name: obj.labelZ ?? "z" });
  }

  for (const a of axes) {
    const ln = document.createElementNS(SVG_NS, "line");
    ln.setAttribute("x1", a.o[0]); ln.setAttribute("y1", a.o[1]);
    ln.setAttribute("x2", a.tip[0]); ln.setAttribute("y2", a.tip[1]);
    ln.setAttribute("stroke", stroke);
    ln.setAttribute("stroke-width", sw);
    g.appendChild(ln);
    // 화살촉을 선 굵기에 묶으면(기본 동작) 0.2mm 선에서 1mm도 안 되게 나와 안 보인다.
    // 좌표축 화살촉은 그림 크기에 비례해야 하므로 축 이름 크기를 기준으로 키운다.
    const headSw = Math.max(sw, size * 0.13);
    const head = makeArrowHead(a.tip[0], a.tip[1], a.dir[0], a.dir[1], headSw, stroke, { lenMul: 5, widthMul: 1.7 });
    if (head) g.appendChild(head);
    if (showNames && a.name) {
      g.appendChild(axisText(a.name, a.tip[0] + size * 0.36, a.tip[1] + size * 0.34, size, stroke));
    }
  }
  return g;
}

/* ----- 좌우 반전: bbox 중심을 축으로 미러링(회전과 독립) ----- */
function applyFlip(g, obj) {
  if (!obj.flipX) return;
  const cx = obj.x + obj.w / 2;
  g.setAttribute("transform", `translate(${2 * cx} 0) scale(-1 1)`);
}

export function renderSolid3d(obj) {
  const stroke = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.2;
  const proj = projectionOf(obj);
  const kind = obj.kind || "box";

  let inner;
  if (kind === "cylinder") inner = drawCylinder(obj, proj, stroke, sw);
  else if (kind === "wedge") inner = drawWedge(obj, proj, stroke, sw);
  else if (kind === "desk") inner = drawDesk(obj, proj, stroke, sw);
  else if (kind === "axes3d") inner = drawAxes3d(obj, proj, stroke, sw);
  else if (kind === "plane") inner = drawPlane(obj, proj, stroke, sw);
  else inner = drawBox(obj, proj, stroke, sw);   // box · slab (그림은 같다)
  applyFlip(inner, obj);

  // 반전 transform과 회전 transform이 한 요소에서 겹치지 않게 바깥 <g>로 감싼다.
  const g = document.createElementNS(SVG_NS, "g");
  g.appendChild(inner);
  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.rotation) {
    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.h / 2;
    g.setAttribute("transform", `rotate(${obj.rotation} ${cx} ${cy})`);
  }
  if (obj.id) g.dataset.id = obj.id;
  return withBoxLabel(g, obj);
}
