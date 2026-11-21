import { buildNativeGraph } from './native-graph.js?v=1.7.0-four-session-integration';
import { EXAM_STYLE, DESCRIPTION_EXAM_STYLE, examMetrics } from './exam-style.js?v=1.7.0-four-session-integration';
import { preserveDescriptionPresentation } from './description-presentation.js?v=1.7.0-four-session-integration';
import { descriptionAxisTitle, descriptionSeriesLabelPositions } from './description-layout.js?v=1.7.0-four-session-integration';
import { mathFromWorld, planeAsY2 } from '../function-graph/coords.js?v=1.7.0-four-session-integration';
import { avoidLabelCurveOverlap } from './label-avoid.js?v=1.7.0-four-session-integration';
import { GRAPH_WORKBENCH_SCHEMA, validateWorkbenchGraph } from './workbench-validate.js?v=1.7.0-four-session-integration';
import { auditGraphReconstructionQuality } from './reconstruction-quality.js?v=1.7.0-four-session-integration';
import { auditGraphDescriptionQuality } from './description-quality.js?v=1.7.0-four-session-integration';
import { renderCoordplane, renderFuncgraph } from '../render/coordplane.js?v=1.7.0-four-session-integration';
import { makeFillPattern } from '../render/fill.js?v=1.7.0-four-session-integration';
import { ensureEmbeddedFonts, getContentBounds } from '../svg-export.js?v=1.7.0-four-session-integration';
import { instantiateObjectsAt } from '../transform.js?v=1.7.0-four-session-integration';
import { openGraphModal } from './graph-modal.js?v=1.7.0-four-session-integration';
import { traceMatrixForPlane } from './trace-coordinates.js?v=1.7.0-four-session-integration';
import { embeddedGraphSourceFrame } from './source-arrow-size.js?v=1.7.0-four-session-integration';

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
  if (descriptionLayout) {
    // 11-11: 글자가 곡선과 겹치지 않게 가까운 빈자리로 옮긴다(곡선·값은 그대로).
    const plane = built.objects.find(o => o.type === 'coordplane');
    if (plane) avoidLabelCurveOverlap(plane, built.objects.filter(o => o.type === 'funcgraph'), { labelSize: examMetrics(plane).label });
  }
  const quality = descriptionLayout ? auditGraphDescriptionQuality(plan) : auditGraphReconstructionQuality(plan);
  const result = { schema: GRAPH_WORKBENCH_SCHEMA, source: copy(source), plan: copy(plan), quality, objects: copy(built.objects), groups: copy(built.groups) };
  validateWorkbenchGraph(result);
  return result;
}

// 11-20 GRAPHFIX(안 1): 모든 출력(편집기 미리보기·PNG 저장·이미지 복사·좌우 비교·캔버스·한글)은 한 가지 틀을 쓴다 —
// 그래프 + 모든 라벨 + 2mm. 예전에는 PNG가 원본 그림 크기(source.width×height)로 잘려, 원본보다 크게 그린 글자
// (「시간(s)」 아래 등)와 바깥으로 옮긴 축 이름이 잘리거나 사라졌다.
export const WORKBENCH_FRAME_MARGIN = 2;
const transformBox = (m, b) => {
  const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};
/** 출력 틀(월드 mm). 캔버스에 넣은 뒤 getContentBounds(…,2)로 재는 틀과 같다(비교 등록 행렬이 있으면 그만큼 옮긴 틀). */
export function workbenchGraphFrame(result) {
  const plane = validateWorkbenchGraph(result);
  const matrix = traceMatrixForPlane(plane.graphTrace || result.graphTrace, plane);
  const content = getContentBounds({ objects: result.objects, layers: [] }, {}, 0);
  const plot = result.plan.source.plotBox, scale = plot.w / plane.w;
  // 잴 수 없으면(문서 없음) 예전 원본 틀로 돌아간다.
  const box = content ? transformBox(matrix, content) : { x: plane.x - plot.x / scale, y: plane.y - plot.y / scale, w: result.source.width / scale, h: result.source.height / scale };
  const p = content ? WORKBENCH_FRAME_MARGIN : 0;
  return { x: box.x - p, y: box.y - p, w: box.w + 2 * p, h: box.h + 2 * p };
}

