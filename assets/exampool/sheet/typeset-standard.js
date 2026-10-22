// 조판 기준(10-22 설계 typeset-standard-design-1022.md): 용지·본문 글자·요소 간격·요소 모양·줄 맞춤·잠금 기본값을 담은 이름 붙은 묶음.
// 문항 카드(내용)와 조판 모양을 나눈다. 내장 「수능 틀」은 고칠 수 없고 복제해서 쓴다. 학교 양식에서 만든 기준은 저장·내보내기·가져오기.
// 단위: 간격·여백 mm, 글자 pt, 장평·자간·줄 간격 %. 비운 값은 수능 틀 값을 따른다(base).
// 이 단계(8)는 조판 코드에 박혀 있던 값을 그대로 옮긴 것이라, 수능 틀로 만든 문서는 예전과 바이트까지 같다(tests/test-typeset-standard.mjs).
export const STANDARD_FORMAT = '5e-typeset-standard';
export const KICE_ID = 'kice';
// px ↔ mm: 조판 HTML은 96dpi px로 쓴다. 0.01px로 맞춰 예전 정수 px 값이 그대로 나오게 한다.
export const mmToPx = mm => Math.round(mm * 96 / 25.4 * 100) / 100;
export const pxToMm = px => Math.round(px * 25.4 / 96 * 10000) / 10000;

export const KICE_STANDARD = deepFreeze({
  format: STANDARD_FORMAT, id: KICE_ID, name: '수능 틀', version: 1, base: null, source: { kind: 'builtin' },
  paper: { size: 'A4', columns: 2, columnGap: 8, margin: { top: 15, bottom: 15, left: 15, right: 15 } },
  text: { font: '함초롬바탕', size: 11, ratio: 95, spacing: -5, lineSpacing: 160, align: 'justify', break: 'word' },
  // 〈보기〉 상자 안쪽: 마지막 줄 아래 14px(반 줄쯤), 좌우 6px. 간격 보기·조절(9단계)이 이 값을 고친다.
  gaps: { bogiPadBottom: pxToMm(14), bogiPadSide: pxToMm(6), bogiPadTop: pxToMm(3) },
  parts: { number: 'n.', bogiTitle: '<보 기>', bogiTitleWidth: pxToMm(54), bogiLineSpacing: 150, tableText: 10, tableLineSpacing: 130, choices: 'auto', labelSpace: 'space', hanging: true },
  fit: { on: true, low: -10, high: 0, shortLastLine: 15 },
  lock: true,
});

function deepFreeze(value) { if (value && typeof value === 'object') { Object.freeze(value); for (const v of Object.values(value)) deepFreeze(v); } return value; }
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, over) {
  if (!isObj(over)) return over === undefined ? structuredClone(base) : over;
  const out = isObj(base) ? structuredClone(base) : {};
  for (const [k, v] of Object.entries(over)) if (v !== undefined && v !== null && v !== '') out[k] = isObj(v) ? merge(out[k], v) : v;
  return out;
}

const RANGE = {
  'paper.columns': [1, 2], 'paper.columnGap': [0, 30], 'paper.margin.top': [5, 40], 'paper.margin.bottom': [5, 40], 'paper.margin.left': [5, 40], 'paper.margin.right': [5, 40],
  'text.size': [6, 20], 'text.ratio': [50, 200], 'text.spacing': [-50, 50], 'text.lineSpacing': [80, 300],
  'gaps.bogiPadBottom': [0, 20], 'gaps.bogiPadSide': [0, 20], 'gaps.bogiPadTop': [0, 20],
  'parts.bogiTitleWidth': [5, 40], 'parts.bogiLineSpacing': [80, 300], 'parts.tableText': [6, 20], 'parts.tableLineSpacing': [80, 300],
  'fit.low': [-20, 0], 'fit.high': [0, 20], 'fit.shortLastLine': [0, 50],
};
const get = (o, path) => path.split('.').reduce((v, k) => v?.[k], o);

