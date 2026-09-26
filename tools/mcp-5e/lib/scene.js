/* ===== SCENE — 경사면 장면을 한 호출로 =====
 *
 * builders.js 가 회로·그래프에서 한 것과 같은 이유로 존재한다: 저수준 add_objects 만 있으면
 * "경사면에 블록을 붙인다"에 삼각함수가 필요하고, LLM은 거기서 반드시 틀린다.
 *
 * 이 파일의 계약 — 모델은 mm 를 계산하지 않는다:
 *   · 위치는 면 위 s(0~1) 로만 준다. 접촉점·법선 이동·회전각 부호는 여기서 계산한다(바이블 §16).
 *   · 선 종류는 제도 명칭(외형선/기준선/가상선…)으로 고른다. dashLength 숫자를 고르지 않는다(§17).
 *   · 그리는 순서(z)는 §19의 6층 순서로 여기서 고정한다.
 *   · 만든 뒤 스스로 검산해서(runChecks) 결과를 문장으로 돌려준다 — 그림 판독이 약한 모델도
 *     "블록이 면에서 떴다"를 글로 읽고 고칠 수 있다.
 *
 * 좌표계: mm, 원점은 아트보드 중앙, +y 아래. 회전은 SVG 와 같은 시계방향 +.
 */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const SW = 0.35;              // §17 표준 선 굵기 — 모든 선이 이 값이다
const BAND_LEVEL = 205;              // §13 회색 띠(마찰 구간)
const MOTION_ARROW_MM = 5;           // §17 움직임 화살표 길이
const CONTACT_TOL = 0.01;            // §16 접촉 검산 통과선
const TEXT_CLEAR_MIN = 1.0;          // §11 글자–선 최소 간격
const TEXT_SIZE = 3.7;               // state.js DEFAULT_TEXT_SIZE_MM
const HALO_TOP = 0.172;              // §11 실측: bbox 상단 = y − fontSize×0.172

/* 제도 표준 선 분류(§17). 모델이 고르는 것은 이 '이름'뿐이다. */
export const LINE_KINDS = {
  "외형선":     { dashLength: 0,   dashGap: 0   },
  "강조외형선": { dashLength: 0,   dashGap: 0, strokeWidth: 0.7 },
  "기준선":     { dashLength: 1.0, dashGap: 0.3 },
  "가상선":     { dashLength: 1.3, dashGap: 0.9 },
  "궤적선":     { dashLength: 1.0, dashGap: 0.3 },
  "숨은선":     { dashLength: 0.5, dashGap: 0.3 },
  "치수보조선": { dashLength: 1.0, dashGap: 0.3 },
  "경계선":     { dashLength: 0.5, dashGap: 0.3 },
};
export const LINE_KIND_NAMES = Object.keys(LINE_KINDS);

function styleOf(kind) {
  const s = LINE_KINDS[kind] || LINE_KINDS["외형선"];
  return { strokeWidth: s.strokeWidth || SW, dashLength: s.dashLength, dashGap: s.dashGap };
}

/* ===== 벡터 ===== */
const v = (x, y) => ({ x, y });
const sub = (a, b) => v(a.x - b.x, a.y - b.y);
const add = (a, b) => v(a.x + b.x, a.y + b.y);
const mul = (a, k) => v(a.x * k, a.y * k);
const len = (a) => Math.hypot(a.x, a.y);
const unit = (a) => { const L = len(a) || 1; return v(a.x / L, a.y / L); };
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;

/* 점 p 와 (a, 방향 u) 무한직선 사이 거리 */
const lineDist = (p, a, u) => Math.abs(cross(sub(p, a), u));

/* 회전 사각형의 네 꼭짓점 (SVG rotate 와 같은 부호) */
function corners(cx, cy, w, h, deg) {
  const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([lx, ly]) => v(cx + lx * c - ly * s, cy + lx * s + ly * c));
}

