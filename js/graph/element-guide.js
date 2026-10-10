// These colors describe editable targets only; the renderer/export remains gray.
export const ELEMENT_COLORS = Object.freeze({ axis: '#528900', text: '#c025a6', guide: '#c06900', point: '#008c7b', region: '#7865d0' });
const SERIES_COLORS = ['#008ea3', '#ad36c4', '#638d00', '#bd6c00', '#315bd0', '#bd376b'];
export function seriesGuideColor(series, index = 0) {
  const key = series.objectId || series.reconstruction?.seriesId;
  let hash = index;
  if (key) { hash = 0; for (const c of key) hash = (hash * 31 + c.charCodeAt(0)) >>> 0; }
  return SERIES_COLORS[hash % SERIES_COLORS.length];
}
export function annotationGuideColor(annotation) {
  if (!annotation || annotation.kind === 'text' || annotation.text && annotation.endStyle === 'none') return ELEMENT_COLORS.text;
  if (['arrow','leader','guide'].includes(annotation.kind)) return ELEMENT_COLORS.guide;
  return ELEMENT_COLORS[annotation.kind] || ELEMENT_COLORS.point;
}
function paintInk(root, color) {
  for (const node of [root, ...root.querySelectorAll('*')]) {
    if (node.closest('[data-preview-hit], [data-annotation-hit]') || node.style.stroke === 'transparent') continue;
    for (const attr of ['stroke', 'fill']) {
      const value = node.getAttribute(attr);
      if (!value || /^(none|transparent|white|#fff(?:fff)?|url\()/i.test(value) || attr === 'fill' && value === 'var(--bg-input)') continue;
      // Transparent hit rectangles and white interiors must stay unchanged.
      node.setAttribute(attr, color);
      if (attr === 'stroke' && node.style.stroke) node.style.stroke = color;
    }
  }
}
export function applyElementGuide(svg, { annotations = [], enabled = false, focusSelector = null } = {}) {
  if (!enabled) return;
  for (const node of svg.querySelectorAll('[data-display-kind], [data-labelpt], [data-legend]')) {
    const kind = node.dataset.displayKind;
    paintInk(node, node.hasAttribute('data-labelpt') || node.hasAttribute('data-legend') ? ELEMENT_COLORS.text
      : ['guide', 'guideline', 'arrow'].includes(kind) ? ELEMENT_COLORS.guide : ELEMENT_COLORS.point);
  }
  for (const node of svg.querySelectorAll('[data-graph-annotation], [data-graph-annotation-shape]')) {
    const id = node.getAttribute('data-graph-annotation') || node.getAttribute('data-graph-annotation-shape');
    paintInk(node, annotationGuideColor(annotations.find(a => a.id === id)));
  }
  for (const node of svg.querySelectorAll('[data-graph-region]')) paintInk(node,ELEMENT_COLORS.region);
  if (focusSelector) for (const node of svg.querySelectorAll(focusSelector)) {
    if(node.hasAttribute('data-annotation-hit'))continue;
    node.setAttribute('data-guide-focus', 'true');
    const box = node.getBBox(), matrix = node.getScreenCTM(), rootMatrix = svg.getScreenCTM();
    if (!matrix || !rootMatrix || !box.width && !box.height) continue;
    const corners = [[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]].map(([x,y]) => {
      const point = svg.createSVGPoint(); point.x=x; point.y=y;
      return point.matrixTransform(matrix).matrixTransform(rootMatrix.inverse());
    });
    const xs=corners.map(p=>p.x), ys=corners.map(p=>p.y);
    const frame = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    for (const [key,value] of Object.entries({x:Math.min(...xs)-.5,y:Math.min(...ys)-.5,width:Math.max(...xs)-Math.min(...xs)+1,height:Math.max(...ys)-Math.min(...ys)+1,fill:'none',stroke:'#008c7b','stroke-width':'.2','stroke-dasharray':'.8 .4','pointer-events':'none','data-guide-focus-frame':''})) frame.setAttribute(key,value);
    svg.append(frame);
  }
}
