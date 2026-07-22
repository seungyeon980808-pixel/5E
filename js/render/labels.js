/* ===== RENDER/LABELS: SVG text object + upright/box/line label helpers ===== */

import {
  SVG_NS,
  grayHex,
  rotPt,
  applySvgTextFont,
  fillTextWithRomanRuns,
  applyObjectLabelFont,
} from "./core.js?v=1.1.0";
import {
  DEFAULT_TEXT_FONT,
  DEFAULT_TEXT_SIZE_MM,
  resolveTextFontStyle,
  resolveTextLetterSpacing,
  resolveTextWidthScale,
  normalizeTextRuns,
  hasStyledTextRuns,
} from "../state.js?v=1.1.0";

// 라벨 세로 중심 보정(em 단위). dominant-baseline:"central"은 글자의 잉크가 아니라
// em 박스를 기준으로 중심을 잡아 라벨이 눈에 띄게 아래로 내려앉았다. 대신
// 베이스라인 기준(dominant-baseline 미지정)으로 두고 이 값만큼 y를 내린다.
//
// 값의 근거(Latin Modern Roman 실측, canvas actualBoundingBox 기준):
//   central 기준선 = 베이스라인 위 0.4175em  ← fontBoundingBox.ascent가 1.125em로
//                                              (수식 기호·악센트 여유) 비정상적으로 높다
//   m·v·n·x·r·a 잉크 중심 = 베이스라인 위 0.215em
//   → 기존 central은 소문자를 0.2em 아래로 내려보내고 있었다(5mm 라벨에서 약 1mm).
// 잉크 기준 정중앙은 소문자에서 0.215em이지만, 실제로 보면 글자가 떠 보인다.
// 사용자 판단에 따라 기존 central(0.4175em)과 잉크 정중앙(0.215em)의 중간값을 쓴다.
//
// 글자별 실측이 아니라 단일 상수인 이유: ① 한 그림 안의 여러 m이 항상 같은 높이에
// 놓여야 하고(잉크 실측을 쓰면 m과 mg가 다른 높이가 된다) ② 내보내기 경로에서
// getBBox가 0을 반환하기 때문(estimateLabelBlock 주석 참고).
const LABEL_OPTICAL_CENTER_EM = 0.316;

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
function makeUprightLabel(text, x, y, color, sizeMm = DEFAULT_TEXT_SIZE_MM, options = {}) {
  const s = String(text ?? "");
  if (!s) return null;
  const t = document.createElementNS(SVG_NS, "text");
  t.setAttribute("x", x);
  t.setAttribute("y", y + sizeMm * LABEL_OPTICAL_CENTER_EM);
  t.setAttribute("font-size", sizeMm);
  // An explicit fontFamily (e.g. the labeler's Dotum-first normal text) overrides
  // the labelType-based 물리량/라벨 font policy; otherwise fall back to it.
  if (options.fontFamily) {
    applySvgTextFont(t, { family: options.fontFamily, style: options.fontStyle || "normal", weight: options.fontWeight || "normal", letterSpacing: "normal" });
  } else {
    applyObjectLabelFont(t, options.labelType, options.labelKind === "callout" || options.italic === false ? "label" : "quantity");
  }
  t.setAttribute("fill", color);
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
    return t;
  }

  const lines = s.split("\n");
  if (lines.length === 1) {
    fillTextWithRomanRuns(t, lines[0]);
  } else {
    const lineHeight = sizeMm * 1.2;
    lines.forEach((line, i) => {
      const ts = document.createElementNS(SVG_NS, "tspan");
      ts.setAttribute("x", x);
      ts.setAttribute("dy", i === 0 ? -lineHeight * (lines.length - 1) / 2 : lineHeight);
      inheritLineFont(ts, t);
      fillTextWithRomanRuns(ts, line || "\u00a0");
      t.appendChild(ts);
    });
  }
  return t;
}

/* Attach a box-shape's (rect/ellipse) upright label, if any. The anchor is
 * computed in the UNROTATED bbox frame so the text stays horizontal regardless
 * of obj.rotation. labelPos: "center" | "above" | "below" | "left" | "right"
 * (default center).
 * When a label exists the shape is wrapped in a <g> that carries the data-id;
 * with no label the bare shape element is returned unchanged. */
function withBoxLabel(shapeEl, obj) {
  const pos = obj.labelPos || "center";
  const size = obj.labelSize || DEFAULT_TEXT_SIZE_MM;
  const gap = size * 0.85;
  const cx = obj.x + obj.w / 2;
  const cy = obj.y + obj.h / 2;
  // Anchor in the object's LOCAL (unrotated) frame, measured from the center.
  // center -> (0,0); the four "outside" spots sit one `gap` beyond each edge.
  let lx = 0, ly = 0;
  if (pos === "above")      ly = -(obj.h / 2 + gap);
  else if (pos === "below") ly =  (obj.h / 2 + gap);
  else if (pos === "left")  lx = -(obj.w / 2 + gap);
  else if (pos === "right") lx =  (obj.w / 2 + gap);
  // Rotate that local anchor by obj.rotation around the center (via the shared
  // rotPt helper) so it stays pinned to the same relative spot as the shape
  // turns. The text node itself is appended OUTSIDE the rotation group, so the
  // glyph stays upright.
  const anchor = rotPt(cx + lx, cy + ly, cx, cy, obj.rotation || 0);
  // Rectangle labels honor the object's labelType like every other shape, but with
  // a "label"(신명중명조 정체·upright) FALLBACK: block names (A, B, C …) created without
  // an explicit type default to regular/upright and never inherit the 물리량 italic.
  // A rect whose labelType is explicitly "quantity"(물리량) still renders as Times New
  // Roman italic. `italic:false` only pins that fallback — it does not override an
  // explicit "quantity". Ellipse keeps its own "quantity" fallback.
  const labelOpts = obj.type === "rect"
    ? { labelType: obj.labelType, italic: false }
    : { labelType: obj.labelType };
  const lbl = makeUprightLabel(obj.label, anchor.x, anchor.y, grayHex(obj.strokeLevel), size, labelOpts);
  if (!lbl) return shapeEl;
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) { g.dataset.id = obj.id; delete shapeEl.dataset.id; }
  g.appendChild(shapeEl);
  g.appendChild(lbl);
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
  const lbl = makeUprightLabel(obj.label, lx, ly, grayHex(obj.strokeLevel), size, { labelType: obj.labelType });
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
  el.setAttribute("fill", "#0d1117");
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
  el.setAttribute("text-anchor", "start");
  el.setAttribute("dominant-baseline", "hanging");
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
  if (hasStyledTextRuns(obj)) {
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
  makeUprightLabel,
  withBoxLabel,
  withLineLabel,
  estimateLabelBlock,
  renderText,
};
