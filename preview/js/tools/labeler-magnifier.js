import { createPointerMagnifier, svgMagnifierSample } from "./pointer-magnifier.js?v=1.7.0-preview-0930";
export { magnifierPosition } from "./pointer-magnifier.js?v=1.7.0-preview-0930";

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
}
