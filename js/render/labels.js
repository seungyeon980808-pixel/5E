/* ===== RENDER/LABELS: SVG text object + upright/box/line label helpers ===== */

import {
  SVG_NS,
  LABEL_INK,
  grayHex,
  rotPt,
  applySvgTextFont,
  fillTextWithRomanRuns,
  applyObjectLabelFont,
  LABEL_OPTICAL_CENTER_EM,
  labelInkOffsets,
  makeLabelKnockout,
  applyGlyphHalo,
} from "./core.js?v=1.4.0";
// 안쪽 물리량 라벨(m_B)의 아래첨자는 수식 렌더러를 거쳐야 나온다 — anglearc·labeler와 같은 경로.
import { measureFormula, renderFormula } from "../formula.js?v=1.4.0";
import {
  DEFAULT_TEXT_FONT,
  DEFAULT_TEXT_SIZE_MM,
  OBJECT_LABEL_QUANTITY_FONT_FAMILY,
  EQUATION_FONT_STYLE,
  resolveTextFontStyle,
  resolveTextLetterSpacing,
  resolveTextWidthScale,
  normalizeTextRuns,
  hasStyledTextRuns,
} from "../state.js?v=1.4.0";

// 세로 중심 보정 상수는 core.js에 있다(치수 라벨·회로 기호와 같은 값을 쓰기 위해).

// 멀티라인 라인 tspan에 부모 <text>의 글꼴/스타일을 명시 복사한다 — 숫자 정자화
// (fillTextWithRomanRuns) 감지가 라인 tspan 단위에서도 동작하도록.
function inheritLineFont(child, parent) {
  const ff = parent.getAttribute("font-family");
  if (ff) child.setAttribute("font-family", ff);
  const fs = parent.getAttribute("font-style");
  if (fs) child.setAttribute("font-style", fs);
}

function applySvgTextRunStyle(t, style = {}) {
  applySvgTextFont(t, {
    family: style.fontFamily || DEFAULT_TEXT_FONT,
    style: style.italic === true ? "italic" : "normal",
    weight: style.fontWeight || "normal",
    letterSpacing: resolveTextLetterSpacing(style),
  });
  const deco = [];
  if (style.underline) deco.push("underline");
  if (style.strikeout) deco.push("line-through");
  if (deco.length) t.setAttribute("text-decoration", deco.join(" "));
  else t.removeAttribute("text-decoration");
}

function textRunLines(runs) {
  const lines = [[]];
  for (const run of runs) {
    const parts = String(run.text ?? "").split("\n");
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, style: run.style || {} });
    });
  }
  return lines;
}

function appendStyledTextRuns(parent, obj) {
  const runs = normalizeTextRuns(obj);
  const lines = textRunLines(runs);
  lines.forEach((line, i) => {
    const lineSpan = document.createElementNS(SVG_NS, "tspan");
    lineSpan.setAttribute("x", obj.x);
    lineSpan.setAttribute("dy", i === 0 ? "0" : obj.fontSize * 1.4);
    if (!line.length) {
      lineSpan.textContent = "\u00a0";
    } else {
      line.forEach((run) => {
        const span = document.createElementNS(SVG_NS, "tspan");
        applySvgTextRunStyle(span, run.style);
        span.textContent = run.text;
        lineSpan.appendChild(span);
      });
    }
    parent.appendChild(lineSpan);
  });
}

/* ===== SHARED UPRIGHT LABEL (Group 3) =====
 * A custom text label that always renders horizontally (screen-upright),
 * EXCLUDED from the object's rotation (the caller appends it as a sibling of the
 * rotated shape, never inside the rotation group), in the default font, and IS
 * included in export (it lives in renderObject's output). Returns an SVG <text>
 * node, or null when there's no label text. */
