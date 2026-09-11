import { decodeScopedPng, encodeScopedPng } from './ai-scoped-edit-png.js';
import { DEFAULT_TEXT_FONT, DEFAULT_TEXT_SIZE_MM } from './state.js?v=1.4.0';

export function effectiveAssetLabelMode(asset, labelsDisabled = false) {
  return labelsDisabled || !asset.label?.trim() || asset.labelMode === 'none' ? 'none' : asset.labelMode === 'text' ? 'text' : 'leader';
}

let serial = 0;
function fromUrl(url) {
  if (typeof url !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(url)) throw new TypeError('원본은 PNG 데이터여야 합니다.');
  return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), c => c.charCodeAt(0));
}
function toUrl(bytes) {
  let raw = '';
  for (let i = 0; i < bytes.length; i += 32768) raw += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return `data:image/png;base64,${btoa(raw)}`;
}
function rect(value, width, height) {
  if (!value || !['x', 'y', 'width', 'height'].every(k => Number.isSafeInteger(value[k])) || value.width <= 0 || value.height <= 0) throw new RangeError('영역은 양의 크기를 가진 정수 좌표여야 합니다.');
  const x = Math.max(0, Math.min(width, value.x)), y = Math.max(0, Math.min(height, value.y));
  const right = Math.max(0, Math.min(width, value.x + value.width)), bottom = Math.max(0, Math.min(height, value.y + value.height));
  if (right <= x || bottom <= y) throw new RangeError('이미지 안의 영역을 선택해 주세요.');
  return { x, y, width: right - x, height: bottom - y };
}
function point(value, width, height, fallback) {
  if (value == null) return fallback;
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) throw new RangeError('라벨 좌표를 확인해 주세요.');
  return { x: Math.max(0, Math.min(width, value.x)), y: Math.max(0, Math.min(height, value.y)) };
}
function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
function normalizeRegions(regions, width, height) {
  if (!Array.isArray(regions) || !regions.length || regions.length > 256) throw new RangeError('영역을 1~256개 선택해 주세요.');
  const ids = new Set();
  const result = regions.map((r, i) => {
    const bounds = rect(r, width, height), id = r.id ?? `region_${i + 1}`;
    if (typeof id !== 'string' || !id || ids.has(id)) throw new TypeError('영역 ID는 고유해야 합니다.');
    ids.add(id);
    if (r.label != null && (typeof r.label !== 'string' || r.label.length > 1000)) throw new TypeError('라벨은 1000자 이하의 텍스트여야 합니다.');
    if (r.keepRects != null && (!Array.isArray(r.keepRects) || r.keepRects.length > 100)) throw new TypeError('보존 영역을 확인해 주세요.');
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    return { ...bounds, id, label: r.label ?? '', labelMode: r.labelMode === 'text' || r.labelMode === 'none' ? r.labelMode : 'leader', anchor: point(r.anchor, width, height, center),
      labelPoint: point(r.labelPoint, width, height, { x: center.x, y: bounds.y }),
      keepRects: (r.keepRects ?? []).map(k => rect(k, width, height)) };
  });
  for (let i = 0; i < result.length; i++) for (let j = 0; j < i; j++) if (overlaps(result[i], result[j])) throw new RangeError('서로 겹치지 않는 영역을 선택해 주세요.');
  return result;
}
function extract(source, region, threshold) {
  const { width, height } = region, count = width * height;
  const data = new Uint8Array(count * 4), keep = new Uint8Array(count), visited = new Uint8Array(count), queue = new Uint32Array(count);
  for (let y = 0; y < height; y++) {
    const start = ((region.y + y) * source.width + region.x) * 4;
    data.set(source.data.subarray(start, start + width * 4), y * width * 4);
  }
  for (const k of region.keepRects) {
    for (let y = Math.max(region.y, k.y); y < Math.min(region.y + height, k.y + k.height); y++) {
      for (let x = Math.max(region.x, k.x); x < Math.min(region.x + width, k.x + k.width); x++) keep[(y - region.y) * width + x - region.x] = 1;
    }
  }
  let tail = 0;
  function visit(p) {
    if (visited[p] || keep[p]) return;
    const o = p * 4;
    if (data[o + 3] !== 0 && !(data[o] >= threshold && data[o + 1] >= threshold && data[o + 2] >= threshold)) return;
    visited[p] = 1;
    queue[tail++] = p;
  }
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  let removedPixelCount = 0;
  for (let head = 0; head < tail; head++) {
    const p = queue[head], x = p % width, y = Math.floor(p / width);
    if (data[p * 4 + 3]) removedPixelCount++;
    data[p * 4 + 3] = 0;
    if (x) visit(p - 1);
    if (x + 1 < width) visit(p + 1);
    if (y) visit(p - width);
    if (y + 1 < height) visit(p + width);
  }
  return { data, visited, stats: { removedPixelCount, preservedPixelCount: count - removedPixelCount, keepPixelCount: keep.reduce((a, b) => a + b, 0), rgbaVerified: true } };
}

