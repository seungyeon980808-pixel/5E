/* ===== RENDER/COORDPLANE: math coordinate plane + (step 3) funcgraph ===== */
//
// renderCoordplane draws a full math coordinate system inside its bbox: optional
// grid, the two axis lines (drawn only where 0 is inside the range), arrowheads,
// tick marks, and — new vs the decorative `axes` symbol — NUMERIC tick labels.
// Everything is a PROJECTION computed from the data (x/y/w/h + range + steps),
// never stored as separate objects (mirrors renderAxes, annotations.js).
//
// The math↔world mapping is the shared coords.js helper (single source of truth,
// 기획서 결정 C/§4), so a graph previewed in the modal lands identically here.
// Convention: +X right, +Y UP (world y flipped).

import {
  SVG_NS,
  grayHex,
  fillTextWithRomanRuns,
  applyObjectLabelFont,
  catmullRomPath,
  applyDash,
  makeArrowHead,
} from "./core.js?v=1.7.0-four-session-integration";
import { coordinateTicks, worldXFromMathX, worldYFromMathY, worldYFromMathY2, y2RangeOf, planeAsY2 } from "../function-graph/coords.js?v=1.7.0-four-session-integration";
import { renderGraphLabel as renderBaseGraphLabel, measureGraphLabel } from "./graph-label.js?v=1.7.0-four-session-integration";
import { renderPolyline } from "./shapes.js?v=1.7.0-four-session-integration";
import { resolveFill, makeFillPattern } from "./fill.js?v=1.7.0-four-session-integration";
import { EXAM_STYLE, isExamStyle, examPlaneStyle, examSeriesStyle } from '../graph/exam-style.js?v=1.7.0-four-session-integration';
import { descriptionTitleLayout, descriptionTickLabelLanes } from '../graph/description-layout.js?v=1.7.0-four-session-integration';

// Source restoration retains its legacy lettering. Newly described graphs use
// italic quantities; the label renderer keeps units and numerals upright.
// Point/series names explicitly request upright lettering at their call sites.
const graphLabelUpright = (obj, requested) => requested ?? (!!obj.reconstruction && !obj.graphStyle?.descriptionLayout);
const graphLabelRenderer = obj => (text, options = {}) => {
  const settings={parenthesesAreUnits:!obj.graphStyle?.descriptionLayout,...options,upright:graphLabelUpright(obj, options.upright),
    sourceHeight:options.sourceHeight ?? (obj.reconstruction?.labelSizeMode==='source-height')};
  if (!isExamStyle(obj)) return renderBaseGraphLabel(text,settings);
  // Measure each font at ONE canonical size. Scaling that same vector label
  // avoids size-dependent canvas glyph metrics changing relative proportions.
  const label=renderBaseGraphLabel(text,{...settings,x:0,y:0,size:EXAM_STYLE.label,sourceHeight:true});
  if(!label)return label;
  const wrap=document.createElementNS(SVG_NS,'g');
  wrap.setAttribute('transform',`translate(${options.x||0} ${options.y||0}) scale(${(options.size||EXAM_STYLE.label)/EXAM_STYLE.label})`);
  wrap.append(label);return wrap;
};

// dominant-baseline(구식 addName) → renderGraphLabel vAlign 매핑.
function baselineToVAlign(b) {
  return b === "hanging" ? "top" : b === "middle" ? "middle" : "baseline";
}

// Grid lines are deliberately light + thin (grayscale project); a hard cap keeps a
// tiny step over a wide range from spraying hundreds of lines.
const GRID_LEVEL = 0;          // 요구: 다른 시험지 확인 결과 점선은 그냥 검정
const TICK_LEVEL = 0;          // 요구: 눈금 표시선도 그냥 검정
const GRID_MAX_LINES = 160;    // per axis; beyond this the grid is skipped

/* ----- 부드러운(베지어) 화살촉 — 평가원 만년필식, 사용자 제공 SVG 벡터에서 직접 추출(요구).
 * 사용자가 준 SVG(붓글씨체 화살표, θ₂ 각도 그림과 같은 계열)에서 화살촉 부분만 잘라내고
 * (막대 제외), 축(attach 중점→팁) 기준 좌우 대칭성을 실측(0.23% 오차, 거의 완전 대칭)한 뒤
 * '아래쪽 절반 기준'(사용자 선택 B안)을 반대쪽에 그대로 미러링해 완전 대칭 형태로 확정.
 * tip→원점, 진행방향→(0,-1) 정규화(L=1) 후 20점으로 다운샘플.
 * 좌우는 항상 완전 대칭(한쪽만 저장하고 반대쪽은 부호만 뒤집어 그린다 — 구조적으로 안 깨짐).
 * 렌더는 centripetal Catmull-Rom(α=0.5)으로 잇는다(점 간격이 고르지 않아도 출렁이지 않음).
 * tip=(tipX,tipY), d=(dirX,dirY) 진행방향 단위, sw=크기 배수(L=sw*mL). 채움만(테두리 없음). */
// 정규화 좌표(b, s): b=앞끝에서의 진행거리(팁 기준 축길이=1), s=중심축에서의 옆 거리.
// [0]=앞끝 … [13]=가장 넓은 지점 … [19]=축(막대) 붙는 끝.
const ARROW_TRACE = [
  [0.0000, 0.0000], [0.0075, 0.0189], [0.0244, 0.0322], [0.0468, 0.0415], [0.2075, 0.0728],
  [0.3680, 0.1068], [0.5143, 0.1427], [0.6639, 0.1874], [0.7624, 0.2195], [0.8599, 0.2560],
  [0.9491, 0.2918], [1.0417, 0.3298], [1.0847, 0.3499], [1.1295, 0.3657], [1.1551, 0.3562],
  [1.1463, 0.2982], [1.1141, 0.2417], [1.0649, 0.1725], [1.0224, 0.1125], [1.0006, 0.0703],
];
// centripetal Catmull-Rom(α=0.5) → 큐빅 베지어 제어점, L=1(정규화) 기준으로 '모듈 로드 시
// 딱 한 번만' 계산해 둔다. ARROW_TRACE는 고정 상수라 이 결과는 절대 안 바뀐다 — 성능 실측
// 결과 매 렌더마다 이 계산을 새로 하면 화살촉 하나에 ~370µs(옛 폴리곤 대비 88배)가 들어
// 드래그 중(전체 씬이 상태 변경마다 재렌더됨) 체감될 만큼 느려졌다(요구: 버벅임 원인 해결).
// smoothArrowHead는 이 정규화 좌표를 sw*6 배로 스케일만 하고 tip/방향으로 옮기기만 한다.
const ARROW_SEGS_NORM = (() => {
  const n = ARROW_TRACE.length;
  const pts = ARROW_TRACE.map(([bn, sn]) => [bn, sn]);
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5;
  const vec = (a, b) => [b[0] - a[0], b[1] - a[1]];
  const scl = (v, k) => [v[0] * k, v[1] * k];
  const add = (...vs) => vs.reduce((a, v) => [a[0] + v[0], a[1] + v[1]], [0, 0]);
  const segs = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)];
    const t0 = 0;
    const t1 = t0 + (dist(p0, p1) || 1e-6);
    const t2 = t1 + (dist(p1, p2) || 1e-6);
    const t3 = t2 + (dist(p2, p3) || 1e-6);
    let m1 = add(scl(vec(p1, p2), 1 / (t2 - t1)), scl(vec(p0, p2), -1 / (t2 - t0)), scl(vec(p0, p1), 1 / (t1 - t0)));
    m1 = scl(m1, t2 - t1);
    let m2 = add(scl(vec(p2, p3), 1 / (t3 - t2)), scl(vec(p1, p3), -1 / (t3 - t1)), scl(vec(p1, p2), 1 / (t2 - t1)));
    m2 = scl(m2, t2 - t1);
    const c1 = add(p1, scl(m1, 1 / 3));
    const c2 = add(p2, scl(m2, -1 / 3));
    segs.push([p1, c1, c2, p2]);
  }
  return { segs, notch: pts[n - 1] };
})();
// 정준(canonical) 방향(dir=(0,-1), 즉 "위쪽")·L=1 기준 'd' 문자열을 모듈 로드 시 딱 한 번만
// 만든다(P(b,s)=(s,b)로 단순화됨 — dirX=0,dirY=-1,px=1,py=0일 때 수식이 그렇게 떨어진다).
// 성능 실측: 이전엔 매 호출마다 256개 숫자를 문자열로 새로 조립했다(옛 폴리곤 8개 대비 32배) —
// 이게 Catmull-Rom 계산을 hoist한 뒤에도 여전히 옛 방식 대비 ~44배 느렸던 진짜 원인이었다.
// 이제 'd'는 상수이고, 호출마다 하는 일은 transform(translate·rotate·scale) 문자열 하나뿐이다
// — 숫자 4개로 줄어 옛 폴리곤 수준(오차 범위)까지 회복된다(실측: 아래 커밋 로그 참고).
const ARROW_D_CANON = (() => {
  const { segs, notch } = ARROW_SEGS_NORM;
  const P = (b, s) => `${s} ${b}`;   // 정준 P(b,s) = (s, b) — 위 주석 참고
  let d = `M ${P(0, 0)} `;
  segs.forEach(([, c1, c2, p1]) => { d += `C ${P(c1[0], c1[1])} ${P(c2[0], c2[1])} ${P(p1[0], p1[1])} `; });
  d += `L ${P(notch[0], -notch[1])} `;
  [...segs].reverse().forEach(([p0, c1, c2]) => { d += `C ${P(c2[0], -c2[1])} ${P(c1[0], -c1[1])} ${P(p0[0], -p0[1])} `; });
  d += "Z";
  return d;
})();
function smoothArrowHead(tipX, tipY, dirX, dirY, sw, color, widthScale = 1) {
  const L = sw * 6.0;             // 전체 크기 배율(비율은 ARROW_TRACE가 고정)
  // 정준 방향(0,-1) → (dirX,dirY)로 돌리는 회전각(도, SVG는 시계방향+). atan2 기준 유도.
  const rotDeg = (Math.atan2(dirY, dirX) * 180) / Math.PI + 90;
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ARROW_D_CANON);
  path.setAttribute("transform", `translate(${tipX} ${tipY}) rotate(${rotDeg}) scale(${widthScale === 1 ? L : `${L * widthScale} ${L}`})`);
  path.setAttribute("fill", color);
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", 0.15 / 6);   // scale(L)로 함께 커져 최종 sw*0.15가 된다
  path.setAttribute("stroke-linejoin", "round");
  return path;
}

// 축(x/y) 끝 화살촉: 예전엔 각진 폴리곤(appendArrow)이었다 — smoothArrowHead(요구 5, 실사진
// 추적)로 교체. 호출부(축 렌더)는 그대로 두기 위해 같은 시그니처의 얇은 래퍼로 남긴다.
function appendArrow(g, tipX, tipY, dirX, dirY, sw, color) {
  g.appendChild(smoothArrowHead(tipX, tipY, dirX, dirY, sw, color));
}

/* ----- format a tick value: kill float noise, trim trailing zeros ----- */
function fmtTick(v) {
  if (!Number.isFinite(v)) return "";
  const r = Math.round(v * 1e6) / 1e6;
  if (Object.is(r, -0)) return "0";
  if (Number.isInteger(r)) return String(r);
  return String(parseFloat(r.toFixed(6)));
}

/* ----- integer k range so that k*step covers [lo,hi] without float drift ----- */
function tickRange(lo, hi, step) {
  const s = Math.abs(step) > 1e-9 ? Math.abs(step) : 1;
  return { kStart: Math.ceil(lo / s - 1e-9), kEnd: Math.floor(hi / s + 1e-9), step: s };
}

/* 표시점 반지름 = 선 굵기 연동. 미리보기 고스트(graph-modal)와 실제 렌더가 같은 값을
   써야 "찍기 전 ≠ 찍은 뒤"로 어긋나지 않는다 — 상수를 양쪽에 두었다가 실제로 어긋났다. */
function markerRadius(strokeWidth) {
  const sw = Number.isFinite(strokeWidth) ? strokeWidth : 0.4;
  return Math.max(sw * 1.465, 0.564);
}

function graphMarker(x,y,shape,size,strokeWidth,color) {
  const node=document.createElementNS(SVG_NS,shape==='circle'||shape==='open-circle'?'circle':shape==='square'?'rect':'path');
  if(shape==='circle'||shape==='open-circle'){node.setAttribute('cx',x);node.setAttribute('cy',y);node.setAttribute('r',size);}
  else if(shape==='square'){node.setAttribute('x',x-size);node.setAttribute('y',y-size);node.setAttribute('width',size*2);node.setAttribute('height',size*2);}
  else node.setAttribute('d',shape==='cross'?`M ${x-size} ${y-size} L ${x+size} ${y+size} M ${x-size} ${y+size} L ${x+size} ${y-size}`:`M ${x-size} ${y} L ${x+size} ${y} M ${x} ${y-size} L ${x} ${y+size}`);
  node.setAttribute('fill',shape==='open-circle'?'#fff':shape==='circle'||shape==='square'?color:'none');node.setAttribute('stroke',color);node.setAttribute('stroke-width',strokeWidth);node.setAttribute('data-graph-marker',shape);return node;
}