// Physics variable labels use the Chrome-resolved HWP equation font family.
// color 인자는 더 이상 글자색으로 쓰지 않는다 — 라벨은 주인 도형의 선·면 색을 따라가지 않고
// 항상 검정(LABEL_INK)이다(2026-07-31 교사 지적). 호출부 시그니처는 그대로 두어 손대지 않는다.
function makeUprightLabel(text, x, y, color, sizeMm = DEFAULT_TEXT_SIZE_MM, options = {}) {
  const s = String(text ?? "");
  if (!s) return null;
  const t = document.createElementNS(SVG_NS, "text");
  // 앵커·baseline은 기본값(상수 보정)으로 두고, centerInk가 켜지면 아래에서 실측으로 덮는다.
  let anchorX = x;
  let baselineY = y + sizeMm * LABEL_OPTICAL_CENTER_EM;
  t.setAttribute("x", anchorX);
  t.setAttribute("y", baselineY);
  t.setAttribute("font-size", sizeMm);
  // An explicit fontFamily (e.g. the labeler's Dotum-first normal text) overrides
  // the labelType-based 물리량/라벨 font policy; otherwise fall back to it.
  if (options.fontFamily) {
    applySvgTextFont(t, { family: options.fontFamily, style: options.fontStyle || "normal", weight: options.fontWeight || "normal", letterSpacing: "normal" });
  } else {
    applyObjectLabelFont(t, options.labelType, options.labelKind === "callout" || options.italic === false ? "label" : "quantity");
  }
  t.setAttribute("fill", LABEL_INK);
  t.setAttribute("text-anchor", "middle");
  // dominant-baseline은 일부러 지정하지 않는다(=alphabetic). 위 y 보정이 대신한다.
  // HWP·Illustrator 등 외부 SVG 임포터가 dominant-baseline을 무시하는 문제도 함께 사라진다.
  // White halo so the label stays readable over strokes/fills (mirrors the
  // line length-display label).
  t.setAttribute("paint-order", "stroke");
  t.setAttribute("stroke", "white");
  t.setAttribute("stroke-width", sizeMm * 0.16);
  t.setAttribute("stroke-linejoin", "round");

  // Styled-run path (labeler with palette-inserted \uad6c\uac04/\ubb3c\ub9ac\ub7c9 symbols): render each
  // run in its OWN font (Times upright / Times italic) inside centered per-line
  // tspans, so the label matches the editor preview. Text-anchor:middle + the halo
  // stay on the parent <text>, inherited by the child run tspans. Gated by the
  // caller on hasStyledTextRuns; plain labels keep the roman-serif auto path below.
  if (options.styled && Array.isArray(options.runs) && options.runs.length) {
    const runLines = textRunLines(options.runs);
    const lineHeight = sizeMm * 1.2;
    runLines.forEach((line, i) => {
      const ts = document.createElementNS(SVG_NS, "tspan");
      ts.setAttribute("x", x);
      ts.setAttribute("dy", runLines.length === 1 ? 0
        : (i === 0 ? -lineHeight * (runLines.length - 1) / 2 : lineHeight));
      if (!line.length) {
        ts.textContent = "\u00a0";
      } else {
        line.forEach((run) => {
          const rs = document.createElementNS(SVG_NS, "tspan");
          applySvgTextRunStyle(rs, run.style);
          rs.textContent = run.text;
          ts.appendChild(rs);
        });
      }
      t.appendChild(ts);
    });
    return withKnockout(t, runLines.map((line) => line.map((r) => r.text).join("")),
      x, y + sizeMm * LABEL_OPTICAL_CENTER_EM, sizeMm, options);
  }

  const lines = s.split("\n");
  /* 사각형 라벨만(options.centerInk) 글자별 잉크 중앙으로 다시 앉힌다.
   * 한 줄일 때만 한다 — 여러 줄은 블록 전체가 baselineY를 중심으로 대칭이라
   * 글자 하나를 기준으로 옮기면 오히려 어긋난다. 못 재면 위에서 넣은 상수 그대로. */
  if (options.centerInk && lines.length === 1) {
    const ink = labelInkOffsets(lines[0], sizeMm, textFontParts(t), textLetterSpacingEm(t, sizeMm));
    if (ink) {
      t.setAttribute("x", x + ink.dx);
      t.setAttribute("y", y + ink.dy);
      baselineY = y + ink.dy;
      anchorX = x + ink.dx;
    }
  }
  if (lines.length === 1) {
    fillTextWithRomanRuns(t, lines[0]);
  } else {
    const lineHeight = sizeMm * 1.2;
    lines.forEach((line, i) => {
      const ts = document.createElementNS(SVG_NS, "tspan");
      ts.setAttribute("x", anchorX);
      ts.setAttribute("dy", i === 0 ? -lineHeight * (lines.length - 1) / 2 : lineHeight);
      inheritLineFont(ts, t);
      fillTextWithRomanRuns(ts, line || "\u00a0");
      t.appendChild(ts);
    });
  }
  return withKnockout(t, lines, anchorX, baselineY, sizeMm, options);
}

