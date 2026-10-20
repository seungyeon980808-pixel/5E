import { buildNativeGraph } from './native-graph.js?v=1.7.0-four-session-integration';
import { EXAM_STYLE, DESCRIPTION_EXAM_STYLE, examMetrics } from './exam-style.js?v=1.7.0-four-session-integration';
import { preserveDescriptionPresentation } from './description-presentation.js?v=1.7.0-four-session-integration';
import { descriptionAxisTitle, descriptionSeriesLabelPositions } from './description-layout.js?v=1.7.0-four-session-integration';
import { mathFromWorld, planeAsY2 } from '../function-graph/coords.js?v=1.7.0-four-session-integration';
import { GRAPH_WORKBENCH_SCHEMA, validateWorkbenchGraph } from './workbench-validate.js?v=1.7.0-four-session-integration';
import { auditGraphReconstructionQuality } from './reconstruction-quality.js?v=1.7.0-four-session-integration';
import { auditGraphDescriptionQuality } from './description-quality.js?v=1.7.0-four-session-integration';
import { renderCoordplane, renderFuncgraph } from '../render/coordplane.js?v=1.7.0-four-session-integration';
import { makeFillPattern } from '../render/fill.js?v=1.7.0-four-session-integration';
import { ensureEmbeddedFonts } from '../svg-export.js?v=1.7.0-four-session-integration';
import { instantiateObjectsAt } from '../transform.js?v=1.7.0-four-session-integration';
import { openGraphModal } from './graph-modal.js?v=1.7.0-four-session-integration';
import { traceMatrixForPlane } from './trace-coordinates.js?v=1.7.0-four-session-integration';

export const GRAPH_WORKBENCH_SELECTION = Object.freeze({ model: 'gpt-6.1-sol', effort: 'medium', serviceTier: null });
export { GRAPH_WORKBENCH_SCHEMA, validateWorkbenchGraph };
const copy = value => structuredClone(value);
const SVG_NS = 'http://www.w3.org/2000/svg';

export function buildWorkbenchGraph(plan, source, { descriptionLayout = false, priorResult = null, request } = {}) {
  const plot = plan.source.plotBox;
  const priorWidth=priorResult?.objects?.find(o=>o.type==='coordplane')?.w;
  const width = descriptionLayout && Number.isFinite(priorWidth) && priorWidth>0 ? priorWidth : EXAM_STYLE.defaultWidth, scale = width / plot.w;
  const built = buildNativeGraph(plan, { source, stylePreset:EXAM_STYLE.preset, box: { x: -width/2, y: -plot.h * scale / 2, w: width, h: plot.h * scale } });
  if (!built.ok) throw new Error(built.error);
  if (descriptionLayout) {
    const plane = built.objects.find(o => o.type === 'coordplane');
    // Preserve the common exam preset, with restrained type and longer,
    // slender axis heads for newly designed graphs. Restoration is unchanged.
    Object.assign(plane.graphStyle, { descriptionLayout: true, ...DESCRIPTION_EXAM_STYLE });
    plane.axisLabelScale = plane.tickLabelScale = DESCRIPTION_EXAM_STYLE.labelScale;
    plane.labelX = descriptionAxisTitle(plan.axes.x, 'x');
    plane.labelY = descriptionAxisTitle(plan.axes.y);
    if (plane.y2 && plan.axes.y2) plane.y2.labelY2 = descriptionAxisTitle(plan.axes.y2);
    const seriesNames = new Set(plan.series.flatMap(s => [s.label, s.endLabel]).filter(Boolean));
    for (const annotation of plane.graphAnnotations) {
      if (seriesNames.has(annotation.text)) annotation.labelRole = 'name';
    }
    preserveDescriptionPresentation(built.objects,plan,priorResult,request);
    for(const series of built.objects.filter(o=>o.type==='funcgraph')) series.graphStyle=copy(plane.graphStyle);
    for(const label of descriptionSeriesLabelPositions(built.objects.filter(o=>o.type==='funcgraph'),examMetrics(plane).label)) {
      const series=label.series,p=series.axis==='y2'?planeAsY2(plane):plane;
      const at=mathFromWorld(p,label.x,label.y),to=mathFromWorld(p,label.to.x,label.to.y);
      plane.graphAnnotations.push({id:`description-label-${series.id}`,kind:'text',text:series.endLabel,labelRole:'name',...at,axis:series.axis,coordinateSpace:'data',seriesId:series.reconstruction?.seriesId});
      plane.graphAnnotations.push({id:`description-label-guide-${series.id}`,kind:'leader',text:'',...at,to,axis:series.axis,coordinateSpace:'data'});
      series.endLabel='';
    }
  }
  const quality = descriptionLayout ? auditGraphDescriptionQuality(plan) : auditGraphReconstructionQuality(plan);
  const result = { schema: GRAPH_WORKBENCH_SCHEMA, source: copy(source), plan: copy(plan), quality, objects: copy(built.objects), groups: copy(built.groups) };
  validateWorkbenchGraph(result);
  return result;
}

