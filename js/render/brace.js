/* ===== RENDER/BRACE: 구획을 묶는 큰 중괄호 =====
 *
 * 생명 기출에서 "이 구간이 무엇이다"를 묶어 보여 주는 그 중괄호다(docs/BIO_PARTS_SPEC.md §1).
 * 글꼴의 '{' 글자를 키워 쓰면 안 된다 — 묶는 구간의 길이·기울기에 맞춰 늘어나야 하고,
 * 꼭짓점의 깊이를 따로 조절해야 하기 때문이다. 그래서 경로를 직접 그린다.
 *
 * 스키마
 *   p1, p2    묶는 구간의 양 끝(화면 좌표). 이 선이 중괄호의 '축'이다
 *   depth     꼭짓점이 축에서 튀어나온 깊이(mm)
 *   flipSide  꼭짓점이 반대쪽을 향한다
 *   label / showLabel / labelType   꼭짓점 바깥에 붙는 글자
 *
 * ── 기하 ───────────────────────────────────────────────────────────
 *   t = p1→p2 단위벡터,  n = t 를 90° 돌린 것(flipSide 면 부호 반전)
 *   d = depth,  q = min(depth, len/5)   ← 어깨(둥근 꺾임)의 크기
 *
 *   M p1
 *   Q (p1  + n·d/2)  → (p1  + n·d/2 + t·q)
 *   L (mid + n·d/2 - t·q)
 *   Q (mid + n·d/2)  → (mid + n·d)          ← 꼭짓점
 *   Q (mid + n·d/2)  → (mid + n·d/2 + t·q)
 *   L (p2  + n·d/2 - t·q)
 *   Q (p2  + n·d/2)  → p2
 *
 * q 를 len/5 로 묶는 이유: 짧은 구간에서 어깨가 서로 넘어가 경로가 뒤집히는 것을 막는다.
 * 라벨은 꼭짓점에서 n 방향으로 LABEL_GAP 만큼 더 나간 자리에 놓는다(bbox 에는 넣지 않는다 —
 * 다른 타입과 같은 관례).
 */

import { SVG_NS, grayHex, fillTextWithRomanRuns, applyObjectLabelFont } from "./core.js?v=1.3.0";
import { measureFormula, renderFormula } from "../formula.js?v=1.3.0";
import {
  DEFAULT_TEXT_SIZE_MM,
  OBJECT_LABEL_QUANTITY_FONT_FAMILY,
  EQUATION_FONT_STYLE,
} from "../state.js?v=1.3.0";

export const DEFAULT_BRACE_DEPTH = 5;
const LABEL_GAP = 3.4;      // 꼭짓점 ~ 라벨 중심 (mm, 명세 고정값)
const QUAD_SAMPLES = 8;     // 표본점 개수 / 이차 베지에 1개

