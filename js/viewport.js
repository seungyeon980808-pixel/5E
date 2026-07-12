/* ===== VIEWPORT (DESIGN 1-2: viewBox zoom/pan, NO CSS transform) ===== */
//
// All zoom/pan is expressed as changes to state.viewBox {x,y,w,h}. The SVG
// viewBox attribute is written from that. Object coordinates never move — only
// the window onto world space does. This keeps hit-testing and fixed-size
// handles (handleSize / zoom) trivial later.

/* ----- module geometry helpers (depend only on the SVG box + viewBox) ----- */

// zoom factor = screen pixels per world unit (uniform; we keep aspect square).
// Derived from how many on-screen pixels one viewBox-width currently spans.
function currentZoom(svg, vb) {
  const rect = svg.getBoundingClientRect();
  return rect.width / vb.w;
}

// world (viewBox) coords -> screen (client) pixels
export function worldToScreen(svg, vb, wx, wy) {
  const pt = svg.createSVGPoint();
  pt.x = wx;
  pt.y = wy;
  const s = pt.matrixTransform(svg.getScreenCTM());
  return { x: s.x, y: s.y };
}

// screen (client) pixels -> world (viewBox) coords.
// Use the SVG's native screen CTM so the conversion honours preserveAspectRatio
// letterboxing (the rendered box is not square). A naive rect.width/height
// divide ignores the centered letterbox and drifts proportionally off-center.
export function screenToWorld(svg, vb, sx, sy) {
  const pt = svg.createSVGPoint();
  pt.x = sx;
  pt.y = sy;
  const w = pt.matrixTransform(svg.getScreenCTM().inverse());
  return { x: w.x, y: w.y };
}

/* ----- public: current zoom factor (will feed handleSize / zoom later) ----- */
let _svgRef = null;
let _stateRef = null;
export function getZoom() {
  if (!_svgRef || !_stateRef) return 1;
  return currentZoom(_svgRef, _stateRef.get().viewBox);
}

// TRUE on-screen scale (px per world unit) honouring preserveAspectRatio="xMidYMid
// meet" letterboxing. getZoom() uses rect.width/vb.w, which is wrong whenever the
// SVG box aspect ratio differs from the viewBox — that mismatch is what made
// committed text resize on commit. The screen CTM's .a is the real meet scale.
export function getRenderScale() {
  if (!_svgRef) return getZoom();
  const m = _svgRef.getScreenCTM();
  return (m && m.a) ? m.a : getZoom();
}

/* ----- center lock: when true, drag-pan is suppressed ----- */
let centerLocked = false;
export function setCenterLocked(val) { centerLocked = val; }

/* ===== ZOOM LIMITS (easy-to-tune) =====================================
 * MAX_ZOOM        — maximum zoom-IN factor (readout ×). 100 = 10000%.
 * MIN_ARTBOARD_VIEWPORT_RATIO — at maximum zoom-OUT the artboard must still
 *   cover at least this fraction of the viewport on BOTH axes. 0.5 = 50%.
 * ===================================================================== */
const MAX_ZOOM = 100;
const MIN_ARTBOARD_VIEWPORT_RATIO = 0.5;

// Allowed range for the viewBox WIDTH (vb.w), given the current SVG box + artboard.
// Smaller vb.w = more zoomed in; larger vb.w = more zoomed out.
//   - minW caps zoom-IN at MAX_ZOOM   (readout zoom = rect.width / vb.w ≤ MAX_ZOOM)
//   - maxW caps zoom-OUT so the artboard's displayed size stays ≥ 50% of the
//     viewport on both axes. Render scale (px per world unit, honouring meet
//     letterboxing) = min(rect.w/vb.w, rect.h/vb.h); during uniform zoom the
//     vb aspect ratio is fixed, so that scale is K/vb.w with K constant.
function zoomWidthBounds(svg, s) {
  const rect = svg.getBoundingClientRect();
  const vb = s.viewBox;
  const ab = s.artboard;
  const K = Math.min(rect.width, (rect.height * vb.w) / vb.h);
  const minScale = Math.max(
    (MIN_ARTBOARD_VIEWPORT_RATIO * rect.width) / ab.w,
    (MIN_ARTBOARD_VIEWPORT_RATIO * rect.height) / ab.h
  );
  const maxW = K / minScale;            // zoom-out limit
  let minW = rect.width / MAX_ZOOM;     // zoom-in limit
  if (minW > maxW) minW = maxW;         // degenerate (tiny viewport): respect zoom-out
  return { minW, maxW };
}

