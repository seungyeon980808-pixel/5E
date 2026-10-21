// Han/글 keys are routed only from the document input. Physical key codes also
// work with Korean layouts and macOS Option-generated characters.
const installed = new WeakSet();
const letters = event => /^Key[A-Z]$/.test(event.code || '')
  ? event.code.slice(3).toLowerCase() : event.key.toLowerCase();
const altShift = {
  n:'format:char-spacing-decrease', w:'format:char-spacing-increase',
  j:'format:char-ratio-decrease', k:'format:char-ratio-increase',
  e:'format:font-size-increase', r:'format:font-size-decrease',
  b:'format:bold', u:'format:underline', i:'format:italic',
  p:'format:superscript', s:'format:subscript',
  a:'format:line-spacing-decrease', z:'format:line-spacing-increase',
};
const controlShift = { l:'format:align-left', c:'format:align-center',
  r:'format:align-right', m:'format:align-justify' };
const chords = { t:'table:create', m:'insert:equation', i:'insert:image' };
// 문단 들여쓰기·여백: 첫 줄은 한 글자, 여백은 1pt씩 (한컴 한글 단축키 일람).
const paragraphSteps = {
  'para:indent-in':{ indent:1 }, 'para:indent-out':{ indent:-1 },
  'para:left-increase':{ left:1 }, 'para:left-decrease':{ left:-1 },
  'para:right-increase':{ right:1 }, 'para:right-decrease':{ right:-1 },
  'para:margins-increase':{ left:1, right:1 }, 'para:margins-decrease':{ left:-1, right:-1 },
};
const controlF = { f5:'para:indent-out', f6:'para:indent-in', f7:'para:margins-decrease', f8:'para:margins-increase' };
const controlAltF = { f5:'para:left-decrease', f6:'para:left-increase', f7:'para:right-increase', f8:'para:right-decrease' };
// Control only: Command+Shift combinations stay with the browser on macOS.
const controlShiftParagraph = { i:'para:indent-in', o:'para:indent-out', g:'para:left-increase',
  e:'para:left-decrease', d:'para:right-increase', f:'para:right-decrease' };

export const EXAM_SHORTCUTS = [
  ['모양 복사·적용','Alt+C'], ['자간 줄이기 / 늘리기','Alt+Shift+N / W'],
  ['장평 줄이기 / 늘리기','Alt+Shift+J / K'], ['글씨 크게 / 작게','Alt+Shift+E / R'],
  ['굵게 / 밑줄 / 기울임','Ctrl+B / U / I'], ['위 첨자 / 아래 첨자','Alt+Shift+P / S'],
  ['글자 모양 / 문단 모양','Alt+L / T'], ['줄 간격 줄이기 / 늘리기','Alt+Shift+A / Z'],
  ['왼쪽 / 가운데 / 오른쪽 / 양쪽 정렬','Ctrl+Shift+L / C / R / M'],
  ['빠른 내어쓰기','본문 Shift+Tab · 셀 안 Ctrl+Shift+Tab'],
  ['첫 줄 들여쓰기 / 내어쓰기 (한 글자)','Ctrl+F6 / F5 · Ctrl+Shift+I / O'],
  ['왼쪽 여백 늘이기 / 줄이기 (1pt)','Ctrl+Alt+F6 / F5 · Ctrl+Shift+G / E'],
  ['오른쪽 여백 늘이기 / 줄이기 (1pt)','Ctrl+Alt+F7 / F8 · Ctrl+Shift+D / F'],
  ['양쪽 여백 늘이기 / 줄이기 (1pt)','Ctrl+F8 / F7'],
  ['한 수준 증가 / 감소 (개요·문단 번호)','Ctrl+숫자패드 − / +'],
  ['강제 줄바꿈 / 쪽 나누기','Shift+Enter / Ctrl+Enter'],
  ['문자표 / 찾아 바꾸기','Ctrl+F10 / Ctrl+H'],
  ['표 / 수식 / 그림 넣기','Ctrl+N → T / M / I'],
  ['셀 선택 / 범위 확장','표 안 F5 / Shift+F5'],
  ['다음 셀 / 이전 셀','Tab / Shift+Tab'], ['행 추가 / 삭제','표 안 Ctrl+Enter / Ctrl+Backspace'],
  ['셀 합치기 / 나누기','셀 선택 후 M / S'], ['셀 높이 / 너비 맞추기','셀 선택 후 H / W'],
  ['선택한 셀 크기','셀 선택 후 Shift+방향키'], ['줄·칸 전체 크기','셀 선택 후 Ctrl+방향키'],
  ['표 크기 유지하며 줄·칸 크기','셀 선택 후 Alt+방향키'], ['표 빠져나오기','Shift+Esc'],
];