/* centerInk 측정용 보조 — <text>에 실제로 적용된 글꼴을 그대로 읽어 온다. */
function textFontParts(t) {
  return {
    style: t.getAttribute("font-style") || "normal",
    weight: t.getAttribute("font-weight") || "normal",
    family: t.getAttribute("font-family") || "serif",
  };
}
/* 자간은 "-0.04em" 같은 em 문자열이거나 "normal"이다. em 수치로 돌려준다.
 * px/mm 등 em이 아닌 단위는 글자 크기에 비례하지 않으므로 0으로 본다(현재 앱에는 없다). */
function textLetterSpacingEm(t, sizeMm) {
  const raw = (t.getAttribute("letter-spacing") || "").trim();
  if (!raw || raw === "normal") return 0;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return raw.endsWith("em") ? n : (sizeMm > 0 ? n / sizeMm : 0);
}

/* \ub77c\ubca8 \ub4a4\ub97c \ud770 \uc0ac\uac01\ud615\uc73c\ub85c \uc9c0\uc6cc \ubc11\uc120\uc774 \uae00\uc790 \uc0ac\uc774\ub85c \ube44\uce58\uc9c0 \uc54a\uac8c \ud55c\ub2e4(core.makeLabelKnockout).
 * \uc9c0\uc6b8 \uac8c \uc5c6\uac70\ub098 options.knockout === false \uba74 <text> \uadf8\ub300\ub85c \ub3cc\ub824\uc900\ub2e4 \u2014 \ud638\ucd9c\ubd80\ub294 \uc5b4\ub290 \ucabd\uc774\ub4e0
 * appendChild\ub9cc \ud558\ubbc0\ub85c \ubc18\ud658 \ud0c0\uc785\uc774 <g>\ub85c \ubc14\ub00c\uc5b4\ub3c4 \uc548\uc804\ud558\ub2e4. */
function withKnockout(t, lines, x, baselineY, sizeMm, options = {}) {
  if (options.knockout === false) return t;
  // 기본: 글자 모양대로만 가린다(core.applyGlyphHalo). 옆 글자를 건드리지 않는다.
  applyGlyphHalo(t, sizeMm, options.haloRatio);
  // labelBg가 켜졌을 때만 라벨 뒤를 흰 사각형으로 통째로 지운다 — 회색 면·격자 위처럼
  // 글자 사이 틈으로 배경이 비치는 게 거슬리는 그림에서만 쓴다(2026-07-26 교사 결정).
  if (!options.labelBg) return t;
  const rect = makeLabelKnockout(lines, x, baselineY, sizeMm, {
    anchor: "middle",
    lineHeight: sizeMm * 1.2,
    fontFamily: t.getAttribute("font-family") || undefined,
    fontStyle: t.getAttribute("font-style") || undefined,
    fontWeight: t.getAttribute("font-weight") || undefined,
  });
  if (!rect) return t;
  const g = document.createElementNS(SVG_NS, "g");
  g.appendChild(rect);
  g.appendChild(t);
  return g;
}

/* Attach a box-shape's (rect/ellipse) upright label, if any. The anchor is
 * computed in the UNROTATED bbox frame so the text stays horizontal regardless
 * of obj.rotation. labelPos: "center" | "above" | "below" | "left" | "right"
 * (default center).
 * When a label exists the shape is wrapped in a <g> that carries the data-id;
 * with no label the bare shape element is returned unchanged. */
/* 안쪽·바깥 두 슬롯을 해석한다 (docs/BOX_LABEL_DUAL_SPEC.md).
 * 새 필드(labelInner/labelOuter)가 하나라도 있으면 그것을 쓰고, 없으면 옛 단일 슬롯
 * (label/labelPos/labelType)을 위치에 따라 안쪽·바깥 중 한쪽으로 읽는다.
 * → 옛 프로젝트 파일은 마이그레이션 없이도 그대로 보인다. */