function renderCoordplane(obj) {
  obj = examPlaneStyle(obj);
  const renderGraphLabel = graphLabelRenderer(obj);
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;

  // Whole-bbox transparent body → the plane is ONE solid click/drag target from
  // anywhere inside (same trick as renderAxes), not just on a drawn line.
  const body = document.createElementNS(SVG_NS, "rect");
  body.setAttribute("x", obj.x);
  body.setAttribute("y", obj.y);
  body.setAttribute("width", obj.w);
  body.setAttribute("height", obj.h);
  body.setAttribute("fill", "transparent");
  g.appendChild(body);

  const color = grayHex(obj.strokeLevel);
  const gridColor = grayHex(GRID_LEVEL);
  const tickColor = grayHex(TICK_LEVEL);   // 눈금 표시선 전용 회색(축선 색과 분리)
  const sw = obj.strokeWidth || 0.2;

  const P = obj; // coords helpers read x/y/w/h/xMin..yMax straight off the object
  const xMin = obj.xMin, xMax = obj.xMax, yMin = obj.yMin, yMax = obj.yMax;
  const left = obj.x, right = obj.x + obj.w, top = obj.y, bottom = obj.y + obj.h;

  const addLine = (x1, y1, x2, y2, stroke, w) => {
    const l = document.createElementNS(SVG_NS, "line");
    l.setAttribute("x1", x1); l.setAttribute("y1", y1);
    l.setAttribute("x2", x2); l.setAttribute("y2", y2);
    l.setAttribute("stroke", stroke);
    l.setAttribute("stroke-width", w);
    g.appendChild(l);
  };

  // Origin in world; each axis is on-screen only if 0 lies within its range.
  const fractionX = obj.axisPlacement?.y?.mode === 'fraction' && Number.isFinite(obj.axisPlacement.y.value) ? Math.max(0, Math.min(1, obj.axisPlacement.y.value)) : null;
  const fractionY = obj.axisPlacement?.x?.mode === 'fraction' && Number.isFinite(obj.axisPlacement.x.value) ? Math.max(0, Math.min(1, obj.axisPlacement.x.value)) : null;
  const boxFrame = obj.axisVariant === 'box', logX = obj.xScale === 'log', logY = obj.yScale === 'log';
  const worldX0 = boxFrame && fractionX !== null ? left + obj.w * fractionX : boxFrame || logX || logY ? left : fractionX !== null ? left + obj.w * fractionX : worldXFromMathX(P, obj.reconstruction?.preserveAxes ? Math.max(xMin, Math.min(xMax, 0)) : 0);
  const worldY0 = boxFrame && fractionY !== null ? top + obj.h * (1 - fractionY) : boxFrame || logX || logY ? bottom : fractionY !== null ? top + obj.h * (1 - fractionY) : worldYFromMathY(P, obj.reconstruction?.preserveAxes ? Math.max(yMin, Math.min(yMax, 0)) : 0);
  const xAxisVisible = boxFrame || logX || logY || fractionY !== null || obj.reconstruction?.preserveAxes || (yMin <= 0 && 0 <= yMax);   // horizontal axis at y=0 crosses the box?
  const yAxisVisible = boxFrame || logX || logY || fractionX !== null || obj.reconstruction?.preserveAxes || (xMin <= 0 && 0 <= xMax);   // vertical axis at x=0 crosses the box?

  // A box has its own frame/tick rails, independent of observed interior axes.
  // Guides still terminate at worldX0/worldY0 (the actual axis intersection).
  const interiorBoxAxes = boxFrame && (worldX0 !== left || worldY0 !== bottom);
  const tickAxisX = boxFrame ? left : worldX0;
  const tickAxisY = boxFrame ? bottom : worldY0;

  // ----- axis variant (형태): 십자(cross) / ㄴ자(quadrant) / ㅏ자(halfcross) / 직선(single) -----
  //   cross     : x·y 양방향 (십자, 공간좌표)
  //   quadrant  : x·y 모두 0부터 (ㄴ자, 1사분면)
  //   halfcross : x는 0부터, y는 양방향 (ㅏ자 — 시간축은 음수 없고 물리량만 ±)
  //   single    : x축만 (직선)
  const variant = obj.axisVariant || "cross";
  const hasYArm = variant !== "single";                    // 세로축을 그리나?
  // 음의 방향 축 팔은 범위가 실제로 음수까지 갈 때만 그린다(비대칭 범위 지원 — variant 대신
  // xMin/yMin으로 판정). 기존 3모양(ㄴ자·ㅏ자·십자)에선 결과가 동일하다.
  const xBoth = xMin < -1e-9;                              // x축 음의 방향도 그리나?
  const yBoth = hasYArm && yMin < -1e-9;                   // y축 음의 방향도?
  const rich = !!obj.richLabels;       // 혼합 라벨러(한글정자+영문이탤릭+수식) 사용
  const fullReconstructionGrid = !!obj.reconstruction && !!obj.gridToData && !obj.gridBounds;
  const gridToData = !!obj.gridToData; // 격자를 데이터 사각형 끝까지(꼬리 없이)
  // Positive-only forms start each axis at the origin; fall back to the box edge
  // when 0 is outside the perpendicular range so the line never begins off-canvas.
  const xAxisLeft   = (fractionX !== null || xBoth) ? left   : (yAxisVisible ? worldX0 : left);
  const yAxisBottom = (fractionY !== null || yBoth) ? bottom : (xAxisVisible ? worldY0 : bottom);

  // Grid/ticks/numbers at the exact box edge read as a terminal "bar" ⊢ and crowd
  // the arrow; skip them so the GRID stops one cell short of the range (평가원:
  // 범위 [-5,5] → 격자 [-4,4]) and the axis ends cleanly with just the arrow.
  const atEdgeX = (v) => Math.abs(v - xMin) < 1e-6 || Math.abs(v - xMax) < 1e-6;
  const atEdgeY = (v) => Math.abs(v - yMin) < 1e-6 || Math.abs(v - yMax) < 1e-6;

  // 눈금/격자의 '데이터 칸' k 범위. graph 도구가 gridCountX/Y(양의 칸 수)를 주면 마지막
  // 눈금을 ±gridCount로 캡한다(그러면 xMax/yMax의 남는 여백은 순수 화살표 마진 — 사진3의
  // "한 칸+α"). gridOver = 격자를 마지막 눈금 밖으로 더 뻗는 칸(사진4의 "반 칸"). 둘 다
  // 없으면(구 좌표평면) 기존처럼 xMin..xMax 정수배수.
  const stepX = obj.gridStepX || 1, stepY = obj.gridStepY || 1;
  // 격자·눈금 칸 수: 방향별(pos/neg) 우선, 없으면 대칭 gridCountX/Y로 폴백(구파일 호환).
  const gcXpos = Number.isFinite(obj.gridCountXPos) ? obj.gridCountXPos : (Number.isFinite(obj.gridCountX) ? obj.gridCountX : null);
  const gcYpos = Number.isFinite(obj.gridCountYPos) ? obj.gridCountYPos : (Number.isFinite(obj.gridCountY) ? obj.gridCountY : null);
  const gcXneg = Number.isFinite(obj.gridCountXNeg) ? obj.gridCountXNeg : (Number.isFinite(obj.gridCountX) ? obj.gridCountX : gcXpos);
  const gcYneg = Number.isFinite(obj.gridCountYNeg) ? obj.gridCountYNeg : (Number.isFinite(obj.gridCountY) ? obj.gridCountY : gcYpos);
  const gridOver = Number.isFinite(obj.gridOver) ? obj.gridOver : 0;
  // 점선 격자 튀어나옴(고급): 네 끝 각각. 없으면 단일 gridOver로 폴백(구파일 호환).
  const goXP = Number.isFinite(obj.gridOverXPos) ? obj.gridOverXPos : gridOver;
  const goXN = Number.isFinite(obj.gridOverXNeg) ? obj.gridOverXNeg : gridOver;
  const goYP = Number.isFinite(obj.gridOverYPos) ? obj.gridOverYPos : gridOver;
  const goYN = Number.isFinite(obj.gridOverYNeg) ? obj.gridOverYNeg : gridOver;
  const kx = gcXpos != null ? { kStart: xBoth ? -gcXneg : 0, kEnd: gcXpos, step: stepX } : tickRange(xMin, xMax, stepX);
  const ky = gcYpos != null ? { kStart: yBoth ? -gcYneg : 0, kEnd: gcYpos, step: stepY } : tickRange(yMin, yMax, stepY);
  // 눈금/라벨 스킵 판정: gridCount·gridToData 경로에선 데이터 범위를 이미 정확히 캡했으니
  // 박스-끝 트리밍(atEdge)을 걸지 않는다. 구 좌표평면(둘 다 없음)에서만 atEdge로 다듬는다.
  const legacyTrim = gcXpos == null && !gridToData;
  const skipTickX = (v) => legacyTrim && atEdgeX(v);
  const skipTickY = (v) => (gcYpos == null && !gridToData) && atEdgeY(v);

  const applyGridStyle = l => {
    const style = obj.gridStyle;
    if (style) {
      if (Number.isFinite(style.strokeWidth) && style.strokeWidth > 0) l.setAttribute('stroke-width', style.strokeWidth);
      if (Number.isFinite(style.strokeLevel)) l.setAttribute('stroke', grayHex(style.strokeLevel));
      if (style.dashLength === 0 || style.dashGap === 0) {
        l.removeAttribute('stroke-dasharray');
        l.setAttribute('stroke-linecap', 'butt');
      } else if (Number.isFinite(style.dashLength) && Number.isFinite(style.dashGap) && style.dashLength > 0 && style.dashGap > 0) {
        l.setAttribute('stroke-dasharray', `${style.dashLength} ${style.dashGap}`);
        l.setAttribute('stroke-linecap', 'butt');
      }
    }
  };

  // ----- GRID (light, dashed — 평가원 style) -----
  // Every grid line spans the SAME grid rectangle so the ends line up cleanly
  // (no dashes poking into the one-cell axis margin, #3). The rectangle is bounded
  // by the outermost drawn grid lines; the origin sides (L자/직선) are the axes.
  if (obj.showGrid && !logX && !logY) {
    // 격자 스타일: 대시를 더 짧게(점에 가깝게) + 간격을 넓혀 성기게(요구: 스타일 변경).
    const gdash = Math.max(sw * 1.8, 0.4);
    const addGrid = (x1, y1, x2, y2) => {
      const l = document.createElementNS(SVG_NS, "line");
      l.setAttribute("x1", x1); l.setAttribute("y1", y1);
      l.setAttribute("x2", x2); l.setAttribute("y2", y2);
      l.setAttribute("stroke", gridColor);
      l.setAttribute("stroke-width", sw * 0.5);
      l.setAttribute("stroke-linecap", "round");            // 짧은 대시가 점처럼 둥글게
      l.setAttribute("stroke-dasharray", `${gdash} ${gdash * 1.35}`);
      applyGridStyle(l);
      g.appendChild(l);
    };
    // 격자선이 놓이는 정수 k 범위. gridCount·gridToData면 데이터 끝(마지막 눈금)까지;
    // 구경로면 박스-끝 한 칸 트리밍.
    let xLoK, xHiK, yLoK, yHiK;
    if (obj.gridBounds) {
      xLoK=Math.ceil(obj.gridBounds.xMin/stepX);xHiK=Math.floor(obj.gridBounds.xMax/stepX);
      yLoK=Math.ceil(obj.gridBounds.yMin/stepY);yHiK=Math.floor(obj.gridBounds.yMax/stepY);
    } else if (!legacyTrim) {
      xLoK = xBoth ? kx.kStart : Math.max(0, kx.kStart); xHiK = kx.kEnd;
      yLoK = yBoth ? ky.kStart : Math.max(0, ky.kStart); yHiK = ky.kEnd;
    } else {
      let gXhi = kx.kEnd * kx.step; if (atEdgeX(gXhi)) gXhi -= kx.step;
      let gXlo = kx.kStart * kx.step; if (atEdgeX(gXlo)) gXlo += kx.step;
      let gYhi = ky.kEnd * ky.step; if (atEdgeY(gYhi)) gYhi -= ky.step;
      let gYlo = ky.kStart * ky.step; if (atEdgeY(gYlo)) gYlo += ky.step;
      xLoK = Math.round(gXlo / kx.step); xHiK = Math.round(gXhi / kx.step);
      yLoK = Math.round(gYlo / ky.step); yHiK = Math.round(gYhi / ky.step);
    }
    // 격자 사각형 경계 = 마지막 눈금 + gridOver 칸(사진4: 데이터 밖으로 반 칸 더).
    const rectLeft  = interiorBoxAxes || fullReconstructionGrid ? left : xBoth ? worldXFromMathX(P, (obj.gridBounds?.xMin ?? xLoK*kx.step) - goXN*kx.step) : worldX0;
    const rectRight = fullReconstructionGrid ? right : worldXFromMathX(P, (obj.gridBounds?.xMax ?? xHiK*kx.step) + goXP*kx.step);
    const rectTop   = fullReconstructionGrid ? top : worldYFromMathY(P, (obj.gridBounds?.yMax ?? yHiK*ky.step) + goYP*ky.step);
    const rectBot   = interiorBoxAxes || fullReconstructionGrid ? bottom : yBoth ? worldYFromMathY(P, (obj.gridBounds?.yMin ?? yLoK*ky.step) - goYN*ky.step) : worldY0;
    if (obj.showGridX !== false && kx.kEnd - kx.kStart <= GRID_MAX_LINES) {
      for (let k = xLoK; k <= xHiK; k++) {
        if ((!xBoth && k < 0) || skipTickX(k * kx.step)) continue;
        const vx = worldXFromMathX(P, k * kx.step);
        if (fullReconstructionGrid && obj.showAxisLines && boxFrame && (Math.abs(vx - left) < 1e-6 || Math.abs(vx - right) < 1e-6)) continue;
        if (yAxisVisible && (obj.showAxisLines || !fullReconstructionGrid) && Math.abs(vx - worldX0) < 1e-6) continue; // axis draws this one
        addGrid(vx, rectTop, vx, rectBot);
      }
    }
    if (obj.showGridY !== false && hasYArm && ky.kEnd - ky.kStart <= GRID_MAX_LINES) { // 직선이면 가로 격자 없음
      for (let k = yLoK; k <= yHiK; k++) {
        if ((!yBoth && k < 0) || skipTickY(k * ky.step)) continue;
        const vy = worldYFromMathY(P, k * ky.step);
        if (fullReconstructionGrid && obj.showAxisLines && boxFrame && (Math.abs(vy - top) < 1e-6 || Math.abs(vy - bottom) < 1e-6)) continue;
        if (xAxisVisible && (obj.showAxisLines || !fullReconstructionGrid) && Math.abs(vy - worldY0) < 1e-6) continue;
        addGrid(rectLeft, vy, rectRight, vy);
      }
    }
  }

  // ----- AXIS LINES + arrowheads (scaled 1.5× like renderAxes) -----
  // 축선은 화살표 notch(가운데 파인 지점)까지만 그어 촉과 깔끔히 이어지게 한다.
  const headSw = sw * 1.5;
  const examHead = obj.axisArrowShape === 'exam';
  const customHead = !examHead && (Number.isFinite(obj.axisArrowLength) || Number.isFinite(obj.axisArrowWidth));
  const headLength = obj.axisArrowLength > 0 ? obj.axisArrowLength : headSw * 6;
  const headWidth = obj.axisArrowWidth > 0 ? obj.axisArrowWidth : headSw * 3.6;
  // Text-created graphs have reserved outer padding. Extend only the axis
  // artwork beyond the data rectangle so an endpoint tick cannot touch a head.
  const overhang = obj.graphStyle?.descriptionLayout && !boxFrame ? headLength * 1.4 : 0;
  const tipRight = right + overhang, tipTop = top - overhang;
  const shaftGap = examHead ? headLength / 1.1551 : customHead ? headLength * 0.7 : headSw * 3.6;
  const arrowOn = key => typeof obj[key] === 'boolean' ? obj[key] : !boxFrame;
  const axisHead = (x, y, dx, dy) => {
    if (examHead) { const head=smoothArrowHead(x,y,dx,dy,headLength/(1.1551*6),color,obj.axisArrowWidthScale || 1);head.setAttribute('data-axis-arrow','');g.appendChild(head); }
    else if (customHead) g.appendChild(makeArrowHead(x,y,dx,dy,headLength,color,{lenMul:1,widthMul:headWidth/(2*headLength)}));
    else appendArrow(g,x,y,dx,dy,headSw,color);
  };
  if (obj.showAxisLines) {
    if (xAxisVisible) {
      addLine(boxFrame ? left : xAxisLeft, worldY0, tipRight - (arrowOn('axisArrowX') ? shaftGap : 0), worldY0, color, sw);
      if (arrowOn('axisArrowX')) axisHead(tipRight,worldY0,1,0);
    }
    if (hasYArm && yAxisVisible) {
      addLine(worldX0, boxFrame ? bottom : yAxisBottom, worldX0, tipTop + (arrowOn('axisArrowY') ? shaftGap : 0), color, sw);
      if (arrowOn('axisArrowY')) axisHead(worldX0,tipTop,0,-1);
    }
    if (boxFrame) {
      // Bottom/left axes normally supply these borders. Interior axes must not
      // replace them; avoid duplicate strokes in the default edge-axis case.
      if (worldY0 !== bottom) addLine(left,bottom,right,bottom,color,sw);
      if (worldX0 !== left) addLine(left,bottom,left,top,color,sw);
      if (worldY0 !== top) addLine(left,top,right,top,color,sw);
      if (!obj.y2?.enabled && worldX0 !== right) addLine(right,bottom,right,top,color,sw);
    }
  }

  // ----- TICK MARKS on the visible axes (skip the origin + box-edge ends) -----
  // 눈금은 '데이터 쪽(안쪽)으로만' 뻗는다(요구): ㄴ자면 x축 눈금은 위로만(아래로 안 튀어나옴),
  // y축 눈금은 오른쪽으로만(왼쪽으로 안 튀어나옴). 반대쪽으로는 그 방향에 데이터가 있을 때만
  // (십자=양쪽). x축 아래쪽은 y가 음수 범위(yBoth)일 때만, y축 왼쪽은 x가 음수 범위(xBoth)일 때만.
  const tIn = obj.tickLength || sw * 4.8;
  const tickSw = obj.tickStrokeWidth || sw * 0.8;
  if (obj.showTicks) {
    if (xAxisVisible && !logX && !Array.isArray(obj.explicitTicksX)) {
      const up = tIn, down = yBoth && !boxFrame ? tIn : 0;       // 위=항상, 아래=y음수범위일 때만
      if (kx.kEnd - kx.kStart <= GRID_MAX_LINES) for (let k = kx.kStart; k <= kx.kEnd; k++) {
        if (k === 0 || (!xBoth && k < 0) || skipTickX(k * kx.step)) continue;
        const vx = worldXFromMathX(P, k * kx.step);
        addLine(vx, tickAxisY - up, vx, tickAxisY + down, tickColor, tickSw);  // -y = 위(안쪽)
      }
    }
    if (hasYArm && yAxisVisible && !logY && !Array.isArray(obj.explicitTicksY)) {
      const rightLen = tIn, leftLen = xBoth && !boxFrame ? tIn : 0; // 오른쪽=항상, 왼쪽=x음수범위일 때만
      if (ky.kEnd - ky.kStart <= GRID_MAX_LINES) for (let k = ky.kStart; k <= ky.kEnd; k++) {
        if (k === 0 || (!yBoth && k < 0) || skipTickY(k * ky.step)) continue;
        const vy = worldYFromMathY(P, k * ky.step);
        addLine(tickAxisX - leftLen, vy, tickAxisX + rightLen, vy, tickColor, tickSw); // +x = 오른쪽(안쪽)
      }
    }
  }

  // ----- TICK LABELS (숫자 또는 기호) -----
  const numSize = Math.max(obj.tickLabelSize || 2.6, 1);
  // 축↔라벨 간격: 눈금이 안쪽으로만 뻗으니 라벨을 축 바로 밑에 더 바짝(요구: 여전히 낮다).
  const tickGap = numSize * 0.04 + sw * 1.5;
  const descriptionXTicks = [];
  // 눈금 숫자 이동(요구 ②): 숫자마다 {dx,dy} 오프셋을 적용하고, data-tick으로 태깅한다
  // (모달 미리보기가 그 태그를 잡아 드래그로 오프셋을 조정). tag=`${axis}:${ord}`.
  const addNumber = (text, nx, ny, anchor, baseline, tag) => {
    let node;
    if (rich) {
      // 눈금 숫자도 halo를 켠다 — 예전엔 흰 사각형 블록이 대신 가려 줬는데 그 블록을
      // 없앴으므로(glyph 윤곽만 남김), 격자 파선이 숫자를 뚫고 지나가지 않게 하려면 필요하다.
      node = renderGraphLabel(text, { x: nx, y: ny, size: numSize, color, anchor, vAlign: baselineToVAlign(baseline), halo: true, haloRatio: obj.haloRatio, weight: obj.labelWeight });
      if (node) g.appendChild(node);
    } else {
      node = document.createElementNS(SVG_NS, "text");
      node.setAttribute("x", nx); node.setAttribute("y", ny);
      node.setAttribute("font-size", numSize);
      node.setAttribute("font-weight", obj.labelWeight ?? 400);
      // Upright serif numerals (math-axis convention); NOT the italic 물리량 font.
      node.setAttribute("font-family", "'Times New Roman', 'IBM Plex Serif', serif");
      node.setAttribute("fill", color);
      node.setAttribute("text-anchor", anchor);
      node.setAttribute("dominant-baseline", baseline);
      node.textContent = text;
      g.appendChild(node);
    }
    if (node && tag) node.setAttribute("data-tick", tag);
    if (node && tag?.startsWith('x:') && obj.graphStyle?.descriptionLayout) {
      const metric = measureGraphLabel(text,EXAM_STYLE.label,false,obj.labelWeight ?? 400,true,{parenthesesAreUnits:false});
      const off = obj.tickOffX?.[Number(tag.slice(2))];
      descriptionXTicks.push({node,x:nx,y:ny,width:metric.w*numSize/EXAM_STYLE.label,height:metric.h*numSize/EXAM_STYLE.label,pinned:!!(off?.dx || off?.dy)});
    }
    return node;
  };
  // 눈금별 이동 오프셋 조회(월드 mm). obj.tickOffX/Y = [{dx,dy}, …] (순번 기준).
  const tickOffOf = (arr, ord) => {
    const o = arr && arr[ord];
    return (o && (Number.isFinite(o.dx) || Number.isFinite(o.dy)))
      ? { dx: o.dx || 0, dy: o.dy || 0 } : { dx: 0, dy: 0 };
  };
  // 눈금 라벨 모드: "none"(없음) | "number"(자동 숫자) | "text"(문자 눈금 — t_0, 2t_0 등 직접).
  // 구파일 호환: tickLabelMode 없으면 showTickLabels로 판정.
  // 문자 눈금은 '가장 아래(축 팔의 맨 끝) → 위' 순서로 배열이 붙는다(요구: ㅏ자 음의 y축에도
  // 입력 가능해야 함). 원점(k=0)은 건너뛴다. 아래 tickOrd(k,kStart)가 그 순번을 준다 —
  // 양의 방향만 있는 축(ㄴ자·1사분면: kStart 0 또는 1)에서는 항상 k-1이 되어 기존 동작과 동일하다.
  const tickMode = obj.tickLabelMode || (obj.showTickLabels ? "number" : "none");
  // kStart..k 사이 0이 아닌 눈금 중 k의 0-based 순번(원점 건너뜀 보정).
  const tickOrd = (k, kStart) => (k - kStart) - (kStart <= 0 && k >= 0 ? 1 : 0);
  if (tickMode !== "none") {
    // 숫자 눈금값 = k × 격자 간격. 격자선이 곧 그 값의 자리이므로 별도 배율을 곱하지 않는다
    // (간격 0.5면 격자가 0.5마다 그어지고 라벨도 0, 0.5, 1… 로 따라붙는다).
    const labelFor = (k, labelStep, arr, kStart) => {
      if (tickMode !== "text") return fmtTick(k * labelStep);
      if (!arr) return "";
      const ord = tickOrd(k, kStart);
      return (ord >= 0 && arr[ord] != null) ? String(arr[ord]) : "";
    };
    if (xAxisVisible && !logX && !Array.isArray(obj.explicitTicksX)) {
      if (kx.kEnd - kx.kStart <= GRID_MAX_LINES) for (let k = kx.kStart; k <= kx.kEnd; k++) {
        if (k === 0 || (!xBoth && k < 0) || skipTickX(k * kx.step)) continue;
        const txt = labelFor(k, kx.step, obj.tickTextX, kx.kStart);
        if (!txt) continue;
        const ordX = tickOrd(k, kx.kStart);
        const offX = tickOffOf(obj.tickOffX, ordX);
        const vx = worldXFromMathX(P, k * kx.step);
        // 눈금 라벨을 눈금선보다 살짝 왼쪽으로(요구): 아래첨자(t₀의 ₀) 때문에 우측으로
        // 치우쳐 보이는 걸 보정.
        addNumber(txt, vx - numSize * 0.14 + offX.dx, tickAxisY + tickGap + offX.dy, "middle", "hanging", "x:" + ordX);
      }
    }
    if (hasYArm && yAxisVisible && !logY && !Array.isArray(obj.explicitTicksY)) {
      if (ky.kEnd - ky.kStart <= GRID_MAX_LINES) for (let k = ky.kStart; k <= ky.kEnd; k++) {
        if (k === 0 || (!yBoth && k < 0) || skipTickY(k * ky.step)) continue;
        const txt = labelFor(k, ky.step, obj.tickTextY, ky.kStart);
        if (!txt) continue;
        const ordY = tickOrd(k, ky.kStart);
        const offY = tickOffOf(obj.tickOffY, ordY);
        const vy = worldYFromMathY(P, k * ky.step);
        addNumber(txt, tickAxisX - tickGap + offY.dx, vy + offY.dy, "end", "middle", "y:" + ordY);
      }
    }
  }

  if (obj.showGrid && (logX || logY)) {
    for (const axis of ['x','y']) for (const value of coordinateTicks(P,axis,axis === 'x' ? stepX : stepY).slice(0,GRID_MAX_LINES)) {
      if (axis === 'x' ? obj.showGridX === false : obj.showGridY === false) continue;
      const x = worldXFromMathX(P,value), y = worldYFromMathY(P,value);
      if (axis === 'x') addLine(x,top,x,bottom,gridColor,sw*0.5); else if(hasYArm) addLine(left,y,right,y,gridColor,sw*0.5);
      g.lastChild.setAttribute('stroke-dasharray', `${Math.max(sw*1.8,0.4)} ${Math.max(sw*1.8,0.4)*1.35}`);
      applyGridStyle(g.lastChild);
    }
  }
  for (const axis of ['x','y']) {
    if (!(axis === 'x' ? logX : logY) || (axis === 'y' && !hasYArm) || Array.isArray(axis === 'x' ? obj.explicitTicksX : obj.explicitTicksY)) continue;
    coordinateTicks(P,axis,1).slice(0,GRID_MAX_LINES).forEach((value,index) => {
      const x=worldXFromMathX(P,value), y=worldYFromMathY(P,value);
      if(obj.showTicks) { if(axis==='x')addLine(x,tickAxisY-tIn,x,tickAxisY,tickColor,tickSw);else addLine(tickAxisX,y,tickAxisX+tIn,y,tickColor,tickSw); }
      if(tickMode!=='none' && (axis==='x'?obj.showTickX!==false:obj.showTickY!==false)) {
        const label=rich ? `10^{${Math.round(Math.log10(value))}}` : `10^${Math.round(Math.log10(value))}`;
        if(axis==='x')addNumber(label,x,tickAxisY+tickGap,'middle','hanging',`x:${index}`);else addNumber(label,tickAxisX-tickGap,y,'end','middle',`y:${index}`);
      }
    });
  }

  for (const axis of ['x', 'y']) {
    const entries = axis === 'x' ? obj.explicitTicksX : obj.explicitTicksY;
    if (!Array.isArray(entries)) continue;
    entries.forEach((tick, index) => {
      const value = tick.value;
      if (!Number.isFinite(value) || value < (axis === 'x' ? xMin : yMin) || value > (axis === 'x' ? xMax : yMax)) return;
      const wx = worldXFromMathX(P, value), wy = worldYFromMathY(P, value);
      const off = tickOffOf(axis === 'x' ? obj.tickOffX : obj.tickOffY, index);
      if (obj.showTicks) {
        if (axis === 'x') addLine(wx, tickAxisY - tIn, wx, tickAxisY, tickColor, tickSw);
        else addLine(tickAxisX, wy, tickAxisX + tIn, wy, tickColor, tickSw);
      }
      if (tickMode !== 'none' && tick.label !== '') {
        if (axis === 'x') addNumber(tick.label, wx + off.dx, tickAxisY + tickGap + off.dy, 'middle', 'hanging', `x:${index}`);
        else addNumber(tick.label, tickAxisX - tickGap + off.dx, wy + off.dy, 'end', 'middle', `y:${index}`);
      }
    });
  }

  // ----- AXIS NAME LABELS + ORIGIN -----
  // A requested symbolic tick can arrive as a text annotation (e.g. π next
  // to the numeric tick 3). Keep that annotation at its actual coordinate and
  // reserve its space before laying out automatic numeric labels.
  if (obj.graphStyle?.descriptionLayout) for (const annotation of obj.graphAnnotations || []) {
    if (annotation.kind !== 'text' || annotation.orientation === 'vertical' || !Number.isFinite(annotation.x) || !Number.isFinite(annotation.y)) continue;
    const x=worldXFromMathX(P,annotation.x), y=worldYFromMathY(P,annotation.y);
    if (x<left || x>right || y<tickAxisY || y>tickAxisY+numSize*1.8) continue;
    const size=annotation.fontSize || annotation.size || numSize;
    const metric=measureGraphLabel(annotation.displayText ?? annotation.text,EXAM_STYLE.label,false,annotation.fontWeight ?? obj.labelWeight ?? 400,true,{parenthesesAreUnits:false});
    const height=metric.h*size/EXAM_STYLE.label;
    descriptionXTicks.push({x,y:y-height/2,width:metric.w*size/EXAM_STYLE.label,height,pinned:true});
  }
  let descriptionXTickDepth = 0;
  for (const label of descriptionTickLabelLanes(descriptionXTicks,numSize*.18)) {
    if (label.dy && label.node) label.node.setAttribute('transform',`translate(0 ${label.dy}) ${label.node.getAttribute('transform') || ''}`);
    descriptionXTickDepth = Math.max(descriptionXTickDepth,label.y+label.dy+label.height-tickAxisY);
  }
  const nameSize = obj.axisLabelSize ? Math.max(obj.axisLabelSize, 1) : Math.max(sw * 14, 3);
  const addName = (text, lx, ly, anchor, baseline, size = nameSize) => {
    if (!text) return;
    if (rich) {
      // 혼합 라벨러: 한글 정자 + 영문 이탤릭 + 줄바꿈 + 수식 + halo.
      const gl = renderGraphLabel(text, { x: lx, y: ly, size, color, anchor, vAlign: baselineToVAlign(baseline), halo: true, haloRatio: obj.haloRatio, weight: obj.labelWeight, upright: true });
      if (gl) g.appendChild(gl);
      return gl;
    }
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", lx); t.setAttribute("y", ly);
    t.setAttribute("font-size", size);
    t.setAttribute("font-weight", obj.labelWeight ?? 400);
    applyObjectLabelFont(t, obj.labelType); if (obj.reconstruction) t.setAttribute("font-style", "normal");
    t.setAttribute("fill", color);
    t.setAttribute("text-anchor", anchor);
    t.setAttribute("dominant-baseline", baseline);
    fillTextWithRomanRuns(t, text);
    g.appendChild(t);
    return t;
  };
  // 축 이름 전용: 저장된 오프셋(labelXOffset/labelYOffset)만큼 옮겨 그리고, 모달 드래그가
  // 잡을 수 있게 data-axisname으로 태깅한다(요구: 축 라벨 이동 가능).
  const offX = obj.labelXOffset && Number.isFinite(obj.labelXOffset.dx) ? obj.labelXOffset : { dx: 0, dy: 0 };
  const offY = obj.labelYOffset && Number.isFinite(obj.labelYOffset.dx) ? obj.labelYOffset : { dx: 0, dy: 0 };
  // 축 라벨 이동(요구 2): 옮긴 라벨은 '평면 박스 기준 분율(labelXPos/labelYPos)'로 절대 위치를
  // 잡는다 → 화살표 여백·범위를 바꿔 축(원점)이 움직여도 라벨은 제자리에 남는다. 분율이 없으면
  // (아직 안 옮김) 기존처럼 축 앵커 + 오프셋을 쓴다.
  const posX = obj.labelXPos && Number.isFinite(obj.labelXPos.fx) ? obj.labelXPos : null;
  const posY = obj.labelYPos && Number.isFinite(obj.labelYPos.fx) ? obj.labelYPos : null;
  const addAxisName = (which, text, lx, ly, anchor, baseline) => {
    if (!text) return;
    const off = which === "x" ? offX : offY;
    const pos = which === "x" ? posX : posY;
    let auto = null;
    const source = obj.reconstruction?.source;
    if (!pos && obj.graphStyle?.descriptionLayout && source?.plotBox) {
      const b = source.plotBox, scale = obj.w / b.w;
      // Same canonical measurement as graphLabelRenderer above. This keeps
      // long Korean/unit labels inside the export, at every insertion size.
      const metric = measureGraphLabel(text, EXAM_STYLE.label, graphLabelUpright(obj), obj.labelWeight ?? 400, true,
        {parenthesesAreUnits:false,unit:obj.reconstruction?.axes?.[which]?.unit});
      auto = descriptionTitleLayout({ which, left, right:tipRight, top:tipTop, axisX:worldX0, axisY:worldY0,
        viewport:{left:obj.x-b.x*scale,right:obj.x+(source.width-b.x)*scale,top:obj.y-b.y*scale,bottom:obj.y+(source.height-b.y)*scale},
        width:metric.w*nameSize/EXAM_STYLE.label,height:metric.h*nameSize/EXAM_STYLE.label,gap:nameSize*.55,
        tickClearance:obj.showTickLabels || obj.tickLabelMode === 'text' ? Math.max(numSize + tickGap,descriptionXTickDepth) + nameSize*.55 : 0 });
    }
    const px = pos ? obj.x + pos.fx * obj.w : (auto?.x ?? lx) + (off.dx || 0);
    const py = pos ? obj.y + pos.fy * obj.h : (auto?.y ?? ly) + (off.dy || 0);
    // 분율 위치는 라벨 '중심'을 그 점에 맞춘다(모달 드래그가 중심 분율을 저장하므로 튐 없음).
    const requestedAnchor = which === "x" ? obj.labelXAnchor : obj.labelYAnchor;
    const anc = ["start", "middle", "end"].includes(requestedAnchor) ? requestedAnchor : (pos ? "middle" : auto?.anchor ?? anchor);
    const bl = pos || auto ? "middle" : baseline;
    const titleSize = nameSize * (auto?.sizeScale ?? 1);
    let el = null;
    if (rich) el = renderGraphLabel(text, { x: px, y: py, size: titleSize, color, anchor: anc, vAlign: baselineToVAlign(bl), unit:obj.graphStyle?.descriptionLayout ? obj.reconstruction?.axes?.[which]?.unit : undefined, orientation: obj.reconstruction?.axes?.[which]?.orientation, halo: true, haloRatio: obj.haloRatio, weight: obj.labelWeight });
    else {
      el = document.createElementNS(SVG_NS, "text");
      el.setAttribute("x", px); el.setAttribute("y", py); el.setAttribute("font-size", titleSize);
      applyObjectLabelFont(el, obj.labelType); if (obj.reconstruction) el.setAttribute("font-style", "normal"); el.setAttribute("fill", color); el.setAttribute("font-weight", obj.labelWeight ?? 400);
      el.setAttribute("text-anchor", anc); el.setAttribute("dominant-baseline", bl);
      fillTextWithRomanRuns(el, text);
    }
    if (el) { el.setAttribute("data-axisname", which); g.appendChild(el); }
  };
  const showX = obj.showAxisLabels !== false && obj.showAxisLabelX !== false; // 라벨별 on/off
  const showY = obj.showAxisLabels !== false && obj.showAxisLabelY !== false;
  if (obj.showAxisLines) {
    const Lshape = (variant === "quadrant" || variant === "halfcross");
    if (obj.reconstruction?.preserveAxes) {
      if (xAxisVisible && showX) addAxisName('x', obj.labelX, right, worldY0 + nameSize, 'end', 'hanging');
      if (hasYArm && yAxisVisible && showY) addAxisName('y', obj.labelY, worldX0 - nameSize * 0.4, top - nameSize * 0.3, 'end', 'auto');
    } else if (Lshape) {
      // ㄴ/ㅏ(사진 기준): x이름 = 화살표의 '아래쪽 오른편', 눈금 숫자와 같은 줄에 나란히
      // (t₀·2t₀… 와 같은 높이, 화살표 오른쪽). y이름 = y축 화살표 '왼쪽 위'.
      const numBaseY = worldY0 + tickGap + numSize * 0.78;
      if (xAxisVisible && showX) addAxisName("x", obj.labelX, right - nameSize * 0.35, numBaseY, "start", "alphabetic");
      if (hasYArm && yAxisVisible && showY) addAxisName("y", obj.labelY, worldX0 - nameSize * 0.32, top + nameSize * 0.85, "end", "auto");
    } else {
      // 십자/직선: x이름=화살표 위, y이름=y축 오른쪽 위.
      if (xAxisVisible && showX) addAxisName("x", obj.labelX, right, worldY0 - nameSize * 0.5, "end", "auto");
      if (hasYArm && yAxisVisible && showY) addAxisName("y", obj.labelY, worldX0 + nameSize * 0.6, top, "start", "hanging");
    }
  }
  // 원점 라벨: ㅏ자(halfcross)는 원점 "좌측"(요구 12), 그 외는 좌하단.
  if (obj.showOrigin && xAxisVisible && yAxisVisible) {
    const oText = obj.labelOrigin ?? "O";
    // 원점 라벨: 기본 크기 살짝 작게(nameSize*0.82) + 원점에 더 가까이(오프셋 축소).
    const oSize = Number.isFinite(obj.originLabelSize) && obj.originLabelSize > 0 ? obj.originLabelSize : nameSize * 0.82;
    const origin = variant === "halfcross" ? addName(oText, worldX0 - oSize * 0.35, worldY0, "end", "middle", oSize)
      : addName(oText, worldX0 - oSize * 0.22, worldY0 + oSize * 0.08, "end", "hanging", oSize);
    origin?.setAttribute("data-axisname", "origin");
  }

  // ----- 오른쪽 세로축(y2): 좌우 이중 y축 -----
  // 생명과학 자료해석 문항의 정형 형식 — 왼쪽 축과 오른쪽 축의 '이름·눈금'이 서로 다르고,
  // 계열마다 어느 축을 읽는지가 정해진다. 판(box)은 하나이므로 오른쪽 축은 판의 오른쪽
  // 끝(right)에 세우고, 눈금은 데이터 반대쪽(바깥)으로 뻗는다.
  // ★ 격자는 왼쪽 축 기준으로만 그린다(위 GRID 블록) — 두 축 모두 그리면 격자가 두 겹이 된다.
  // ★ 기출 관례상 눈금 '숫자'가 아예 없는 경우가 많다 → showTickY2를 꺼도 축선·축 이름은 나온다.
  const y2c = obj.y2;
  if (y2c && y2c.enabled && hasYArm && obj.showAxisLines) {
    const r2 = y2RangeOf(obj);
    // 축선 + 화살촉: 왼쪽 세로축과 같은 모양·같은 높이 범위(판의 아래끝~위끝).
    addLine(right, boxFrame || y2c.scale === 'log' ? bottom : yAxisBottom, right, top + (arrowOn('axisArrowY2') ? shaftGap : 0), color, sw);
    if (arrowOn('axisArrowY2')) axisHead(right, top, 0, -1);
    const step2 = Number.isFinite(y2c.gridStepY2) && y2c.gridStepY2 > 0 ? y2c.gridStepY2 : 1;
    const lblStep2 = Number.isFinite(y2c.tickStepY2) && y2c.tickStepY2 > 0 ? y2c.tickStepY2 : step2;
    const texts2 = Array.isArray(y2c.tickTextY2) && y2c.tickTextY2.length ? y2c.tickTextY2 : null;
    const showNum2 = y2c.showTickY2 === true || !!texts2;
    // 눈금 칸 인덱스는 왼쪽 축(ky)의 것을 그대로 쓴다 — 판이 하나뿐이라 두 축의 눈금 개수가
    // 같아야 하고, 왼쪽에서 화살표 여백으로 잘라 둔 마지막 칸을 오른쪽만 더 그리면 안 된다
    // (tickRange로 y2 범위를 따로 훑으면 여백 안쪽에 눈금이 하나 더 생긴다).
    const lo2 = Math.min(r2.min, r2.max), hi2 = Math.max(r2.min, r2.max);
    let ord2 = 0;
    if (y2c.scale !== 'log' && !Array.isArray(y2c.explicitTicks) && ky.kEnd - ky.kStart <= GRID_MAX_LINES) {
      for (let k = ky.kStart; k <= ky.kEnd; k++) {
        const v2 = k * step2;
        if (k === 0 || (!yBoth && k < 0) || skipTickY(k * ky.step)) continue;
        if (v2 < lo2 - 1e-6 || v2 > hi2 + 1e-6) continue;
        const vy = worldYFromMathY2(obj, v2);
        // 눈금 표시선도 showTickY2를 따라간다 — 끄면 '축선 + 축 이름'만 남는다(기출 관례).
        if (obj.showTicks && showNum2) addLine(right, vy, right + (boxFrame ? -tIn : tIn), vy, tickColor, tickSw);  // 바깥(오른쪽)으로
        if (showNum2) {
          const txt = texts2 ? String(texts2[ord2] ?? "") : fmtTick(k * lblStep2);
          if (txt) addNumber(txt, right + tIn + tickGap, vy, "start", "middle", null)?.setAttribute('data-y2-tick', String(ord2));
        }
        ord2++;
      }
    }
    if(y2c.scale === 'log' && !Array.isArray(y2c.explicitTicks)) coordinateTicks(planeAsY2(P),'y',1).slice(0,GRID_MAX_LINES).forEach((value,index)=>{
      const y=worldYFromMathY2(P,value);
      if(obj.showTicks&&showNum2)addLine(right,y,right+(boxFrame?-tIn:tIn),y,tickColor,tickSw);
      if(showNum2)addNumber(rich?`10^{${Math.round(Math.log10(value))}}`:`10^${Math.round(Math.log10(value))}`,right+tIn+tickGap,y,'start','middle',null)?.setAttribute('data-y2-tick',String(index));
    });
    // 축 이름: 오른쪽 바깥에 세로쓰기(아래→위로 읽는 방향, -90° 회전).
    (y2c.explicitTicks || []).forEach((tick,index) => {
      if (tick.value < lo2 || tick.value > hi2) return;
      const vy = worldYFromMathY2(obj, tick.value);
      if (obj.showTicks && showNum2) addLine(right, vy, right + (boxFrame ? -tIn : tIn), vy, tickColor, tickSw);
      if (showNum2 && tick.label) addNumber(tick.label, right + tIn + tickGap, vy, 'start', 'middle', null)?.setAttribute('data-y2-tick',String(index));
    });
    if (y2c.labelY2) {
      const lx = right + tIn + (showNum2 ? numSize * 1.9 : numSize * 0.5) + nameSize * 0.65;
      const ly = (top + bottom) / 2;
      const wrap = document.createElementNS(SVG_NS, "g");
      const orientation = obj.reconstruction?.axes?.y2?.orientation || 'rotate';
      if (orientation === 'rotate') wrap.setAttribute('transform', `rotate(-90 ${lx} ${ly})`);
      let el2 = null;
      if (rich) {
        el2 = renderGraphLabel(y2c.labelY2, { orientation: orientation === 'vertical' ? 'vertical' : 'horizontal', unit:obj.graphStyle?.descriptionLayout ? obj.reconstruction?.axes?.y2?.unit : undefined, x: lx, y: ly, size: nameSize, color, anchor: "middle", vAlign: "middle", halo: true, haloRatio: obj.haloRatio, weight: obj.labelWeight });
      } else {
        el2 = document.createElementNS(SVG_NS, "text");
        el2.setAttribute("x", lx); el2.setAttribute("y", ly); el2.setAttribute("font-size", nameSize);
        applyObjectLabelFont(el2, obj.labelType); if (obj.reconstruction) el2.setAttribute("font-style", "normal"); el2.setAttribute("fill", color);
        el2.setAttribute("text-anchor", "middle"); el2.setAttribute("dominant-baseline", "middle");
        fillTextWithRomanRuns(el2, y2c.labelY2);
      }
      if (el2) { el2.setAttribute("data-axisname", "y2"); wrap.appendChild(el2); g.appendChild(wrap); }
    }
  }

  // ----- '표시' 레이어(요구 ③): 곡선에 종속되지 않는 독립 주석 -----
  // 전부 평면 객체에 math 좌표로 저장되고 여기서 P로 world 변환 → 평면을 리사이즈해도 함께 따라온다.
  // 표시점 ●, 수선의 발(축까지 점선), 화살촉, 가이드라인(두 점 점선), 범례(선 견본+글씨) 박스.
  const annColor = grayHex(obj.strokeLevel);
  const annSw = obj.strokeWidth || 0.3;
  const styleGuide = (line, override) => {
    const hasOverride = override && ['strokeWidth', 'dashLength', 'dashGap', 'strokeLevel'].some(key => Number.isFinite(override[key]));
    const style = hasOverride ? { ...obj.guideStyle, ...override } : obj.guideStyle;
    if (!style) return;
    if (Number.isFinite(style.strokeWidth) && style.strokeWidth > 0) line.setAttribute('stroke-width', style.strokeWidth);
    if (Number.isFinite(style.strokeLevel)) line.setAttribute('stroke', grayHex(style.strokeLevel));
    if (style.dashLength === 0 || style.dashGap === 0) {
      line.removeAttribute('stroke-dasharray');
      line.setAttribute('stroke-linecap', 'butt');
    } else if (Number.isFinite(style.dashLength) && style.dashLength > 0 && Number.isFinite(style.dashGap) && style.dashGap > 0) {
      line.setAttribute('stroke-dasharray', `${style.dashLength} ${style.dashGap}`);
      line.setAttribute('stroke-linecap', 'butt');
    }
    line.setAttribute('data-graph-guide', '');
  };
  const wmX = (mx) => worldXFromMathX(P, mx), wmY = (my) => worldYFromMathY(P, my);
  // 수선의 발: 점 (x,y)에서 두 축으로 점선을 내린다(곡선 불필요 — 자유 표시점에서도 동작).
  (obj.annGuides || []).forEach((p, index) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const wx = wmX(p.x), wy = wmY(p.y);
    const seg = (x1, y1, x2, y2) => {
      const l = document.createElementNS(SVG_NS, "line");
      l.setAttribute('data-display-kind','guide'); l.setAttribute('data-display-index',String(index));
      l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2);
      l.setAttribute("stroke", annColor); l.setAttribute("stroke-width", annSw * 0.55);
      l.setAttribute("stroke-dasharray", "0.54 0.42"); l.setAttribute("stroke-linecap", "round");
      styleGuide(l, p);
      g.appendChild(l);
    };
    if (Math.abs(wy - worldY0) > 1e-6) seg(wx, wy, wx, worldY0);   // → x축(수직)
    if (Math.abs(wx - worldX0) > 1e-6) seg(wx, wy, worldX0, wy);   // → y축(수평)
  });
  // 가이드라인: 두 점을 잇는 점선(수선의 발보다 대시가 큼 — 안내선 성격).
  (obj.guideLines || []).forEach((gl, index) => {
    if (!gl || !Number.isFinite(gl.x1)) return;
    const l = document.createElementNS(SVG_NS, "line");
    l.setAttribute('data-display-kind','guideline'); l.setAttribute('data-display-index',String(index));
    l.setAttribute("x1", wmX(gl.x1)); l.setAttribute("y1", wmY(gl.y1));
    l.setAttribute("x2", wmX(gl.x2)); l.setAttribute("y2", wmY(gl.y2));
    // 가이드라인: 수선의 발보다 더 촘촘하고 얇게(요구 2, 평가원 양식).
    l.setAttribute("stroke", annColor); l.setAttribute("stroke-width", annSw * 0.45);
    l.setAttribute("stroke-dasharray", "0.45 0.35"); l.setAttribute("stroke-linecap", "round");
    styleGuide(l, gl);
    g.appendChild(l);
  });
  // 화살촉: (x,y)=곡선 위 지점, (dx,dy)=그 지점 접선(요구 5, 클릭 한 번). 옛 데이터(tx,ty)도 호환.
  // 클릭한 지점이 화살촉의 '정중앙'에 오도록 촉을 진행 방향으로 길이 절반만큼 앞당긴다(요구 4).
  (obj.annArrows || []).forEach((a, index) => {
    if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return;
    const cx = wmX(a.x), cy = wmY(a.y);
    let dx, dy;
    if (Number.isFinite(a.dx) && Number.isFinite(a.dy)) { dx = a.dx; dy = a.dy; }
    else { dx = cx - wmX(Number.isFinite(a.tx) ? a.tx : a.x - 1); dy = cy - wmY(Number.isFinite(a.ty) ? a.ty : a.y); }
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    // 방향표시 화살표(표시 탭)는 기존 화살촉(makeArrowHead)을 그대로 쓴다 — 좌표축 화살표만
    // smoothArrowHead(요구 5)로 바뀌었고, 이 화살표·직선 끝 화살표는 원래 것을 유지한다.
    const headSw = annSw * 1.75, headLen = headSw * 4.5;   // makeArrowHead의 length와 동일
    // 클릭 지점이 화살촉 정중앙(요구 4) — 촉을 진행방향으로 절반 앞당긴다.
    const head = isExamStyle(obj) ? smoothArrowHead(cx + dx * obj.axisArrowLength / 2,cy + dy * obj.axisArrowLength / 2,dx,dy,obj.axisArrowLength/(1.1551*6),annColor) : makeArrowHead(cx + dx * headLen / 2, cy + dy * headLen / 2, dx, dy, headSw, annColor);
    head.setAttribute('data-display-kind','arrow'); head.setAttribute('data-display-index',String(index));
    g.appendChild(head);
  });
  // 표시점: 검은 원(반지름 = 선 굵기 연동, 계열 표시점과 동일 식).
  (obj.annMarkers || []).forEach((p, index) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute('data-display-kind','marker'); c.setAttribute('data-display-index',String(index));
    c.setAttribute("cx", wmX(p.x)); c.setAttribute("cy", wmY(p.y));
    c.setAttribute("r", obj.markerSize || markerRadius(annSw)); c.setAttribute("fill", annColor); c.setAttribute("stroke", "none");
    g.appendChild(c);
  });
  // 라벨러 표시점(요구 ⑥): 점 + A·B·C… 라벨. 라벨은 점에서 dist(mm)만큼 angle(도, 0=오른쪽,
  // +=반시계) 방향에 놓인다. 화면 y는 아래로 증가하므로 반시계로 보이려면 dy를 -sin으로 뒤집는다.
  (obj.annLabelPoints || []).forEach((lp, li) => {
    if (!lp || !Number.isFinite(lp.x) || !Number.isFinite(lp.y)) return;
    const wx = wmX(lp.x), wy = wmY(lp.y);
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", wx); c.setAttribute("cy", wy);
    c.setAttribute("r", obj.markerSize || markerRadius(annSw)); c.setAttribute("fill", annColor); c.setAttribute("stroke", "none");
    if (Number.isFinite(li)) c.setAttribute("data-labelpt", String(li));   // 미리보기 드래그용(향후)
    g.appendChild(c);
    const dist = Number.isFinite(lp.dist) ? lp.dist : 5;
    const angleDeg = Number.isFinite(lp.angle) ? lp.angle : 45;
    const rad = (angleDeg * Math.PI) / 180;
    const lx = wx + Math.cos(rad) * dist, ly = wy - Math.sin(rad) * dist;
    const size = Number.isFinite(lp.size) ? lp.size : 5.29; // 15pt ≈ 5.29mm
    // 점 이름(A·B·C…)은 변수가 아니라 이름표 — 기울임 없이 정자로 쓴다(요구).
    const lbl = renderGraphLabel(String(lp.text ?? ""), {
      x: lx, y: ly, size, color: annColor, anchor: "middle", vAlign: "middle", halo: true, upright: true,
      haloRatio: obj.haloRatio, weight: obj.labelWeight,
    });
    if (lbl) { lbl.setAttribute("data-labelpoint-text", String(li)); g.appendChild(lbl); }
  });
  // 범례 박스: 선 견본 + 글씨 여러 줄. anchor(x,y)=박스 좌상단(math). 크기는 world mm.
  (obj.legends || []).forEach((lg, li) => {
    if (!lg || !Array.isArray(lg.rows) || !lg.rows.length) return;
    renderLegendBox(g, lg, wmX(lg.x), wmY(lg.y), obj, li);
  });

  // Opposite-side frame ticks are explicit; ordinary boxed exams use bottom/left.
  if(boxFrame && obj.showTicks) for(const line of [...g.querySelectorAll('line')]) {
    if(Number(line.getAttribute('stroke-width'))!==tickSw)continue;
    const x1=Number(line.getAttribute('x1')),x2=Number(line.getAttribute('x2')),y1=Number(line.getAttribute('y1')),y2=Number(line.getAttribute('y2'));
    if(obj.boxTickTop===true&&x1===x2&&y2===bottom&&y1<bottom)addLine(x1,top,x1,top+tIn,tickColor,tickSw);
    else if(obj.boxTickRight===true&&!obj.y2?.enabled&&y1===y2&&x1===left&&x2>left)addLine(right-tIn,y1,right,y1,tickColor,tickSw);
  }

  // ----- rotation: whole plane turns about its bbox center -----
  const rot = obj.rotation ?? 0;
  if (rot) {
    const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
    g.setAttribute("transform", `rotate(${rot} ${cx} ${cy})`);
  }
  (obj.graphAnnotations || []).forEach((annotation) => {
    if (!annotation || !Number.isFinite(annotation.x) || !Number.isFinite(annotation.y)) return;
    const x = worldXFromMathX(P, annotation.x);
    const y = annotation.axis === 'y2' ? worldYFromMathY2(P, annotation.y) : worldYFromMathY(P, annotation.y);
    if (annotation.kind === 'point' && annotation.endStyle !== 'none') {
      const pointSw = annotation.strokeWidth > 0 ? annotation.strokeWidth : sw;
      const dot = document.createElementNS(SVG_NS, 'circle'); dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', annotation.markerSize > 0 ? annotation.markerSize : Math.max(pointSw * 1.6, 0.5)); dot.setAttribute('stroke', color); dot.setAttribute('stroke-width', pointSw); dot.setAttribute('fill', annotation.endStyle === 'open' ? '#fff' : Number.isFinite(annotation.fillLevel) ? grayHex(annotation.fillLevel) : color); g.appendChild(dot);
      dot.setAttribute('data-graph-annotation-shape', annotation.id || '');
      dot.setAttribute('data-graph-annotation-kind', annotation.kind);
    }
    if ((annotation.kind === 'leader' || annotation.kind === 'arrow') && Number.isFinite(annotation.to?.x) && Number.isFinite(annotation.to?.y)) {
      const tx = worldXFromMathX(P, annotation.to.x);
      const ty = annotation.axis === 'y2' ? worldYFromMathY2(P, annotation.to.y) : worldYFromMathY(P, annotation.to.y);
      const width = Number.isFinite(annotation.strokeWidth) && annotation.strokeWidth > 0 ? annotation.strokeWidth : sw * 0.7;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', x); line.setAttribute('y1', y); line.setAttribute('x2', tx); line.setAttribute('y2', ty);
      line.setAttribute('stroke', color); line.setAttribute('stroke-width', width);
      line.setAttribute('data-graph-annotation-shape', annotation.id || '');
      line.setAttribute('data-graph-annotation-kind', annotation.kind);
      g.appendChild(line);
      const length = Math.hypot(tx - x, ty - y);
      if (annotation.kind === 'arrow' && length > 1e-9) g.appendChild(isExamStyle(obj) ? smoothArrowHead(tx,ty,(tx-x)/length,(ty-y)/length,obj.axisArrowLength/(1.1551*6),color) : makeArrowHead(tx, ty, (tx - x) / length, (ty - y) / length, width * 1.75, color));
    }
    if (annotation.kind === 'guide') {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', x); line.setAttribute('y1', y);
      const endpoint = Number.isFinite(annotation.to?.x) && Number.isFinite(annotation.to?.y);
      line.setAttribute('x2', endpoint ? wmX(annotation.to.x) : annotation.orientation === 'horizontal' ? worldX0 : x);
      line.setAttribute('y2', endpoint ? (annotation.axis === 'y2' ? worldYFromMathY2(P, annotation.to.y) : wmY(annotation.to.y)) : annotation.orientation === 'horizontal' ? y : worldY0);
      line.setAttribute('stroke', color); line.setAttribute('stroke-width', sw * 0.55);
      line.setAttribute('data-graph-annotation-shape', annotation.id || '');
      line.setAttribute('data-graph-annotation-kind', annotation.kind);
      styleGuide(line, annotation); g.appendChild(line);
    }
    const label = renderGraphLabel(annotation.displayText ?? annotation.text, { x, y, size: annotation.fontSize || annotation.size || nameSize, sourceHeight: annotation.labelSizeMode === 'source-height' ? true : undefined, anchor: 'middle', vAlign: 'middle', orientation: annotation.orientation, haloRatio: obj.haloRatio, weight: annotation.fontWeight ?? obj.labelWeight,
      upright:obj.graphStyle?.descriptionLayout && annotation.labelRole === 'name' ? true : undefined });
    if (label) { label.setAttribute('data-graph-annotation', annotation.id || ''); g.appendChild(label); }
  });
  return g;
}