export function documentShortcut(event, { inCell = false, cellSelection = false } = {}) {
  const key = letters(event), control = event.ctrlKey || event.metaKey;
  if (event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (!event.altKey && controlF[key]) return controlF[key];
    if (event.altKey && controlAltF[key]) return controlAltF[key];
    if (!event.altKey && event.code === 'NumpadSubtract') return 'level-increase';
    if (!event.altKey && event.code === 'NumpadAdd') return 'level-decrease';
  }
  if (event.ctrlKey && !event.metaKey && event.shiftKey && !event.altKey && controlShiftParagraph[key])
    return controlShiftParagraph[key];
  if (event.altKey && event.shiftKey && !control) return altShift[key] || null;
  if (control && event.shiftKey && !event.altKey) {
    if (key === 'tab' && inCell) return 'hanging-indent';
    return controlShift[key] || null;
  }
  if (control && !event.shiftKey && !event.altKey) {
    if ({ b:'format:bold', u:'format:underline', i:'format:italic' }[key])
      return { b:'format:bold', u:'format:underline', i:'format:italic' }[key];
    if (key === 'n') return 'chord';
    if (key === 'h') return 'edit:find-replace';
    if (key === 'f10') return 'insert:symbols';
    if (key === 'enter') return inCell ? 'table:insert-row-below' : 'page:break';
    // Mac의 ⌘Backspace는 「줄 앞까지 지우기」 — 표 줄 지우기는 Ctrl+Backspace만(M3)
    if (key === 'backspace' && inCell && event.ctrlKey) return 'table:delete-row';
  }
  if (!control && !event.altKey && !event.shiftKey) {
    if (cellSelection && key === 'h') return 'equal-height';
    if (cellSelection && key === 'w') return 'equal-width';
    if (cellSelection && key === 'm') return 'table:cell-merge';
    if (cellSelection && key === 's') return 'table:cell-split';
  }
  if (!control && event.altKey && !event.shiftKey)
    return { c:'edit:format-copy', l:'format:char-shape', t:'format:para-shape' }[key] || null;
  if (!control && !event.altKey && event.shiftKey) {
    if (key === 'f5' && inCell) return 'extend-cells';
    if (key === 'escape' && inCell) return 'exit-table';
  }
  // One-stroke alternatives for users who prefer not to use a chord.
  if (event.ctrlKey && !event.metaKey && event.altKey && !event.shiftKey && key === 'm') return 'insert:equation';
  if (event.ctrlKey && !event.metaKey && event.altKey && !event.shiftKey && key === 'i') return 'insert:image';
  return null;
}

// Plans use native HWP dimensions, not the current zoom or screen rectangles.
export function cellResizePlan(cells, selected, { axis, mode, delta = 0 }) {
  const size = axis === 'width' ? 'width' : 'height';
  const coordinate = axis === 'width' ? 'col' : 'row';
  const span = axis === 'width' ? 'colSpan' : 'rowSpan';
  const chosen = cells.filter(cell => selected.includes(cell.cellIdx));
  if (!chosen.length) return [];
  const steps = new Map();
  if (mode === 'equal') {
    const average = chosen.reduce((sum, cell) => sum + cell[size], 0) /
      chosen.reduce((sum, cell) => sum + cell[span], 0);
    for (const cell of chosen) steps.set(cell.cellIdx, Math.round(average * cell[span]) - cell[size]);
  } else if (mode === 'cell') {
    for (const cell of chosen) steps.set(cell.cellIdx, delta);
  } else {
    const tracks = new Set();
    for (const cell of chosen) for (let n = cell[coordinate]; n < cell[coordinate] + cell[span]; n++) tracks.add(n);
    let neighbor = null;
    if (mode === 'fixed') {
      const start = Math.min(...tracks), end = Math.max(...tracks) + 1;
      const count = Math.max(...cells.map(cell => cell[coordinate] + cell[span]));
      neighbor = end < count ? end : start > 0 ? start - 1 : null;
      if (neighbor === null) return [];
    }
    for (const cell of cells) {
      let change = 0;
      for (let n = cell[coordinate]; n < cell[coordinate] + cell[span]; n++) {
        if (tracks.has(n)) change += delta;
        if (n === neighbor) change -= delta * tracks.size;
      }
      if (change) steps.set(cell.cellIdx, change);
    }
  }
  // A protected cell or a too-small compensating neighbor blocks the whole
  // operation, so a fixed-size edit cannot resize only half of its boundary.
  if (cells.some(cell => steps.has(cell.cellIdx) &&
      (cell.cellProtect || cell[size] + steps.get(cell.cellIdx) < 100))) return [];
  return [...steps].filter(([, change]) => change !== 0)
    .map(([cellIdx, change]) => ({ cellIdx, [size + 'Delta']:change }));
}