/* ----- setup: wire wheel-zoom + drag-pan onto the SVG element ----- */
// Pan bound: the VIEWPORT CENTER point (center of the viewBox) must stay inside
// the artboard rectangle [-abW/2, abW/2] × [-abH/2, abH/2] — i.e. no artboard
// corner may cross past the viewport center. Applies in every mode. This still
// allows the artboard to sit partly off-screen, but never almost entirely out of
// view (which would leave the viewport center on empty/dark space).
function clampViewBox(s) {
  const vb = s.viewBox;
  const abW = s.artboard.w, abH = s.artboard.h;
  const cx = vb.x + vb.w / 2;
  const cy = vb.y + vb.h / 2;
  const clampedCx = Math.min(abW / 2, Math.max(-abW / 2, cx));
  const clampedCy = Math.min(abH / 2, Math.max(-abH / 2, cy));
  vb.x = clampedCx - vb.w / 2;
  vb.y = clampedCy - vb.h / 2;
}

// Clamp the current zoom (vb.w/vb.h) into [minW, maxW], scaling uniformly.
function clampZoom(svg, s) {
  const vb = s.viewBox;
  const { minW, maxW } = zoomWidthBounds(svg, s);
  const clampedW = Math.min(maxW, Math.max(minW, vb.w));
  if (clampedW !== vb.w) {
    const k = clampedW / vb.w;
    vb.w *= k;
    vb.h *= k;
  }
}