/* 범례 박스 렌더(요구 3): 평가원 양식 — 작고 직각인 박스, 각 줄 [선 견본 ──][글씨].
 * lg.size=글씨 크기, lg.swatch=선 견본 길이(둘 다 mm, 없으면 기본). 박스는 실제 글씨 폭에
 * 맞춰 딱 맞게(auto-fit). 텍스트 자간은 현행 대비 +50%(요구). 선 견본은 dash로 스타일 표현. */
function renderLegendBox(g, lg, x0, y0, obj, li) {
  const renderGraphLabel = graphLabelRenderer(obj);
  const color = grayHex(obj.strokeLevel);
  const sw = obj.strokeWidth || 0.3;
  // 기본값을 평가원 양식에 맞게 작게(종전보다 축소).
  const size = Number.isFinite(lg.size) && lg.size > 0 ? lg.size : 2.2;
  const swatch = Number.isFinite(lg.swatch) && lg.swatch > 0 ? lg.swatch : size * 2.4;
  const pad = Number.isFinite(lg.pad) && lg.pad >= 0 ? lg.pad : size * 0.5;
  const rowH = size * 1.5, gap = size * 0.55;
  const ls = size * 0.18;   // 자간(+50% 느낌): 글자 사이를 벌린다(요구).
  const rows = lg.rows;
  const sourceSwatch = !!obj.reconstruction?.schema && lg.frame !== true && rows.length === 1 && rows[0].text === "" && pad === 0;
  const framed = lg.frame === true || lg.frame !== false && !obj.reconstruction?.schema;
  // 박스 폭 = 여백 + 견본 + 간격 + 가장 넓은 글씨 폭(자간 반영) + 여백.
  let maxText = 0;
  rows.forEach((r) => {
    const t = String(r.text || "");
    const measured=isExamStyle(obj)
      ? measureGraphLabel(t,EXAM_STYLE.label,graphLabelUpright(obj,obj.graphStyle?.descriptionLayout ? true : undefined),obj.labelWeight??400,true).w*size/EXAM_STYLE.label
      : measureGraphLabel(t,size,!!obj.reconstruction,obj.labelWeight??400,obj.reconstruction?.labelSizeMode==='source-height').w;
    const w = measured + ls * Math.max(0, t.replace(/\s/g, "").length - 1);
    if (w > maxText) maxText = w;
  });
  const boxW = pad * 2 + swatch + gap + maxText;
  const boxH = pad * 2 + rowH * rows.length;
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", x0); rect.setAttribute("y", sourceSwatch ? y0 - rowH / 2 : y0);
  rect.setAttribute("width", boxW); rect.setAttribute("height", boxH);
  rect.setAttribute("fill", "#ffffff"); rect.setAttribute("fill-opacity", framed ? "0.9" : "0");
  rect.setAttribute("stroke", framed ? color : "none"); rect.setAttribute("stroke-width", sw * 0.5);
  // 직각 박스(요구): rx 제거.
  if (Number.isFinite(li)) rect.setAttribute("data-legend", String(li));   // 미리보기 드래그 이동용
  g.appendChild(rect);
  rows.forEach((r, i) => {
    const cy = sourceSwatch ? y0 : y0 + pad + rowH * i + rowH / 2;
    const l = document.createElementNS(SVG_NS, "line");
    l.setAttribute("x1", x0 + pad); l.setAttribute("y1", cy);
    l.setAttribute("x2", x0 + pad + swatch); l.setAttribute("y2", cy);
    l.setAttribute("stroke", color); l.setAttribute("stroke-width", r.strokeWidth ?? sw * 1.3);
    l.setAttribute("stroke-linecap", "round");
    if (Array.isArray(r.dash) && r.dash.length === 2 && (r.dash[0] || r.dash[1])) {
      l.setAttribute("stroke-dasharray", `${r.dash[0]} ${r.dash[1]}`);
    }
    if (r.lineVisible !== false) g.appendChild(l);
    if (r.markerShape && r.markerShape !== 'none') g.appendChild(graphMarker(x0+pad+swatch/2,cy,r.markerShape,r.markerSize>0?r.markerSize:size*.25,r.markerStrokeWidth>0?r.markerStrokeWidth:sw,color));
    const lbl = renderGraphLabel(String(r.text || ""), {
      x: x0 + pad + swatch + gap, y: cy, size, color, anchor: "start", vAlign: "middle", halo: false, upright:obj.graphStyle?.descriptionLayout ? true : undefined,
    });
    if (lbl) {
      if (Number.isFinite(li)) lbl.setAttribute("data-legend-text", `${li}:${i}`);
      // 자간 +50%(요구): formula/한글 런의 <text>에 letter-spacing 적용(textContent 기반이라 반영됨).
      lbl.querySelectorAll("text").forEach((t) => t.setAttribute("letter-spacing", isExamStyle(obj)?EXAM_STYLE.label*.18:ls));
      g.appendChild(lbl);
    }
  });
}