function resizeSelected(bridge, axis, mode, delta) {
  const input = bridge.input, block = input.getSelectedCellBlock();
  if (!block) return false;
  const w = bridge.wasm, path = block.cellPath?.length > 1 ? JSON.stringify(block.cellPath) : null;
  const count = (path ? w.getTableDimensionsByPath(block.sec, block.ppi, path)
    : w.getTableDimensions(block.sec, block.ppi, block.ci)).cellCount;
  const cells = Array.from({ length:count }, (_, cellIdx) => {
    const cellPath = block.cellPath?.map((step, index) => index === block.cellPath.length - 1
      ? { ...step, cellIndex:cellIdx, cellParaIndex:0 } : step);
    const info = path ? w.getCellInfoByPath(block.sec, block.ppi, JSON.stringify(cellPath))
      : w.getCellInfo(block.sec, block.ppi, block.ci, cellIdx);
    const props = path ? w.getCellPropertiesByPath(block.sec, block.ppi, path, cellIdx)
      : w.getCellProperties(block.sec, block.ppi, block.ci, cellIdx);
    return { cellIdx, ...info, ...props };
  });
  const changes = cellResizePlan(cells, block.cellIndices, { axis, mode, delta });
  if (!changes.length) return false;
  const selection = input.cursor.captureCellSelection();
  bridge.transaction('shortcut-' + mode + '-' + axis, () => {
    const result = path ? w.resizeTableCellsByPath(block.sec, block.ppi, path, changes)
      : w.resizeTableCells(block.sec, block.ppi, block.ci, changes);
    if (result?.ok === false) throw new Error(result.error || '셀 크기를 바꾸지 못했습니다.');
    return true;
  });
  if (selection) input.cursor.restoreCellSelection(selection);
  input.updateCellSelection();
  return true;
}

// Studio reports paragraph lengths in px and writes them as px × 150 (1pt = 200).
const ptOf = px => Math.round((px || 0) * 0.75 * 10) / 10;
const paragraphUnits = pt => Math.round(pt * 200);
export function paragraphStepPlan(para, fontSize, { indent = 0, left = 0, right = 0 }) {
  const props = {};
  if (indent) props.indent = paragraphUnits(ptOf(para.indent) + indent * (fontSize || 1000) / 100);
  if (left) props.marginLeft = paragraphUnits(Math.max(0, ptOf(para.marginLeft) + left));
  if (right) props.marginRight = paragraphUnits(Math.max(0, ptOf(para.marginRight) + right));
  const current = { indent:para.indent, marginLeft:para.marginLeft, marginRight:para.marginRight };
  for (const name of Object.keys(props))
    if (props[name] === paragraphUnits(ptOf(current[name]))) delete props[name];
  return Object.keys(props).length ? props : null;
}

// Like Han/글, each selected paragraph moves from its own value in one undo step.
function stepParagraph(bridge, input, step) {
  const fontSize = input.getCharProperties()?.fontSize;
  const separate = !input.cursor.isInHeaderFooter() && !input.cursor.isInFootnote();
  const targets = separate ? input.getParaFormatTargetsAtCursor?.() || [] : [];
  if (targets.length > 1) {
    const w = bridge.wasm;
    const plans = targets.map(t => [t, paragraphStepPlan(t.kind === 'cell'
      ? w.getCellParaPropertiesAt(t.sec, t.parentPara, t.controlIdx, t.cellIdx, t.cellParaIdx)
      : w.getParaPropertiesAt(t.sec, t.para), fontSize, step)]).filter(([, props]) => props);
    if (!plans.length) return false;
    bridge.transaction('paragraph-step', () => {
      for (const [t, props] of plans) {
        const json = JSON.stringify(props);
        if (t.kind === 'cell') w.applyParaFormatInCell(t.sec, t.parentPara, t.controlIdx, t.cellIdx, t.cellParaIdx, json);
        else w.applyParaFormat(t.sec, t.para, json);
      }
      return true;
    });
    input.emitCursorFormatState?.();
    return true;
  }
  const props = paragraphStepPlan(input.getParaProperties(), fontSize, step);
  if (!props) return false;
  input.applyParaFormat(props);
  return true;
}