function boxLabelSlots(obj) {
  if (obj.labelInner != null || obj.labelOuter != null) {
    return {
      inner: { text: obj.labelInner || "", type: obj.labelInnerType || "" },
      outer: { text: obj.labelOuter || "", pos: obj.labelOuterPos || "right",
               // 바깥도 물리량을 쓸 수 있다(2026-07-31). 부재는 옛 규칙대로 이름표.
               type: obj.labelOuterType || "label" },
    };
  }
  const pos = obj.labelPos || "center";
  if (pos === "center") {
    return { inner: { text: obj.label || "", type: obj.labelType || "" },
             outer: { text: "", pos: "right", type: "label" } };
  }
  return { inner: { text: "", type: "" },
           outer: { text: obj.label || "", pos, type: "label" } };
}

/* Anchor in the object's LOCAL (unrotated) frame, measured from the center.
 * center -> (0,0); the four "outside" spots sit one `gap` beyond each edge.
 * Rotated by obj.rotation around the center so the anchor stays pinned to the
 * same relative spot as the shape turns (the glyph itself stays upright — the
 * text node is appended OUTSIDE the rotation group). */
function boxLabelAnchor(obj, pos, gap) {
  const cx = obj.x + obj.w / 2;
  const cy = obj.y + obj.h / 2;
  let lx = 0, ly = 0;
  if (pos === "above")      ly = -(obj.h / 2 + gap);
  else if (pos === "below") ly =  (obj.h / 2 + gap);
  else if (pos === "left")  lx = -(obj.w / 2 + gap);
  else if (pos === "right") lx =  (obj.w / 2 + gap);
  return rotPt(cx + lx, cy + ly, cx, cy, obj.rotation || 0);
}

/* 안쪽 물리량 라벨은 수식 렌더러로 그린다 — m_B 의 B 가 아래첨자로 나와야 한다.
 * renderFormula 의 앵커는 top-left 이므로 실측 폭·높이의 절반만큼 되끌어 중앙에 맞춘다
 * (anglearc 라벨과 같은 방식). 첨자·위첨자가 없는 글자는 이 경로를 타지 않는다. */
function makeQuantityBoxLabel(text, ax, ay, sizeMm) {
  const family = OBJECT_LABEL_QUANTITY_FONT_FAMILY;
  const fm = measureFormula(text, sizeMm, { family, weight: "normal", style: EQUATION_FONT_STYLE });
  if (!fm) return null;
  return renderFormula({
    x: ax - fm.w / 2,
    y: ay - fm.h / 2,
    source: text,
    fontSize: sizeMm,
    fontFamily: family,
  });
}

/* 라벨 한 개를 만드는 **공용 진입점**. 어느 부품이든 사용자가 적어 넣는 라벨은 전부
 * 이걸 거친다 — 물리량이면서 첨자 문법(_ ^)이 있으면 수식 렌더러로, 아니면 기존 정자
 * 텍스트로 간다. 2026-07-31 이전에는 상자·선·회로만 수식 경로가 있었고 진자·광학·기구
 * 라벨은 v_0 을 그대로 "v_0" 으로 찍었다.
 *   text  라벨 글자 · ax, ay  글자 중심 · sizeMm  글자 크기
 *   opts.labelType  "quantity"(기본, 물리량) | "label"(이름표 정자)
 * 반환은 <text> 또는 수식 <g>. 붙일 곳에서 그대로 appendChild 하면 된다. */
function makeLabelEl(text, ax, ay, sizeMm, opts = {}) {
  const s = String(text ?? "");
  if (!s) return null;
  const type = opts.labelType;
  if (type !== "label" && /[_^]/.test(s)) {
    const el = makeQuantityBoxLabel(s, ax, ay, sizeMm);
    if (el) return el;                       // 수식 파서가 실패하면 아래 정자 경로로 흘린다
  }
  return makeUprightLabel(s, ax, ay, opts.color || LABEL_INK, sizeMm, {
    labelType: type, labelBg: opts.labelBg, haloRatio: opts.haloRatio,
    italic: opts.italic, centerInk: opts.centerInk,
  });
}

