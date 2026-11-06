// 11-06 사용자: 그림 맞춤은 단추 하나로 「좌우 맞춤 → 상하 맞춤 → 자유」를 돌린다. 기본값은 좌우 맞춤, 비율은 절대 그대로.
// - 좌우: 표 칸 안이면 칸 안쪽 너비(양옆 합쳐 1mm 남김 — 5E 조판기가 보낸 크기와 같게), 본문이면 단 너비에 맞춘다.
// - 상하: 같은 줄 다른 그림 높이에 맞춘다. 폭이 칸을 넘으면 칸 너비에서 멈춘다. 기준 그림이 없거나 본문 그림이면 건너뛴다.
// - 자유: 자동으로 맞추지 않는다(손잡이로 직접 바꾼 크기 그대로).
// 크기를 바꾼 뒤 칸 줄 자리 다시 잡기(겹침 금지)·보던 자리 지키기는 bridge.setProperties·transaction이 맡는다.
export const FIT_MODES = ['width', 'height', 'free'];
export const FIT_LABELS = { width: '좌우 맞춤', height: '상하 맞춤', free: '자유' };
const HWP_PER_MM = 7200 / 25.4;
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;

export function nextFitMode(mode) { return FIT_MODES[(FIT_MODES.indexOf(mode) + 1) % FIT_MODES.length] || 'width'; }

function cellBox(bridge, ref) {
  const last = ref.cellPath.at(-1), cellIndex = last.cellIndex ?? last.cellIdx;
  const cell = parse(ref.cellPath.length > 1
    ? bridge.wasm.getCellPropertiesByPath(ref.sec, ref.ppi, JSON.stringify(ref.cellPath), cellIndex)
    : bridge.wasm.getCellProperties(ref.sec, ref.ppi, last.controlIndex ?? last.controlIdx, cellIndex));
  const props = parse(bridge.properties(ref));
  return {
    width: cell.width - (cell.paddingLeft || 0) - (cell.paddingRight || 0) - (props.outerMarginLeft || 0) - (props.outerMarginRight || 0) - 1 * HWP_PER_MM,
  };
}

function columnWidth(bridge, ref) {
  const doc = bridge.wasm.borrowDocumentHandle(), page = parse(doc.getPageDef(ref.sec || 0)), columns = parse(doc.getColumnDef(ref.sec || 0)) || {};
  const count = Math.max(1, columns.columnCount || 1);
  return (page.width - page.marginLeft - page.marginRight - (count > 1 ? (columns.spacing || 0) * (count - 1) : 0)) / count;
}

const idx = (step, a, b) => step?.[a] ?? step?.[b];
// 같은 표·같은 줄의 다른 칸에 든 그림 높이(HWPUNIT). 줄은 그려진 칸 상자의 row로 가른다.
function rowSiblingHeights(bridge, ref) {
  const path = ref.cellPath, last = path.at(-1), myCell = idx(last, 'cellIndex', 'cellIdx');
  const boxes = parse(bridge.wasm.borrowDocumentHandle().getTableCellBboxesByPath(ref.sec, ref.ppi, JSON.stringify(path))) || [];
  const rowOf = cell => boxes.find(b => b.cellIdx === cell)?.row, myRow = rowOf(myCell);
  if (myRow === undefined) return [];
  const sameStep = (a, b) => idx(a, 'controlIndex', 'controlIdx') === idx(b, 'controlIndex', 'controlIdx') && idx(a, 'cellIndex', 'cellIdx') === idx(b, 'cellIndex', 'cellIdx') && idx(a, 'cellParaIndex', 'cellParaIdx') === idx(b, 'cellParaIndex', 'cellParaIdx');
  const heights = [];
  for (const {ref: other} of bridge.documentPictures?.() || []) {
    const op = other.cellPath;
    if (other.sec !== ref.sec || other.ppi !== ref.ppi || !Array.isArray(op) || op.length !== path.length) continue;
    if (!op.slice(0, -1).every((step, i) => sameStep(step, path[i]))) continue;
    const end = op.at(-1), cell = idx(end, 'cellIndex', 'cellIdx');
    if (idx(end, 'controlIndex', 'controlIdx') !== idx(last, 'controlIndex', 'controlIdx') || cell === myCell || rowOf(cell) !== myRow) continue;
    const h = parse(bridge.properties(other))?.height;
    if (h > 0) heights.push(h);
  }
  return heights;
}

// 그 모드의 목표 크기 {width,height} · 건너뜀('skip') · 맞추지 않음(null, 자유).
// 상하(11-06 다시 정함): 같은 표 같은 줄 다른 그림들 중 가장 높은 것에 높이를 맞춘다. 폭은 칸 너비에서 멈춘다.
// 같은 줄에 다른 그림이 없거나 본문 그림이면 기준이 없어 건너뛴다.
export function fitTarget(bridge, ref, mode) {
  if (mode === 'free') return null;
  const props = parse(bridge.properties(ref));
  if (!(props.width > 0 && props.height > 0)) throw new Error('그림 크기를 읽지 못했습니다.');
  const ratio = props.height / props.width;
  let width;
  if (ref.cellPath?.length) {
    const box = cellBox(bridge, ref);
    if (mode === 'height') {
      const heights = rowSiblingHeights(bridge, ref);
      if (!heights.length) return 'skip';
      width = Math.min(box.width, Math.max(...heights) / ratio);
    } else width = box.width;
  } else {
    if (mode === 'height') return 'skip';
    width = columnWidth(bridge, ref);
  }
  // 그림이 사라질 만큼 작아지지 않게(폭 최소 5mm) — 비율은 그대로.
  width = Math.round(Math.max(width, 5 * HWP_PER_MM));
  return { width, height: Math.round(width * ratio), current: props };
}

// 그 모드로 그림 크기를 정한다. 바꾼 크기({width,height}) · 이미 맞음(null) · 건너뜀('skip').
export function fitSize(bridge, ref, mode) {
  const target = fitTarget(bridge, ref, mode);
  if (!target || target === 'skip') return target;
  const { width, height, current } = target;
  if (Math.abs(width - current.width) < 20 && Math.abs(height - current.height) < 20) return null;
  return { width, height };
}

// 지금 크기가 그 모드와 맞는지. 폭 차이 1mm 또는 2% 안이면 맞은 것으로 본다. 자유는 늘 맞다.
export function fitMatches(bridge, ref, mode) {
  if (mode === 'free') return true;
  try {
    const target = fitTarget(bridge, ref, mode);
    if (!target || target === 'skip') return false;
    return Math.abs(target.width - target.current.width) <= Math.max(HWP_PER_MM, target.width * .02);
  } catch { return false; }
}

// 지금 크기가 어느 모드와 맞는지(아이콘이 실제 상태를 따르게). 좌우·상하 크기가 같은 그림도 있으니
// 마지막으로 고른 모드(remembered)가 아직 맞으면 그 모드를 먼저 본다 — 단추가 한 모드에 멈추지 않게.
export function detectFitMode(bridge, ref, remembered = null) {
  if (remembered && fitMatches(bridge, ref, remembered)) return remembered;
  for (const mode of ['width', 'height']) if (fitMatches(bridge, ref, mode)) return mode;
  return 'free';
}

export function applyPictureFit(bridge, ref, mode) {
  const size = fitSize(bridge, ref, mode);
  if (!size || size === 'skip') return size;
  bridge.transaction(ref.cellPath?.length ? 'fit-cell-picture' : 'inspector-picture-fit', () => { bridge.setProperties(ref, size); return true; });
  return size;
}
