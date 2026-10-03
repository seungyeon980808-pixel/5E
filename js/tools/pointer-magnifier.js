import { previewStorage } from "../preview-storage.js?v=1.6.1-remediation-0929";

const SVG_NS = "http://www.w3.org/2000/svg";
const SIZE = 160;
const SCALE = 8;
const OFFSET = 24;
const MARGIN = 8;
const preferenceEvent = "5e:crop-magnifier-preference";
const preferences = new Map();
const preferenceKey = (context) => context === "canvas" || context === "library"
  ? `crop-magnifier-${context}` : "crop-magnifier";

export function magnifierPosition(x, y, width, height) {
  const fit = (point, limit) => Math.max(MARGIN, Math.min(
    point + OFFSET + SIZE + MARGIN <= limit ? point + OFFSET : point - OFFSET - SIZE,
    limit - SIZE - MARGIN,
  ));
  return { x: fit(x, width), y: fit(y, height) };
}

export function cropMagnifierEnabled(context = "capture") {
  const fallback = context !== "library";
  try {
    const stored = previewStorage.getItem(preferenceKey(context));
    return stored === null ? preferences.get(context) ?? fallback : stored === "true";
  } catch { return preferences.get(context) ?? fallback; }
}

export function mountCropMagnifierToggle(host, context = "canvas") {
  const label = document.createElement("label");
  label.className = "crop-magnifier-control";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.dataset.cropMagnifierToggle = "";
  const sync = () => { input.checked = cropMagnifierEnabled(context); };
  sync();
  input.addEventListener("change", () => {
    preferences.set(context, input.checked);
    try { previewStorage.setItem(preferenceKey(context), String(input.checked)); }
    catch { /* A blocked settings store keeps the preference for this session. */ }
    window.dispatchEvent(new Event(preferenceEvent));
  });
  label.append(input, document.createTextNode("자르기 돋보기"));
  host.append(label);
  window.addEventListener(preferenceEvent, sync);
  return () => { window.removeEventListener(preferenceEvent, sync); label.remove(); };
}

export function rasterMagnifierSample(image, pointer) {
  if (!image?.isConnected || image.hidden || !image.complete || !image.naturalWidth) return null;
  const bounds = image.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  const x = (pointer.x - bounds.left) / bounds.width;
  const y = (pointer.y - bounds.top) / bounds.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return {
    href: image.currentSrc || image.src, width: image.naturalWidth, height: image.naturalHeight,
    x: x * image.naturalWidth, y: y * image.naturalHeight,
    spanX: (SIZE - 2) * image.naturalWidth / (SCALE * bounds.width),
    spanY: (SIZE - 2) * image.naturalHeight / (SCALE * bounds.height),
  };
}

export function svgMagnifierSample(svg, pointer) {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = pointer.x;
  point.y = pointer.y;
  const world = point.matrixTransform(matrix.inverse());
  const span = (SIZE - 2) / (SCALE * Math.hypot(matrix.a, matrix.b));
  return { href: "#scene", x: world.x, y: world.y, spanX: span, spanY: span };
}

function createLens(id) {
  const lens = document.createElement("div");
  lens.id = id;
  lens.setAttribute("aria-hidden", "true");
  Object.assign(lens.style, {
    position: "fixed", left: "0", top: "0", width: `${SIZE}px`, height: `${SIZE}px`,
    boxSizing: "border-box", border: "1px solid var(--border-strong, #999)",
    background: "var(--bg-panel, white)", boxShadow: "0 2px 8px rgba(0,0,0,.16)",
    pointerEvents: "none", overflow: "hidden", contain: "strict", zIndex: "10120",
  });
  const viewport = document.createElementNS(SVG_NS, "svg");
  viewport.setAttribute("width", "100%");
  viewport.setAttribute("height", "100%");
  viewport.setAttribute("preserveAspectRatio", "none");
  viewport.setAttribute("focusable", "false");
  lens.append(viewport);
  const crosshair = document.createElementNS(SVG_NS, "svg");
  crosshair.setAttribute("viewBox", "0 0 158 158");
  crosshair.setAttribute("focusable", "false");
  Object.assign(crosshair.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
  for (const [color, width] of [["white", "2"], ["#1769aa", "1"]]) {
    const lines = document.createElementNS(SVG_NS, "path");
    lines.setAttribute("d", "M0 79H158 M79 0V158");
    lines.setAttribute("stroke", color);
    lines.setAttribute("stroke-width", width);
    crosshair.append(lines);
  }
  lens.append(crosshair);
  // Root mounting keeps viewport coordinates independent of the editor's body zoom.
  document.documentElement.append(lens);
  return { lens, viewport };
}

export function createPointerMagnifier({ surface, sample, available, id = "crop-magnifier", dragging = true }) {
  let lens = null, viewport = null, content = null, frame = null, pointer = null, panning = false;
  const events = new AbortController();
  const hide = () => {
    pointer = null;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    if (lens) lens.hidden = true;
  };
  const paint = () => {
    frame = null;
    if (!pointer || panning || !available() || !surface.isConnected) { hide(); return; }
    const source = sample(pointer);
    if (!source) { hide(); return; }
    if (!lens) ({ lens, viewport } = createLens(id));
    const tag = source.width ? "image" : "use";
    if (content?.localName !== tag) {
      content = document.createElementNS(SVG_NS, tag);
      viewport.replaceChildren(content);
    }
    content.setAttribute("href", source.href);
    if (source.width) {
      content.setAttribute("width", source.width);
      content.setAttribute("height", source.height);
    }
    viewport.setAttribute("viewBox", `${source.x - source.spanX / 2} ${source.y - source.spanY / 2} ${source.spanX} ${source.spanY}`);
    const position = magnifierPosition(pointer.x, pointer.y, window.innerWidth, window.innerHeight);
    lens.style.transform = `translate(${position.x}px, ${position.y}px)`;
    lens.hidden = false;
  };
  const refresh = () => {
    if (!available() || panning) { hide(); return; }
    if (pointer && frame === null) frame = requestAnimationFrame(paint);
  };
  const listen = (target, type, listener, options = {}) => target.addEventListener(type, listener, { ...options, signal: events.signal });
  listen(surface, "pointermove", event => {
    if (event.pointerType === "touch" || (event.buttons && (!dragging || event.buttons !== 1))) { hide(); return; }
    pointer = { x: event.clientX, y: event.clientY };
    refresh();
  });
  listen(surface, "pointerleave", hide);
  listen(surface, "pointercancel", hide);
  listen(surface, "pointerdown", hide);
  listen(window, "blur", () => { panning = false; hide(); });
  listen(window, "resize", hide);
  listen(window, "scroll", hide, { capture: true, passive: true });
  listen(window, preferenceEvent, refresh);
  listen(window, "keydown", event => {
    if (event.code === "Space") { panning = true; hide(); }
    if (event.key === "Escape") hide();
  }, { capture: true });
  listen(window, "keyup", event => { if (event.code === "Space") panning = false; }, { capture: true });
  return { hide, refresh, destroy() { hide(); events.abort(); lens?.remove(); } };
}

export function attachCropMagnifier({ surface, image, inspector, available = () => true, id, context = "capture" }) {
  const lens = createPointerMagnifier({
    surface, id, available: () => cropMagnifierEnabled(context) && available(),
    sample: pointer => rasterMagnifierSample(image, pointer),
  });
  const removeToggle = mountCropMagnifierToggle(inspector, context);
  return { ...lens, destroy() { lens.destroy(); removeToggle(); } };
}