/* Attach a box-shape's (rect/ellipse) upright labels, if any. 안쪽(가운데)과
 * 바깥(위·아래·왼쪽·오른쪽)을 **동시에** 붙일 수 있다 — 상자 안에 물리량(m_B),
 * 상자 밖에 이름표(B)를 두는 기출 관례를 그대로 그리기 위해서다.
 * 라벨이 하나라도 있으면 도형을 <g>로 감싸 data-id를 옮긴다. */
function withBoxLabel(shapeEl, obj) {
  const size = obj.labelSize || DEFAULT_TEXT_SIZE_MM;
  const gap = size * 0.85;
  const { inner, outer } = boxLabelSlots(obj);
  const parts = [];

  if (inner.text) {
    const a = boxLabelAnchor(obj, "center", gap);
    // 물리량이면서 첨자 문법이 있을 때만 수식 경로. 그 외는 기존 텍스트 경로 그대로.
    const el = (inner.type === "quantity" && /[_^]/.test(inner.text))
      ? makeQuantityBoxLabel(inner.text, a.x, a.y, size)
      // Rectangle labels honor labelType like every other shape, but with a
      // "label"(신명중명조 정체) FALLBACK: block names (A, B, C …) created without an
      // explicit type default to upright and never inherit the 물리량 italic.
      // centerInk는 **사각형 + 안쪽 배치**에서만 켠다(2026-07-27 교사 결정).
      : makeUprightLabel(inner.text, a.x, a.y, grayHex(obj.strokeLevel), size,
          obj.type === "rect"
            ? { labelType: inner.type, italic: false, labelBg: obj.labelBg,
                haloRatio: obj.haloRatio, centerInk: true }
            : { labelType: inner.type, labelBg: obj.labelBg, haloRatio: obj.haloRatio });
    if (el) parts.push(el);
  }

  if (outer.text) {
    // 바깥도 안쪽과 같은 두 서체를 쓴다(2026-07-31 교사 결정). 상자 안이 이름(A·B)이고
    // 바깥이 질량(m·2m)인 도판이 있어서다 — 기본값은 여전히 이름표(정체)다.
    // 바깥 배치는 도형에서 gap만큼 떨어뜨리는 게 기준이라 centerInk를 켜지 않는다.
    const a = boxLabelAnchor(obj, outer.pos, gap);
    const el = (outer.type === "quantity" && /[_^]/.test(outer.text))
      ? makeQuantityBoxLabel(outer.text, a.x, a.y, size)
      // outer.type 은 항상 quantity|label 중 하나라 fallback(italic 플래그)은 쓰지 않는다.
      : makeUprightLabel(outer.text, a.x, a.y, grayHex(obj.strokeLevel), size,
          { labelType: outer.type, labelBg: obj.labelBg, haloRatio: obj.haloRatio });
    if (el) parts.push(el);
  }

  if (!parts.length) return shapeEl;
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) { g.dataset.id = obj.id; delete shapeEl.dataset.id; }
  g.appendChild(shapeEl);
  parts.forEach((p) => g.appendChild(p));
  return g;
}

/* Attach a line's optional upright label (Group 3): when labelShow is on and
 * label text is non-empty, render it screen-upright, centered ABOVE the line
 * midpoint (mirrors the length-display styling, custom text, lifted above). The
 * line is drawn in absolute p1→p2 coords (no rotation group), so the label is
 * naturally upright. Wraps the body in a <g> carrying the data-id. */
