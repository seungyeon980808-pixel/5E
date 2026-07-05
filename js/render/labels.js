/* ===== RENDER/LABELS: SVG text object + upright/box/line label helpers ===== */

import {
  SVG_NS,
  grayHex,
  rotPt,
  applySvgTextFont,
  fillTextWithRomanRuns,
  applyObjectLabelFont,
} from "./core.js?v=0.46.0";
import {
  DEFAULT_TEXT_FONT,
  DEFAULT_TEXT_SIZE_MM,
  resolveTextFontStyle,
  resolveTextLetterSpacing,
  normalizeTextRuns,
  hasStyledTextRuns,
} from "../state.js?v=0.46.0";

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
  t.setAttribute("y", y);
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
  t.setAttribute("dominant-baseline", "central");
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
  // Optional rotation about the text's top-left anchor.
  const rot = obj.rotation ?? 0;
  if (rot) el.setAttribute("transform", `rotate(${rot},${obj.x},${obj.y})`);

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