// 문단 번호·글머리표는 수준 번호를, 개요는 기존 개요 스타일 명령을 사용한다.
function stepLevel(input, action) {
  const para = input.getParaProperties();
  if (['Number','Bullet'].includes(para.headType)) {
    const level = Math.min(6, Math.max(0, (para.paraLevel || 0) + (action === 'level-increase' ? -1 : 1)));
    if (level === (para.paraLevel || 0)) return false;
    input.applyParaFormat({ paraLevel:level });
    return true;
  }
  const before = input.getCurrentStyleId();
  input.dispatcher.dispatchWithResult('format:' + action);
  return input.getCurrentStyleId() !== before;
}

function openCaretCharShape(bridge, input) {
  const dispatcher = input.dispatcher, at = structuredClone(input.getCursorPosition()), generation = bridge.generation;
  // Studio's dialog expects a selected range. Supply a collapsed range while
  // applying its result through pending typing format at the original caret.
  const target = new Proxy(input, { get(object, name) {
    if (name === 'getSelection') return () => ({ start:at, end:at });
    if (name === 'applyCharPropsToRange') return (_start, _end, props) => {
      if (bridge.generation !== generation || JSON.stringify(input.getCursorPosition()) !== JSON.stringify(at)) return;
      input.applyCharFormat(props);
    };
    const value = Reflect.get(object, name);
    return typeof value === 'function' ? value.bind(object) : value;
  } });
  const services = new Proxy(dispatcher.services, { get(object, name) {
    if (name === 'getInputHandler') return () => target;
    return Reflect.get(object, name);
  } });
  dispatcher.registry.get('format:char-shape').execute(services);
  bridge.deps.eventBus.emit('command-state-changed');
}