function withLineLabel(bodyEl, obj) {
  if (!(obj.labelShow && String(obj.label ?? ""))) return bodyEl;
  // Length-display (dimension) mode already shows text along the line, so the
  // external label is redundant there — skip it (Group 6 task 3).
  if (obj.lineStyle === "dimensionArrow") return bodyEl;
  const mx = (obj.p1.x + obj.p2.x) / 2;
  const my = (obj.p1.y + obj.p2.y) / 2;
  const size = obj.labelSize || DEFAULT_TEXT_SIZE_MM;
  // Offset the label along the line's NORMAL by a FIXED distance so the label-to-
  // line gap is identical at every angle (the old screen-up offset varied with
  // angle). Default side is normalized to screen-up (negative y); 반전(labelFlip)
  // mirrors it to the opposite side at the SAME perpendicular distance (point-
  // symmetric about the foot of the perpendicular = the midpoint).
  const dx = obj.p2.x - obj.p1.x, dy = obj.p2.y - obj.p1.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (ny > 0) { nx = -nx; ny = -ny; } // keep default side pointing up
  const side = obj.labelFlip ? -1 : 1;
  const off = size; // fixed perpendicular gap (angle-independent)
  const lx = mx + nx * off * side;
  const ly = my + ny * off * side;
  // 물리량이면서 첨자 문법이 있으면 수식 경로 — 상자 라벨(withBoxLabel)·회로 소자 라벨과
  // 같은 정책이다. 이게 없어서 실·용수철·선의 label 만 v_0 이 v₀ 로 바뀌지 않았다(2026-07-31).
  // 기본값(labelType 미지정)은 물리량이다 — 글꼴 정책(applyObjectLabelFont)과 같은 기준.
  const lbl = (obj.labelType !== "label" && /[_^]/.test(String(obj.label)))
    ? makeQuantityBoxLabel(obj.label, lx, ly, size)
    : makeUprightLabel(obj.label, lx, ly, grayHex(obj.strokeLevel), size, { labelType: obj.labelType, labelBg: obj.labelBg, haloRatio: obj.haloRatio });
  if (!lbl) return bodyEl;
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) { g.dataset.id = obj.id; if (bodyEl.dataset) delete bodyEl.dataset.id; }
  g.appendChild(bodyEl);
  g.appendChild(lbl);
  return g;
}

/* ----- estimate a labeler's text block half-extents (world mm) -----
 * No exact measurement is available here: renderLabeler runs for both the live
 * canvas and SVG/PNG export, where the element isn't laid out yet (getBBox would
 * read 0). So estimate from font size, line count, the longest line, and the
 * line height used by makeUprightLabel (lineHeight = size * 1.2). The block is
 * centered on the label point; the returned half-width/half-height include `pad`.
 * Per-char widths intentionally OVER-estimate (CJK ≈ 1em, others ≈ 0.6em) so the
 * leader stops outside the glyphs even when measurement is imperfect. */
function estimateLabelBlock(text, size, pad) {
  const s = String(text ?? "");
  const lines = s.length ? s.split("\n") : [""];
  const lineHeight = size * 1.2;
  const isWide = (code) =>
    (code >= 0x1100 && code <= 0x11ff) ||  // Hangul Jamo
    (code >= 0x3000 && code <= 0x9fff) ||  // CJK symbols/punctuation + Unified
    (code >= 0xac00 && code <= 0xd7a3) ||  // Hangul Syllables
    (code >= 0xf900 && code <= 0xfaff) ||  // CJK Compatibility Ideographs
    (code >= 0xff00 && code <= 0xffef);    // Fullwidth forms
  let maxEm = 0;
  for (const line of lines) {
    let em = 0;
    for (const ch of line) em += isWide(ch.codePointAt(0)) ? 1.0 : 0.6;
    maxEm = Math.max(maxEm, em);
  }
  const blockW = maxEm * size;
  const blockH = lines.length * lineHeight;
  return { hw: blockW / 2 + pad, hh: blockH / 2 + pad };
}