/* ===== FUNCGRAPH (step 3): a formula-driven open curve =====
 * points[] are already baked to WORLD mm by the sampler, so rendering is just the
 * open Catmull-Rom path — identical to an open `curve`. No arrowheads, no fill. */
// 불연속(점근선/극점)에서 sampler가 run을 끊어 두면 flat points[]에 큰 점프가 남는다.
// 그 점프를 그대로 이으면 존재하지 않는 가짜 세로선이 그려지므로, 인접 점 간 거리가
// (중앙값의 8배 이상으로) 크게 튀는 지점에서 서브패스를 분리해 개별 M으로 그린다.
// ----- Centripetal Catmull-Rom → 한 구간(p1→p2)의 큐빅 베지어 제어점 -----
// 지정한 점을 '정확히' 지나가는 보간 곡선(요구: 내가 찍은 점을 정확히 통과). 균일 방식은
// 점 간격이 들쭉날쭉하거나 급히 꺾이면 곡선이 출렁이거나 고리를 만든다(overshoot). 중심
// 매개변수(centripetal, α=0.5)는 그런 출렁임·꼬임 없이 매끄럽다(d3 curveCatmullRom 방식).
// 곡률 t: 제어점을 앵커에서 t배만큼 밀어 볼록함 조절(1=표준). 앵커는 그대로라 통과 보장.
function crBezierCP(p0, p1, p2, p3, t) {
  const EPS = 1e-12;
  const d01 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const d12 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const d23 = Math.hypot(p3.x - p2.x, p3.y - p2.y);
  const l01a = Math.sqrt(d01), l12a = Math.sqrt(d12), l23a = Math.sqrt(d23);
  let c1x = p1.x, c1y = p1.y, c2x = p2.x, c2y = p2.y;
  if (l01a > EPS) {
    const a = 2 * d01 + 3 * l01a * l12a + d12, n = 3 * l01a * (l01a + l12a);
    c1x = (p1.x * a - p0.x * d12 + p2.x * d01) / n;
    c1y = (p1.y * a - p0.y * d12 + p2.y * d01) / n;
  }
  if (l23a > EPS) {
    const b = 2 * d23 + 3 * l23a * l12a + d12, m = 3 * l23a * (l23a + l12a);
    c2x = (p2.x * b + p1.x * d23 - p3.x * d12) / m;
    c2y = (p2.y * b + p1.y * d23 - p3.y * d12) / m;
  }
  const s = Number.isFinite(t) ? t : 1;   // 곡률: 제어점을 앵커 기준 s배로 스케일
  if (s !== 1) {
    c1x = p1.x + (c1x - p1.x) * s; c1y = p1.y + (c1y - p1.y) * s;
    c2x = p2.x + (c2x - p2.x) * s; c2y = p2.y + (c2y - p2.y) * s;
  }
  return { c1x, c1y, c2x, c2y };
}
function catmullRomPathT(pts, t) {
  if (!pts || pts.length < 2) return "";
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  const n = pts.length;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)];
    const { c1x, c1y, c2x, c2y } = crBezierCP(p0, p1, p2, p3, t);
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}
// 곡선(스무딩) 렌더와 동일한 기하로 폴리라인을 촘촘한 점으로 편다(표시점/수선/화살표가
// '그려진 곡선 위'에 정확히 앉게 하는 용도). 렌더와 같은 centripetal 제어점을 써야 어긋나지 않는다.
function smoothSamplePts(pts, t, segs = 12) {
  if (!pts || pts.length < 3) return pts || [];
  const n = pts.length;
  const out = [{ x: pts[0].x, y: pts[0].y }];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)];
    const { c1x, c1y, c2x, c2y } = crBezierCP(p0, p1, p2, p3, t);
    for (let j = 1; j <= segs; j++) {
      const u = j / segs, v = 1 - u;
      out.push({
        x: v * v * v * p1.x + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * p2.x,
        y: v * v * v * p1.y + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * p2.y,
      });
    }
  }
  return out;
}
// ----- 베지어 핸들(편집 가능한 접선) -----
// centripetal Catmull-Rom이 각 앵커에서 자동으로 잡는 접선을, 사용자가 잡아끌 수 있는
// 핸들로 노출한다(잉크스케이프 노드 편집). catmullRomHandles: 각 앵커의 in/out 핸들을
// '앵커 기준 오프셋'으로 반환(저장·앵커 이동에 안정적). 렌더/샘플은 절대 제어점을 받는다.
function catmullRomHandles(pts, t) {
  const n = pts.length;
  const h = pts.map(() => ({ ix: 0, iy: 0, ox: 0, oy: 0 }));
  if (n < 2) return h;
  if (n === 2) { // 두 점 = 직선. 핸들을 1/3 지점에 둬 직선 유지.
    const dx = (pts[1].x - pts[0].x) / 3, dy = (pts[1].y - pts[0].y) / 3;
    h[0].ox = dx; h[0].oy = dy; h[1].ix = -dx; h[1].iy = -dy;
    return h;
  }
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)];
    const { c1x, c1y, c2x, c2y } = crBezierCP(p0, p1, p2, p3, t);
    h[i].ox = c1x - p1.x; h[i].oy = c1y - p1.y;         // p1의 out 핸들
    h[i + 1].ix = c2x - p2.x; h[i + 1].iy = c2y - p2.y; // p2의 in 핸들
  }
  return h;
}
// 절대 제어점(handles[i] = {inX,inY,outX,outY}, pts와 평행)으로 3차 베지어 path를 만든다.
function bezierPathD(pts, handles, segmentModes = []) {
  if (!pts || pts.length < 2 || !handles || handles.length !== pts.length) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    if (segmentModes[i] === "line") { d += ` L ${pts[i + 1].x} ${pts[i + 1].y}`; continue; }
    const o = handles[i], nx = handles[i + 1];
    d += ` C ${o.outX} ${o.outY} ${nx.inX} ${nx.inY} ${pts[i + 1].x} ${pts[i + 1].y}`;
  }
  return d;
}
// 핸들 베지어를 촘촘한 점으로 편다(표시점/수선/스냅이 곡선 위에 앉게).
function bezierSamplePts(pts, handles, segs = 16, segmentModes = []) {
  if (!pts || pts.length < 2 || !handles || handles.length !== pts.length) return pts || [];
  const out = [{ x: pts[0].x, y: pts[0].y }];
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i], p2 = pts[i + 1];
    if (segmentModes[i] === "line") { out.push({ ...p2 }); continue; }
    const c1x = handles[i].outX, c1y = handles[i].outY;
    const c2x = handles[i + 1].inX, c2y = handles[i + 1].inY;
    for (let j = 1; j <= segs; j++) {
      const u = j / segs, v = 1 - u;
      out.push({
        x: v * v * v * p1.x + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * p2.x,
        y: v * v * v * p1.y + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * p2.y,
      });
    }
  }
  return out;
}
// 명시적 경계(breaks = 샘플러가 준 '새 run 시작 인덱스')로만 점 배열을 run으로 나눈다.
// 경계가 없으면 한 덩어리. 사용자가 찍은 꺾은선의 긴 구간이 임의로 끊기지 않게, 직선 계열은
// 이것만 쓴다(거리 추정 없음).
function splitByBreaks(pts, breaks) {
  if (!breaks || !breaks.length) return [pts];
  const set = new Set(breaks);
  const runs = []; let run = [];
  for (let i = 0; i < pts.length; i++) {
    if (set.has(i) && run.length) { runs.push(run); run = []; }
    run.push(pts[i]);
  }
  if (run.length) runs.push(run);
  return runs;
}
// 구파일(breaks 없이 저장된 함수식) 호환용: 이웃 점 간 거리가 튀는 곳에서 끊는다. 정확하진
// 않지만 없는 것보다 낫다. breaks가 있으면 그쪽이 우선(정확).
function distanceSplitRuns(pts) {
  const dists = [];
  for (let i = 1; i < pts.length; i++) dists.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const sorted = [...dists].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)] || 0;
  const thresh = med * 8;
  let run = [pts[0]];
  const parts = [];
  for (let i = 1; i < pts.length; i++) {
    if (med > 0 && dists[i - 1] > thresh) { parts.push(run); run = [pts[i]]; }
    else run.push(pts[i]);
  }
  parts.push(run);
  return parts;
}
function funcgraphPathD(pts, curvature = 1, breaks) {
  if (!pts || pts.length < 2) return catmullRomPathT(pts || [], curvature);
  // breaks가 배열이면(빈 배열 포함) sampler가 준 정확한 경계 = 신뢰한다. 빈 배열 = 끊김 없는
  // 완전 연속 곡선 = 한 덩어리. breaks가 아예 없을 때(구파일)만 거리 휴리스틱으로 폴백한다.
  // ★ 예전엔 빈 배열도 휴리스틱으로 넘어가, 고주파 함수의 가파른 구간을 '끊김'으로 오판해
  //   연속 곡선을 여러 조각으로 쪼개고 큰 틈을 냈다(사진2·3 버그). Array.isArray로 해결.
  const runs = Array.isArray(breaks) ? splitByBreaks(pts, breaks) : distanceSplitRuns(pts);
  return runs.map((r) => catmullRomPathT(r, curvature)).filter(Boolean).join(" ").trim();
}

