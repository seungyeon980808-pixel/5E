import { decodeScopedPng, encodeScopedPng } from './ai-scoped-edit-png.js';

const MAX_PIXELS = 16_000_000;
const MAX_ASSETS = 128;
const MAX_PNG_BYTES = 64 * 1024 * 1024;

export class PreparedAssetRefinementError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'PreparedAssetRefinementError';
  }
}

function checkpoint(signal) {
  if (signal?.aborted) throw new DOMException('물체 미세 조정을 취소했습니다.', 'AbortError');
}

function pngBytes(dataUrl) {
  const prefix = 'data:image/png;base64,';
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix)) throw new TypeError('분리 결과는 PNG 데이터여야 합니다.');
  const encoded = dataUrl.slice(prefix.length);
  if (!encoded || encoded.length > Math.ceil(MAX_PNG_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new TypeError('분리 PNG 데이터가 올바르지 않습니다.');
  }
  return Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
}

function pngUrl(bytes) {
  let raw = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) raw += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return `data:image/png;base64,${btoa(raw)}`;
}

function dimensions(prepared) {
  const { width, height } = prepared ?? {};
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width * height > MAX_PIXELS) {
    throw new RangeError('분리 결과의 원본 크기를 확인할 수 없습니다.');
  }
  if (!Array.isArray(prepared.assets) || !prepared.assets.length || prepared.assets.length > MAX_ASSETS) {
    throw new RangeError('미세 조정할 물체 수가 허용 범위를 벗어났습니다.');
  }
  return { width, height };
}

function clippedRect(value, width, height) {
  if (!value || !['x', 'y', 'width', 'height'].every(key => Number.isSafeInteger(value[key])) || value.width <= 0 || value.height <= 0) {
    throw new RangeError('조정 영역은 양의 크기를 가진 정수 좌표여야 합니다.');
  }
  const left = Math.max(0, value.x), top = Math.max(0, value.y);
  const right = Math.min(width, value.x + value.width), bottom = Math.min(height, value.y + value.height);
  if (right <= left || bottom <= top) throw new RangeError('조정 영역이 원본 이미지 안에 있어야 합니다.');
  return { left, top, right, bottom };
}

async function hydrate(prepared, signal) {
  const { width, height } = dimensions(prepared);
  const owners = new Uint8Array(width * height);
  const rgba = new Uint8Array(width * height * 4);
  const metadata = new Map();
  const ids = new Set();

  for (const [index, asset] of prepared.assets.entries()) {
    checkpoint(signal);
    if (!asset || typeof asset.id !== 'string' || !asset.id || ids.has(asset.id)
      || !['x', 'y', 'width', 'height'].every(key => Number.isSafeInteger(asset[key]))
      || asset.x < 0 || asset.y < 0 || asset.width <= 0 || asset.height <= 0
      || asset.x + asset.width > width || asset.y + asset.height > height) {
      throw new RangeError('분리된 물체의 위치 또는 식별자가 올바르지 않습니다.');
    }
    ids.add(asset.id);
    let decoded;
    try {
      decoded = await decodeScopedPng(pngBytes(asset.data));
    } catch (error) {
      checkpoint(signal);
      throw new PreparedAssetRefinementError(
        '분리 결과를 읽을 수 없습니다. 자동 분리를 다시 실행하거나 원본을 사용해 주세요.',
        { cause: error },
      );
    }
    checkpoint(signal);
    if (decoded.width !== asset.width || decoded.height !== asset.height) throw new RangeError('분리 PNG의 크기와 위치 정보가 다릅니다.');
    const owner = index + 1;
    let pixelCount = 0;
    for (let y = 0; y < decoded.height; y++) for (let x = 0; x < decoded.width; x++) {
      const local = (y * decoded.width + x) * 4;
      if (!decoded.data[local + 3]) continue;
      const pixel = (asset.y + y) * width + asset.x + x;
      if (owners[pixel]) throw new RangeError('분리 PNG에 겹친 픽셀 소속이 있어 안전하게 조정할 수 없습니다.');
      owners[pixel] = owner;
      rgba.set(decoded.data.subarray(local, local + 4), pixel * 4);
      pixelCount++;
      if ((pixelCount & 0xffff) === 0) checkpoint(signal);
    }
    if (!pixelCount) throw new RangeError('픽셀이 없는 분리 물체는 조정할 수 없습니다.');
    metadata.set(owner, structuredClone(asset));
  }
  return { width, height, owners, rgba, metadata };
}

