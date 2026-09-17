import { screenToWorld } from "../viewport.js?v=1.6.0-preview-labeler-0917-1111";

const NS = "http://www.w3.org/2000/svg";
let runtime = null;

export function labelerAnchorCount(object) {
  return 1 + (object.p3 ? 1 : 0) + (object.extraAnchors || []).length;
}

export function beginLabelerBranches(objectId) {
  runtime?.begin(objectId);
}

export function labelerBranchStatus() {
  return runtime?.status() || null;
}

export function initLabelerBranches(svg, state) {
  let draft = null;
  let cursor = null;
  const guide = document.createElementNS(NS, "line");
  guide.setAttribute("data-labeler-cursor-guide", "");
  guide.setAttribute("stroke", "#1769aa");
  guide.setAttribute("stroke-width", "1");
  guide.setAttribute("stroke-dasharray", "4 4");
  guide.setAttribute("vector-effect", "non-scaling-stroke");
  const overlay = document.createElementNS(NS, "g");
  overlay.setAttribute("data-labeler-branches", "");
  overlay.setAttribute("pointer-events", "none");
  overlay.setAttribute("aria-hidden", "true");
  const object = () => state.get().objects.find((item) => item.id === draft?.objectId);
  const active = () => draft && state.get().activeTool === "LABELER_BRANCH";
  function drawGuide() {
    if (!active() || !cursor) { guide.remove(); return; }
    const start = draft.elbow;
    if (!start) { guide.remove(); return; }
    guide.setAttribute("x1", start.x);
    guide.setAttribute("y1", start.y);
    guide.setAttribute("x2", cursor.x);
    guide.setAttribute("y2", cursor.y);
    overlay.appendChild(guide);
  }
  function draw() {
    overlay.replaceChildren();
    if (!active()) return;
    const target = object();
    if (!target) return;
    svg.appendChild(overlay);
    const scale = Math.hypot(svg.getScreenCTM()?.a || 1, svg.getScreenCTM()?.b || 0);
    drawGuide();
    if (draft.elbow) {
      const anchors = [target.p1, ...(target.p3 ? [target.p3] : []), ...(target.extraAnchors || []), ...draft.anchors];
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", anchors.map((point) => `M${point.x} ${point.y}L${draft.elbow.x} ${draft.elbow.y}`).join(" "));
      path.setAttribute("stroke", "#1769aa");
      path.setAttribute("stroke-width", String(1 / scale));
      path.setAttribute("fill", "none");
      overlay.appendChild(path);
    }
    for (const point of [...draft.anchors, ...(draft.elbow ? [draft.elbow] : [])]) {
      const dot = document.createElementNS(NS, "circle");
      dot.setAttribute("cx", point.x);
      dot.setAttribute("cy", point.y);
      dot.setAttribute("r", String(3 / scale));
      dot.setAttribute("fill", "white");
      dot.setAttribute("stroke", "#1769aa");
      dot.setAttribute("stroke-width", String(1 / scale));
      overlay.appendChild(dot);
    }
  }
  function finish(commit) {
    const pending = draft;
    draft = null;
    cursor = null;
    overlay.remove();
    state.update((s) => {
      const target = s.objects.find((item) => item.id === pending?.objectId);
      if (commit && target && !target.locked && pending.anchors.length && pending.elbow) {
        s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));
        s.redoStack = [];
        const anchors = [...(target.p3 ? [target.p3] : []), ...(target.extraAnchors || []), ...pending.anchors].slice(0, 4);
        target.p3 = anchors[0];
        target.extraAnchors = anchors.slice(1);
        target.elbow = pending.elbow;
      }
      if (s.activeTool === "LABELER_BRANCH") s.activeTool = "V";
    });
  }
  runtime = {
    begin(objectId) {
      if (active()) { finish(true); return; }
      const target = state.get().objects.find((item) => item.id === objectId);
      if (!target || target.type !== "labeler" || target.locked || labelerAnchorCount(target) >= 5) return;
      draft = { objectId, elbow: target.elbow ? { ...target.elbow } : null, anchors: [] };
      cursor = null;
      state.update((s) => { s.activeTool = "LABELER_BRANCH"; s.draft = null; });
      draw();
    },
    status: () => active() ? { needsElbow: !draft.elbow, count: labelerAnchorCount(object()) + draft.anchors.length } : null,
  };
  svg.addEventListener("pointerdown", (event) => {
    if (!active() || event.button !== 0) return;
    event.stopImmediatePropagation();
  }, true);
  svg.addEventListener("pointermove", (event) => {
    if (!active()) return;
    cursor = event.buttons || event.pointerType === "touch" ? null
      : screenToWorld(svg, state.get().viewBox, event.clientX, event.clientY);
    drawGuide();
  });
  svg.addEventListener("pointerleave", () => { cursor = null; guide.remove(); });
  svg.addEventListener("click", (event) => {
    if (!active() || event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const point = screenToWorld(svg, state.get().viewBox, event.clientX, event.clientY);
    if (!draft.elbow) draft.elbow = point;
    else if (labelerAnchorCount(object()) + draft.anchors.length < 5) draft.anchors.push(point);
    state.update(() => {});
    draw();
  }, true);
  window.addEventListener("keydown", (event) => {
    if (!active() || event.isComposing) return;
    const target = event.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    if (event.key !== "Enter" && event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finish(event.key === "Enter");
  }, true);
  state.subscribe(() => {
    if (draft && (!active() || !object() || object().locked)) { draft = null; overlay.remove(); }
    else draw();
  });
}
