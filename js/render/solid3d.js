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

import { SVG_NS, grayHex } from "./core.js?v=1.2.0";
import { withBoxLabel } from "./labels.js?v=1.2.0";

// slab(판·상판)은 box와 같은 그림이다 — 생성 시 깊이 기본값만 다르다(tools.js).
// 종류를 나눠 둬야 "판을 그렸다"는 의도가 저장돼 나중에 다시 편집할 때도 유지된다.
export const SOLID3D_KINDS = ["box", "slab", "cylinder", "wedge"];
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
function drawBox(obj, proj, stroke, sw) {
  const { dx, dy } = proj;
  const x0 = obj.x, y0 = obj.y + dy;
  const fw = obj.w - dx, fh = obj.h - dy;
  const sh = shadeOf(obj);
  const g = document.createElementNS(SVG_NS, "g");
  g.appendChild(face(obj, [[x0, y0], [x0 + fw, y0], [x0 + fw + dx, y0 - dy], [x0 + dx, y0 - dy]], sh.top, stroke, sw));
  g.appendChild(face(obj, [[x0 + fw, y0], [x0 + fw + dx, y0 - dy], [x0 + fw + dx, y0 + fh - dy], [x0 + fw, y0 + fh]], sh.side, stroke, sw));
  g.appendChild(face(obj, [[x0, y0], [x0 + fw, y0], [x0 + fw, y0 + fh], [x0, y0 + fh]], sh.front, stroke, sw));
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