function ownerFor(metadata, id) {
  for (const [owner, asset] of metadata) if (asset.id === id) return owner;
  throw new RangeError('선택한 물체를 분리 결과에서 찾을 수 없습니다.');
}

function forRect(rect, width, callback, signal) {
  let visited = 0;
  for (let y = rect.top; y < rect.bottom; y++) for (let x = rect.left; x < rect.right; x++) {
    callback(y * width + x);
    if ((visited++ & 0xffff) === 0) checkpoint(signal);
  }
}

function uniqueId(metadata, idFactory) {
  const id = idFactory();
  if (typeof id !== 'string' || !id || [...metadata.values()].some(asset => asset.id === id)) throw new RangeError('새 물체 식별자를 만들지 못했습니다.');
  return id;
}

function applyOperation(workspace, operation, signal, idFactory) {
  const { width, height, owners, metadata } = workspace;
  if (!operation || typeof operation.type !== 'string') throw new TypeError('미세 조정 작업을 확인할 수 없습니다.');
  if (operation.type === 'merge') {
    const target = ownerFor(metadata, operation.targetId), source = ownerFor(metadata, operation.sourceId);
    if (target === source) throw new RangeError('서로 다른 두 물체를 선택해 주세요.');
    for (let pixel = 0; pixel < owners.length; pixel++) {
      if (owners[pixel] === source) owners[pixel] = target;
      if ((pixel & 0xffff) === 0) checkpoint(signal);
    }
    metadata.delete(source);
    return;
  }
  if (operation.type === 'exclude') {
    const excluded = ownerFor(metadata, operation.assetId);
    for (let pixel = 0; pixel < owners.length; pixel++) {
      if (owners[pixel] === excluded) owners[pixel] = 0;
      if ((pixel & 0xffff) === 0) checkpoint(signal);
    }
    metadata.delete(excluded);
    return;
  }
  if (operation.type === 'split') {
    if (metadata.size >= MAX_ASSETS) throw new RangeError('미세 조정 결과는 128개 물체를 넘을 수 없습니다.');
    const source = ownerFor(metadata, operation.assetId);
    const rect = clippedRect(operation.rect, width, height);
    let owner = 1;
    while (metadata.has(owner) && owner <= MAX_ASSETS) owner++;
    let moved = 0;
    forRect(rect, width, pixel => { if (owners[pixel] === source) { owners[pixel] = owner; moved++; } }, signal);
    let remaining = 0;
    for (let pixel = 0; pixel < owners.length; pixel++) {
      if (owners[pixel] === source) remaining++;
      if ((pixel & 0xffff) === 0) checkpoint(signal);
    }
    if (!moved || !remaining) throw new RangeError('나누기 영역에는 선택한 물체의 일부 픽셀만 포함되어야 합니다.');
    const original = metadata.get(source);
    metadata.set(owner, {
      ...structuredClone(original), id: uniqueId(metadata, idFactory), label: '', labelMode: 'none',
      anchor: { x: Math.round((rect.left + rect.right) / 2), y: Math.round((rect.top + rect.bottom) / 2) },
      labelPoint: { x: rect.left, y: Math.max(0, rect.top - 16) },
    });
    return;
  }
  if (operation.type === 'reassign') {
    const target = ownerFor(metadata, operation.targetId);
    const rect = clippedRect(operation.rect, width, height);
    let moved = 0;
    forRect(rect, width, pixel => {
      if (owners[pixel] && owners[pixel] !== target) { owners[pixel] = target; moved++; }
    }, signal);
    if (!moved) throw new RangeError('선택한 영역에 다른 물체의 픽셀이 없습니다.');
    const present = new Uint8Array(MAX_ASSETS + 1);
    for (let pixel = 0; pixel < owners.length; pixel++) {
      present[owners[pixel]] = 1;
      if ((pixel & 0xffff) === 0) checkpoint(signal);
    }
    for (const owner of metadata.keys()) if (!present[owner]) metadata.delete(owner);
    return;
  }
  throw new TypeError('지원하지 않는 미세 조정 작업입니다.');
}

