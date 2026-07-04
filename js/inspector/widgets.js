/* ===== INSPECTOR — shared widgets & constants =====
 * Extracted verbatim from js/inspector.js (v0.44.0 split): reusable color
 * picker / collapsible section builders + module-level constants shared by
 * the section builders (js/inspector/section-*.js) and populate(). */

export const GRAY_LEVELS = [0, 43, 85, 128, 170, 213, 255];
export const SHAPE_TYPES = ["rect", "ellipse", "triangle"];
export const CIRCUIT_HEIGHT_ELEMENTS = new Set(["resistor", "inductor", "capacitor", "voltmeter", "ammeter"]);
// Branch-B "line family": share arrow + dash controls; fill section is hidden for them.
export const LINE_TYPES = ["line", "polyline", "curve"];
export const DASH_TYPES = [...SHAPE_TYPES, ...LINE_TYPES];
export function supportsDash(obj) {
  return !!obj && (DASH_TYPES.includes(obj.type) || (obj.type === "optics" && obj.kind === "object_arrow"));
}
// Dash presets (world units / mm). 실선 = (0,0) = solid (no dasharray).
export const DASH_PRESETS = [
  { label: "실선",  dashLength: 0, dashGap: 0 },
  { label: "점선1", dashLength: 0.2, dashGap: 0.2 },
  { label: "점선2", dashLength: 0.5, dashGap: 0.3 },
  { label: "점선3", dashLength: 1.0, dashGap: 0.3 },
];

// True while user is dragging a color picker bar — suppresses populate() re-entry.
let _dragging = false;

// Read-only accessor: populate() (js/inspector.js) checks the drag state of
// the single module-level flag without importing the mutable binding itself.
export function isColorDragging() { return _dragging; }

export function levelToHex(v) {
  const h = Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}

/* ===== Reusable color picker widget =====
 * onInput(level) — fires continuously on drag / swatch click
 * onStart()      — fires at drag/click start, before any state change (for snapshot)
 * onCommit()     — fires at drag end / swatch click end (push undo snapshot here)
 */
export function makeColorPicker(onInput, onStart, onCommit) {
  const root = document.createElement("div");
  root.className = "cp-root";

  const palette = document.createElement("div");
  palette.className = "cp-palette";

  // Slider + numeric box live on one row (number is right-aligned next to the bar).
  const barRow = document.createElement("div");
  barRow.className = "cp-bar-row";
  const barWrap = document.createElement("div");
  barWrap.className = "cp-bar-wrap";
  const bar = document.createElement("div");
  bar.className = "cp-bar";
  const handle = document.createElement("div");
  handle.className = "cp-handle";
  barWrap.appendChild(bar);
  barWrap.appendChild(handle);

  // Numeric level input. Shown value = "darkness" 0..255 (0 = white, 255 = black),
  // which is the inverse of the internal grayscale level (0 = black, 255 = white)
  // used by the renderer — so saved-file/render semantics stay untouched.
  const numInput = document.createElement("input");
  numInput.type = "number";
  numInput.min = "0";
  numInput.max = "255";
  numInput.step = "1";
  numInput.className = "cp-num-input";

  barRow.appendChild(barWrap);
  barRow.appendChild(numInput);

  const preview = document.createElement("div");
  preview.className = "cp-preview";

  root.appendChild(palette);
  root.appendChild(barRow);
  root.appendChild(preview);

  let _level = 0;

  function setLevel(v, fire) {
    _level = Math.round(Math.max(0, Math.min(255, v)));
    const pct = (1 - _level / 255) * 100; // left=white=255, right=black=0
    handle.style.left = `${pct}%`;
    preview.style.background = levelToHex(_level);
    // Don't clobber the field while the user is typing in it.
    if (document.activeElement !== numInput) numInput.value = 255 - _level;
    if (fire && onInput) onInput(_level);
  }

  // Numeric box: type a darkness value (0=white..255=black), apply on Enter/blur.
  numInput.addEventListener("focus", () => { if (onStart) onStart(); });
  function applyNum() {
    const raw = parseInt(numInput.value, 10);
    if (!isFinite(raw)) return;
    const darkness = Math.max(0, Math.min(255, raw));
    numInput.value = darkness;           // reflect clamped/parsed value
    setLevel(255 - darkness, true);      // darkness → internal level, render + fire
  }
  numInput.addEventListener("keydown", (e) => { if (e.key === "Enter") numInput.blur(); });
  numInput.addEventListener("change", () => { applyNum(); if (onCommit) onCommit(); });

  function levelFromX(e) {
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return Math.round((1 - pct) * 255);
  }

  // Palette swatches
  GRAY_LEVELS.forEach((g) => {
    const sw = document.createElement("div");
    sw.className = "cp-swatch";
    sw.style.background = levelToHex(g);
    sw.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (onStart) onStart();
      setLevel(g, true);
      if (onCommit) onCommit();
    });
    palette.appendChild(sw);
  });

  // Bar and handle share the same drag handler
  function startBarDrag(e) {
    e.preventDefault();
    if (onStart) onStart();      // capture snapshot BEFORE first change
    _dragging = true;            // suppress populate() re-entry during drag
    setLevel(levelFromX(e), true);

    function onMove(e2) { setLevel(levelFromX(e2), true); }
    function onUp() {
      _dragging = false;
      if (onCommit) onCommit();  // push undo snapshot
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  bar.addEventListener("mousedown", startBarDrag);
  handle.addEventListener("mousedown", startBarDrag);

  return {
    el: root,
    setValue(v) { setLevel(v, false); },
    setDisabled(flag) {
      root.style.opacity = flag ? "0.4" : "";
      root.style.pointerEvents = flag ? "none" : "";
      numInput.disabled = !!flag;
    },
  };
}

/* ----- Collapsible section wrapper ----- */
export function makeSection(title, bodyEl) {
  const details = document.createElement("details");
  details.open = true;
  details.className = "insp-section";
  const summary = document.createElement("summary");
  summary.className = "insp-summary";
  summary.textContent = title;
  details.appendChild(summary);
  details.appendChild(bodyEl);
  return details;
}
