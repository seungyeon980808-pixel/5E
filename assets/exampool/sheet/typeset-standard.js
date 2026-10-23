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
  // text·material·bogi·ask·choices: 지문·자료(그림·표·묶음)·〈보기〉·발문·선지 앞에 더 두는 간격(mm). 수능 틀은 0(조판이 정한 기본 간격만).
  // 10-23 평가원 규칙(2009-6 모평 한글 원본 실측 × 0.768 = 5E 단 폭 86 ÷ 원본 111.98, kice-form-analysis/rules-200906.md):
  // 〈보기〉 안쪽 좌우 3.0→2.30, 위 2.0→1.54, 아래 3.0→2.30. 자료 상자 안쪽 좌우 3.0→2.30, 위아래 2.0→1.54.
  // 상자·표·그림·〈보기〉 뒤 문단 아래 2.01→1.54(after). 표 칸 안 여백 0.5→0.38. 선 굵기 0.12mm는 줄이지 않는다(0.09는 인쇄가 흐림).
  gaps: { text: 0, material: 0, bogi: 0, ask: 0, choices: 0, after: 1.54, bogiPadBottom: 2.30, bogiPadSide: 2.30, bogiPadLeft: 2.30, bogiPadRight: 2.30, bogiPadTop: 1.54, boxPadSide: 2.30, boxPadTop: 1.54, boxPadBottom: 1.54 },
  // bogiTitleWidth 15.96→12.26: 11pt 「<보 기>」가 더 넓으면 글 폭에 맞춰 넓힌다(handoff). cellPad 표 칸 안 여백, rule 선 굵기(mm).
  // choiceTabs: 선지 칸 간격(① 시작선부터, 5개·3개·2개 한 줄) — 원본 21.6·36.0·56.0 × 0.768.
  // labelSpace: 「ㄱ.」「①」 뒤 빈칸 — 'space' 보통 띄어쓰기(평가원 원본), 'fixed' 고정 띄어쓰기(지워지지 않음, 빈 자리만).
  parts: { number: 'n.', bogiTitle: '<보 기>', bogiTitleWidth: 12.26, bogiTitleRow: 2.91, bogiTitlePad: 0.38, bogiLineSpacing: 150, tableText: 10, tableLineSpacing: 130, cellPad: 0.38, rule: 0.12, choices: 'auto', choiceTabs: [16.59, 27.65, 43.02], labelSpace: 'space', hanging: true },
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
  'gaps.text': [0, 20], 'gaps.material': [0, 20], 'gaps.bogi': [0, 20], 'gaps.ask': [0, 20], 'gaps.choices': [0, 20], 'gaps.bogiPadBottom': [0, 20], 'gaps.bogiPadSide': [0, 20], 'gaps.bogiPadLeft': [0, 20], 'gaps.bogiPadRight': [0, 20], 'gaps.bogiPadTop': [0, 20], 'gaps.after': [0, 20], 'gaps.boxPadSide': [0, 20], 'gaps.boxPadTop': [0, 20], 'gaps.boxPadBottom': [0, 20],
  'parts.bogiTitleWidth': [5, 40], 'parts.bogiLineSpacing': [80, 300], 'parts.tableText': [6, 20], 'parts.tableLineSpacing': [80, 300], 'parts.cellPad': [0, 5], 'parts.rule': [0.05, 1], 'parts.bogiTitlePad': [0, 5], 'parts.bogiTitleRow': [0.5, 10],
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

// 블록 종류 → 기준 간격 이름(간격 보기·조절과 조판이 같이 쓴다).
export const gapRole = kind => kind === 'bogi' ? 'bogi' : ['figure', 'table', 'group', 'box'].includes(kind) ? 'material' : 'text';
// 조판 코드가 읽는 값(px·%)으로 풀어 둔 모양. 수능 틀이면 예전 상수와 같은 값.
export function layoutValues(standard = KICE_STANDARD) {
  const s = resolveStandard(standard);
  return {
    ratio: s.text.ratio, spacing: s.text.spacing, gapText: s.gaps.text, gapMaterial: s.gaps.material, gapBogi: s.gaps.bogi, askGap: s.gaps.ask, choicesGap: s.gaps.choices,
    margin: s.paper.margin, columnGap: s.paper.columnGap,
    bogiBottom: mmToPx(s.gaps.bogiPadBottom), bogiSide: mmToPx(s.gaps.bogiPadSide), bogiTop: mmToPx(s.gaps.bogiPadTop),
    // 〈보기〉 왼쪽·오른쪽 안 여백(10-23 설정 팝업): 따로 정하지 않은 옛 틀은 「좌우」 값 하나를 양쪽에 쓴다.
    bogiLeft: mmToPx(standard?.gaps?.bogiPadLeft ?? s.gaps.bogiPadSide), bogiRight: mmToPx(standard?.gaps?.bogiPadRight ?? s.gaps.bogiPadSide),
    bogiTitle: s.parts.bogiTitle || '<보 기>', bogiTitleRow: mmToPx(s.parts.bogiTitleRow ?? 2.91),
    bogiTitleWidth: mmToPx(s.parts.bogiTitleWidth), bogiTitlePad: mmToPx(s.parts.bogiTitlePad ?? 0), bogiLineSpacing: s.parts.bogiLineSpacing,
    gapAfter: s.gaps.after ?? 0, boxSide: mmToPx(s.gaps.boxPadSide), boxTop: mmToPx(s.gaps.boxPadTop), boxBottom: mmToPx(s.gaps.boxPadBottom),
    cellPad: mmToPx(s.parts.cellPad), rule: `${Math.round(s.parts.rule * 72 / 25.4 * 100) / 100}pt solid #000`,
    choiceTabs: (s.parts.choiceTabs || []).map(mmToPx), labelSpace: s.parts.labelSpace,
    tableLineSpacing: s.parts.tableLineSpacing, tableText: s.parts.tableText,
  };
}