export function initViewport(svg, state, onChange) {
  _svgRef = svg;
  _stateRef = state;

  const ZOOM_STEP = 1.0015; // per wheel delta unit; >1 so deltaY<0 zooms in

  let spaceHeld = false;
  let panning = false;
  let panStart = null; // { sx, sy, vb:{...} }
  let spaceDragged = false;  // Space를 누른 채 팬(드래그)을 시작했는가
  let spaceOnCanvas = false;  // Space 눌림이 캔버스/본문 대상이었는가(입력필드 제외)

  // notify caller (main) that viewBox changed → it writes SVG + re-renders
  const commit = () => onChange();

  /* --- wheel: plain = vertical pan, Shift = horizontal pan, Ctrl = zoom --- */
  svg.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey && !e.shiftKey) {
        // plain scroll → pan vertically (blocked when centerLocked)
        e.preventDefault();
        if (!centerLocked) {
          state.update((s) => {
            const _rect = svg.getBoundingClientRect();
            s.viewBox.y += (e.deltaY / _rect.height) * s.viewBox.h;
            clampViewBox(s);
          });
          commit();
        }
        return;
      }
      if (e.shiftKey && !e.ctrlKey) {
        // Shift+scroll → pan horizontally (blocked when centerLocked)
        e.preventDefault();
        if (!centerLocked) {
          state.update((s) => {
            const _rect = svg.getBoundingClientRect();
            s.viewBox.x += (e.deltaY / _rect.height) * s.viewBox.h;
            clampViewBox(s);
          });
          commit();
        }
        return;
      }
      // Ctrl+scroll → zoom; when centerLocked, zoom is centered on artboard origin
      e.preventDefault();
      state.update((s) => {
        const vb = s.viewBox;
        const factor = Math.pow(ZOOM_STEP, e.deltaY);
        const { minW, maxW } = zoomWidthBounds(svg, s);
        const clampedW = Math.min(maxW, Math.max(minW, vb.w * factor));
        const k = clampedW / vb.w;
        const newW = vb.w * k;
        const newH = vb.h * k;

        if (centerLocked) {
          vb.w = newW;
          vb.h = newH;
          vb.x = -newW / 2;
          vb.y = -newH / 2;
        } else {
          const before = screenToWorld(svg, vb, e.clientX, e.clientY);
          const rect = svg.getBoundingClientRect();
          const fx = (e.clientX - rect.left) / rect.width;
          const fy = (e.clientY - rect.top) / rect.height;
          vb.w = newW;
          vb.h = newH;
          vb.x = before.x - fx * newW;
          vb.y = before.y - fy * newH;
        }
        clampViewBox(s);
      });
      commit();
    },
    { passive: false }
  );

  /* --- pan start: middle button, or left button while Space held --- */
  svg.addEventListener("mousedown", (e) => {
    const isMiddle = e.button === 1;
    const isSpaceLeft = e.button === 0 && spaceHeld;
    if (!isMiddle && !isSpaceLeft) return;

    e.preventDefault(); // always suppress middle-click autoscroll
    if (centerLocked) return;
    if (isSpaceLeft) spaceDragged = true; // 스페이스+드래그 팬 → 탭이 아님(중앙복귀 억제)
    panning = true;
    const vb = state.get().viewBox;
    panStart = { sx: e.clientX, sy: e.clientY, vb: { ...vb } };
    svg.classList.add("is-panning");
  });

  window.addEventListener("mousemove", (e) => {
    if (!panning) return;
    if (!panStart || e.buttons === 0) { panning = false; panStart = null; svg.classList.remove("is-panning"); return; }
    if (centerLocked) return;
    const rect = svg.getBoundingClientRect();
    const start = panStart.vb;
    // convert pixel delta into world delta using the *start* viewBox scale
    const dxWorld = ((e.clientX - panStart.sx) / rect.width) * start.w;
    const dyWorld = ((e.clientY - panStart.sy) / rect.height) * start.h;
    state.update((s) => {
      s.viewBox.x = start.x - dxWorld;
      s.viewBox.y = start.y - dyWorld;
      clampViewBox(s);
    });
    commit();
  });

  window.addEventListener("mouseup", () => {
    if (!panning) return;
    panning = false;
    panStart = null;
    svg.classList.remove("is-panning");
  });

  /* --- Space: 누르는 동안 팬(홀드), 짧게 탭(드래그 없이)하면 중앙으로 복귀 --- */
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;
    // Ctrl/⌘+Space = 중앙 고정 토글(main.js가 처리) → 팬/탭 로직에서 제외
    if (e.ctrlKey || e.metaKey) return;
    // 텍스트 입력 중이면 스페이스는 그대로(공백 입력)
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (!spaceHeld) {
      spaceHeld = true;
      spaceDragged = false;
      spaceOnCanvas = (t === document.body || t === svg);
      svg.classList.add("space-held");
      // 캔버스/본문에 포커스일 때만 페이지 스크롤 억제
      if (spaceOnCanvas) e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code !== "Space" || !spaceHeld) return;
    spaceHeld = false;
    svg.classList.remove("space-held");
    // 드래그 없이 캔버스에서 탭 → 1회 중앙 복귀 (고정 상태면 이미 중앙이라 생략)
    if (spaceOnCanvas && !spaceDragged && !centerLocked) {
      centerView(state); // state.update → applyViewBox+render 구독자 자동 호출
    }
  });

  // suppress middle-click autoscroll / context menu on the canvas
  svg.addEventListener("auxclick", (e) => {
    if (e.button === 1) e.preventDefault();
  });

  /* --- window resize: zoom bounds depend on viewport size, so re-clamp both
         the zoom level and the pan offset whenever the SVG box changes. --- */
  window.addEventListener("resize", () => {
    state.update((s) => {
      clampZoom(svg, s);
      if (centerLocked) {
        s.viewBox.x = -s.viewBox.w / 2;
        s.viewBox.y = -s.viewBox.h / 2;
      }
      clampViewBox(s);
    });
    commit();
  });
}

/* ----- centerView: reposition so artboard (world origin) is centered in view ----- */
export function centerView(state) {
  state.update((s) => {
    s.viewBox.x = -s.viewBox.w / 2;
    s.viewBox.y = -s.viewBox.h / 2;
  });
}
