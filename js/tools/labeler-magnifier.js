const SVG_NS = "http://www.w3.org/2000/svg";
const SIZE = 160;
const SCALE = 8;
const OFFSET = 24;
const MARGIN = 8;

export function magnifierPosition(x, y, width, height) {
  const fit = (point, limit) => Math.max(MARGIN, Math.min(
    point + OFFSET + SIZE + MARGIN <= limit ? point + OFFSET : point - OFFSET - SIZE,
    limit - SIZE - MARGIN,
  ));
  return { x: fit(x, width), y: fit(y, height) };
}

export function initLabelerMagnifier(svg, state) {
  let lens = null;
  let viewport = null;
  let frame = null;
  let pointer = null;
  let panning = false;

  const available = () => {
    const s = state.get();
    return (s.activeTool === "LABELER_BRANCH" || (s.activeTool === "LABELER" && !s.draft)) && !s.draftText && !panning;
  };
  const hide = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    if (lens) lens.hidden = true;
  };
  const leave = () => { pointer = null; hide(); };

  function createLens() {
    lens = document.createElement("div");
    lens.id = "labeler-magnifier";
    lens.setAttribute("aria-hidden", "true");
    Object.assign(lens.style, {
      position: "fixed", left: "0", top: "0", width: `${SIZE}px`, height: `${SIZE}px`,
      boxSizing: "border-box", border: "1px solid var(--border-strong)",
      background: "var(--bg-panel)", boxShadow: "0 2px 8px rgba(0,0,0,.16)",
      pointerEvents: "none", overflow: "hidden", contain: "strict", zIndex: "90",
      zoom: "calc(1 / var(--ui-zoom, 1))",
    });
    viewport = document.createElementNS(SVG_NS, "svg");
    viewport.setAttribute("width", "100%");
    viewport.setAttribute("height", "100%");
    viewport.setAttribute("focusable", "false");
    const content = document.createElementNS(SVG_NS, "use");
    content.setAttribute("href", "#scene");
    viewport.appendChild(content);
    lens.appendChild(viewport);
    const crosshair = document.createElementNS(SVG_NS, "svg");
    crosshair.setAttribute("viewBox", "0 0 158 158");
    crosshair.setAttribute("focusable", "false");
    Object.assign(crosshair.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
    for (const [color, width] of [["white", "2"], ["#1769aa", "1"]]) {
      const lines = document.createElementNS(SVG_NS, "path");
      lines.setAttribute("d", "M0 79H158 M79 0V158");
      lines.setAttribute("stroke", color);
      lines.setAttribute("stroke-width", width);
      crosshair.appendChild(lines);
    }
    lens.appendChild(crosshair);
    document.body.appendChild(lens);
  }

  function paint() {
    frame = null;
    if (!pointer || !available()) { hide(); return; }
    const matrix = svg.getScreenCTM();
    if (!matrix) { hide(); return; }
    const point = svg.createSVGPoint();
    point.x = pointer.x;
    point.y = pointer.y;
    const world = point.matrixTransform(matrix.inverse());
    const span = (SIZE - 2) / (SCALE * Math.hypot(matrix.a, matrix.b));
    if (!lens) createLens();
    const position = magnifierPosition(pointer.x, pointer.y, window.innerWidth, window.innerHeight);
    viewport.setAttribute("viewBox", `${world.x - span / 2} ${world.y - span / 2} ${span} ${span}`);
    lens.style.transform = `translate(${position.x}px, ${position.y}px)`;
    lens.hidden = false;
  }

  function schedule() {
    if (!pointer || !available()) { hide(); return; }
    if (frame === null) frame = requestAnimationFrame(paint);
  }

  svg.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || event.buttons) { leave(); return; }
    pointer = { x: event.clientX, y: event.clientY };
    schedule();
  });
  svg.addEventListener("pointerleave", leave);
  svg.addEventListener("pointerdown", leave);
  window.addEventListener("blur", () => { panning = false; leave(); });
  window.addEventListener("resize", leave);
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") { panning = true; hide(); }
    if (event.key === "Escape") leave();
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") { panning = false; schedule(); }
  });
  state.subscribe(schedule);
}
