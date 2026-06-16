/* ===== MAIN (wire modules; data-as-truth + viewBox zoom/pan) ===== */
//
// Responsibilities:
//   1. write state.viewBox onto the SVG (the only coordinate authority);
//   2. subscribe render to the store so data changes auto-repaint;
//   3. init viewport (wheel zoom / drag pan) → it mutates viewBox via update;
//   4. provide verification hooks (button + console helper) that call
//      state.update — never render() directly.

import { state } from "./state.js";
import { render } from "./render.js";
import { initViewport, getZoom } from "./viewport.js";

const svg = document.getElementById("canvas");
const zoomReadout = document.getElementById("zoom-readout");

/* ----- projection of viewBox onto the SVG element ----- */
function applyViewBox(s) {
  const { x, y, w, h } = s.viewBox;
  svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
  if (zoomReadout) zoomReadout.textContent = `zoom ${getZoom().toFixed(2)}×`;
}

/* ----- subscribe: every state.update() repaints + re-projects viewBox ----- */
// render runs automatically on data change (data-as-truth, DESIGN 1-1).
state.subscribe(render);
state.subscribe(applyViewBox);

/* ----- viewport: zoom/pan mutate viewBox through the store ----- */
// onChange is intentionally a no-op: initViewport mutates viewBox via
// state.update(), which already fires the applyViewBox + render subscribers.
// Keeping the hook lets viewport be reused in setups without those subscribers.
initViewport(svg, state, () => {});

/* ----- initial paint ----- */
applyViewBox(state.get());
render(state.get());

/* ===== VERIFICATION HOOKS ===== */

// (a) Button: scatter the dots to new random WORLD coords via state.update.
//     The screen follows WITHOUT any direct render() call.
const shuffleBtn = document.getElementById("btn-shuffle");
if (shuffleBtn) {
  shuffleBtn.addEventListener("click", () => {
    state.update((s) => {
      s.verifyDots.forEach((d) => {
        d.x = +(10 + Math.random() * 80).toFixed(1);
        d.y = +(10 + Math.random() * 80).toFixed(1);
      });
    });
  });
}

// (b) Console helper: try `phyVerify.move(0, 50, 50)` or `phyVerify.add(60,60)`.
//     All paths go through state.update → subscribers fire → screen updates.
window.phyVerify = {
  state,
  move(index, x, y) {
    state.update((s) => {
      const d = s.verifyDots[index];
      if (d) { d.x = x; d.y = y; }
    });
  },
  add(x, y, color = "#d29922") {
    state.update((s) => s.verifyDots.push({ x, y, r: 1.6, color }));
  },
  clear() {
    state.update((s) => { s.verifyDots.length = 0; });
  },
  zoom: getZoom,
};

console.info(
  "[PhysicsExamDrawer 1A] data-as-truth ready. Try:\n" +
    "  phyVerify.move(0, 50, 50)   // move dot 0 to world (50,50)\n" +
    "  phyVerify.add(60, 60)       // add a dot\n" +
    "  phyVerify.clear()           // remove all dots\n" +
    "Screen follows with NO direct render() call. Wheel=zoom, Space/middle-drag=pan."
);
