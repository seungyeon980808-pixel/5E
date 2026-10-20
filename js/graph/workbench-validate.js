// 그래프 작업대 결과의 형식 검사만 따로 둔다. 조판·출제 칸(rhwp-exam-links → ai-candidate-snapshot)은 이 검사만 쓰는데,
// workbench-result.js에서 가져오면 그래프 편집 창·SVG 내보내기·실험 기구 자료(약 1.5MB)까지 함께 받게 된다.
// workbench-result.js는 같은 이름으로 다시 내보내므로 기존 import는 그대로 동작한다.
import { validateGraphPlan } from './reconstruction-contract.js?v=1.7.0-four-session-integration';

export const GRAPH_WORKBENCH_SCHEMA = '5e.graph-workbench-result/v1';
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