/** 그래프 결과를 출력 틀로 그린 SVG. sourceFrame = 원본 그림(0,0,source.width,source.height)이 이 그림 안에서 놓이는 자리(px) — 좌우 비교 정렬용. */
export async function workbenchGraphRaster(result) {
  const plane = validateWorkbenchGraph(result);
  const fontCss = await ensureEmbeddedFonts();
  // SVG-as-image cannot see the document's webfonts. Load before measuring and
  // embed the same face in the candidate, rather than falling back on export.
  await Promise.all(['normal', 'italic'].map(style => document.fonts?.load(`${style} 400 16px "Latin Modern Roman"`)));
  const plot = result.plan.source.plotBox, scale = plot.w / plane.w;
  const frame = workbenchGraphFrame(result);
  // 픽셀 격자를 원본 그림과 맞춘다: 원본 틀 자리가 정수 픽셀이 되도록 왼쪽·위로 1px 안쪽만 더 둔다(비교·원본 크기 재기에서 번짐 없음).
  const rawX = (plane.x - frame.x) * scale - plot.x, rawY = (plane.y - frame.y) * scale - plot.y;
  const sourceFrame = { x: Math.ceil(rawX - 1e-6), y: Math.ceil(rawY - 1e-6), width: result.source.width, height: result.source.height };
  const originX = frame.x - (sourceFrame.x - rawX) / scale, originY = frame.y - (sourceFrame.y - rawY) / scale;
  const width = Math.max(1, Math.ceil((frame.x + frame.w - originX) * scale - 1e-6)), height = Math.max(1, Math.ceil((frame.y + frame.h - originY) * scale - 1e-6));
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height));
  svg.setAttribute('data-source-frame', [sourceFrame.x, sourceFrame.y, sourceFrame.width, sourceFrame.height].map(v => +v.toFixed(3)).join(' '));
  svg.setAttribute('data-frame-mm', [frame.x, frame.y, frame.w, frame.h].map(v => +v.toFixed(3)).join(' '));
  const paper = document.createElementNS(SVG_NS, 'rect');
  paper.setAttribute('width', '100%'); paper.setAttribute('height', '100%'); paper.setAttribute('fill', '#fff'); svg.append(paper);
  const defs = document.createElementNS(SVG_NS, 'defs');
  const fontStyle = document.createElementNS(SVG_NS, 'style'); fontStyle.textContent = fontCss; defs.append(fontStyle); svg.append(defs);
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('transform', `translate(${-originX * scale} ${-originY * scale}) scale(${scale})`);
  svg.append(group);
  for (const object of result.objects) { const pattern = makeFillPattern(object); if (pattern) defs.append(pattern); }
  // Registration belongs to the comparison frame, never mathematical coordinates.
  const registered = document.createElementNS(SVG_NS, 'g');
  const matrix = traceMatrixForPlane(plane.graphTrace || result.graphTrace, plane);
  registered.setAttribute('transform', `matrix(${matrix.join(' ')})`); group.append(registered);
  for (const object of [...result.objects.filter(o => o.type !== 'coordplane'), plane]) registered.append(object.type === 'coordplane' ? renderCoordplane(object) : renderFuncgraph(object));
  const bytes = new TextEncoder().encode(new XMLSerializer().serializeToString(svg));
  let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { data: 'data:image/svg+xml;base64,' + btoa(binary), width, height, sourceFrame, frame };
}

export async function workbenchGraphDataUrl(result) {
  return (await workbenchGraphRaster(result)).data;
}

/** workbenchGraphRaster가 만든 SVG 주소에서 원본 틀(sourceFrame)을 읽는다. 예전(원본 틀) 그림이거나 PNG면 null. */
export const workbenchGraphSourceFrame = embeddedGraphSourceFrame;

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
// 11-07 G9: 「편집기로 가져오기」는 같은 편집기를 제목 「그래프」·「캔버스로 내보내기」·「한글에 넣기」로 연다(destination).
export function editWorkbenchGraph(result, { onApply, onClose, reference = null, destination = null } = {}) {
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
    onApply: () => { const edited = { ...copy(result), objects: copy(draft.objects), groups: copy(draft.groups) }; validateWorkbenchGraph(edited); return onApply?.(edited); },
    onClose,
    ...(destination ? { title: '그래프', confirmLabel: destination.confirmLabel || '캔버스로 내보내기', examSend: destination.examSend !== false, aiEntries: true } : {}),
  });
}

export async function workbenchGraphContextAttachment(result, candidateId) {
  const { data, width, height } = await workbenchGraphRaster(result);
  const image = new Image(); image.src = data; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0);
  return { id: candidateId || 'graph-draft', name: '현재 편집한 그래프.png', data: canvas.toDataURL('image/png') };
}