// 기준 하나를 수능 틀 위에 펼쳐 빠진 값을 채우고, 범위를 벗어난 값은 오류로 알린다.
export function resolveStandard(standard) {
  if (!standard || standard.id === KICE_ID) return KICE_STANDARD;
  const full = merge(KICE_STANDARD, standard);
  full.format = STANDARD_FORMAT; full.base = KICE_ID;
  validateStandard(full);
  return deepFreeze(full);
}
export function validateStandard(s) {
  if (!s || typeof s !== 'object') throw Error('조판 기준 형식이 아닙니다.');
  if (!String(s.name || '').trim()) throw Error('조판 기준 이름을 적어 주세요.');
  if (!['A4', 'B4', 'A3'].includes(s.paper?.size)) throw Error('용지는 A4·B4·A3 가운데 하나여야 합니다.');
  for (const [path, [lo, hi]] of Object.entries(RANGE)) {
    const v = get(s, path);
    if (v === undefined) continue;
    if (!Number.isFinite(v) || v < lo || v > hi) throw Error(`조판 기준 값이 범위를 벗어났습니다: ${path} = ${v} (${lo}~${hi})`);
  }
  if (get(s, 'fit.low') > get(s, 'fit.high')) throw Error('줄 맞춤 자간 범위가 거꾸로입니다.');
  return true;
}

// 새 기준: 수능 틀(또는 다른 기준)을 복제해 이름을 붙인다. 수능 틀은 고칠 수 없다.
export function copyStandard(from = KICE_STANDARD, { name, source = { kind: 'copy' }, id = 'std_' + Math.random().toString(36).slice(2, 10) } = {}) {
  const base = resolveStandard(from), copy = structuredClone(base);
  Object.assign(copy, { id, name: name || `${base.name} (내 설정)`, base: KICE_ID, source: { ...source, at: new Date().toISOString() }, version: 1 });
  validateStandard(copy);
  return copy;
}

// 파일로 주고받기(.5e-typeset.json)
export function exportStandard(standard) {
  const s = resolveStandard(standard);
  return JSON.stringify({ ...structuredClone(s), format: STANDARD_FORMAT }, null, 2);
}
export function importStandard(text) {
  let raw; try { raw = typeof text === 'string' ? JSON.parse(text) : text; } catch { throw Error('조판 기준 파일을 읽지 못했습니다.'); }
  if (raw?.format !== STANDARD_FORMAT) throw Error('5E 조판 기준 파일(.5e-typeset.json)이 아닙니다.');
  if (raw.id === KICE_ID) raw = { ...raw, id: 'std_' + Math.random().toString(36).slice(2, 10), name: `${raw.name || '수능 틀'} (가져옴)` };
  const s = merge(KICE_STANDARD, raw); s.base = KICE_ID; s.source = { ...(raw.source || {}), kind: raw.source?.kind || 'file' };
  validateStandard(s);
  return s;
}

// 문항에 쓸 기준: 문항 → 시험지 → 수능 틀 순서.
export function standardFor(question, { exam = null, standards = [] } = {}) {
  const id = question?.standardId || exam?.standardId || KICE_ID;
  return id === KICE_ID ? KICE_STANDARD : resolveStandard(standards.find(s => s.id === id) || null);
}

// 조판 코드가 읽는 값(px·%)으로 풀어 둔 모양. 수능 틀이면 예전 상수와 같은 값.
export function layoutValues(standard = KICE_STANDARD) {
  const s = resolveStandard(standard);
  return {
    ratio: s.text.ratio, spacing: s.text.spacing,
    margin: s.paper.margin, columnGap: s.paper.columnGap,
    bogiBottom: mmToPx(s.gaps.bogiPadBottom), bogiSide: mmToPx(s.gaps.bogiPadSide), bogiTop: mmToPx(s.gaps.bogiPadTop),
    bogiTitleWidth: mmToPx(s.parts.bogiTitleWidth), bogiLineSpacing: s.parts.bogiLineSpacing,
    tableLineSpacing: s.parts.tableLineSpacing, tableText: s.parts.tableText,
  };
}
