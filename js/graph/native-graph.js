/* Native reconstruction: validation precedes allocation and every state mutation. */
import { validateGraphPlan } from './reconstruction-contract.js?v=1.7.0-four-session-integration';
import { makeDefaultCoordplane } from '../function-graph/defaults.js?v=1.7.0-four-session-integration';
import { worldFromMath, mathFromWorld, planeAsY2 } from '../function-graph/coords.js?v=1.7.0-four-session-integration';
import { sampleFunctionPoints } from '../function-graph/sampler.js?v=1.7.0-four-session-integration';
import { shapePreservingHandles, sampleShapeSegment } from '../function-graph/shape-preserving.js?v=1.7.0-four-session-integration';
import { buildRegionGeometry, normalizedToMath } from './graph-features.js?v=1.7.0-four-session-integration';
import { fitObservedCurve } from '../function-graph/curve-fit.js?v=1.7.0-four-session-integration';
import { simplifyPolyline } from '../function-graph/polyline-simplify.js?v=1.7.0-four-session-integration';
import { normalizedExpressionToData } from '../function-graph/analytic-fit.js?v=1.7.0-four-session-integration';
import { nextObjectId } from '../tools/id.js?v=1.7.0-four-session-integration';
import { mapNativeGrid } from './native-grid.js?v=1.7.0-four-session-integration';
import { inferAxisStep } from './axis-layout.js?v=1.7.0-four-session-integration';
import { observedAxisBreakMarks } from './axis-break-observation.js?v=1.7.0-four-session-integration';
import { auditGraphReconstructionQuality } from './reconstruction-quality.js?v=1.7.0-four-session-integration';
import { EXAM_STYLE } from './exam-style.js?v=1.7.0-four-session-integration';

const clone = (v) => JSON.parse(JSON.stringify(v));
const title = (a) => {
  const compact = (v) => String(v || '').replace(/\s/g, '');
  const caption = compact(a.title), unit = compact(a.unit);
  if (unit && (caption.endsWith(`(${unit})`) || caption.endsWith(`（${unit}）`))) return a.title;
  return [a.title, a.unit ? `(${a.unit})` : ''].filter(Boolean).join(' ');
};
const fail = (error, review = []) => ({ ok: false, objects: [], groups: [], error, review });