export async function prepareEditableAssets(dataUrl, regions, { threshold = 240 } = {}) {
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 255) throw new RangeError('배경 임계값은 0~255의 정수여야 합니다.');
  const source = await decodeScopedPng(fromUrl(dataUrl));
  const normalized = normalizeRegions(regions, source.width, source.height), assets = [];
  for (const region of normalized) {
    const extracted = extract(source, region, threshold);
    const png = await encodeScopedPng({ width: region.width, height: region.height, data: extracted.data }, { metadata: source.metadata });
    const decoded = await decodeScopedPng(png);
    for (let p = 0; p < region.width * region.height; p++) {
      const original = ((region.y + Math.floor(p / region.width)) * source.width + region.x + p % region.width) * 4;
      for (let c = 0; c < 4; c++) {
        const expected = c === 3 && extracted.visited[p] ? 0 : source.data[original + c];
        if (decoded.data[p * 4 + c] !== expected) throw new Error('원본 픽셀 보존 검증에 실패했습니다.');
      }
    }
    const { keepRects, ...fields } = region;
    assets.push({ ...fields, data: toUrl(png), stats: extracted.stats });
  }
  return { width: source.width, height: source.height, assets,
    stats: { removedPixelCount: assets.reduce((n, a) => n + a.stats.removedPixelCount, 0), preservedPixelCount: assets.reduce((n, a) => n + a.stats.preservedPixelCount, 0), rgbaVerified: true } };
}

export function insertEditableAssets(state, prepared, { isCurrent, aiTaskId, aiCandidateId } = {}) {
  if (typeof isCurrent !== 'function') throw new TypeError('삽입 대상 확인 함수가 필요합니다.');
  if (!prepared?.assets?.length || prepared.assets.length > 256 || !Number.isFinite(prepared.width) || prepared.width <= 0 || !Number.isFinite(prepared.height) || prepared.height <= 0) throw new TypeError('준비한 이미지 영역이 없습니다.');
  if ((aiTaskId != null || aiCandidateId != null) && ![aiTaskId, aiCandidateId].every(v => typeof v === 'string' && v.trim())) throw new TypeError('이미지 작업·버전 정보를 확인할 수 없습니다.');
  const current = state.get();
  if (!isCurrent(current)) throw new Error('이미지를 준비하는 동안 페이지 또는 후보가 변경되었습니다.');
  const scale = Math.min(current.artboard.w * 0.9 / prepared.width, current.artboard.h * 0.9 / prepared.height);
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('아트보드 크기를 확인해 주세요.');
  const map = p => ({ x: (p.x - prepared.width / 2) * scale, y: (p.y - prepared.height / 2) * scale });
  const stamp = `${Date.now().toString(36)}_${++serial}`, objects = [], groups = [];
  for (const [i, asset] of prepared.assets.entries()) {
    const bounds = rect(asset, prepared.width, prepared.height);
    if (Object.keys(bounds).some(k => bounds[k] !== asset[k]) || typeof asset.data !== 'string' || !asset.data.startsWith('data:image/png;base64,') || typeof asset.label !== 'string') throw new TypeError('준비한 이미지 영역이 올바르지 않습니다.');
    const groupId = `grp_editable_${stamp}_${i}`, imageId = `obj_editable_${stamp}_${i}`;
    const common = { groupId, locked: false, positionLocked: false, ...(aiTaskId ? { aiTaskId, aiCandidateId } : {}), editableAssetRegionId: asset.id };
    objects.push({ ...common, id: imageId, type: 'image', src: asset.data, ...map(asset), w: asset.width * scale, h: asset.height * scale,
      rotation: 0, mode: 'edit', opacity: 1, aspectLocked: true, exportable: true, imageSelectionLocked: false, cutouts: [] });
    const memberIds = [imageId];
    const labelMode = effectiveAssetLabelMode(asset, prepared.labelsDisabled);
    if (labelMode !== 'none') {
      const id = `${imageId}_label`;
      const anchor = point(asset.anchor, prepared.width, prepared.height, null), labelPoint = point(asset.labelPoint, prepared.width, prepared.height, null);
      if (!anchor || !labelPoint) throw new TypeError('라벨 좌표가 없습니다.');
      objects.push({ ...common, id, type: 'labeler', p1: map(labelMode === 'text' ? labelPoint : anchor), p2: map(labelPoint), text: asset.label, labelType: 'label',
        fontFamily: DEFAULT_TEXT_FONT, labelSize: DEFAULT_TEXT_SIZE_MM, strokeLevel: 0, strokeWidth: 0.2 });
      memberIds.push(id);
    }
    groups.push({ id: groupId, memberIds });
  }
  state.update(draft => {
    if (!isCurrent(draft) || draft.activePageId !== current.activePageId) throw new Error('삽입 대상이 변경되었습니다.');
    draft.undoStack.push(structuredClone(draft.objects));
    if (draft.undoStack.length > 60) draft.undoStack.splice(0, draft.undoStack.length - 60);
    draft.redoStack = [];
    for (const object of objects) draft.objects.push({ ...object, layerId: draft.activeLayerId, order: draft.objects.length });
    (draft.groups ??= []).push(...groups);
    draft.selectedIds = objects.map(o => o.id);
    draft.targetedId = null;
    draft.activeTool = 'V';
  });
  return { ids: objects.map(o => o.id), groupIds: groups.map(g => g.id), added: objects.length, scale };
}
