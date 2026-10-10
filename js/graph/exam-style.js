/* One physical style for graph creation, editing, canvas and export.
 * Geometry and scientific values are never changed by these projections.
 * The reference width is the distance between the two ends of the plot box,
 * not the outer bounds including labels. See DESIGN.md for measured sources.
 */
export const EXAM_STYLE = Object.freeze({
  preset: 'kice-v1', referenceWidth: 70, defaultWidth: 50,
  axis: .3, curve: .5, guide: .15, tick: .24, tickLength: 1.2,
  arrowLength: 3.6, marker: .7, label: 4.8, dash: .8, gap: .6,
});
export const isExamStyle = value => value?.graphStyle?.preset === EXAM_STYLE.preset;
const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
export function examMetrics(plane) {
  const style = plane.graphStyle || {};
  const scale = positive(plane.w, EXAM_STYLE.referenceWidth) / EXAM_STYLE.referenceWidth;
  const stroke = scale * positive(style.strokeScale, 1);
  return { scale, axis: EXAM_STYLE.axis * stroke, curve: EXAM_STYLE.curve * stroke,
    guide: EXAM_STYLE.guide * stroke, tick: EXAM_STYLE.tick * stroke,
    tickLength: EXAM_STYLE.tickLength * stroke,
    arrowLength: EXAM_STYLE.arrowLength * stroke * positive(style.arrowScale, 1),
    marker: EXAM_STYLE.marker * stroke, label: EXAM_STYLE.label * stroke * positive(style.labelScale, 1),
    dash: EXAM_STYLE.dash * stroke, gap: EXAM_STYLE.gap * stroke };
}
const offset = (value, scale) => value ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k, Number.isFinite(v) ? v * scale : v])) : value;
export function examPlaneStyle(plane) {
  if (!isExamStyle(plane)) return plane;
  const m = examMetrics(plane), relative = plane.w / positive(plane.graphStyle.referenceWidth, EXAM_STYLE.referenceWidth);
  const guide = { strokeWidth: m.guide, dashLength: m.dash, dashGap: m.gap };
  const annotation = a => ({ ...a, size: m.label, fontSize: m.label, labelSizeMode: 'source-height',
    markerSize: m.marker, strokeWidth: a.kind === 'guide' ? m.guide : m.axis,
    ...(a.kind === 'guide' ? {dashLength:m.dash,dashGap:m.gap} : {}),
    ...(a.customStyle && Number.isFinite(a.size) ? {fontSize:a.size*plane.w/positive(a.customStyleWidth,plane.graphStyle.referenceWidth||EXAM_STYLE.referenceWidth)} : {}),
    ...(a.customStyle ? Object.fromEntries(['strokeWidth','dashLength','dashGap','size','fontSize','markerSize'].filter(k=>Number.isFinite(a[k])).map(k=>[k,a[k]*plane.w/positive(a.customStyleWidth,plane.graphStyle.referenceWidth||EXAM_STYLE.referenceWidth)])) : {}) });
  const customGuide=a=>a.customStyle?{...a,...Object.fromEntries(['strokeWidth','dashLength','dashGap'].filter(k=>Number.isFinite(a[k])).map(k=>[k,a[k]*plane.w/positive(a.customStyleWidth,plane.graphStyle.referenceWidth||EXAM_STYLE.referenceWidth)]))}:a;
  const result = { ...plane, richLabels: true, strokeWidth: m.axis, tickStrokeWidth: m.tick,
    tickLength: m.tickLength, axisLabelSize: m.label, tickLabelSize: m.label, originLabelSize: m.label,
    axisArrowShape: 'exam', axisArrowLength: m.arrowLength,
    guideStyle: guide, markerSize: m.marker,
    graphAnnotations: (plane.graphAnnotations || []).map(annotation),
    annGuides: (plane.annGuides || []).map(customGuide),
    guideLines: (plane.guideLines || []).map(customGuide),
    annLabelPoints: (plane.annLabelPoints || []).map(a=>({...a,size:m.label,dist:positive(a.dist,5)*relative})),
    legends: (plane.legends || []).map(l=>({...l,size:m.label,swatch:positive(l.swatch,EXAM_STYLE.label*2.4)*relative,pad:Number.isFinite(l.pad)?l.pad*relative:m.label*.5,strokeWidth:m.axis,rows:(l.rows||[]).map(r=>({...r,dash:Array.isArray(r.dash)?r.dash.map(v=>v*relative):r.dash,markerSize:m.marker,markerStrokeWidth:m.axis,strokeWidth:m.curve}))})),
    labelXOffset: offset(plane.labelXOffset,relative), labelYOffset: offset(plane.labelYOffset,relative),
    tickOffX: (plane.tickOffX || []).map(v=>offset(v,relative)), tickOffY: (plane.tickOffY || []).map(v=>offset(v,relative)),
  };
  // A solid grid carries meaning in some source figures. Preserve that choice.
  result.gridStyle = { ...plane.gridStyle, ...guide, ...(plane.gridStyle?.dashLength === 0 ? {dashLength:0,dashGap:0} : {}) };
  return result;
}
export function examSeriesStyle(series, plane) {
  const frame = plane || { w: series.graphStyleWidth, graphStyle: series.graphStyle };
  if (!isExamStyle(frame)) return series;
  const m = examMetrics(frame), relative = frame.w / positive(series.graphStyleWidth,EXAM_STYLE.referenceWidth);
  const result = { ...series, graphStyle:frame.graphStyle, strokeWidth:series.sourceKind==='region'?series.strokeWidth:m.curve,
    endLabelSize:m.label, markerSize:m.marker, markerStrokeWidth:m.axis, guideStyle:{strokeWidth:m.guide,dashLength:m.dash,dashGap:m.gap},
    arrowMarks:(series.arrowMarks||[]).map(a=>({...a,strokeWidth:m.axis,examLength:m.arrowLength})),
    endpointMarkers:(series.endpointMarkers||[]).map(a=>({...a,markerSize:m.marker})),
    ...(series.bars ? {bars:{...series.bars,strokeWidth:m.axis,labelSize:m.label}} : {}),
    ...(series.area ? {area:{...series.area,labelSize:m.label}} : {}),
    ...(series.regionSpec ? {regionSpec:{...series.regionSpec,strokeWidth:Number.isFinite(series.regionSpec.strokeWidth)?series.regionSpec.strokeWidth*relative:0}} : {}),
  };
  if (series.customStyle && !series.styleOverrides) for(const key of ['strokeWidth','markerSize','markerStrokeWidth','endLabelSize']) if(Number.isFinite(series[key]))result[key]=series[key]*frame.w/positive(series.customStyleWidth,series.graphStyleWidth||EXAM_STYLE.referenceWidth);
  for (const [key,spec] of Object.entries(series.styleOverrides || {})) if(['strokeWidth','markerSize','markerStrokeWidth','endLabelSize'].includes(key) && Number.isFinite(spec.value))result[key]=spec.value*frame.w/positive(spec.width,frame.w);
  for (const key of ['dashLength','dashGap']) if(Number.isFinite(series[key]))result[key]=series[key]*frame.w/positive(series.customStyleWidth,series.graphStyleWidth||EXAM_STYLE.referenceWidth);
  if(Array.isArray(series.dashPattern))result.dashPattern=series.dashPattern.map(v=>v*relative);
  return result;
}
export function graphSizeAdvice(width) {
  if (width < 50) return '작은 출력 · 라벨 가독성을 확인하세요. 권장 축 영역 폭 50–70 mm';
  if (width > 70) return '큰 출력 · 전체 크기와 여백을 확인하세요. 권장 축 영역 폭 50–70 mm';
  return '권장 크기 · 축 영역 폭 50–70 mm. 라벨을 포함한 전체 크기도 확인하세요.';
}