/* ===== ① 골격 — 경사면(빗면 자산) + 수평면 =====
 *
 * §1 자산 우선: 빗면은 손조립 도형이 아니라 `triangle`(직각삼각형) 자산이다.
 * 렌더러(shapes.js:75) 기준 flipX=false → 직각이 왼쪽 아래, 빗변은 왼쪽 위 꼭짓점에서
 * 오른쪽 아래로 내려온다. 즉 apex "left" = flipX:false, "right" = flipX:true.
 *
 * 면 위 s 의 뜻(모델에게 노출하는 규약):
 *   경사면  s=0 → 아래(수평면과 만나는 점), s=1 → 위(꼭대기)
 *   수평면  s=0 → 경사면 아래끝, s=1 → 바깥쪽 끝
 */
function traceIncline({ angleDeg, inclineLen, apex, groundLen, extendBack }) {
  const th = angleDeg * D2R;
  const W = inclineLen * Math.cos(th);   // 빗면의 수평 투영
  const H = inclineLen * Math.sin(th);   // 높이
  const left = apex === "left";

  // 수평면 높이를 y=0 으로 두고 그린 뒤, 마지막에 장면 전체를 아트보드 중앙으로 옮긴다.
  const J = v(0, 0);                                    // 경사면과 수평면이 만나는 점
  const A = v(left ? -W : W, -H);                       // 꼭대기
  const baseFar = v(left ? -W : W, 0);                  // 꼭대기 아래(빗면의 직각 꼭짓점 쪽)
  const groundEnd = v(left ? groundLen : -groundLen, 0);
  const backEnd = v(baseFar.x + (left ? -extendBack : extendBack), 0);

  const wedge = {
    type: "triangle",
    x: Math.min(J.x, baseFar.x), y: -H, w: W, h: H,
    flipX: !left, flipY: false,
    fillNone: true, strokeWidth: SW, strokeLevel: 0,
  };

  // 수평면 선. 빗면 자산이 자기 밑변을 이미 그리므로 그 구간은 겹쳐 긋지 않는다(§13 정신).
  const ground = {
    type: "line", p1: { ...J }, p2: { ...groundEnd },
    lineMode: "solid", strokeWidth: SW, strokeLevel: 0,
  };
  const skeleton = [wedge, ground];
  if (extendBack > 0) {
    skeleton.push({
      type: "line", p1: { ...baseFar }, p2: { ...backEnd },
      lineMode: "solid", strokeWidth: SW, strokeLevel: 0,
    });
  }

  const seg = (name, a, b) => {
    const u = unit(sub(b, a));
    // 바깥 법선 = 물체가 놓이는 쪽(위). 이 장면의 면은 전부 비수직이므로 y<0 쪽이 바깥이다.
    let n = v(u.y, -u.x);
    if (n.y > 0) n = mul(n, -1);
    const lr = u.x >= 0 ? u : mul(u, -1);               // 회전각은 좌→우 방향으로 잰다(§16 부호)
    return { name, a, b, u, n, len: len(sub(b, a)), rotDeg: Math.atan2(lr.y, lr.x) * R2D };
  };

  return {
    segments: {
      경사면: seg("경사면", J, A),
      수평면: seg("수평면", J, groundEnd),
    },
    skeleton,
    meta: { J, A, W, H, left, angleDeg },
  };
}

const SEG_ALIAS = {
  경사면: "경사면", incline: "경사면", slope: "경사면", 빗면: "경사면",
  수평면: "수평면", ground: "수평면", 바닥: "수평면", floor: "수평면", 지면: "수평면",
};

