import { FIGURE_STYLES, parseFlowSteps, parsePlotTable, buildFlowchart } from './figure-studio-model.js?v=1.7.0-four-session-integration';
import { planDataPlot } from './data-plot.js?v=1.7.0-four-session-integration';
import { renderObject } from './render.js?v=1.7.0-four-session-integration';
import { nextObjectId } from './tools/id.js?v=1.7.0-four-session-integration';
import { rebuildGroups } from './transform.js?v=1.7.0-four-session-integration';

const NS = 'http://www.w3.org/2000/svg';
const EXAMPLES = {
  flow: '문제 인식\n가설 설정\n탐구 수행\n결론 도출',
  plot: '시간(s)\t이동 거리(m)\n0\t0\n1\t2.1\n2\t4.0\n3\t6.2\n4\t8.1',
};
const COPY = {
  flow: { label: '과정 순서', hint: '한 줄에 한 과정씩 입력하세요. → 또는 ->로 이어 적어도 됩니다. 최대 12개.', action: '편집기에 넣기' },
  plot: { label: 'x, y 데이터', hint: '엑셀 두 열 또는 CSV를 붙여넣으세요. 첫 행은 축 이름으로 쓸 수 있습니다. 최대 1,000행.', action: '편집기에 넣기' },
};

// Uses the existing renderer and object schema; previews never touch document state.
// 10-22: 그림 화면 아래 막대 「도식 만들기」 단추는 없앴다. 일러스트(참고 이미지 포함)는 AI 이미지/그래프의 「이미지 생성」이 맡고,
// 흐름도·데이터 그래프(AI 없음)는 ⌘K 명령 팔레트 「흐름도 만들기」「데이터 그래프 만들기」로 이 작은 창을 연다.
export function initFigureStudio(state, { onInserted } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'figure-studio'; dialog.id = 'figure-studio';
  dialog.setAttribute('aria-labelledby', 'fs-title');
  dialog.innerHTML = `
    <header class="fs-head"><div><h2 id="fs-title">흐름도·데이터 그래프</h2><p>입력한 값으로만 만들고, 5E에서 이어서 편집하세요.</p></div>
      <button type="button" data-fs-close aria-label="제작 창 닫기">닫기</button></header>
    <div class="fs-body"><section class="fs-controls" aria-label="제작 설정">
      <div class="fs-modes" role="group" aria-label="도식 종류">
        <button type="button" data-fs-mode="flow" aria-pressed="true">흐름도</button>
        <button type="button" data-fs-mode="plot" aria-pressed="false">데이터 그래프</button>
      </div>
      <div class="fs-field-head"><label for="fs-input" id="fs-label"></label><button type="button" data-fs-example>예시 넣기</button></div>
      <textarea id="fs-input" spellcheck="false" aria-describedby="fs-hint fs-error" maxlength="60000"></textarea>
      <p id="fs-hint" class="fs-hint"></p>
      <div data-fs-flow hidden><label for="fs-layout">배치 방향</label><select id="fs-layout"><option value="vertical">위에서 아래로</option><option value="horizontal">왼쪽에서 오른쪽으로</option></select></div>
      <label class="fs-check" data-fs-plot hidden><input id="fs-connect" type="checkbox" checked> 측정점 연결하기</label>
      <fieldset class="fs-styles"><legend>표현 스타일</legend><div class="fs-presets" role="group" aria-label="표현 스타일">
        ${Object.entries(FIGURE_STYLES).map(([key, value]) => `<button type="button" data-fs-style="${key}" aria-pressed="${key === 'exam'}">${value.label}</button>`).join('')}
      </div></fieldset>
      <p id="fs-error" class="fs-error" role="status" aria-live="polite"></p>
    </section><section class="fs-preview" aria-label="도식 미리보기">
      <div class="fs-preview-head"><strong>미리보기</strong><span data-fs-size></span></div>
      <div class="fs-paper-wrap"><div class="fs-empty" data-fs-empty></div><svg data-fs-svg role="img" aria-label="삽입할 도식" xmlns="${NS}" hidden></svg></div>
      <p class="fs-preview-note" data-fs-note></p>
    </section></div>
    <footer class="fs-footer"><span data-fs-footer></span><button type="button" data-fs-submit></button></footer>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const input = $('#fs-input'), error = $('#fs-error'), svg = $('[data-fs-svg]'), submit = $('[data-fs-submit]');
  let mode = 'flow', style = 'exam';
  const drafts = { flow: '', plot: '' };
  let returnFocus = null, frame = null;

  function plan(makeId = i => `fs-preview-${i}`) {
    const snapshot = state.get();
    if (mode === 'flow') return buildFlowchart(parseFlowSteps(input.value), {
      layout: $('#fs-layout').value, style, artboard: snapshot.artboard,
      layerId: snapshot.activeLayerId, order: snapshot.objects.length, makeId,
    });
    const table = parsePlotTable(input.value);
    let index = 0;
    const result = planDataPlot(table.points, { connect: $('#fs-connect').checked, reuseSelected: false,
      center: { x: 0, y: 0 }, labels: table.labels,
      size: { w: snapshot.artboard.w - 24, h: snapshot.artboard.h - 24 },
    }, snapshot, () => makeId(index++));
    if (!result.ok) throw new Error(result.error);
    for (const obj of result.objects) {
      obj.strokeWidth = FIGURE_STYLES[style].strokeWidth;
      if (obj.type === 'coordplane') { obj.labelType = 'label'; obj.axisLabelSize = FIGURE_STYLES[style].labelSize; obj.showGrid = style === 'soft'; }
    }
    return result.objects;
  }
  function updatePreview() {
    frame = null;
    const { w, h } = state.get().artboard;
    $('[data-fs-size]').textContent = `${w} × ${h} mm`;
    svg.replaceChildren(); svg.setAttribute('hidden', ''); $('[data-fs-empty]').hidden = false;
    input.removeAttribute('aria-invalid'); error.textContent = '';
    submit.disabled = false;
    try {
      const objects = plan();
      svg.setAttribute('viewBox', `${-w / 2} ${-h / 2} ${w} ${h}`);
      svg.style.aspectRatio = `${w} / ${h}`;
      for (const object of objects) { const el = renderObject(object, objects); if (el) svg.append(el); }
      svg.removeAttribute('hidden'); $('[data-fs-empty]').hidden = true;
      $('[data-fs-note]').textContent = `${objects.length}개 편집 객체 · 묶어서 삽입합니다. 개별 수정은 그룹을 해제하세요.`;
    } catch (cause) {
      submit.disabled = true;
      $('[data-fs-empty]').textContent = '입력하면 도식을 미리 볼 수 있습니다.';
      $('[data-fs-note]').textContent = '입력한 값으로만 도식을 만듭니다.';
      if (input.value.trim()) { error.textContent = cause.message; input.setAttribute('aria-invalid', 'true'); }
    }
  }
  function schedulePreview() { if (frame === null) frame = requestAnimationFrame(updatePreview); }
  function setMode(next) {
    drafts[mode] = input.value; mode = next; input.value = drafts[mode];
    for (const button of dialog.querySelectorAll('[data-fs-mode]')) button.setAttribute('aria-pressed', String(button.dataset.fsMode === mode));
    for (const kind of ['flow', 'plot']) $(`[data-fs-${kind}]`).hidden = kind !== mode;
    $('#fs-label').textContent = COPY[mode].label; $('#fs-hint').textContent = COPY[mode].hint;
    input.placeholder = EXAMPLES[mode]; submit.textContent = COPY[mode].action;
    $('[data-fs-footer]').textContent = '삽입 후 PNG·SVG로 내보낼 수 있습니다.';
    updatePreview();
  }
  submit.addEventListener('click', () => {
    if (submit.disabled) return;
    try {
      const objects = plan(() => nextObjectId()), groupId = nextObjectId();
      state.update(snapshot => {
        snapshot.undoStack.push(structuredClone(snapshot.objects)); snapshot.redoStack = [];
        for (const object of objects) { object.groupId = groupId; object.order = snapshot.objects.length; snapshot.objects.push(object); }
        snapshot.selectedIds = objects.map(object => object.id); snapshot.targetedId = null; snapshot.activeTool = 'V'; rebuildGroups(snapshot);
      });
      dialog.close(); onInserted?.(); document.getElementById('canvas')?.focus();
    } catch (cause) { error.textContent = cause.message || '도식을 넣지 못했습니다. 다시 시도해 주세요.'; }
  });
  const open = (next = mode) => { returnFocus = document.activeElement; setMode(next === 'plot' ? 'plot' : 'flow'); if (!dialog.open) dialog.showModal(); input.focus(); };
  window.addEventListener('5e:figure-studio-open', event => open(event.detail?.mode));
  $('[data-fs-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => returnFocus?.focus());
  dialog.addEventListener('keydown', event => event.stopPropagation());
  $('[data-fs-example]').addEventListener('click', () => { input.value = EXAMPLES[mode]; drafts[mode] = input.value; updatePreview(); input.focus(); });
  input.addEventListener('input', () => {
    drafts[mode] = input.value;
    schedulePreview();
  });
  $('#fs-layout').addEventListener('change', updatePreview); $('#fs-connect').addEventListener('change', updatePreview);
  dialog.querySelectorAll('[data-fs-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.fsMode)));
  dialog.querySelectorAll('[data-fs-style]').forEach(button => button.addEventListener('click', () => {
    style = button.dataset.fsStyle;
    dialog.querySelectorAll('[data-fs-style]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    updatePreview();
  }));
  state.subscribe(() => { if (dialog.open) schedulePreview(); });
  setMode(mode);
  return { open };
}