export function buildNativeGraph(input, options = {}) {
  const checked = validateGraphPlan(input, { source: options.source });
  if (!checked.ok || checked.blocked) return fail(checked.errors?.map((e) => e.message).join('; ') || '검수가 필요한 축 또는 계열입니다.', checked.review || []);
  const plan = checked.plan, quality = auditGraphReconstructionQuality(plan);
  const review = [...clone(checked.review || []), ...quality.issues.map(i=>({path:i.path,reason:i.message}))];
  const mappedGrid = mapNativeGrid(plan);
  const addedBreaks = observedAxisBreakMarks(plan).filter(a => !(plan.annotations || []).some(b => b.id === a.id));
  const box = options.box || { x: 10, y: 10, w: 60, h: 45 };
  if (!['x', 'y', 'w', 'h'].every((k) => Number.isFinite(box[k])) || box.w <= 0 || box.h <= 0) return fail('그래프 영역이 올바르지 않습니다.', review);
  const observed = plan.coordinateMode === 'observed';
  const displayAxis = (axis) => !axis ? null : observed
    ? { ...axis, min: 0, max: 1, step: 0.25, ticks: (axis.ticks || []).map(t => ({ ...t, observedValue: t.value, value: t.position, label: t.displayMath ?? t.label })) }
    : { ...axis, ticks: (axis.ticks || []).map(t => ({ ...t, label: t.displayMath ?? t.label })) };
  const x = displayAxis(plan.axes.x), y = displayAxis(plan.axes.y), y2 = displayAxis(plan.axes.y2);
  const displayTitle = a => a.displayTitle ?? a.displayMath ?? title(a);
  // Exam-style labels and guides scale with the inserted graph, not browser zoom.
  const styleScale = box.w / 70;
  const style = plan.style || {};
  const labelSizeMode = style.fontSizePx && style.labelSize === undefined ? 'source-height' : 'legacy';
  const labelSize = style.labelSize ?? (style.fontSizePx ? style.fontSizePx * box.w / plan.source.plotBox.w : 5.4 * styleScale);
  const plane = { ...makeDefaultCoordplane({ x: 0, y: 0 }), x: box.x, y: box.y, w: box.w, h: box.h,
    xMin: x.min, xMax: x.max, yMin: y.min, yMax: y.max,
    xScale: observed ? 'linear' : x.scale, yScale: observed ? 'linear' : y.scale,
    gridStepX: inferAxisStep(x), gridStepY: inferAxisStep(y),
    tickStepX: inferAxisStep(x), tickStepY: inferAxisStep(y),
    labelX: displayTitle(x), labelY: displayTitle(y), labelOrigin: '', showOrigin: false,
    showAxisLabels: true, showAxisLabelX: !!displayTitle(x), showAxisLabelY: !!displayTitle(y), showGrid: false,
    showTickLabels: false, tickLabelMode: x.ticks?.length || y.ticks?.length ? 'text' : 'none', explicitTicksX: clone(x.ticks || []), explicitTicksY: clone(y.ticks || []),
    showTicks: !!(x.ticks?.length || y.ticks?.length), showTickX: !!x.ticks?.length, showTickY: !!y.ticks?.length,
    lockAspect: false, richLabels: true, seriesLock: true, axisVariant: x.min >= 0 && y.min >= 0 ? 'quadrant' : 'cross',
    axisLabelSize: labelSize, tickLabelSize: labelSize, originLabelSize: labelSize, labelWeight: style.labelWeight ?? 400,
    coordinateMode: observed ? 'observed' : 'data', axisPlacement: clone(plan.axisPlacement || {}),
    guideStyle: { strokeWidth: 0.14 * styleScale, dashLength: 0.55 * styleScale, dashGap: 0.4 * styleScale, ...(style.guideStyle || {}) },
    reconstruction: { labelStyle: 'upright', labelSizeMode, schema: plan.schema, source: clone(plan.source), axes: clone(plan.axes), annotations: clone(plan.annotations || []), review, quality: clone(quality), preserveAxes: true },
    graphAnnotations: clone([...mappedGrid.annotations || [], ...addedBreaks]),
  };
  const grid = plan.grid || mappedGrid.grid;
  if (grid) {
    plane.showGrid = true;
    plane.gridToData = true;
    plane.showGridX = grid.xStep !== undefined;
    plane.showGridY = grid.yStep !== undefined;
    for (const key of ['x', 'y']) if (grid[`${key}Step`] !== undefined) plane[`gridStep${key.toUpperCase()}`] = grid[`${key}Step`] * (grid.coordinateSpace === 'normalized' ? plane[`${key}Max`] - plane[`${key}Min`] : 1);
    plane.gridStyle = clone(grid.style || { strokeWidth: 0.1, dashLength: 0, dashGap: 0 });
    plane.reconstruction.gridMapping = clone(mappedGrid.migrated);
  }
  for (const key of ['x', 'y']) {
    const axis = plan.axes[key], upper = key.toUpperCase();
    if (axis.titlePosition) plane[`label${upper}Pos`] = { fx: axis.titlePosition.x, fy: 1 - axis.titlePosition.y };
    if (axis.titleAnchor) plane[`label${upper}Anchor`] = axis.titleAnchor;
  }
  if (y2) plane.y2 = { enabled: true, scale: observed ? 'linear' : y2.scale, labelY2: displayTitle(y2), y2Min: y2.min, y2Max: y2.max,
    gridStepY2: inferAxisStep(y2), tickStepY2: inferAxisStep(y2),
    showTickY2: !!y2.ticks?.length, explicitTicks: clone(y2.ticks || []), tickTextY2: [] };
  plane.graphAnnotations = plane.graphAnnotations.map((a) => {
    const series=plan.series.find(s=>s.id===a.seriesId);
    if(a.kind==='point' && a.anchorX!==undefined && series?.observedPoints) a={...a,markerSize:a.markerSize ?? series.markerSize ?? .8*styleScale,strokeWidth:a.strokeWidth ?? series.strokeWidth ?? style.strokeWidth ?? .45*styleScale};
    if (a.coordinateSpace !== 'normalized') return { ...a, text: a.displayMath ?? a.displayText ?? a.text, ...(a.fontSizePx ? { size: a.fontSizePx * box.w / plan.source.plotBox.w, labelSizeMode: 'source-height' } : {}) };
    const p = a.axis === 'y2' ? planeAsY2(plane) : plane;
    return { ...a, text: a.displayMath ?? a.displayText ?? a.text, ...(a.fontSizePx ? { size: a.fontSizePx * box.w / plan.source.plotBox.w, labelSizeMode: 'source-height' } : {}), ...(a.to ? { to: normalizedToMath(p,a.to) } : {}), ...(a.anchorX!==undefined?{anchorX:normalizedToMath(p,{x:a.anchorX,y:0}).x}:{}), ...normalizedToMath(p,a), coordinateSpace: 'data' };
  });
  const frame = plan.frame || {};
  if (frame.variant) plane.axisVariant = frame.variant === 'none' ? 'quadrant' : frame.variant === 'x' ? 'single' : frame.variant;
  if (frame.variant === 'none') plane.showAxisLines = false;
  for (const [key, field] of Object.entries({arrowX:'axisArrowX',arrowY:'axisArrowY',arrowY2:'axisArrowY2',arrowLength:'axisArrowLength',arrowWidth:'axisArrowWidth',strokeWidth:'strokeWidth',tickTop:'boxTickTop',tickRight:'boxTickRight'})) if(frame[key] !== undefined) plane[field]=['arrowLength','arrowWidth'].includes(key) ? frame[key] * styleScale : frame[key];
  if(frame.variant==='box') for(const k of ['axisArrowX','axisArrowY','axisArrowY2']) if(plane[k]===undefined)plane[k]=false;
  plane.legends=(plan.legends || []).map(l=>({...clone(l),...(l.coordinateSpace==='normalized'?normalizedToMath(plane,l):{}),coordinateSpace:'data'}));
  const objects = [plane];
  if (options.stylePreset === EXAM_STYLE.preset) plane.graphStyle = {preset:EXAM_STYLE.preset,referenceWidth:box.w};
  for (const s of mappedGrid.series) {
    const p = s.axis === 'y2' ? planeAsY2(plane) : plane;
    const f = { type: 'funcgraph', closed: s.closed === true, strokeLevel: 0, strokeWidth: s.strokeWidth ?? style.strokeWidth ?? 0.45 * styleScale,
      dashLength: s.dashLength ?? (s.lineStyle === 'dashed' ? 1.2 * styleScale : 0), dashGap: s.dashGap ?? (s.lineStyle === 'dashed' ? 0.9 * styleScale : 0), locked: false, positionLocked: false,
      lineVisible: s.lineVisible !== false, markerShape:s.markerShape || 'none', markerSize:s.markerSize ?? 0.8 * styleScale, ...(s.markerStrokeWidth !== undefined ? {markerStrokeWidth:s.markerStrokeWidth}:{}), ...(s.dashPattern ? {dashPattern:clone(s.dashPattern)}:{}),
      axis: s.axis || 'y', curveStyle: s.curveStyle || 'straight', curvature: 1,
      label: '', labelShow: false, endLabel: s.endLabel ?? ((plan.annotations || []).some(a => a.text === s.label || a.seriesId === s.id && a.kind === 'text') || (plan.legends || []).some(l => l.rows.some(row => row.text === s.label)) ? '' : s.label || ''), endLabelSize: labelSize, labelWeight: style.labelWeight ?? 400,
      segmentModes: clone(s.segmentModes || []), arrowSpecs: clone(s.arrowSpecs || []),
      sourceKind: s.kind === 'expression' ? 'expression' : s.kind,
      breaks: clone(s.breaks || []), endpointMarkers: clone(s.endpoints || []),
      reconstruction: { labelStyle: 'upright', labelSizeMode, sourceId: plan.source.id, seriesId: s.id, certainty: s.certainty,
        coordinateSpace: s.coordinateSpace, original: clone(s) } };
    if (s.kind === 'expression') {
      const originalDomain = s.domain || { min: p.xMin, max: p.xMax };
      const domain = s.coordinateSpace==='normalized'?{min:normalizedToMath(p,{x:originalDomain.min,y:0}).x,max:normalizedToMath(p,{x:originalDomain.max,y:0}).x}:originalDomain;
      const expression = s.coordinateSpace==='normalized'&&!observed?normalizedExpressionToData(s.expression,plan.axes,s.axis):s.expression;
      const sampled = sampleFunctionPoints(expression, domain.min, domain.max, p);
      if (sampled.error || sampled.points.length < 2) return fail(sampled.error || '함수 정의역 안에 표시할 곡선이 없습니다.', review);
      Object.assign(f, { expr: expression, points: sampled.points, breaks: sampled.breaks,
        mathPoints: sampled.points.map((q) => mathFromWorld(p, q.x, q.y)),
        domainMin: domain.min, domainMax: domain.max, domainAuto: false, curveStyle: 'smooth', offset: { dx: 0, dy: 0 } });
      if(s.observedPoints){f.observedOriginalPoints=clone(s.observedPoints);f.originalMathPoints=s.observedPoints.map(q=>s.coordinateSpace==='normalized'?normalizedToMath(p,q):clone(q));}
      if(s.approximation)f.reconstruction.approximation=clone(s.approximation);
    } else if (s.kind === 'bar') {
      const slot = (p.xMax - p.xMin) / s.items.length, widthRatio = s.widthRatio ?? 0.55;
      const points = [], rects = [];
      s.items.forEach((it, i) => {
        const cx = it.x ?? (p.xMin + slot * (i + 0.5)), left = cx - slot * widthRatio / 2, right = cx + slot * widthRatio / 2;
        const top = worldFromMath(p, left, it.value), base = worldFromMath(p, right, it.base ?? s.base ?? 0);
        const loY = Math.min(top.y, base.y), hiY = Math.max(top.y, base.y);
        points.push({ x: top.x, y: hiY }, { x: top.x, y: loY }, { x: base.x, y: loY }, { x: base.x, y: hiY });
        rects.push({ x: top.x, y: loY, w: base.x - top.x, h: hiY - loY, label: it.label || '', fillLevel:it.fillLevel ?? s.fillLevel ?? 220 });
      });
      Object.assign(f, { points, breaks: [], bars: { items: rects, labelSize: 2.6, strokeWidth: 0.3, fillLevel: s.fillLevel ?? 220 },
        barBase:s.base ?? 0, barItems: clone(s.items), barWidthRatio: widthRatio, barFill: 'gray', barPreserveValues: true });
    } else {
      const protectedIndices=[...(s.fit?.protectedIndices || []),...(s.endpoints || []).map(e=>e.index),...(plan.annotations || []).filter(a=>a.seriesId===s.id && Number.isInteger(a.pointIndex)).map(a=>a.pointIndex)];
      const fitted=fitObservedCurve(s.points,{...s.fit,certainty:s.certainty,segmentModes:s.segmentModes,breaks:s.breaks,protectedIndices});
      if(!fitted.ok)return fail(fitted.error,review);
      const anchors=fitted.points;
      if(s.fit?.enabled){f.fit=clone(s.fit);f.observedOriginalPoints=clone(s.points);f.originalMathPoints=s.points.map(q=>s.coordinateSpace==='normalized'?normalizedToMath(p,q):clone(q));f.fitChangedIndices=fitted.changedIndices;}
      let mathPoints = anchors.map((q) => s.coordinateSpace === 'normalized' ? normalizedToMath(p,q) : { x: q.x, y: q.y });
      let worldPoints = mathPoints.map((q) => worldFromMath(p, q.x, q.y));
      const reduced = simplifyPolyline(worldPoints, { ...s, protectedIndices });
      if (reduced.changed) {
        // Keep the complete source evidence separately from editable vertices.
        f.observedOriginalPoints = clone(s.points);
        f.originalMathPoints = clone(mathPoints);
        f.reconstruction.polylineSimplification = { version: 1, originalCount: mathPoints.length,
          keptIndices: reduced.keptIndices, removedIndices: reduced.removedIndices };
        mathPoints = reduced.keptIndices.map(i => mathPoints[i]);
        worldPoints = reduced.points;
        f.breaks = reduced.breaks;
        f.endpointMarkers = f.endpointMarkers.map(e => ({ ...e, index: reduced.indexMap[e.index] }));
        // Indexed contacts were protected above; only their indices change.
        plane.graphAnnotations = plane.graphAnnotations.map(a => a.seriesId === s.id && Number.isInteger(a.pointIndex)
          ? { ...a, pointIndex: reduced.indexMap[a.pointIndex] } : a);
      }
      Object.assign(f, { mathPoints, points: worldPoints, autoExtend: false });
      const suppliedHandles = s.handlesMath || ((s.curveStyle === 'smooth' || s.segmentModes?.includes('smooth')) ? shapePreservingHandles(anchors, s.segmentModes || [], s.breaks || []) : null);
      if (suppliedHandles) {
        f.handlesMode = s.handlesMath ? 'manual' : 'shape-preserving';
        f.handlesMath = suppliedHandles.map((h,i) => { if(s.coordinateSpace !== 'normalized')return clone(h); const a=normalizedToMath(p,{x:anchors[i].x+h.ix,y:anchors[i].y+h.iy}),b=normalizedToMath(p,{x:anchors[i].x+h.ox,y:anchors[i].y+h.oy}),q=mathPoints[i];return {ix:a.x-q.x,iy:a.y-q.y,ox:b.x-q.x,oy:b.y-q.y}; }); f.curveStyle = 'smooth';
        f.handles = mathPoints.map((q, i) => {
          const h = f.handlesMath[i], a = worldFromMath(p, q.x + h.ix, q.y + h.iy), b = worldFromMath(p, q.x + h.ox, q.y + h.oy);
          return { inX: a.x, inY: a.y, outX: b.x, outY: b.y };
        });
      }
    }
    if (f.arrowSpecs?.length && f.mathPoints?.length) {
      f.arrowMarks = f.arrowSpecs.map(a => {
        const worldHandles=(f.handles || []).map((h,i)=>({ix:h.inX-f.points[i].x,iy:h.inY-f.points[i].y,ox:h.outX-f.points[i].x,oy:h.outY-f.points[i].y}));
        let segment=a.segmentIndex, fraction=a.t;
        if(s.kind==='expression') {
          segment=f.mathPoints.findIndex((p,i,all)=>i<all.length-1 && p.x<=a.x && all[i+1].x>=a.x);
          if(segment<0)return null;
          fraction=(a.x-f.mathPoints[segment].x)/(f.mathPoints[segment+1].x-f.mathPoints[segment].x);
        }
        const q = sampleShapeSegment(f.points, worldHandles, segment, fraction, f.segmentModes);
        const at = {x:q.x,y:q.y};
        const dx = q.dx, dy = q.dy, length = Math.hypot(dx, dy) || 1;
        return { ...at, dx: dx / length * a.dir, dy: dy / length * a.dir, strokeWidth: a.strokeWidth ?? f.strokeWidth };
      });
    }
    if(f.arrowMarks)f.arrowMarks=f.arrowMarks.filter(Boolean);
    if (s.area?.enabled) f.area = { from: s.area.min, to: s.area.max,
      worldFrom: worldFromMath(p, s.area.min, 0).x, worldTo: worldFromMath(p, s.area.max, 0).x,
      baseY: worldFromMath(p, 0, 0).y, level: 220 };
    if(plane.graphStyle){f.graphStyle=clone(plane.graphStyle);f.graphStyleWidth=box.w;}
    objects.push(f);
  }
  const regions=[];
  for(const spec of plan.regions || []) {
    const geometry=buildRegionGeometry(spec,plane,objects.slice(1));
    if(!geometry.ok)return fail(geometry.error,review);
    regions.push({type:'funcgraph',sourceKind:'region',axis:spec.axis || 'y',regionSpec:clone(spec),regionFillLevel:spec.level ?? 220,regionOpacity:spec.opacity ?? 1,closed:true,lineVisible:false,strokeWidth:0,mathPoints:geometry.mathPoints,points:geometry.points,breaks:[],curveStyle:'straight',locked:false,positionLocked:false});
  }
  objects.splice(1,0,...regions);
  let counter = 0;
  const nextId = options.nextId || (() => `native_graph_${++counter}`);
  const ids = objects.map(() => nextId());
  if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) return fail('객체 ID가 중복되거나 올바르지 않습니다.', review);
  const gid = `grp_${ids[0]}`;
  objects.forEach((obj, i) => { obj.id = ids[i]; obj.order = i; obj.layerId = options.layerId; obj.groupId = gid; if (i) obj.planeId = ids[0]; });
  return { ok: true, objects, groups: [{ id: gid, memberIds: ids }], review };
}

export function insertNativeGraph(state, plan, options = {}) {
  const current = state.get();
  const built = buildNativeGraph(plan, { ...options, layerId: options.layerId ?? current.activeLayerId, nextId: options.nextId || nextObjectId });
  if (!built.ok) return built;
  if (built.objects.some((o) => current.objects.some((old) => old.id === o.id)) || built.groups.some((g) => current.groups?.some((old) => old.id === g.id))) return fail('기존 객체 ID와 충돌합니다.', built.review);
  state.update((draft) => {
    const snapshot = clone(draft.objects), start = draft.objects.length;
    // Axes and internal labels stay above opaque series shading. Scene uses array order.
    draft.objects.push(...[...built.objects.slice(1), built.objects[0]].map((o, i) => ({ ...o, order: start + i })));
    draft.groups = [...(draft.groups || []), ...built.groups];
    draft.undoStack.push(snapshot); draft.redoStack = [];
    draft.selectedIds = [built.objects[0].id]; draft.targetedId = null; draft.activeTool = 'V';
  });
  return { ok: true, planeId: built.objects[0].id, objectIds: built.objects.map((o) => o.id), review: built.review };
}