// 직선/꺾은선 계열(사용자가 클릭으로 찍은 점): 점 사이를 곡선이 아니라 그냥 직선으로 잇는다.
// breaks가 있으면(직선 모양 함수식) 그 경계에서만 끊고, 없으면 통째로 잇는다(종전과 동일).
function straightPathD(pts, breaks) {
  if (!pts || pts.length < 2) return "";
  return splitByBreaks(pts, breaks)
    .map((r) => r.length < 2 ? "" : `M ${r[0].x} ${r[0].y} ` + r.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" "))
    .filter(Boolean).join(" ").trim();
}

function pointAtWorldX(a, b, x) {
  const span = b.x - a.x;
  if (Math.abs(span) < 1e-12) return { x, y: a.y };
  const t = (x - a.x) / span;
  return { x, y: a.y + (b.y - a.y) * t };
}

function clipRunByWorldX(run, xMin, xMax) {
  const clipped = [];
  for (let i = 0; i < run.length - 1; i++) {
    const a = run[i], b = run[i + 1];
    const segMin = Math.max(Math.min(a.x, b.x), xMin);
    const segMax = Math.min(Math.max(a.x, b.x), xMax);
    if (segMax < segMin) continue;
    const first = pointAtWorldX(a, b, a.x <= b.x ? segMin : segMax);
    const last = pointAtWorldX(a, b, a.x <= b.x ? segMax : segMin);
    if (!clipped.length || Math.hypot(clipped.at(-1).x - first.x, clipped.at(-1).y - first.y) > 1e-9) clipped.push(first);
    if (!clipped.length || Math.hypot(clipped.at(-1).x - last.x, clipped.at(-1).y - last.y) > 1e-9) clipped.push(last);
  }
  return clipped;
}

