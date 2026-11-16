import { createPointerMagnifier, svgMagnifierSample } from "./pointer-magnifier.js?v=1.7.0-four-session-integration";
export { magnifierPosition } from "./pointer-magnifier.js?v=1.7.0-four-session-integration";

export function initLabelerMagnifier(svg, state) {
  const lens = createPointerMagnifier({
    surface: svg, id: "labeler-magnifier", dragging: false,
    available: () => {
      const s = state.get();
      return (s.activeTool === "LABELER_BRANCH" || (s.activeTool === "LABELER" && !s.draft)) && !s.draftText;
    },
    sample: pointer => svgMagnifierSample(svg, pointer),
  });
  state.subscribe(lens.refresh);
  // 11-11 사용자: 이미 만든 지시선 라벨의 끝점(가리키는 점·꺾임점)을 잡아 끄는 동안에도 새로 만들 때처럼 돋보기를 켠다.
  // 손잡이 이름: p0 = 가리키는 점(p1), p1 = 라벨 글자 자리(p2) — 글자 자리는 끝점이 아니므로 뺀다.
  let endpointDrag = false;
  const drag = createPointerMagnifier({
    surface: svg, id: "labeler-endpoint-magnifier", dragging: true,
    available: () => endpointDrag,
    sample: pointer => svgMagnifierSample(svg, pointer),
  });
  svg.addEventListener("pointerdown", event => {
    const handle = event.target?.closest?.("[data-handle]");
    const object = handle && state.get().objects?.find(o => o.id === handle.dataset.id);
    endpointDrag = Boolean(object && object.type === "labeler" && event.button === 0 && handle.dataset.handle !== "p1");
  }, true);
  const stop = () => { if (!endpointDrag) return; endpointDrag = false; drag.refresh(); };
  window.addEventListener("pointerup", stop, true);
  window.addEventListener("pointercancel", stop, true);
}