/* 축(t)·법선(n)·깊이·어깨크기를 한 번에. 렌더·표본점이 모두 이걸 쓴다. */
function frame(obj) {
  const p1 = obj.p1 || { x: 0, y: 0 };
  const p2 = obj.p2 || p1;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  // 길이가 0이면 방향을 정할 수 없다 — 오른쪽을 가리키는 것으로 두고 경로만 접히게 둔다.
  const t = len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
  const sign = obj.flipSide ? -1 : 1;
  // SVG 는 y가 아래로 자란다. t=(1,0)일 때 n=(0,-1) → 기본값은 '위쪽'으로 볼록하다.
  const n = { x: t.y * sign, y: -t.x * sign };
  const d = Number.isFinite(obj.depth) ? obj.depth : DEFAULT_BRACE_DEPTH;
  const q = Math.min(Math.abs(d), len / 5);
  return { p1, p2, t, n, d, q, len, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
}

/* base + n·nk + t·tk */
function at(base, f, nk, tk) {
  return {
    x: base.x + f.n.x * nk + f.t.x * tk,
    y: base.y + f.n.y * nk + f.t.y * tk,
  };
}

/* 명세의 7개 절을 순서대로. 각 항목은 {kind:"L"|"Q", ...}. */
function segments(obj) {
  const f = frame(obj);
  const h = f.d / 2;
  const a1 = at(f.p1, f, h, 0);              // p1 쪽 어깨 제어점
  const a1e = at(f.p1, f, h, f.q);           //  〃      끝점
  const m0 = at(f.mid, f, h, -f.q);          // 가운데 왼쪽
  const mc = at(f.mid, f, h, 0);             // 꼭짓점 제어점
  const apex = at(f.mid, f, f.d, 0);         // 꼭짓점
  const m1 = at(f.mid, f, h, f.q);           // 가운데 오른쪽
  const a2s = at(f.p2, f, h, -f.q);          // p2 쪽 어깨 시작
  const a2 = at(f.p2, f, h, 0);              //  〃    제어점
  return {
    frame: f,
    apex,
    start: f.p1,
    segs: [
      { kind: "Q", c: a1, to: a1e },
      { kind: "L", to: m0 },
      { kind: "Q", c: mc, to: apex },
      { kind: "Q", c: mc, to: m1 },
      { kind: "L", to: a2s },
      { kind: "Q", c: a2, to: f.p2 },
    ],
  };
}

/* 이차 베지에 위의 한 점 */
function quadPoint(p0, c, p1, u) {
  const v = 1 - u;
  return {
    x: v * v * p0.x + 2 * v * u * c.x + u * u * p1.x,
    y: v * v * p0.y + 2 * v * u * c.y + u * u * p1.y,
  };
}

/* 경로를 따라가는 표본점. 픽(hitTest)과 bbox 가 공용으로 쓴다 —
 * 꼭짓점을 포함한 경로 전체가 반드시 들어간다. */
export function bracePathPoints(obj, n = QUAD_SAMPLES) {
  const { start, segs } = segments(obj);
  const pts = [{ x: start.x, y: start.y }];
  let cur = start;
  for (const s of segs) {
    if (s.kind === "L") {
      pts.push({ x: s.to.x, y: s.to.y });
    } else {
      for (let i = 1; i <= n; i += 1) pts.push(quadPoint(cur, s.c, s.to, i / n));
    }
    cur = s.to;
  }
  return pts;
}

export function braceBBox(obj) {
  const pts = bracePathPoints(obj);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/* 꼭짓점 바깥의 라벨 자리. 인스펙터·다른 코드가 쓸 일이 있어 계산을 한 곳에 둔다. */
function labelAnchor(obj) {
  const { frame: f, apex } = segments(obj);
  return { x: apex.x + f.n.x * LABEL_GAP, y: apex.y + f.n.y * LABEL_GAP };
}

export function renderBrace(obj) {
  const stroke = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.35;
  const g = document.createElementNS(SVG_NS, "g");

  const { start, segs } = segments(obj);
  let d = `M ${start.x} ${start.y}`;
  for (const s of segs) {
    d += s.kind === "L"
      ? ` L ${s.to.x} ${s.to.y}`
      : ` Q ${s.c.x} ${s.c.y} ${s.to.x} ${s.to.y}`;
  }

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", stroke);
  path.setAttribute("stroke-width", sw);
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-linecap", "round");
  g.appendChild(path);

  if (obj.showLabel && obj.label) {
    const size = DEFAULT_TEXT_SIZE_MM;
    const a = labelAnchor(obj);
    if (obj.labelType === "quantity") {
      /* 물리량: 수식 엔진으로 렌더 — 입력은 t_1 그대로 두고 화면만 t₁로 바뀐다.
       * 그리스 이름·아래첨자(_)·위첨자(^) 변환이 수식 객체와 동일해진다(annotations.js
       * 각도 라벨과 같은 경로). renderFormula 의 앵커는 top-left이므로 실측 폭·높이의
       * 절반만큼 되끌어 중앙에 앉힌다. */
      const family = OBJECT_LABEL_QUANTITY_FONT_FAMILY;
      const fm = measureFormula(obj.label, size, { family, weight: "normal", style: EQUATION_FONT_STYLE });
      const el = renderFormula({
        x: a.x - fm.w / 2,
        y: a.y - fm.h / 2,
        source: obj.label,
        fontSize: size,
        fontFamily: family,
      });
      if (el) g.appendChild(el);
    } else {
      // "라벨"(정체, 기본값): 일반 텍스트 경로 — {romanN}·로마숫자 세리프 처리까지 그대로.
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", a.x);
      t.setAttribute("y", a.y);
      t.setAttribute("font-size", size);
      applyObjectLabelFont(t, obj.labelType, "label");
      t.setAttribute("fill", stroke);
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("dominant-baseline", "middle");
      // 흰 테두리 — 다른 라벨과 같은 정책(기본 켜짐)
      if (obj.halo !== false) {
        t.setAttribute("paint-order", "stroke");
        t.setAttribute("stroke", "white");
        t.setAttribute("stroke-width", size * 0.16);
        t.setAttribute("stroke-linejoin", "round");
      }
      fillTextWithRomanRuns(t, obj.label);
      g.appendChild(t);
    }
  }

  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
}