// 막대 무늬 <pattern> id 일련번호 — 모달 미리보기처럼 obj.id가 없는 렌더에서 충돌을 막는다.
let _barPatSeq = 0;

function graphAreaForRender(obj, plane) {
  const area = obj.area;
  if (!area || area.frame || !obj.reconstruction || !plane || !obj.mathPoints?.length
    || obj.mathPoints.length !== obj.points?.length) return area;
  const mapping = obj.axis === 'y2' ? planeAsY2(plane) : plane;
  // Older files may contain shading left at the pre-insertion coordinates.
  // Recover only an attached curve that still matches its mathematical plane;
  // independently moved/rotated curves and custom world-only fills stay intact.
  if (!obj.mathPoints.every((point, i) => {
    const x = worldXFromMathX(mapping, point.x), y = worldYFromMathY(mapping, point.y);
    return Number.isFinite(x) && Number.isFinite(y)
      && Math.abs(x - obj.points[i].x) < 1e-6 && Math.abs(y - obj.points[i].y) < 1e-6;
  })) return area;
  const baseY = worldYFromMathY(mapping, 0);
  if (!Number.isFinite(baseY)) return area;
  const dx = Number.isFinite(obj.offset?.dx) ? obj.offset.dx : 0;
  const from = Number.isFinite(area.from) ? worldXFromMathX(mapping, area.from + dx) : NaN;
  const to = Number.isFinite(area.to) ? worldXFromMathX(mapping, area.to + dx) : NaN;
  return { ...area, baseY,
    ...(Number.isFinite(from) ? { worldFrom: from } : {}),
    ...(Number.isFinite(to) ? { worldTo: to } : {}) };
}