/* ----- text: SVG <text> with optional multi-line <tspan> elements ----- */
// x/y = top-left anchor in world coords (dominant-baseline: hanging positions y at top).
// Multi-line: split on \n, each line is a <tspan> with dy=fontSize*1.4.
function renderText(obj) {
  const el = document.createElementNS(SVG_NS, "text");
  el.setAttribute("x", obj.x);
  el.setAttribute("y", obj.y);
  el.setAttribute("font-size", obj.fontSize);
  el.setAttribute("fill", LABEL_INK);
  // Style fields — safe defaults so old text objects (without them) still render.
  applySvgTextFont(el, {
    family: obj.fontFamily || DEFAULT_TEXT_FONT,
    style: resolveTextFontStyle(obj),
    weight: obj.fontWeight || "normal",
    letterSpacing: resolveTextLetterSpacing(obj),
  });
  const deco = [];
  if (obj.underline) deco.push("underline");
  if (obj.strikeout) deco.push("line-through");
  if (deco.length) el.setAttribute("text-decoration", deco.join(" "));
  /* 세로쓰기(textOrient:"vertical") — 기출 그래프의 세로축 이름 표기.
   * 회전(눕히기)과 다른 물건이다: 글자는 똑바로 선 채 한 자씩 아래로 쌓인다.
   * 회전은 이미 rotation 으로 되지만, 평가원 도판의 "수심(m)" 같은 축 이름은
   * 눕히지 않고 세워 쌓는다(docs/SURVEY_earth_20260731.md — 그래프 패널에 거의 매장).
   * 글자마다 x 를 앵커에 맞춰야 기둥이 흔들리지 않으므로 가운데 정렬로 바꾼다. */
  const vertical = obj.textOrient === "vertical";
  el.setAttribute("text-anchor", vertical ? "middle" : "start");
  el.setAttribute("dominant-baseline", "hanging");
  // 흰 테두리(halo) — 기본 켜짐. 시험지 그림에서 글자가 선·채움 위에 얹히는 게 일상이라
  // 평가원 원본처럼 항상 가독성을 확보한다. 인스펙터에서 obj.halo=false로 끌 수 있다.
  // (부재 = 켜짐이므로 구파일 백필 불필요 — project-io 규칙 "부재가 곧 신호"와 일치)
  if (obj.halo !== false) {
    el.setAttribute("paint-order", "stroke");
    el.setAttribute("stroke", "white");
    el.setAttribute("stroke-width", (obj.fontSize || DEFAULT_TEXT_SIZE_MM) * 0.16);
    el.setAttribute("stroke-linejoin", "round");
  }
  if (obj.id) el.dataset.id = obj.id;
  // Optional rotation about the text's top-left anchor, + 장평(가로 배율).
  // 변환 목록은 왼쪽부터 적용된다 → 장평으로 가로만 늘린 결과를 앵커 기준으로 회전.
  // 장평 피벗은 앵커(obj.x): text-anchor="start"라 글자가 여기서 시작한다.
  const rot = obj.rotation ?? 0;
  const wsx = resolveTextWidthScale(obj);
  const tf = [];
  if (rot) tf.push(`rotate(${rot},${obj.x},${obj.y})`);
  if (wsx !== 1) tf.push(`translate(${obj.x},0) scale(${wsx},1) translate(${-obj.x},0)`);
  if (tf.length) el.setAttribute("transform", tf.join(" "));

  // 다중 런(실제 사용자 서식)일 때만 런 단위로 그린다. 단일/빈 런은 일반 텍스트로
  // 취급해 "구간 I/II/III" 세리프(section-marker) 처리를 적용한다. (hasStyledTextRuns)
  if (vertical && !hasStyledTextRuns(obj)) {
    // 줄바꿈은 무시하고 글자 단위로 쌓는다 — 세로 축 이름은 한 기둥이 원칙이다.
    // 줄 간격 1.4배(가로 여러 줄)보다 촘촘한 1.05배를 쓴다: 가로쓰기의 줄 간격을
    // 그대로 쓰면 글자 사이가 벌어져 축 이름이 아니라 낱글자 여러 개로 보인다.
    const chars = Array.from((obj.text || "").replace(/\n/g, ""));
    chars.forEach((ch, i) => {
      const ts = document.createElementNS(SVG_NS, "tspan");
      ts.setAttribute("x", obj.x);
      ts.setAttribute("dy", i === 0 ? "0" : (obj.fontSize || DEFAULT_TEXT_SIZE_MM) * 1.05);
      inheritLineFont(ts, el);
      fillTextWithRomanRuns(ts, ch === " " ? " " : ch);
      el.appendChild(ts);
    });
  } else if (hasStyledTextRuns(obj)) {
    appendStyledTextRuns(el, obj);
  } else {
    const lines = (obj.text || "").split("\n");
    if (lines.length === 1) {
      fillTextWithRomanRuns(el, lines[0]);
    } else {
      lines.forEach((line, i) => {
        const ts = document.createElementNS(SVG_NS, "tspan");
        ts.setAttribute("x", obj.x);
        ts.setAttribute("dy", i === 0 ? "0" : obj.fontSize * 1.4);
        inheritLineFont(ts, el);
        fillTextWithRomanRuns(ts, line || "\u00a0");
        el.appendChild(ts);
      });
    }
  }
  return el;
}

export {
  makeLabelEl,
  makeUprightLabel,
  boxLabelSlots,
  withBoxLabel,
  withLineLabel,
  estimateLabelBlock,
  renderText,
};
