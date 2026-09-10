import {
  GRID_ASSET_COUNT,
  GRID_SIZE,
  gridAssignments,
  mergeAssignments,
  summarizeAssignments,
  whitespaceAssignments,
} from './ai-separated-assets-assignments.js';
import { decodeScopedPng, encodeScopedPng } from './ai-scoped-edit-png.js';

const WHITE_THRESHOLD = 240;

function separationOptions(options) {
  if (options === undefined) options = {};
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('분리 옵션을 확인해 주세요.');
  const layout = options.layout === undefined ? 'auto' : options.layout;
  const maxAssets = options.maxAssets === undefined ? null : options.maxAssets;
  if (layout !== 'auto' && layout !== 'grid') throw new RangeError('분리 배치는 auto 또는 grid여야 합니다.');
  if (maxAssets !== null && (!Number.isInteger(maxAssets) || maxAssets < 1 || maxAssets > 256)) throw new RangeError('최대 객체 수는 1~256의 정수 또는 null이어야 합니다.');
  return { layout, maxAssets };
}

function reviewError(ErrorType, message, reason, details = {}) {
  const error = new ErrorType(message);
  error.code = reason;
  error.reviewRequired = true;
  error.reviewReasons = [reason];
  error.manualCorrectionAvailable = true;
  Object.assign(error, details);
  return error;
}

export const SEPARATED_ASSETS_PROMPT = `
승인된 공통 스타일 지침은 그대로 적용한다. 출력 품질, 해상도, 모델, 사용자의 요청을 바꾸지 않는다. 공통 지침의 원본 전체 구성 대신 아래 아틀라스 배치만 적용하며, 그 밖의 스타일과 의미 보존 규칙은 바꾸지 않는다.
결과는 하나의 PNG 안에 4×4 격자로 배치한다. 서로 독립적으로 편집할 수 있는 객체 또는 기능적으로 하나인 조립체를 최대 16개까지, 한 셀에 하나씩 왼쪽 위부터 행 우선으로 놓고 남는 셀은 완전히 비운다. 입력에 분리할 객체 또는 조립체가 16개를 넘으면 일부를 생략하거나 합치지 말고, 16개 제한으로 생성할 수 없다고 명확히 알린다.
입력에 있는 객체 수, 부품 수, 연결·접촉·포함·층·상대 위치와 비율 같은 내부 관계를 보존한다. 객체 내부에서 과학적 의미를 가진 화살표와 눈금도 보존한다. 임의의 과학 요소, 부품, 연결, 장식은 추가하지 않는다.
글자, 숫자, 수식, 텍스트 라벨, 라벨만을 위한 지시선, 배지, 셀 테두리와 격자선은 넣지 않는다. 과학적 의미를 가진 화살표·눈금·실제 연결선은 이 금지 대상이 아니다.
각 객체는 셀의 모든 가장자리에서 넉넉히 떨어뜨린다. 첫 행의 위쪽과 마지막 행의 아래쪽을 포함하여 이미지 외곽과 모든 셀 경계에 깨끗하고 연속된 빈 여백을 둔다. 객체나 그림자, 선이 셀 경계를 넘거나 닿아서는 안 된다.
배경은 모든 픽셀이 완전히 불투명한 순수 흰색(#FFFFFF, alpha 255)인 단색으로 만든다. 투명 배경을 만들지 않는다. 체크무늬를 RGB 픽셀로 그리거나 회색·유색·어두운 배경, 종이 질감, 그림자 배경을 만들지 않는다.
`;

function fromUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new TypeError('분리할 원본은 PNG 데이터여야 합니다.');
  return Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), character => character.charCodeAt(0));
}

function toUrl(bytes) {
  let raw = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) raw += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return `data:image/png;base64,${btoa(raw)}`;
}

function isWhite(data, pixel) {
  const offset = pixel * 4;
  return data[offset] >= WHITE_THRESHOLD && data[offset + 1] >= WHITE_THRESHOLD && data[offset + 2] >= WHITE_THRESHOLD && data[offset + 3] === 255;
}

function isPureWhite(data, pixel) {
  const offset = pixel * 4;
  return data[offset] === 255 && data[offset + 1] === 255 && data[offset + 2] === 255 && data[offset + 3] === 255;
}

