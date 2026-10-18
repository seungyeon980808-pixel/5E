/* ===== FIGURE STUDIO: bounded input plans, with no DOM or network ===== */
export const FIGURE_STYLES = Object.freeze({
  exam: { label: '시험지 흑백', strokeWidth: 0.22, fillLevel: 255, labelSize: 2.8,
    prompt: '흰 배경에 검정 선으로 표현한 시험용 과학 도식. 불필요한 장식과 명암을 줄이고 라벨을 읽기 쉽게 배치한다.' },
  soft: { label: '학습지 회색', strokeWidth: 0.2, fillLevel: 242, labelSize: 2.8,
    prompt: '흰 배경, 검정 외곽선과 옅은 중성 회색 면을 사용한 학습지용 과학 도식.' },
  bold: { label: '굵은 선', strokeWidth: 0.4, fillLevel: 255, labelSize: 3,
    prompt: '흰 배경에 선명하고 굵은 검정 선을 사용한 과학 도식. 축소해도 구조를 구분하기 쉽게 표현한다.' },
});

export function parseFlowSteps(text) {
  const steps = String(text).split(/\r?\n|\s*(?:→|->)\s*/).map(s => s.trim()).filter(Boolean);
  if (steps.length < 2) throw new Error('과정 두 개 이상을 한 줄에 하나씩 입력해 주세요.');
  if (steps.length > 12) throw new Error('한 흐름도에는 최대 12개 과정을 넣을 수 있습니다. 나누어서 만들어 주세요.');
  if (steps.some(s => [...s].length > 60)) throw new Error('각 과정은 60자 이내로 적어 주세요.');
  return steps;
}

function splitRow(line, separator) {
  const cells = []; let cell = '', quoted = false, closed = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted) { quoted = false; closed = true; }
      else if (!cell.trim() && !closed) quoted = true;
      else throw new Error('따옴표 위치를 확인해 주세요.');
    } else if (ch === separator && !quoted) { cells.push(cell.trim()); cell = ''; closed = false; }
    else { if (closed && ch.trim()) throw new Error('따옴표 뒤에는 구분자가 필요합니다.'); cell += ch; }
  }
  if (quoted) throw new Error('닫히지 않은 따옴표가 있습니다.');
  cells.push(cell.trim()); return cells;
}
const NUMERIC = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
function numberCell(cell) {
  const value = cell.replace(/^(\+|-)?(\d{1,3}(?:,\d{3})+)(\.\d+)?$/, (_, sign = '', digits, decimal = '') => sign + digits.replaceAll(',', '') + decimal);
  return NUMERIC.test(value) && Number.isFinite(Number(value)) ? Number(value) : null;
}

export function parsePlotTable(text) {
  const rows = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).map((line, i) => ({ line: line.trim(), number: i + 1 })).filter(r => r.line);
  if (!rows.length) throw new Error('x, y 두 열의 데이터를 입력해 주세요.');
  const first = rows[0].line;
  const sep = first.includes('\t') ? '\t' : first.includes(';') ? ';' : first.includes(',') ? ',' : null;
  let labels = null; const points = [];
  for (const [index, row] of rows.entries()) {
    let cells;
    try { cells = sep ? splitRow(row.line, sep) : row.line.split(/\s+/); }
    catch (error) { throw new Error(`${row.number}행: ${error.message}`); }
    if (cells.length !== 2 || cells.some(c => !c)) throw new Error(`${row.number}행에 비어 있지 않은 두 열이 필요합니다.`);
    const values = cells.map(numberCell);
    if (index === 0 && values.every(v => v === null) && cells.every(c => !/^[+-]?[\d.]/.test(c))) {
      if (cells.some(c => [...c].length > 40)) throw new Error('축 이름은 40자 이내로 적어 주세요.');
      labels = cells; continue;
    }
    if (values.some(v => v === null)) throw new Error(`${row.number}행에 숫자가 아닌 값이 있습니다. 빈칸·단위·오타를 확인해 주세요.`);
    points.push({ x: values[0], y: values[1] });
  }
  if (points.length < 2) throw new Error('숫자 데이터가 두 행 이상 필요합니다.');
  if (points.length > 1000) throw new Error('미리보기는 1,000행까지 지원합니다. 데이터를 나누어 넣어 주세요.');
  return { points, labels: labels || ['x', 'y'] };
}