/* ===== 본체 ===== */
export function buildInclineScene(input = {}) {
  const warnings = [];
  const errors = [];

  const inc = input.incline || {};
  const angleDeg = num(inc.angleDeg, 30);
  const apex = inc.apex === "right" ? "right" : "left";
  const gnd = input.ground || {};
  const groundLen = num(gnd.length, 45);
  const extendBack = num(gnd.extendBack, 0);
  let inclineLen = num(inc.length, NaN);
  if (!Number.isFinite(inclineLen)) {
    const h = num(inc.height, NaN);
    inclineLen = Number.isFinite(h) ? h / Math.sin(angleDeg * D2R) : 42;
  }
  if (angleDeg <= 0 || angleDeg >= 90) errors.push(`incline.angleDeg 는 0~90 사이여야 합니다 (받은 값 ${angleDeg})`);
  if (errors.length) return { errors, warnings, objects: [], checks: [] };

  const T = traceIncline({ angleDeg, inclineLen, apex, groundLen, extendBack });
  const S = T.segments;

  const pick = (on, where) => {
    const key = SEG_ALIAS[String(on || "").trim()];
    if (!key) {
      errors.push(`${where}: on "${on}" 은(는) 없는 면입니다 — "경사면" 또는 "수평면"`);
      return null;
    }
    return S[key];
  };
  // 면 위 s 점
  const at = (sg, s) => add(sg.a, mul(sg.u, sg.len * clamp01(s)));

  /* §19 층 순서대로 담는다. 그리는 순서 = z 순서 = 이 배열 순서. */
  const L1 = [...T.skeleton];   // 골격
  const L2 = [];                // 영역(회색 띠)
  const L3 = [];                // 물체
  const L4 = [];                // 연결(실·용수철)
  const L5 = [];                // 보조(기준선·가상선)
  const L6 = [];                // 주석(치수·각도·캡션·화살표)

  const checkItems = [];        // 검산 대상 — 만들어 놓은 객체에서 되짚어 잰다

  /* ----- ② 영역: 마찰 구간 (§11 — 면 '아래(안쪽)'로 깔린다) ----- */
  for (const [i, f] of (input.friction || []).entries()) {
    const sg = pick(f.on, `friction[${i}]`);
    if (!sg) continue;
    const from = clamp01(num(f.from, 0)), to = clamp01(num(f.to, 1));
    if (to <= from) { errors.push(`friction[${i}]: to 가 from 보다 커야 합니다`); continue; }
    const t = num(f.thickness, 2);
    const mid = at(sg, (from + to) / 2);
    const c = add(mid, mul(sg.n, -t / 2));               // 안쪽으로 두께 절반
    const w = sg.len * (to - from);
    const obj = {
      type: "rect", x: c.x - w / 2, y: c.y - t / 2, w, h: t, rotation: sg.rotDeg,
      fillLevel: num(f.level, BAND_LEVEL), strokeLevel: num(f.level, BAND_LEVEL), strokeWidth: SW,
    };
    L2.push(obj);
    checkItems.push({ kind: "마찰 띠", label: `${sg.name} ${fmt(from)}~${fmt(to)}`, obj, seg: sg, edge: "top", inside: true });
  }

  /* ----- ③ 물체: 블록 (§15 기본 정사각 / §16 스냅) -----
   * 이름표 기본 ON: 기출 장면 패널 416개 중 374개(90%)가 물체에 이름표(A·B…)를 단다.
   * "80% 이상이면 조립체 기본값"(PART_FREQUENCY 동시출현표) 규칙에 따라, 이름을 안 주면
   * A·B·C 순서로 자동으로 붙인다. 끄려면 autoName:false. */
  const AUTO_NAMES = "ABCDEFGH";
  const autoName = input.autoName !== false;
  let autoIdx = 0;
  const blockObjs = [];
  for (const [i, b] of (input.blocks || []).entries()) {
    const sg = pick(b.on, `blocks[${i}]`);
    if (!sg) continue;
    const w = num(b.w, num(b.size, 8));
    const h = num(b.h, num(b.size, 8));
    const p = at(sg, num(b.s, 0.5));
    const c = add(p, mul(sg.n, h / 2));                  // 바깥쪽으로 두께 절반
    const st = styleOf(b.phantom ? "가상선" : "외형선");
    // 가상선(이전 위치)에는 이름을 새로 붙이지 않는다 — 같은 물체의 다른 시각이라서다.
    const outer = b.labelOuter !== undefined ? b.labelOuter
      : (autoName && !b.phantom && !b.labelInner ? AUTO_NAMES[autoIdx++] : undefined);
    const obj = trim({
      type: "rect", x: c.x - w / 2, y: c.y - h / 2, w, h, rotation: sg.rotDeg,
      fillLevel: num(b.fillLevel, 255), fillNone: false,
      strokeLevel: 0, ...st,
      labelInner: b.labelInner, labelInnerType: b.labelInner ? (b.labelInnerType || "quantity") : undefined,
      labelOuter: outer, labelOuterType: outer ? (b.labelOuterType || "label") : undefined,
      labelOuterPos: outer ? (b.labelOuterPos || "above") : undefined,
    });
    L3.push(obj);
    blockObjs.push({ obj, seg: sg, s: num(b.s, 0.5), w, h, name: b.labelOuter || b.labelInner || `블록${i + 1}` });
    checkItems.push({ kind: "블록", label: `${obj.labelOuter || obj.labelInner || `#${i}`} (${sg.name})`, obj, seg: sg, edge: "bottom", inside: false });
  }

  /* ----- ④ 연결: 실·용수철 (§10 — 블록 변에 정확히 접한다) ----- */
  for (const [i, c] of (input.connectors || []).entries()) {
    const A = blockObjs[c.from], B = blockObjs[c.to];
    if (!A || !B) { errors.push(`connectors[${i}]: from/to 는 blocks 배열의 번호(0부터)여야 합니다`); continue; }
    if (A.seg !== B.seg) { errors.push(`connectors[${i}]: 지금은 같은 면 위의 두 블록만 이을 수 있습니다`); continue; }
    const sg = A.seg;
    const lo = A.s <= B.s ? A : B, hi = A.s <= B.s ? B : A;
    const p1 = add(at(sg, lo.s), mul(sg.u, lo.w / 2));   // 마주보는 변의 중점
    const p2 = add(at(sg, hi.s), mul(sg.u, -hi.w / 2));
    const half = add(mul(sg.n, (lo.h + hi.h) / 4), v(0, 0));
    const line = c.kind === "용수철" ? "helix" : "line";
    L4.push(trim({
      type: "spring", p1: add(p1, half), p2: add(p2, half),
      springStyle: line, turns: line === "helix" ? num(c.turns, 8) : undefined,
      radius: line === "helix" ? num(c.radius, 2.5) : undefined,
      label: c.label, labelShow: !!c.label, strokeWidth: SW, strokeLevel: 0,
    }));
    if (len(sub(p2, p1)) <= 0.2) warnings.push(`connectors[${i}]: 두 블록이 거의 붙어 있어 ${c.kind || "실"}이 보이지 않습니다`);
  }

  /* ----- ⑤ 보조: 기준선 ----- */
  for (const [i, g] of (input.guides || []).entries()) {
    const sg = pick(g.on, `guides[${i}]`);
    if (!sg) continue;
    const p = at(sg, num(g.s, 0.5));
    const L = num(g.length, 20);
    const dir = g.direction === "vertical" ? v(0, -1) : v(1, 0);
    L5.push({
      type: "line", p1: sub(p, mul(dir, num(g.back, 0))), p2: add(p, mul(dir, L)),
      lineMode: "solid", strokeLevel: 0, ...styleOf(g.lineKind || "기준선"),
    });
  }

  /* ----- ⑥ 주석 ----- */
  // 각도 호: 꼭짓점은 두 면의 실제 교점, 두 변은 '빗면'과 '빗면 아래 밑변'이다.
  if (input.angleArc) {
    const a = typeof input.angleArc === "object" ? input.angleArc : {};
    const { J, A, left } = T.meta;
    // anglearc 는 수학 관례(반시계 +, +Y 위) — 화면 벡터의 y 부호를 뒤집어 각을 잰다.
    const mathAngle = (vec) => (Math.atan2(-vec.y, vec.x) * R2D + 360) % 360;
    const aInc = mathAngle(sub(A, J));                   // 빗면 쪽
    const aBase = left ? 180 : 0;                        // 빗면 밑변 쪽(삼각형 안쪽)
    const start = left ? aInc : aBase;                   // 반시계로 훑어 θ 만큼
    L6.push({
      type: "anglearc", x: J.x, y: J.y,
      radius: num(a.radius, Math.min(14, inclineLen * 0.32)),
      startAngle: start, sweepAngle: angleDeg,
      label: a.label || "theta", labelType: "quantity", showLabel: a.showLabel !== false,
      strokeWidth: SW, strokeLevel: 0,
    });
    checkItems.push({ kind: "각도 호", label: `${angleDeg}°`, arc: { J, A, aInc, aBase, want: angleDeg } });
  }

  // 치수선: 내장 치수선을 쓴다(§14 — 화살표와 글자를 손으로 조립하지 않는다)
  for (const [i, d] of (input.dims || []).entries()) {
    const off = num(d.offset, 8);
    const label = d.label || "d";
    if (d.kind === "height") {
      const { A, left } = T.meta;
      const x = A.x + (left ? -off : off);
      L6.push(dimLine(v(x, A.y), v(x, 0), label, d));
      L5.push(extLine(A, v(x, A.y)));
      L5.push(extLine(v(A.x, 0), v(x, 0)));
    } else if (d.kind === "along") {
      const sg = pick(d.on, `dims[${i}]`);
      if (!sg) continue;
      const p1 = at(sg, clamp01(num(d.from, 0))), p2 = at(sg, clamp01(num(d.to, 1)));
      const o = mul(sg.n, off);
      L6.push(dimLine(add(p1, o), add(p2, o), label, d));
      L5.push(extLine(p1, add(p1, o)));
      L5.push(extLine(p2, add(p2, o)));
    } else {
      errors.push(`dims[${i}]: kind 는 "height" 또는 "along" 입니다`);
    }
  }

  // 움직임 화살표: 길이 5mm 고정(§17 — 원본에서 위치·방향만 읽는다)
  for (const [i, ar] of (input.arrows || []).entries()) {
    const sg = pick(ar.on, `arrows[${i}]`);
    if (!sg) continue;
    const p = add(at(sg, num(ar.s, 0.5)), mul(sg.n, num(ar.gap, 6)));
    const down = ar.direction === "down" || ar.direction === "아래";
    const d = mul(sg.u, down ? -1 : 1);
    const L = num(ar.length, MOTION_ARROW_MM);
    L6.push(trim({
      type: "line", p1: sub(p, mul(d, L / 2)), p2: add(p, mul(d, L / 2)),
      lineMode: "arrow", arrowVariant: "right", arrowHead: "end",
      strokeWidth: SW, strokeLevel: 0, label: ar.label, labelShow: !!ar.label,
    }));
  }

  // 캡션(한글 설명 글자): §11 — 선·띠에서 떨어뜨린다. 폭은 서버에 폰트가 없어 추정한다.
  for (const [i, cp] of (input.captions || []).entries()) {
    const sg = pick(cp.on, `captions[${i}]`);
    if (!sg) continue;
    const size = num(cp.fontSize, TEXT_SIZE);
    const below = cp.side !== "above";
    // 같은 면 안쪽에 회색 띠가 깔려 있으면 그 두께만큼 더 뺀다 —
    // "판단이 애매하면 띠 바깥으로"(§11). 사용자가 gap을 직접 주면 그 값을 존중한다.
    const band = below
      ? Math.max(0, ...(input.friction || [])
          .filter((f) => SEG_ALIAS[String(f.on || "").trim()] === sg.name)
          .map((f) => num(f.thickness, 2)))
      : 0;
    const gap = num(cp.gap, 3 + band);
    const p = add(at(sg, num(cp.s, 0.8)), mul(sg.n, below ? -gap : gap));
    const w = estTextWidth(cp.text, size);
    const obj = {
      type: "text", text: String(cp.text ?? ""), fontSize: size,
      x: p.x - w / 2,
      // y 는 앵커(글자 상단). bbox 상단은 그보다 halo 만큼 위에 있다(§11 실측).
      y: below ? p.y + size * HALO_TOP : p.y - size * (1 + HALO_TOP),
    };
    L6.push(obj);
    checkItems.push({ kind: "캡션", label: `"${obj.text}"`, text: { obj, w, size } });
    warnings.push(`captions[${i}]: 글자 폭은 추정치(${w.toFixed(1)}mm)입니다 — export_image 로 가운데 정렬을 한 번 보세요`);
  }

  if (errors.length) return { errors, warnings, objects: [], checks: [] };

  /* z순서: §19의 층 순서를 따르되 '영역(회색 띠)'만 골격보다 뒤에 깐다.
   * 띠를 골격 위에 얹으면 띠 윗변이 잉크 선(굵기 0.35)의 아래 절반을 덮어 바닥선이
   * 그 구간에서 얇아진다(2026-07-31 렌더 확인). §13이 말한 "잉크 선은 별개 객체로
   * 딱 필요한 변에만"을 지키려면 선이 띠 위에 와야 한다. */
  const objects = [...L2, ...L1, ...L3, ...L4, ...L5, ...L6];

  /* ----- 패널 이름 (가)·(나) — 기출 장면의 52%가 단다. panel 을 주면 장면 아래 가운데. ----- */
  if (input.panel) {
    const b0 = sceneBBox(objects);
    const size = num(input.panelSize, 4.2);
    objects.push({
      type: "text", x: b0.x + b0.w / 2 - estTextWidth(input.panel, size) / 2,
      y: b0.y + b0.h + num(input.panelGap, 3.5), text: String(input.panel), fontSize: size,
    });
  }

  /* ----- 장면을 아트보드 중앙(또는 at)으로 옮긴다 ----- */
  const box = sceneBBox(objects);
  const target = input.at || { x: 0, y: 0 };
  const shift = v(num(target.x, 0) - (box.x + box.w / 2), num(target.y, 0) - (box.y + box.h / 2));
  objects.forEach((o) => translate(o, shift));
  checkItems.forEach((c) => {
    if (c.arc) { c.arc.J = add(c.arc.J, shift); c.arc.A = add(c.arc.A, shift); }
  });
  const segShift = {};
  for (const k of Object.keys(S)) {
    segShift[k] = { ...S[k], a: add(S[k].a, shift), b: add(S[k].b, shift) };
  }
  checkItems.forEach((c) => { if (c.seg) c.seg = segShift[c.seg.name]; });

  const checks = runChecks(checkItems, objects, { angleDeg });
  return {
    objects, checks, warnings, errors: [],
    size: { w: box.w, h: box.h },
    counts: { 골격: L1.length, 영역: L2.length, 물체: L3.length, 연결: L4.length, 보조: L5.length, 주석: L6.length },
  };
}

/* ===== 검산 — 만들어 놓은 객체에서 되짚어 잰다 =====
 * 계산에 쓴 값을 그대로 다시 쓰면 검산이 아니다. 여기서는 emit 된 x/y/w/h/rotation 에서
 * 꼭짓점을 다시 구해 면까지의 거리를 잰다 — 빌더가 틀리면 여기서 걸린다.
 */
function runChecks(items, objects, { angleDeg }) {
  const out = [];
  for (const it of items) {
    if (it.obj && it.seg) {
      const o = it.obj;
      const cs = corners(o.x + o.w / 2, o.y + o.h / 2, o.w, o.h, o.rotation || 0);
      const edge = it.edge === "top" ? [cs[0], cs[1]] : [cs[3], cs[2]];
      const d = Math.max(...edge.map((p) => lineDist(p, it.seg.a, it.seg.u)));
      const side = dot(sub(v(o.x + o.w / 2, o.y + o.h / 2), it.seg.a), it.seg.n);
      const ok = d <= CONTACT_TOL && (it.inside ? side < 0 : side > 0);
      out.push({
        ok,
        text: `${it.kind} ${it.label} — ${it.edge === "top" ? "윗변" : "밑변"}–면 거리 ${d.toFixed(3)}mm` +
          ` (통과선 ${CONTACT_TOL}), ${it.inside ? "면 안쪽" : "면 바깥쪽"} ${side >= 0 ? "+" : "−"}`,
      });
    }
    if (it.arc) {
      const got = Math.abs(norm180(it.arc.aInc - it.arc.aBase));
      out.push({
        ok: Math.abs(got - angleDeg) < 0.01,
        text: `각도 호 — 두 변에서 되잰 각 ${got.toFixed(2)}° (지정 ${angleDeg}°)`,
      });
    }
    if (it.text) {
      const { obj, w, size } = it.text;
      const top = obj.y - size * HALO_TOP, bottom = obj.y + size * (1 + HALO_TOP);
      const bb = { x: obj.x, y: top, w, h: bottom - top };
      let min = Infinity, who = "";
      for (const o of objects) {
        if (o === obj || o.type === "text") continue;
        const d = bboxGap(bb, bboxOfLocal(o));
        if (d < min) { min = d; who = o.type; }
      }
      out.push({
        ok: min >= TEXT_CLEAR_MIN,
        text: `캡션 ${it.label} — 가장 가까운 요소(${who})까지 ${min === Infinity ? "-" : min.toFixed(2)}mm` +
          ` (§11 통과선 ${TEXT_CLEAR_MIN}mm)`,
      });
    }
  }
  // 선 굵기 표준(§17)
  const bad = objects.filter((o) => o.strokeWidth !== undefined &&
    o.strokeWidth !== SW && o.strokeWidth !== 0.7);
  out.push({
    ok: bad.length === 0,
    text: bad.length ? `선 굵기 — 표준(0.35) 아닌 객체 ${bad.length}개` : `선 굵기 — 전부 표준 0.35mm(§17)`,
  });
  return out;
}

/* ===== 잔 도구 ===== */
function dimLine(p1, p2, label, d) {
  return {
    type: "line", p1, p2, lineMode: "lengthArrow", dimensionVariant: d.variant || "basic",
    dimensionLabel: label, strokeWidth: SW, strokeLevel: 0,
    // 자동값(선 굵기 기반)은 2.8mm 라 옆의 이름표(A·B)보다 눈에 띄게 작다.
    // §2의 이름표 크기(대문자 높이 4.6~5.0mm ⇒ 4.2)에 맞춘다.
    dimensionLabelSize: num(d.labelSize, 4.2),
  };
}
function extLine(p1, p2) {
  return { type: "line", p1, p2, lineMode: "solid", strokeLevel: 0, ...styleOf("치수보조선") };
}
function estTextWidth(s, size) {
  // 한글은 전각, 라틴·숫자는 대략 0.55em. 서버에 폰트 메트릭이 없어 추정치다.
  let em = 0;
  for (const ch of String(s ?? "")) em += /[가-힣ㄱ-ㆎ]/.test(ch) ? 1 : 0.55;
  return em * size;
}
function bboxOfLocal(o) {
  if (o.x !== undefined && o.w !== undefined) {
    if (!o.rotation) return { x: o.x, y: o.y, w: o.w, h: o.h };
    const cs = corners(o.x + o.w / 2, o.y + o.h / 2, o.w, o.h, o.rotation);
    const xs = cs.map((p) => p.x), ys = cs.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  if (o.p1 && o.p2) {
    return {
      x: Math.min(o.p1.x, o.p2.x), y: Math.min(o.p1.y, o.p2.y),
      w: Math.abs(o.p2.x - o.p1.x), h: Math.abs(o.p2.y - o.p1.y),
    };
  }
  if (o.type === "anglearc") return { x: o.x - o.radius, y: o.y - o.radius, w: o.radius * 2, h: o.radius * 2 };
  return null;
}
function bboxGap(a, b) {
  if (!a || !b) return Infinity;
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
  return Math.hypot(dx, dy);
}
function sceneBBox(objects) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of objects) {
    const b = bboxOfLocal(o);
    if (!b) continue;
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function translate(o, s) {
  if (o.x !== undefined) { o.x += s.x; o.y += s.y; }
  if (o.p1) { o.p1 = add(o.p1, s); o.p2 = add(o.p2, s); }
  if (Array.isArray(o.points)) o.points = o.points.map((p) => add(p, s));
}
function trim(o) {
  const out = {};
  for (const [k, val] of Object.entries(o)) if (val !== undefined) out[k] = val;
  return out;
}
const num = (x, d) => (Number.isFinite(x) ? x : d);
const clamp01 = (x) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
const fmt = (x) => (Math.round(x * 100) / 100).toString();
const norm180 = (a) => { let x = ((a % 360) + 540) % 360 - 180; return x; };