// Match the original pixel frame so the existing wipe comparison aligns both plots.
export async function workbenchGraphDataUrl(result) {
  const plane = validateWorkbenchGraph(result);
  const fontCss = await ensureEmbeddedFonts();
  // SVG-as-image cannot see the document's webfonts. Load before measuring and
  // embed the same face in the candidate, rather than falling back on export.
  await Promise.all(['normal', 'italic'].map(style => document.fonts?.load(`${style} 400 16px "Latin Modern Roman"`)));
  const plot = result.plan.source.plotBox, scale = plot.w / plane.w;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('viewBox', `0 0 ${result.source.width} ${result.source.height}`);
  svg.setAttribute('width', String(result.source.width)); svg.setAttribute('height', String(result.source.height));
  const paper = document.createElementNS(SVG_NS, 'rect');
  paper.setAttribute('width', '100%'); paper.setAttribute('height', '100%'); paper.setAttribute('fill', '#fff'); svg.append(paper);
  const defs = document.createElementNS(SVG_NS, 'defs');
  const fontStyle = document.createElementNS(SVG_NS, 'style'); fontStyle.textContent = fontCss; defs.append(fontStyle); svg.append(defs);
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('transform', `translate(${plot.x - plane.x * scale} ${plot.y - plane.y * scale}) scale(${scale})`);
  svg.append(group);
  for (const object of result.objects) { const pattern = makeFillPattern(object); if (pattern) defs.append(pattern); }
  // Registration belongs to the comparison frame, never mathematical coordinates.
  const registered = document.createElementNS(SVG_NS, 'g');
  const matrix = traceMatrixForPlane(plane.graphTrace || result.graphTrace, plane);
  registered.setAttribute('transform', `matrix(${matrix.join(' ')})`); group.append(registered);
  for (const object of [...result.objects.filter(o => o.type !== 'coordplane'), plane]) registered.append(object.type === 'coordplane' ? renderCoordplane(object) : renderFuncgraph(object));
  const bytes = new TextEncoder().encode(new XMLSerializer().serializeToString(svg));
  let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return 'data:image/svg+xml;base64,' + btoa(binary);
}

export function insertWorkbenchGraph(state, result, { taskId, candidateId } = {}) {
  validateWorkbenchGraph(result);
  const view = state.get().viewBox;
  const objects = copy([...result.objects.filter(o => o.type !== 'coordplane'), result.objects.find(o => o.type === 'coordplane')]).map(o => ({ ...o, aiTaskId: taskId, aiCandidateId: candidateId }));
  instantiateObjectsAt(state, objects, { x: view.x + view.w / 2, y: view.y + view.h / 2 });
  const ids = [...state.get().selectedIds];
  const planeId = state.get().objects.find(o => ids.includes(o.id) && o.type === 'coordplane')?.id;
  state.update(s => { s.selectedIds = [planeId]; });
  return { planeId, ids };
}

// The standard editor edits an isolated draft; Cancel never changes the page or result.
export function editWorkbenchGraph(result, { onApply, onClose, reference = null } = {}) {
  const plane = validateWorkbenchGraph(result);
  const savedTrace = plane.graphTrace || result.graphTrace || null;
  const initialReference = reference || result.traceReference || null;
  // A replaced source and its registration are one saved pair. In particular,
  // an uploaded image without plotBox must not inherit the original AI frame.
  const traceReference = savedTrace?.reference || (initialReference ? {
    ...copy(initialReference),
    ...(!initialReference.plotBox ? { plotBox: copy(result.plan.source.plotBox) } : {}),
  } : null);
  // Keep portable results free of a temporary layer ID when the editor rebuilds curves.
  const draft = { objects: copy(result.objects), groups: copy(result.groups || []), artboard: { w: 210, h: 297 }, viewBox: { x: -105, y: -148.5, w: 210, h: 297 }, activeLayerId: plane.layerId, undoStack: [], redoStack: [], selectedIds: [plane.id] };
  const editingState = { get: () => draft, update: fn => fn(draft) };
  openGraphModal(plane.id, 'coord', {
    state: editingState,
    traceReference: copy(traceReference),
    traceState: copy(savedTrace),
    onApply: () => { const edited = { ...copy(result), objects: copy(draft.objects), groups: copy(draft.groups) }; validateWorkbenchGraph(edited); onApply?.(edited); },
    onClose,
  });
}

export async function workbenchGraphContextAttachment(result, candidateId) {
  const data = await workbenchGraphDataUrl(result);
  const image = new Image(); image.src = data; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = result.source.width; canvas.height = result.source.height;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0);
  return { id: candidateId || 'graph-draft', name: '현재 편집한 그래프.png', data: canvas.toDataURL('image/png') };
}
