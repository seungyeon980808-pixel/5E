import { buildNativeGraph } from './native-graph.js?v=1.7.0-four-session-integration';
import { EXAM_STYLE } from './exam-style.js?v=1.7.0-four-session-integration';
import { validateGraphPlan } from './reconstruction-contract.js?v=1.7.0-four-session-integration';
import { auditGraphReconstructionQuality } from './reconstruction-quality.js?v=1.7.0-four-session-integration';
import { renderCoordplane, renderFuncgraph } from '../render/coordplane.js?v=1.7.0-four-session-integration';
import { makeFillPattern } from '../render/fill.js?v=1.7.0-four-session-integration';
import { ensureEmbeddedFonts } from '../svg-export.js?v=1.7.0-four-session-integration';
import { instantiateObjectsAt } from '../transform.js?v=1.7.0-four-session-integration';
import { openGraphModal } from './graph-modal.js?v=1.7.0-four-session-integration';
import { traceMatrixForPlane } from './trace-coordinates.js?v=1.7.0-four-session-integration';

export const GRAPH_WORKBENCH_SCHEMA = '5e.graph-workbench-result/v1';
export const GRAPH_WORKBENCH_SELECTION = Object.freeze({ model: 'gpt-6.1-sol', effort: 'medium', serviceTier: null });
const copy = value => structuredClone(value);
const SVG_NS = 'http://www.w3.org/2000/svg';
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const pointList = points => Array.isArray(points) && points.length <= 20000 && points.every(point);

export function validateWorkbenchGraph(result) {
  if (result?.schema !== GRAPH_WORKBENCH_SCHEMA) throw new Error('그래프 결과 형식이 올바르지 않습니다.');
  const checked = validateGraphPlan(result.plan, { source: result.source });
  if (!checked.ok || checked.blocked) throw new Error('확인하지 못한 축 또는 계열이 있습니다. 원본을 확인한 뒤 다시 복원하세요.');
  const objects = result.objects;
  if (!Array.isArray(objects) || objects.some(o => !o || typeof o !== 'object')) throw new Error('편집 그래프의 객체 목록이 올바르지 않습니다.');
  const plane = Array.isArray(objects) && objects.find(object => object.type === 'coordplane');
  if (!Array.isArray(objects) || !plane || objects.length > 256 || objects.filter(o => o.type === 'coordplane').length !== 1
    || objects.some(o => typeof o.id !== 'string' || !o.id || !['coordplane', 'funcgraph'].includes(o.type))
    || new Set(objects.map(o => o.id)).size !== objects.length
    || !['x', 'y', 'w', 'h'].every(k => Number.isFinite(plane[k])) || plane.w <= 0 || plane.h <= 0) throw new Error('편집 그래프의 좌표 정보가 올바르지 않습니다.');
  for (const axis of ['x', 'y']) {
    if (!Number.isFinite(plane[`${axis}Min`]) || !Number.isFinite(plane[`${axis}Max`]) || plane[`${axis}Max`] <= plane[`${axis}Min`]
      || (plane[`${axis}Scale`] === 'log' && plane[`${axis}Min`] <= 0)) throw new Error('편집 그래프의 축 범위가 올바르지 않습니다.');
  }
  for (const ticks of [plane.explicitTicksX, plane.explicitTicksY, plane.y2?.explicitTicks]) {
    if (ticks != null && (!Array.isArray(ticks) || ticks.some(tick => !tick || typeof tick !== 'object'))) throw new Error('편집 그래프의 눈금 정보가 올바르지 않습니다.');
  }
  if (plane.graphAnnotations !== undefined && (!Array.isArray(plane.graphAnnotations) || plane.graphAnnotations.some(a => !a || typeof a !== 'object'))) throw new Error('편집 그래프의 표기 정보가 올바르지 않습니다.');
  if (result.groups !== undefined && (!Array.isArray(result.groups) || result.groups.some(g => !g || typeof g.id !== 'string' || !g.id
    || !Array.isArray(g.memberIds) || new Set(g.memberIds).size !== g.memberIds.length
    || g.memberIds.some(id => !objects.some(o => o.id === id && o.groupId === g.id)))
    || new Set(result.groups.map(g => g.id)).size !== result.groups.length)) throw new Error('편집 그래프의 그룹 정보가 올바르지 않습니다.');
  for (const object of objects.filter(o => o.type === 'funcgraph')) {
    if (object.planeId !== plane.id || !pointList(object.points)
      || ['mathPoints', 'markers'].some(key => object[key] !== undefined && !pointList(object[key]))
      || (object.guideSegs !== undefined && (!Array.isArray(object.guideSegs) || object.guideSegs.some(segment => !pointList(segment))))
      || (object.arrowPolys !== undefined && (!Array.isArray(object.arrowPolys) || object.arrowPolys.some(arrow => !arrow || !pointList(arrow.points))))
      || (object.handles != null && (!Array.isArray(object.handles) || object.handles.some(handle => !handle || !['inX', 'inY', 'outX', 'outY'].every(k => Number.isFinite(handle[k])))))
      || (object.arrowMarks !== undefined && (!Array.isArray(object.arrowMarks) || object.arrowMarks.some(arrow => !point(arrow) || !Number.isFinite(arrow.dx) || !Number.isFinite(arrow.dy))))
      || (object.endpointMarkers !== undefined && (!Array.isArray(object.endpointMarkers) || object.endpointMarkers.some(marker => !marker || !Number.isInteger(marker.index) || marker.index < 0 || marker.index >= object.points.length)))) throw new Error('편집 그래프의 계열 정보가 올바르지 않습니다.');
  }
  return plane;
}

export function buildWorkbenchGraph(plan, source) {
  const plot = plan.source.plotBox;
  const width = EXAM_STYLE.defaultWidth, scale = width / plot.w;
  const built = buildNativeGraph(plan, { source, stylePreset:EXAM_STYLE.preset, box: { x: -width/2, y: -plot.h * scale / 2, w: width, h: plot.h * scale } });
  if (!built.ok) throw new Error(built.error);
  const result = { schema: GRAPH_WORKBENCH_SCHEMA, source: copy(source), plan: copy(plan), quality: auditGraphReconstructionQuality(plan), objects: copy(built.objects), groups: copy(built.groups) };
  validateWorkbenchGraph(result);
  return result;
}

// Match the original pixel frame so the existing wipe comparison aligns both plots.
export async function workbenchGraphDataUrl(result) {
  const plane = validateWorkbenchGraph(result);
  const fontCss = await ensureEmbeddedFonts();
  // SVG-as-image cannot see the document's webfonts. Load before measuring and
  // embed the same face in the candidate, rather than falling back on export.
  await document.fonts?.load('normal 400 16px "Latin Modern Roman"');
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