function isAcceptedFrameBackground(data, pixel) {
  const offset = pixel * 4;
  const red = data[offset], green = data[offset + 1], blue = data[offset + 2];
  return Math.min(red, green, blue) >= 250 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 3 && data[offset + 3] === 255;
}

function frameIsTransparent(source) {
  for (let x = 0; x < source.width; x++) {
    if (source.data[x * 4 + 3] !== 0 || source.data[((source.height - 1) * source.width + x) * 4 + 3] !== 0) return false;
  }
  for (let y = 0; y < source.height; y++) {
    if (source.data[y * source.width * 4 + 3] !== 0 || source.data[(y * source.width + source.width - 1) * 4 + 3] !== 0) return false;
  }
  return true;
}

function assertOuterFrame(source, transparent) {
  let pureWhite = true;
  const inspect = pixel => {
    if (transparent ? source.data[pixel * 4 + 3] !== 0 : !isAcceptedFrameBackground(source.data, pixel)) {
      throw new Error('체크무늬나 어두운 배경은 분리할 수 없습니다. 실제 투명 또는 흰색 배경을 사용해 주세요.');
    }
    pureWhite &&= isPureWhite(source.data, pixel);
  };
  for (let x = 0; x < source.width; x++) {
    inspect(x);
    inspect((source.height - 1) * source.width + x);
  }
  for (let y = 0; y < source.height; y++) {
    inspect(y * source.width);
    inspect(y * source.width + source.width - 1);
  }
  return transparent ? 'transparent' : pureWhite ? 'white' : 'near-white';
}

function detectBackground(source, transparent) {
  const count = source.width * source.height;
  const background = new Uint8Array(count);
  if (transparent) {
    for (let pixel = 0; pixel < count; pixel++) background[pixel] = source.data[pixel * 4 + 3] === 0 ? 1 : 0;
  } else {
    const queue = new Uint32Array(count);
    let tail = 0;
    const visit = pixel => {
      if (background[pixel]) return;
      if (!isWhite(source.data, pixel)) return;
      background[pixel] = 1;
      queue[tail++] = pixel;
    };
    for (let x = 0; x < source.width; x++) { visit(x); visit((source.height - 1) * source.width + x); }
    for (let y = 0; y < source.height; y++) { visit(y * source.width); visit(y * source.width + source.width - 1); }
    for (let head = 0; head < tail; head++) {
      const pixel = queue[head], x = pixel % source.width, y = Math.floor(pixel / source.width);
      if (x) visit(pixel - 1);
      if (x + 1 < source.width) visit(pixel + 1);
      if (y) visit(pixel - source.width);
      if (y + 1 < source.height) visit(pixel + source.width);
    }
  }
  return background;
}

async function encodeAsset(source, owners, bounds) {
  const data = new Uint8Array(bounds.width * bounds.height * 4);
  let removedPixelCount = 0, preservedPixelCount = 0;
  for (let localY = 0; localY < bounds.height; localY++) for (let localX = 0; localX < bounds.width; localX++) {
    const sourceX = bounds.x + localX, sourceY = bounds.y + localY, sourcePixel = sourceY * source.width + sourceX;
    const sourceOffset = sourcePixel * 4, outputOffset = (localY * bounds.width + localX) * 4;
    data.set(source.data.subarray(sourceOffset, sourceOffset + 4), outputOffset);
    if (owners[sourcePixel] !== bounds.owner) {
      if (data[outputOffset + 3] !== 0) removedPixelCount++;
      else preservedPixelCount++;
      data[outputOffset + 3] = 0;
    } else preservedPixelCount++;
  }
  const encoded = await encodeScopedPng({ width: bounds.width, height: bounds.height, data }, { metadata: source.metadata });
  const decoded = await decodeScopedPng(encoded);
  if (!decoded.data.every((value, index) => value === data[index])) throw new Error('분리한 객체의 원본 픽셀 보존 검증에 실패했습니다.');
  const { owner, ...sourceBounds } = bounds;
  return { ...sourceBounds, sourceBounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    foregroundPixelCount: bounds.foregroundPixelCount, assignedForegroundPixelCount: bounds.foregroundPixelCount, data: toUrl(encoded),
    stats: { removedPixelCount, preservedPixelCount, foregroundPixelCount: bounds.foregroundPixelCount,
      assignedForegroundPixelCount: bounds.foregroundPixelCount, rgbaVerified: true } };
}