async function encodeAssets(workspace, signal) {
  const { width, height, owners, rgba, metadata } = workspace;
  const bounds = new Map([...metadata.keys()].map(owner => [owner, { left: width, top: height, right: 0, bottom: 0, count: 0 }]));
  for (let pixel = 0; pixel < owners.length; pixel++) {
    const owner = owners[pixel];
    if (owner && bounds.has(owner)) {
      const item = bounds.get(owner), x = pixel % width, y = Math.floor(pixel / width);
      item.left = Math.min(item.left, x); item.top = Math.min(item.top, y);
      item.right = Math.max(item.right, x + 1); item.bottom = Math.max(item.bottom, y + 1); item.count++;
    }
    if ((pixel & 0xffff) === 0) checkpoint(signal);
  }

  const assets = [];
  for (const [owner, meta] of metadata) {
    const item = bounds.get(owner);
    if (!item?.count) continue;
    const x = Math.max(0, item.left - 1), y = Math.max(0, item.top - 1);
    const right = Math.min(width, item.right + 1), bottom = Math.min(height, item.bottom + 1);
    const assetWidth = right - x, assetHeight = bottom - y;
    const data = new Uint8Array(assetWidth * assetHeight * 4);
    let copied = 0;
    for (let localY = 0; localY < assetHeight; localY++) for (let localX = 0; localX < assetWidth; localX++) {
      const pixel = (y + localY) * width + x + localX;
      if (owners[pixel] !== owner) continue;
      data.set(rgba.subarray(pixel * 4, pixel * 4 + 4), (localY * assetWidth + localX) * 4); copied++;
      if ((copied & 0xffff) === 0) checkpoint(signal);
    }
    const encoded = await encodeScopedPng({ width: assetWidth, height: assetHeight, data });
    checkpoint(signal);
    const verified = await decodeScopedPng(encoded);
    checkpoint(signal);
    if (verified.width !== assetWidth || verified.height !== assetHeight || verified.data.some((value, index) => value !== data[index])) {
      throw new Error('미세 조정 PNG의 RGBA 검증에 실패했습니다.');
    }
    assets.push({
      ...meta, x, y, width: assetWidth, height: assetHeight, data: pngUrl(encoded),
      sourceBounds: { x, y, width: assetWidth, height: assetHeight },
      foregroundPixelCount: item.count, assignedForegroundPixelCount: item.count,
      semanticGroupingVerified: false,
      stats: { ...(meta.stats ?? {}), preservedPixelCount: item.count, foregroundPixelCount: item.count,
        assignedForegroundPixelCount: item.count, rgbaVerified: true },
    });
  }
  return assets;
}

function manualRegion(asset) {
  return { id: asset.id, x: asset.x, y: asset.y, width: asset.width, height: asset.height,
    label: asset.label ?? '', labelMode: asset.labelMode ?? 'none', anchor: asset.anchor,
    labelPoint: asset.labelPoint, keepRects: [] };
}

export async function refinePreparedAssets(prepared, operation, { signal, idFactory = () => crypto.randomUUID() } = {}) {
  checkpoint(signal);
  const workspace = await hydrate(prepared, signal);
  applyOperation(workspace, operation, signal, idFactory);
  const assets = await encodeAssets(workspace, signal);
  if (!assets.length) throw new RangeError('페이지에 넣을 물체가 하나 이상 있어야 합니다.');
  const assignedForegroundPixelCount = assets.reduce((total, asset) => total + asset.foregroundPixelCount, 0);
  const foregroundPixelCount = Number.isSafeInteger(prepared.foregroundPixelCount)
    ? prepared.foregroundPixelCount : assignedForegroundPixelCount;
  if (foregroundPixelCount < assignedForegroundPixelCount) throw new RangeError('분리 결과의 픽셀 합계가 올바르지 않습니다.');
  const unassignedForegroundPixelCount = foregroundPixelCount - assignedForegroundPixelCount;
  const reviewReasons = [...new Set([...(prepared.reviewReasons ?? []), 'manual-refinement',
    ...(unassignedForegroundPixelCount ? ['manual-pixels-excluded'] : [])])];
  return {
    ...structuredClone(prepared), assets, foregroundPixelCount, assignedForegroundPixelCount,
    unassignedForegroundPixelCount, semanticGroupingVerified: false, reviewRequired: true,
    reviewReasons, manualCorrectionAvailable: true, manualRegions: assets.map(manualRegion),
    stats: { ...(prepared.stats ?? {}), foregroundPixelCount, assignedForegroundPixelCount,
      unassignedForegroundPixelCount, rgbaVerified: true,
      assignmentVerified: unassignedForegroundPixelCount === 0,
      layoutMode: 'manual-refinement', analysisCompleted: true },
  };
}