function renderFuncgraph(obj, plane = null) {
  obj = examSeriesStyle(obj, plane);
  const renderGraphLabel = graphLabelRenderer(obj);
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;

  const pts = obj.points || [];
  if(obj.sourceKind === 'region') {
    if(pts.length>=3) {
      const region=document.createElementNS(SVG_NS,'path');region.setAttribute('d',`M ${pts.map(p=>`${p.x} ${p.y}`).join(' L ')} Z`);
      region.setAttribute('fill',grayHex(obj.regionFillLevel ?? 180));region.setAttribute('fill-opacity',Math.max(0,Math.min(1,obj.regionOpacity ?? 0.35)));
      region.setAttribute('stroke',obj.lineVisible===true||obj.regionSpec?.strokeWidth>0?grayHex(obj.strokeLevel):'none');region.setAttribute('stroke-width',obj.regionSpec?.strokeWidth ?? obj.strokeWidth ?? .2);
      region.setAttribute('data-graph-region','');if(obj.regionSpec?.id)region.setAttribute('data-graph-region-id',obj.regionSpec.id);g.appendChild(region);
    }
    return g;
  }


  /* ----- 곡선 아래 면적 채움 (함수 하나에 붙는 옵션) -----
   * obj.area = { from, to, baseY, level, edges, label }
   *   from·to = 정의역 값(비우면 함수 정의역 전체). baseY = 기준선의 세계 y(mm) —
   *   평면의 y=0 위치를 만든 쪽(그래프 모달·MCP)이 구워 넣는다. 이 파일의 다른 그래프
   *   요소(guideSegs·markers)와 같은 규약이라 저장·미리보기·캔버스가 한 경로로 통일된다.
   * 곡선보다 먼저 그려 채움이 선 아래로 깔린다. */
  const area = graphAreaForRender(obj, plane);
  if (area && Number.isFinite(area.baseY) && pts.length > 1) {
    const frame = area.frame;
    const determinant = frame ? frame[0] * frame[3] - frame[1] * frame[2] : 1;
    const local = p => !frame || Math.abs(determinant) < 1e-12 ? p : {
      x: (frame[3] * (p.x - frame[4]) - frame[2] * (p.y - frame[5])) / determinant,
      y: (-frame[1] * (p.x - frame[4]) + frame[0] * (p.y - frame[5])) / determinant,
    };
    const areaPoints = frame ? pts.map(local) : pts;
    const areaHandles = frame ? obj.handles?.map(h => {
      const a = local({ x: h.inX, y: h.inY }), b = local({ x: h.outX, y: h.outY });
      return { inX: a.x, inY: a.y, outX: b.x, outY: b.y };
    }) : obj.handles;
    const areaGroup = frame ? document.createElementNS(SVG_NS, 'g') : g;
    if (frame) { areaGroup.setAttribute('transform', `matrix(${frame.join(' ')})`); g.appendChild(areaGroup); }
    const dMin = obj.domainMin, dMax = obj.domainMax;
    const hasDomain = Number.isFinite(dMin) && Number.isFinite(dMax) && dMax !== dMin;
    const allX = areaPoints.map((point) => point.x);
    const dataXMin = Math.min(...allX), dataXMax = Math.max(...allX);
    let clipXMin = dataXMin, clipXMax = dataXMax;
    if (hasDomain && (Number.isFinite(area.from) || Number.isFinite(area.to))) {
      const lo = Math.min(area.from ?? dMin, area.to ?? dMax);
      const hi = Math.max(area.from ?? dMin, area.to ?? dMax);
      const worldX = (value) => dataXMin + ((value - Math.min(dMin, dMax)) / Math.abs(dMax - dMin)) * (dataXMax - dataXMin);
      clipXMin = Number.isFinite(area.worldFrom) ? area.worldFrom : worldX(lo);
      clipXMax = Number.isFinite(area.worldTo) ? area.worldTo : worldX(hi);
    }
    if (Number.isFinite(area.worldFrom)) clipXMin = area.worldFrom;
    if (Number.isFinite(area.worldTo)) clipXMax = area.worldTo;
    let areaOffset = 0;
    const hasAreaHandles = Array.isArray(areaHandles) && areaHandles.length === pts.length;
    const areaRuns = splitByBreaks(areaPoints, obj.breaks)
      .map((run) => {
        const offset = areaOffset; areaOffset += run.length;
        const geometry = hasAreaHandles ? bezierSamplePts(run, areaHandles.slice(offset, offset + run.length), 32, obj.segmentModes?.slice(offset, offset + run.length - 1))
          : (obj.curveStyle || (obj.sourceKind === 'points' ? 'straight' : 'smooth')) === 'smooth' ? smoothSamplePts(run, obj.curvature, 24) : run;
        return clipRunByWorldX(geometry, Math.min(clipXMin, clipXMax), Math.max(clipXMin, clipXMax));
      })
      .filter((run) => run.length > 1);
    if (areaRuns.length) {
      const d = areaRuns.map((seg) => `M ${seg[0].x.toFixed(3)} ${area.baseY.toFixed(3)} `
        + seg.map((p) => `L ${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(" ")
        + ` L ${seg.at(-1).x.toFixed(3)} ${area.baseY.toFixed(3)} Z`).join(" ");
      const fillEl = document.createElementNS(SVG_NS, "path");
      fillEl.setAttribute("d", d);
      fillEl.setAttribute("fill", grayHex(area.level ?? 220));
      fillEl.setAttribute("stroke", "none");
      areaGroup.appendChild(fillEl);
      // 경계선: 채운 구간의 양 끝을 곡선에서 기준선까지 가는 실선으로 내린다(기본 켬).
      if (area.edges !== false) {
        [areaRuns[0][0], areaRuns.at(-1).at(-1)].forEach((p) => {
          const l = document.createElementNS(SVG_NS, "line");
          l.setAttribute("x1", p.x); l.setAttribute("y1", p.y);
          l.setAttribute("x2", p.x); l.setAttribute("y2", area.baseY);
          l.setAttribute("stroke", grayHex(obj.strokeLevel));
          l.setAttribute("stroke-width", (obj.strokeWidth ?? 0.3) * 0.55);
          areaGroup.appendChild(l);
        });
      }
      // 면적 라벨: 채운 영역 한가운데에 흰 halo 글자(스타일 가이드 5장).
      if (area.label) {
        const seg = areaRuns.reduce((longest, run) => run.length > longest.length ? run : longest, areaRuns[0]);
        const mid = seg[Math.floor(seg.length / 2)];
        const lbl = renderGraphLabel(area.label, {
          x: (seg[0].x + seg.at(-1).x) / 2,
          y: (mid.y + area.baseY) / 2,
          size: area.labelSize || Math.max((obj.strokeWidth || 0.3) * 11, 2.8),
          color: grayHex(obj.strokeLevel), anchor: "middle", vAlign: "middle", halo: true,
          haloRatio: Number.isFinite(area.haloRatio) ? area.haloRatio : obj.haloRatio,
        });
        if (lbl) areaGroup.appendChild(lbl);
      }
    }
  }

  /* ----- 막대그래프 (obj.bars) -----
   * 새 객체 타입을 만들지 않고 funcgraph에 얹은 막대(생명과학 기출 관례: 세로 막대,
   * 회색 단색 + 검은 외곽선, 무늬 없음). 기하가 두 곳에 있는 이유:
   *   obj.bars.items = [{x,y,w,h,label}] — 구울 때의 축 정렬 사각형(원본 규격)
   *   obj.points     = 막대마다 네 꼭짓점(bl,tl,tr,br) — 이동·회전·리사이즈(transform.js)와
   *                    bbox·클릭(pick.js)이 실제로 보고 옮기는 배열
   * 그래서 개수가 맞으면 points를 진실로 삼는다 — 그래야 회전·리사이즈 결과가 그려진다.
   * 채우기는 js/render/fill.js의 공용 함수(resolveFill·makeFillPattern)를 재사용한다. */
  const bars = obj.bars;
  const isBars = !!(bars && Array.isArray(bars.items) && bars.items.length);
  if (isBars) {
    const usePts = pts.length === bars.items.length * 4;
    // 무늬 채우기는 객체별 <pattern>이 필요하다. id는 funcgraph id 기준(없으면 렌더 일련번호).
    const fillObj = {
      type: "rect", id: `bars_${obj.id != null ? obj.id : "p" + (++_barPatSeq)}`,
      fillStyle: bars.fillStyle || "solid",
      fillLevel: Number.isFinite(bars.fillLevel) ? bars.fillLevel : 170,
      fillTile: bars.fillTile,
    };
    const pat = makeFillPattern(fillObj);
    if (pat) {
      const defs = document.createElementNS(SVG_NS, "defs");
      defs.appendChild(pat);
      g.appendChild(defs);
    }
    const fillAttr = resolveFill(fillObj);
    const edge = grayHex(obj.strokeLevel);
    const esw = Number.isFinite(bars.strokeWidth) ? bars.strokeWidth : (obj.strokeWidth ?? 0.3);
    const lblSize = Number.isFinite(bars.labelSize) ? bars.labelSize : Math.max(esw * 11, 2.6);
    bars.items.forEach((r, i) => {
      const q = usePts ? pts.slice(i * 4, i * 4 + 4) : [
        { x: r.x, y: r.y + r.h }, { x: r.x, y: r.y },
        { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h },
      ];
      if (q.length < 4 || q.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return;
      const bar = document.createElementNS(SVG_NS, "path");
      bar.setAttribute("d", `M ${q[0].x} ${q[0].y} L ${q[1].x} ${q[1].y} L ${q[2].x} ${q[2].y} L ${q[3].x} ${q[3].y} Z`);
      bar.setAttribute("fill", Number.isFinite(r.fillLevel) ? grayHex(r.fillLevel) : fillAttr);
      bar.setAttribute("stroke", edge);
      bar.setAttribute("stroke-width", esw);
      bar.setAttribute("stroke-linejoin", "miter");
      g.appendChild(bar);
      // 이름표: 막대 아래(밑변 바깥쪽). '아래'를 윗변→밑변 방향으로 구해 회전에도 따라간다.
      if (!r.label) return;
      const bm = { x: (q[0].x + q[3].x) / 2, y: (q[0].y + q[3].y) / 2 };
      const tm = { x: (q[1].x + q[2].x) / 2, y: (q[1].y + q[2].y) / 2 };
      let ux = bm.x - tm.x, uy = bm.y - tm.y;
      const ul = Math.hypot(ux, uy);
      if (ul > 1e-6) { ux /= ul; uy /= ul; } else { ux = 0; uy = 1; }
      const lbl = renderGraphLabel(r.label, {
        x: bm.x + ux * lblSize * 0.45, y: bm.y + uy * lblSize * 0.45,
        size: lblSize, color: edge, anchor: "middle", vAlign: "top",
      });
      if (lbl) g.appendChild(lbl);
    });
  }

  // curveStyle: "straight"(수동 계열 기본, 요구 ④의 직선/꺾은선) | "smooth"(함수식 기본, 기존 Catmull-Rom).
  // 막대 계열은 points가 '사각형 꼭짓점'이라 선으로 이으면 안 된다 — 선 경로를 건너뛴다.
  if (!isBars && obj.lineVisible !== false) {
    const style = obj.curveStyle || (obj.sourceKind === "points" ? "straight" : "smooth");
    const el = document.createElementNS(SVG_NS, "path");
    // 편집 가능한 베지어 핸들이 있으면(자유곡선 변환) 그 제어점으로 진짜 3차 베지어를 그린다.
    const hasHandles = Array.isArray(obj.handles) && obj.handles.length === pts.length && pts.length >= 2;
    const bezierD = () => {
      const starts = [0, ...(obj.breaks || []).filter(i => Number.isInteger(i) && i > 0 && i < pts.length), pts.length];
      return starts.slice(0, -1).map((start, i) => bezierPathD(pts.slice(start, starts[i + 1]), obj.handles.slice(start, starts[i + 1]), obj.segmentModes?.slice(start, starts[i + 1] - 1))).join(' ');
    };
    let pathD = hasHandles ? bezierD()
      : (style === "straight" ? straightPathD(pts, obj.breaks) : funcgraphPathD(pts, obj.curvature, obj.breaks));
    // Closure belongs to one continuous series, never to individual discontinuous
    // runs. Repeated endpoints already contain their closing geometry.
    if (obj.closed === true && pts.length > 2 && !(obj.breaks || []).some(i => Number.isInteger(i) && i > 0 && i < pts.length) && (pathD.match(/\bM\b/g) || []).length === 1) {
      const first = pts[0], last = pts[pts.length - 1];
      const closingMode = obj.segmentModes?.[pts.length - 1];
      if ((first.x !== last.x || first.y !== last.y) && closingMode !== 'line' && (hasHandles || style === 'smooth')) {
        if (hasHandles) {
          const a = obj.handles[pts.length - 1], b = obj.handles[0];
          pathD += ` C ${a.outX} ${a.outY} ${b.inX} ${b.inY} ${first.x} ${first.y}`;
        } else {
          const cp = crBezierCP(pts[pts.length - 2], last, first, pts[1], obj.curvature);
          pathD += ` C ${cp.c1x} ${cp.c1y} ${cp.c2x} ${cp.c2y} ${first.x} ${first.y}`;
        }
      }
      pathD += ' Z';
    }
    el.setAttribute("d", pathD);
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", grayHex(obj.strokeLevel));
    el.setAttribute("stroke-width", obj.strokeWidth ?? 0.2);
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-linejoin", "round");
    applyDash(el, obj);
    if (Array.isArray(obj.dashPattern) && obj.dashPattern.length && obj.dashPattern.every(n => Number.isFinite(n) && n >= 0) && obj.dashPattern.some(n => n > 0)) el.setAttribute("stroke-dasharray", obj.dashPattern.join(" "));
    // Reconstructed dash lengths describe visible ink and gaps. Round caps can
    // bridge a measured gap; zero-length dot strokes still need round caps.
    if (obj.reconstruction && el.hasAttribute('stroke-dasharray')) {
      const pattern = el.getAttribute('stroke-dasharray').trim().split(/[ ,]+/).map(Number);
      const effective = pattern.length % 2 ? pattern.concat(pattern) : pattern;
      if (effective.every((n, i) => Number.isFinite(n) && (i % 2 || n > 0))) el.setAttribute('stroke-linecap', 'butt');
    }
    g.appendChild(el);
  }

  // 끝 라벨(요구 ⑬): 계열의 마지막 점 옆에 이름을 붙인다. 혼합 라벨러 재사용(한글정자+
  // 영문이탤릭+수식+halo) — 그래프 선 위에 걸쳐도 부드럽게 끊긴다(요구 ⑯).
  if (obj.endLabel && pts.length && !isBars) {
    const last = pts[pts.length - 1];
    const prev = pts.length > 1 ? pts[pts.length - 2] : last;
    const dx = last.x - prev.x, dy = last.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const size = obj.endLabelSize || Math.max((obj.strokeWidth || 0.2) * 14, 3);
    // 선의 진행 방향으로 아주 살짝만 띄워 끝에 더 바짝(요구: 더 가까이). 거의 수직이면 오른쪽에.
    const nx = dx / len, ny = dy / len;
    const lx = last.x + nx * size * 0.18 + (Math.abs(nx) < 0.2 ? size * 0.28 : 0);
    const ly = last.y + ny * size * 0.18;
    const lbl = renderGraphLabel(obj.endLabel, {
      x: lx, y: ly, size, color: grayHex(obj.strokeLevel),
      anchor: nx >= 0 ? "start" : "end", vAlign: "middle", halo: true, haloRatio: obj.haloRatio, weight: obj.labelWeight,
      upright:obj.graphStyle?.descriptionLayout ? true : undefined,
    });
    if (lbl) { lbl.setAttribute("data-end-label", ""); g.appendChild(lbl); }
  }

  // ----- 그래프 요소(표시점 ● / 수선의 발 / 구간 화살표) -----
  // 모달에서 세팅되어 fg에 세계좌표로 베이크된 것들. renderFuncgraph가 계열과 함께 그려
  // 미리보기·캔버스·저장이 한 경로로 통일된다(그래프 요소 원본 math 스펙은 markerXs/guideXs/
  // arrowSpecs로 함께 저장 — 재편집 시 모달이 되읽는다).
  const gc = grayHex(obj.strokeLevel);
  const gsw = obj.strokeWidth || 0.3;
  (obj.guideSegs || []).forEach((seg) => {
    if (!seg || seg.length < 2) return;
    const l = document.createElementNS(SVG_NS, "line");
    l.setAttribute("x1", seg[0].x); l.setAttribute("y1", seg[0].y);
    l.setAttribute("x2", seg[1].x); l.setAttribute("y2", seg[1].y);
    l.setAttribute("stroke", gc); l.setAttribute("stroke-width", obj.guideStyle?.strokeWidth ?? gsw * 0.55);
    l.setAttribute("stroke-dasharray", obj.guideStyle ? `${obj.guideStyle.dashLength} ${obj.guideStyle.dashGap}` : "0.54 0.42"); l.setAttribute("stroke-linecap", isExamStyle(obj) ? "butt" : "round");
    l.setAttribute('data-graph-guide', '');
    g.appendChild(l);
  });
  // 구간 화살표: 곡선 위 지정 지점에 화살촉만 접선 방향으로 얹는다(선을 덧그리지 않는다).
  (obj.arrowMarks || []).forEach((am) => {
    if (!am || !Number.isFinite(am.x) || !Number.isFinite(am.y)) return;
    const head = am.examLength ? smoothArrowHead(am.x,am.y,am.dx,am.dy,am.examLength/(1.1551*6),gc) : makeArrowHead(am.x, am.y, am.dx, am.dy, am.strokeWidth || 0.525, gc);
    head.setAttribute('data-graph-direction', '');
    g.appendChild(head);
  });
  // arrowPolys는 옛 저장 파일 호환용(예전엔 화살표를 폴리라인으로 구웠다).
  (obj.arrowPolys || []).forEach((ap) => {
    if (!ap || !ap.points || ap.points.length < 2) return;
    const el = renderPolyline({
      type: "polyline", points: ap.points, arrowHead: ap.arrowHead, arrowVariant: ap.arrowVariant,
      strokeWidth: ap.strokeWidth || 0.525, strokeLevel: obj.strokeLevel,
    });
    if (el) g.appendChild(el);
  });
  if(obj.markerShape && obj.markerShape !== 'none') pts.forEach((p,i)=>{if(obj.endpointMarkers?.some(e=>e.index===i))return;g.appendChild(graphMarker(p.x,p.y,obj.markerShape,obj.markerSize>0?obj.markerSize:markerRadius(gsw),obj.markerStrokeWidth>0?obj.markerStrokeWidth:gsw,gc));});
  (obj.markers || []).forEach((m) => {
    if (!m) return;
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", m.x); c.setAttribute("cy", m.y);
    // 선 굵기(gsw)에 비례. 계수·하한을 다시 30% 줄였다(요구) — graph-modal의
    // markerRadiusOf와 같은 식이어야 "찍기 전 미리보기 = 찍은 뒤"가 어긋나지 않는다.
    c.setAttribute("r", obj.markerSize || markerRadius(gsw));
    c.setAttribute("fill", gc); c.setAttribute("stroke", "none");
    g.appendChild(c);
  });
  (obj.endpointMarkers?.length ? obj.endpointMarkers : (pts.length === 1 && (!obj.markerShape || obj.markerShape === 'none') ? [{ index: 0, kind: 'closed' }] : [])).forEach((endpoint) => {
    const point = obj.points?.[endpoint.index];
    if (!point) return;
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', point.x); circle.setAttribute('cy', point.y);
    circle.setAttribute('r', endpoint.markerSize || obj.markerSize || Math.max(markerRadius(gsw), gsw * 1.6));
    circle.setAttribute('fill', endpoint.kind === 'open' ? '#fff' : Number.isFinite(endpoint.fillLevel) ? grayHex(endpoint.fillLevel) : gc);
    circle.setAttribute('stroke', gc); circle.setAttribute('stroke-width', gsw);
    circle.setAttribute('data-graph-endpoint', endpoint.kind);
    g.appendChild(circle);
  });
  return g;
}

export { renderCoordplane, renderFuncgraph, smoothSamplePts, catmullRomHandles, bezierSamplePts, markerRadius };