function manualRegion(asset) {
  return { id: asset.id, x: asset.x, y: asset.y, width: asset.width, height: asset.height, label: asset.label,
    labelMode: asset.labelMode, anchor: { ...asset.anchor }, labelPoint: { ...asset.labelPoint }, keepRects: [] };
}

export async function prepareSeparatedAssets(dataUrl, options) {
  const { layout, maxAssets } = separationOptions(options);
  const source = await decodeScopedPng(fromUrl(dataUrl));
  if (Math.floor(Math.min(source.width, source.height) / GRID_SIZE / 3) < 2) throw new RangeError('4×4 객체 분리에 필요한 이미지 해상도가 부족합니다.');
  const transparent = frameIsTransparent(source);
  const backgroundMode = assertOuterFrame(source, transparent);
  const background = detectBackground(source, transparent);
  const grid = gridAssignments(source, background);
  const foregroundPixelCount = background.reduce((total, value) => total + (value ? 0 : 1), 0);
  if (!foregroundPixelCount) throw reviewError(Error, '분리할 객체가 없습니다. 이미지 안에 객체를 배치해 주세요.', 'empty-foreground');

  const useGrid = layout === 'grid' || !grid.boundaryForeground;
  const initial = useGrid ? grid : whitespaceAssignments(source, background);
  const assignment = mergeAssignments(source, initial, !useGrid);
  const summary = summarizeAssignments(source, background, assignment);
  if (summary.unassignedForegroundPixelCount) throw reviewError(Error, '분리 과정에서 일부 원본 픽셀을 할당하지 못했습니다. 결과를 확인해 주세요.', 'foreground-unassigned', summary);
  if (maxAssets !== null && summary.items.length > maxAssets) {
    throw reviewError(RangeError, `분리 결과가 최대 객체 수 ${maxAssets}개를 넘습니다. 결과를 확인하고 직접 영역을 선택해 주세요.`, 'asset-limit-exceeded',
      { maxAssets, detectedAssetCount: summary.items.length, foregroundPixelCount: summary.foregroundPixelCount });
  }

  const assets = [];
  for (const item of summary.items) {
    const encoded = await encodeAsset(source, assignment.owners, item), number = assets.length + 1;
    const center = { x: encoded.x + encoded.width / 2, y: encoded.y + encoded.height / 2 };
    assets.push({ id: `separated_${number}`, ...encoded, label: `객체 ${number}`, labelMode: 'leader', anchor: center, labelPoint: { x: center.x, y: encoded.y },
      semanticGroupingVerified: false });
  }

  const reviewReasons = ['semantic-grouping-unverified'];
  const addReason = reason => { if (!reviewReasons.includes(reason)) reviewReasons.push(reason); };
  const layoutMode = useGrid ? 'fixed-grid' : 'whitespace';
  if (backgroundMode === 'near-white') addReason('near-white-background');
  if (!useGrid) addReason('whitespace-layout');
  if (grid.boundaryForeground) addReason('grid-boundary-foreground');
  if (assignment.mergeCount) addReason('nearby-parts-merged');
  if (assets.length > GRID_ASSET_COUNT) addReason('asset-count-exceeds-grid');
  const stats = {
    removedPixelCount: assets.reduce((total, asset) => total + asset.stats.removedPixelCount, 0),
    preservedPixelCount: assets.reduce((total, asset) => total + asset.stats.preservedPixelCount, 0),
    foregroundPixelCount: summary.foregroundPixelCount,
    assignedForegroundPixelCount: summary.assignedForegroundPixelCount,
    unassignedForegroundPixelCount: summary.unassignedForegroundPixelCount,
    rgbaVerified: true,
    assignmentVerified: summary.unassignedForegroundPixelCount === 0,
    backgroundMode,
    layoutMode,
  };
  return { width: source.width, height: source.height, assets,
    foregroundPixelCount: summary.foregroundPixelCount,
    assignedForegroundPixelCount: summary.assignedForegroundPixelCount,
    unassignedForegroundPixelCount: summary.unassignedForegroundPixelCount,
    semanticGroupingVerified: false,
    reviewRequired: true,
    reviewReasons,
    manualCorrectionAvailable: true,
    manualRegions: assets.map(manualRegion),
    stats };
}