export function installDocumentShortcuts(bridge) {
  const doc = bridge.editor.element.contentDocument;
  if (installed.has(doc)) return;
  installed.add(doc);
  let pending = null;
  const clear = () => { pending = null; };
  const notify = message => bridge.onChange?.(new Error(message));
  const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  doc.addEventListener('focusout', clear, true);
  doc.addEventListener('compositionstart', clear, true);
  bridge.deps.eventBus.on('document-swapped', clear);
  doc.addEventListener('keydown', event => {
    const input = bridge.input, cursor = input?.cursor;
    if (event.target !== input?.textarea || !cursor || event.defaultPrevented ||
        bridge.editor.element.ownerDocument.querySelector('#rhwp-exam-workspace[aria-busy="true"]')) { clear(); return; }
    const context = { inCell:cursor.isInCell() && !cursor.isInTextBox(), cellSelection:cursor.isInCellSelectionMode() };
    const blockLetter = context.cellSelection && !input.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
      ['h','w','m','s'].includes(letters(event)) ? documentShortcut(event, context) : null;
    if ((event.isComposing || event.keyCode === 229 || input.isComposing) && !blockLetter) {
      clear();
      // Leave ordinary composing text to the IME, but do not let Studio's
      // fallback shortcuts mutate a half-composed selection.
      if (documentShortcut(event, context)) consume(event);
      return;
    }
    // Korean cell-block letters can start an IME sequence despite preventDefault.
    // Reuse Studio's guard to suppress that sequence and its trailing input.
    if (blockLetter) input._cellBlockLetterImeGuard?.arm(event);
    if (input.imagePlacementMode || input.textboxPlacementMode || input.connectorDrawingMode || input.polygonDrawingMode || input.formOverlay) { clear(); return; }
    if (['Control','Meta','Alt','Shift'].includes(event.key)) return;
    let action = blockLetter;
    if (pending) {
      const valid = pending.input === input && pending.generation === bridge.generation && Date.now() < pending.expires;
      clear();
      if (event.key === 'Escape') { consume(event); return; }
      if (valid && !event.altKey && !event.shiftKey) action = chords[letters(event)];
    }
    action ||= documentShortcut(event, context);
    if (action === 'chord') {
      consume(event);
      for (const name of ['_pendingChordK','_pendingChordM','_pendingChordG','_pendingChordV']) input[name] = false;
      if (!event.repeat) pending = { input, generation:bridge.generation, expires:Date.now() + 2000 };
      return;
    }
    // 구조 잠금(rhwp-exam-layout-lock.js)이 켜져 있으면 칸 크기·맞춤은 바꾸지 않는다. 줄·칸·합치기는 명령 전달기에서 막힌다.
    const structureLocked = () => {
      if (!input.examTableLayoutLocked) return false;
      if (input.examStructureNotice) input.examStructureNotice('구조 잠금 중 · 표·그림의 크기나 틀은 구조 잠금을 풀고 바꾸세요. 글은 그대로 고칠 수 있습니다.');
      return true;
    };
    if (context.cellSelection && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key) &&
        (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)) {
      consume(event);
      if (structureLocked()) return;
      const axis = ['ArrowLeft','ArrowRight'].includes(event.key) ? 'width' : 'height';
      const mode = event.altKey ? 'fixed' : event.ctrlKey || event.metaKey ? 'track' : 'cell';
      try { if (!resizeSelected(bridge, axis, mode, ['ArrowRight','ArrowDown'].includes(event.key) ? 300 : -300))
        notify('보호된 셀이나 최소 크기를 확인하세요. 표 크기 고정은 옆 줄·칸이 필요합니다.'); }
      catch (error) { notify(error.message); }
      return;
    }
    if (!action) return;
    consume(event);
    if (event.repeat && ['extend-cells','exit-table'].includes(action)) return;
    try {
      if (['table:insert-row-below','table:delete-row','table:cell-merge','table:cell-split'].includes(action)) {
        const at = input.getCursorPosition();
        if ((at.cellPath?.length || 0) > 1) { notify('중첩 표의 줄·셀 구조는 현재 단축키로 변경할 수 없습니다.'); return; }
        const w = bridge.wasm, count = w.getTableDimensions(at.sectionIndex, at.parentParaIndex, at.controlIndex).cellCount;
        const anchor = w.getCellInfo(at.sectionIndex, at.parentParaIndex, at.controlIndex, at.cellIndex);
        const selected = ['table:cell-merge','table:cell-split'].includes(action) ? input.getSelectedCellBlock()?.cellIndices : null;
        for (let cellIdx = 0; cellIdx < count; cellIdx++) {
          const info = w.getCellInfo(at.sectionIndex, at.parentParaIndex, at.controlIndex, cellIdx);
          const affected = selected ? selected.includes(cellIdx) : info.row <= anchor.row && info.row + info.rowSpan > anchor.row;
          if (affected && w.getCellProperties(at.sectionIndex, at.parentParaIndex, at.controlIndex, cellIdx).cellProtect) {
            notify('보호된 셀이 포함된 줄·셀은 변경할 수 없습니다.'); return;
          }
        }
      }
      if (action.startsWith('equal-')) {
        if (structureLocked()) return;
        if (!resizeSelected(bridge, action === 'equal-width' ? 'width' : 'height', 'equal'))
          notify('크기를 맞출 여러 셀을 선택하세요. 보호된 셀은 변경할 수 없습니다.');
      } else if (action === 'extend-cells') {
        if (!context.cellSelection) cursor.enterCellSelectionMode();
        if (cursor.getCellSelectionPhase() === 1) cursor.advanceCellSelectionPhase();
        input.caret.hide(); input.selectionRenderer.clear(); input.updateCellSelection();
      } else if (action === 'exit-table') {
        input.exitCellSelectionMode(); cursor.exitTable(1); input.updateCaret(); input.focus();
      } else if (paragraphSteps[action]) {
        if (!stepParagraph(bridge, input, paragraphSteps[action])) notify('여백을 더 줄일 수 없습니다.');
      } else if (action === 'level-increase' || action === 'level-decrease') {
        if (!stepLevel(input, action)) notify('개요나 문단 번호가 있는 문단에서 수준을 바꿀 수 있습니다.');
      } else if (action === 'hanging-indent') {
        if (!input.applyHangingIndentAtCursor()) notify('이 위치에서는 빠른 내어쓰기를 사용할 수 없습니다.');
      } else if (!input.dispatcher?.isEnabled(action)) {
        notify('이 위치에서는 해당 단축키를 사용할 수 없습니다. 본문이나 편집 가능한 셀을 선택하세요.');
      } else if (action === 'format:char-shape' && !input.getSelection() && !context.cellSelection) {
        openCaretCharShape(bridge, input);
      } else {
        const result = input.dispatcher.dispatchWithResult(action);
        if (!result.ok) notify(result.message || '단축키를 실행하지 못했습니다.');
      }
    } catch (error) { notify(error.message); }
  }, true);
}