export function buildFlowchart(steps, { layout = 'vertical', style = 'exam', artboard = { w: 90, h: 60 }, makeId = i => `flow_${i}`, layerId = 1, order = 0 } = {}) {
  if (!Array.isArray(steps) || steps.length < 2 || steps.length > 12 || steps.some(s => typeof s !== 'string' || !s.trim() || [...s].length > 60)) throw new Error('과정 입력을 확인해 주세요.');
  if (!['vertical', 'horizontal'].includes(layout) || !FIGURE_STYLES[style]) throw new Error('배치와 스타일을 확인해 주세요.');
  if (![artboard.w, artboard.h].every(n => Number.isFinite(n) && n >= 30 && n <= 200)) throw new Error('아트보드 크기를 30~200mm로 설정해 주세요.');
  const preset = FIGURE_STYLES[style], vertical = layout === 'vertical';
  const available = (vertical ? artboard.h : artboard.w) - 12;
  const gap = Math.min(5, available / (steps.length * 3));
  const along = Math.min(vertical ? 13 : 42, (available - gap * (steps.length - 1)) / steps.length);
  const width = vertical ? Math.min(64, artboard.w - 12) : along;
  const chars = Math.floor((width - 5) / preset.labelSize);
  if (along < 7 || chars < 2) throw new Error('과정이 많아 글자가 작아집니다. 배치 방향을 바꾸거나 아트보드를 늘려 주세요.');
  const labels = steps.map(step => {
    const charsOfStep = [...step], lines = [];
    for (let i = 0; i < charsOfStep.length; i += chars) lines.push(charsOfStep.slice(i, i + chars).join(''));
    return lines.join('\n');
  });
  const maxLines = Math.max(...labels.map(s => s.split('\n').length));
  const height = vertical ? along : Math.max(12, maxLines * preset.labelSize * 1.25 + 4);
  if (maxLines * preset.labelSize * 1.25 + 3 > height || height > artboard.h - 12) throw new Error('상자에 글자가 들어가지 않습니다. 과정 문구를 줄이거나 아트보드를 늘려 주세요.');
  const total = steps.length * along + (steps.length - 1) * gap;
  const boxes = steps.map((_, i) => ({
    id: makeId(i), type: 'rect', x: vertical ? -width / 2 : -total / 2 + i * (along + gap),
    y: vertical ? -total / 2 + i * (along + gap) : -height / 2, w: width, h: height,
    rotation: 0, strokeLevel: 0, strokeWidth: preset.strokeWidth, fillLevel: preset.fillLevel, fillNone: false,
    labelInner: labels[i], labelInnerType: 'label', labelOuter: '', labelSize: preset.labelSize,
    locked: false, positionLocked: false, layerId, order: order + i * 2,
  }));
  const objects = [];
  boxes.forEach((box, i) => {
    objects.push(box);
    const next = boxes[i + 1]; if (!next) return;
    objects.push({ id: makeId(steps.length + i), type: 'line',
      p1: vertical ? { x: 0, y: box.y + height } : { x: box.x + width, y: 0 },
      p2: vertical ? { x: 0, y: next.y } : { x: next.x, y: 0 },
      lineMode: 'arrow', lineStyle: 'solid', arrowHead: 'end', arrowVariant: 'right',
      rotation: 0, strokeLevel: 0, strokeWidth: preset.strokeWidth,
      dashLength: 0, dashGap: 0, locked: false, positionLocked: false, layerId, order: order + i * 2 + 1 });
  });
  return objects;
}
