import { state } from '../state.js?v=1.7.0-four-session-integration';
import { resolveAIModelSelection } from '../ai-model-capabilities.js?v=1.7.0-four-session-integration';
import { IndexedDBOutputCacheBackend } from '../ai-output-cache-store.js?v=1.7.0-four-session-integration';
import { createTaskBridge } from '../ai-task-workspaces.js?v=1.7.0-four-session-integration';
import { registerEscapeLayer } from '../escape-layers.js?v=1.7.0-four-session-integration';
import { validateGraphPlan } from './reconstruction-contract.js?v=1.7.0-four-session-integration';
import { graphSourceHash, createGraphReconstructionWorkflow } from './reconstruction-workflow.js?v=1.7.0-four-session-integration';
import { buildNativeGraph, insertNativeGraph } from './native-graph.js?v=1.7.0-four-session-integration';
import { renderCoordplane, renderFuncgraph } from '../render/coordplane.js?v=1.7.0-four-session-integration';
import { ensureEmbeddedFonts } from '../svg-export.js?v=1.7.0-four-session-integration';
import { makeFillPattern } from '../render/fill.js?v=1.7.0-four-session-integration';
import { openGraphModal } from './graph-modal.js?v=1.7.0-four-session-integration';
import { summarizeAnalyticGraph } from './analytic-summary.js?v=1.7.0-four-session-integration';
import { GRAPH_WORKBENCH_SELECTION } from './workbench-result.js?v=1.7.0-four-session-integration';
import { EXAM_STYLE } from './exam-style.js?v=1.7.0-four-session-integration';

const SVG_NS = 'http://www.w3.org/2000/svg';
let overlay, workflow, bridge, source, attachment, plan, catalog, selection, busy = false, uiEpoch = 0, opener, selectedFallback = false;
const byId = id => overlay.querySelector(`#gr-${id}`);
const message = text => { byId('status').textContent = text; };
const bindSource = value => ({ id: value.id, hash: value.hash, width: value.width, height: value.height });
const readDataUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file);
});
const decode = src => new Promise((resolve, reject) => {
  const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('이미지를 읽지 못했습니다.')); image.src = src;
});
const fallbackBlocked = () => !selectedFallback && workflow?.snapshot()?.maxAttempts > 1 && workflow.snapshot().finalAttemptSucceeded === false;
function setBusy(value) {
  busy = value;
  for (const field of overlay.querySelectorAll('input,select,textarea,button')) field.disabled = value;
  byId('model').disabled = true; byId('effort').disabled = true;
  for (const button of byId('history').querySelectorAll('button')) button.disabled = value || button.dataset.unavailable === 'true';
  byId('cancel').disabled = false; byId('close').disabled = false;
  byId('cancel').hidden = !value;
  const checked = plan && source && validateGraphPlan(plan, { source: bindSource(source) });
  byId('insert').disabled = value || fallbackBlocked() || !checked?.ok || checked.blocked || !!overlay.querySelector(':invalid');
  byId('analyze').disabled = value || !source || !selection;
  byId('reanalyze').disabled = value || !source || !selection;
  byId('edit').disabled = byId('insert').disabled;
}
function renderPreview() {
  const preview = byId('preview'); preview.replaceChildren();
  const review = byId('review'); review.replaceChildren();
  if (!plan) { setBusy(busy); return; }
  const checked = validateGraphPlan(plan, { source: bindSource(source) });
  const summary = summarizeAnalyticGraph(plan);
  for (const line of summary.lines) { const li = document.createElement('li'); li.textContent = line; review.append(li); }
  for (const item of [...checked.errors.map(e => ({ reason: e.message })), ...checked.review.filter(item => !item.reason?.startsWith('식으로 바꾸지 못함'))]) {
    const li = document.createElement('li'); li.textContent = item.reason; review.append(li);
  }
  const frame = plan.source?.plotBox;
  const previewScale = frame?.w > 0 && frame?.h > 0 ? EXAM_STYLE.defaultWidth / frame.w : 1;
  const built = buildNativeGraph(plan, { stylePreset:'kice-v1', box: { x: 15, y: 15, w: frame?.w * previewScale, h: frame?.h * previewScale }, source: bindSource(source) });
  if (built.ok) {
    const svg = document.createElementNS(SVG_NS, 'svg'); svg.setAttribute('viewBox', '0 0 125 95'); svg.setAttribute('aria-label', '편집 그래프 미리보기'); svg.style.cssText = 'width:100%;height:270px;';
    const defs = document.createElementNS(SVG_NS, 'defs'); svg.append(defs);
    for (const object of built.objects) { const pattern = makeFillPattern(object); if (pattern) defs.append(pattern); }
    for (const object of [...built.objects.slice(1), built.objects[0]]) svg.append(object.type === 'coordplane' ? renderCoordplane(object) : renderFuncgraph(object));
    preview.append(svg);
    const bounds = svg.getBBox(), padding = 7;
    svg.setAttribute('viewBox', `${bounds.x - padding} ${bounds.y - padding} ${Math.max(1, bounds.width) + padding * 2} ${Math.max(1, bounds.height) + padding * 2}`);
  } else {
    const p = document.createElement('p'); p.textContent = checked.blocked ? '축 수치 또는 지원하지 않는 표현을 확인해 주세요.' : built.error; preview.append(p);
  }
  byId('insert').disabled = busy || fallbackBlocked() || !checked.ok || checked.blocked || !built.ok || !!overlay.querySelector(':invalid');
  byId('edit').disabled = byId('insert').disabled;
}
function editAxes() {
  const host = byId('axes'); host.replaceChildren();
  if (!plan) return;
  for (const axis of ['x', 'y', ...(plan.axes?.y2 ? ['y2'] : [])]) {
    const data = plan.axes?.[axis];
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      const warning = document.createElement('p'); warning.textContent = `${axis}축 데이터 형식이 잘못되었습니다. 축을 다시 분석해 주세요.`; warning.setAttribute('role', 'alert'); host.append(warning); continue;
    }
    const fieldset = document.createElement('fieldset'); fieldset.style.cssText = 'border:1px solid var(--border);padding:8px;margin:8px 0;';
    const legend = document.createElement('legend'); legend.textContent = `${axis}축`; fieldset.append(legend);
    for (const [key, label, type] of [['title', '제목', 'text'], ['unit', '단위', 'text'], ['min', '최솟값', 'number'], ['max', '최댓값', 'number'], ['step', '눈금 간격', 'number']]) {
      const wrap = document.createElement('label'); wrap.style.cssText = 'display:inline-flex;gap:5px;align-items:center;margin:4px;'; wrap.append(document.createTextNode(label));
      const input = document.createElement('input'); input.type = type; input.className = 'modal-input'; input.step = 'any'; input.style.width = type === 'number' ? '80px' : '120px'; input.value = data[key] ?? ''; input.setAttribute('aria-label', `${axis}축 ${label}`);
      input.addEventListener('change', () => {
        data[key] = type === 'number' ? (input.value.trim() === '' ? null : Number(input.value)) : input.value;
        if (type === 'number' && data.scale === 'unknown' && ['min', 'max', 'step'].every(k => Number.isFinite(data[k]))) data.scale = 'linear';
        reviewChanged();
      }); wrap.append(input); fieldset.append(wrap);
    }
    const direction = document.createElement('label'); direction.style.cssText = 'display:inline-flex;gap:5px;align-items:center;margin:4px;'; direction.append(document.createTextNode('제목 방향'));
    const orientation = document.createElement('select'); orientation.className = 'modal-input'; orientation.setAttribute('aria-label', `${axis}축 제목 방향`);
    for (const [value, label] of [['horizontal', '가로'], ['vertical', '세로쓰기'], ['rotate', '90° 회전']]) { const option = document.createElement('option'); option.value = value; option.textContent = label; orientation.append(option); }
    orientation.value = data.orientation || 'horizontal'; orientation.onchange = () => { data.orientation = orientation.value; reviewChanged(); }; direction.append(orientation); fieldset.append(direction);
    const observed = plan.coordinateMode === 'observed';
    const wrap = document.createElement('label'); wrap.style.cssText = 'display:block;margin:4px;'; wrap.append(document.createTextNode(observed ? '눈금 (값 : 표기 | 위치 0~1 | 표시 수식, 값이 없으면 null)' : '눈금 (한 줄에 값 : 표기)'));
    const ticks = document.createElement('textarea'); ticks.className = 'modal-input'; ticks.setAttribute('aria-label', `${axis}축 눈금`); ticks.style.cssText = 'display:block;width:100%;height:65px;';
    const safeTicks = Array.isArray(data.ticks) && data.ticks.every(t => t && typeof t === 'object' && !Array.isArray(t));
    if (data.ticks !== undefined && !safeTicks) {
      ticks.value = JSON.stringify(data.ticks); ticks.setCustomValidity('눈금 데이터 형식이 잘못되었습니다. 올바른 눈금을 입력해 주세요.');
      const warning = document.createElement('p'); warning.setAttribute('role', 'alert'); warning.textContent = '눈금 데이터 형식이 잘못되었습니다. 아래 내용을 올바른 눈금으로 수정해야 삽입할 수 있습니다.'; fieldset.append(warning);
    } else ticks.value = (data.ticks || []).map(t => `${t.value} : ${t.label}` + (observed ? ` | ${t.position ?? ''} | ${t.displayMath ?? ''}` : '')).join('\n');
    ticks.addEventListener('change', () => {
      const rows = ticks.value.split('\n').filter(line => line.trim());
      const parsed = rows.map(line => {
        const [pair, position, displayMath, ...extra] = line.split('|'), separator = pair.indexOf(':');
        const valueText = pair.slice(0, separator).trim(), value = observed && valueText === 'null' ? null : Number(valueText);
        if (separator < 1 || !valueText || (value !== null && !Number.isFinite(value)) || extra.length || (!observed && position !== undefined)) return null;
        const tick = { value, label: pair.slice(separator + 1).trim() };
        if (observed) {
          if (!position?.trim() || !Number.isFinite(Number(position)) || Number(position) < 0 || Number(position) > 1) return null;
          tick.position = Number(position); if (displayMath?.trim()) tick.displayMath = displayMath.trim();
        }
        return tick;
      });
      if (parsed.some(t => !t)) {
        const error = observed ? '눈금은 값 : 표기 | 위치 0~1 | 표시 수식 형식으로 입력해 주세요.' : '눈금은 값 : 표기 형식으로 입력해 주세요.';
        ticks.setCustomValidity(error); ticks.reportValidity(); renderPreview(); message(error); return;
      }
      ticks.setCustomValidity('');
      data.ticks = parsed;
      reviewChanged();
    }); wrap.append(ticks); fieldset.append(wrap); host.append(fieldset);
  }
}
function reviewChanged() {
  renderPreview();
  const checked = validateGraphPlan(plan, { source: bindSource(source) });
  if (!checked.ok || overlay.querySelector(':invalid')) return;
  selectedFallback = !checked.blocked; renderPreview();
  void workflow.saveReview(plan).catch(() => message('수정 내용의 복구 정보를 저장하지 못했습니다. 다시 시도해 주세요.'));
}
async function acceptSource(data, name, epoch = ++uiEpoch) {
  const image = await decode(data), hash = await graphSourceHash(data);
  if (epoch !== uiEpoch) return;
  source = { id: hash, hash, width: image.naturalWidth, height: image.naturalHeight, plotBox: { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight } };
  attachment = { id: source.id, name, data }; plan = null; selectedFallback = false;
  byId('original').src = data; byId('original').hidden = false;
  byId('source-name').textContent = `${name} · ${source.width} × ${source.height}`;
  byId('axes').replaceChildren(); byId('history').replaceChildren(); renderPreview(); message('원본을 준비했습니다.'); setBusy(false);
}
async function readModels() {
  selection = null;
  for (const [id, value, label] of [['model', GRAPH_WORKBENCH_SELECTION.model, 'Sol 6.1'], ['effort', GRAPH_WORKBENCH_SELECTION.effort, 'medium']]) {
    const select = byId(id), option = document.createElement('option'); option.value = value; option.textContent = label;
    select.replaceChildren(option); select.value = value; select.disabled = true;
  }
  if (!bridge?.models) { message('AI 연결을 사용할 수 없습니다.'); setBusy(busy); return; }
  try {
    catalog = await bridge.models();
    selection = resolveAIModelSelection(GRAPH_WORKBENCH_SELECTION, catalog);
    message('Sol 6.1 · medium으로 분석합니다.');
  } catch (error) { selection = null; message(error.message); }
  setBusy(busy);
}
function renderAttemptHistory(value = workflow?.snapshot()) {
  const host = byId('history'); host.replaceChildren();
  const attempts = value?.attempts || [];
  if (!attempts.length) return;
  const info = document.createElement('p'); info.textContent = `분석 ${attempts.length}/${value.maxAttempts || 1}회 · 자동 비교는 품질 보증이 아닙니다. 원본과 최종 결과를 확인하세요.`; if (value.finalAttemptSucceeded === false) info.textContent += ' 마지막 분석에 실패했습니다. 사용할 이전 결과를 직접 선택하세요.';
  host.append(info);
  for (const item of attempts) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'modal-btn';
    button.textContent = `${item.attempt === 1 ? '최초' : item.attempt + '차'} 결과${!item.valid ? ' (검증 오류)' : item.blocked ? ' (확인 필요)' : ''}`;
    button.dataset.unavailable = String(!item.plan); button.disabled = busy || !item.plan;
    button.onclick = () => { if (!item.plan) return; selectedFallback = item.valid && !item.blocked; plan = structuredClone(item.plan); editAxes(); renderPreview(); message(`${item.attempt}차 결과를 보고 있습니다. 삽입하면 선택한 결과가 사용됩니다.`); };
    host.append(button);
  }
}
async function renderCandidatePng(candidate, { attempt }) {
  plan = candidate; editAxes(); renderPreview(); setBusy(true); renderAttemptHistory();
  const svg = byId('preview').querySelector('svg');
  if (!svg) throw new Error('편집 그래프를 그리지 못해 비교 보정을 중단했습니다.');
  const fontCss = await ensureEmbeddedFonts(); await document.fonts.ready;
  const clone = svg.cloneNode(true), view = svg.viewBox.baseVal;
  const factor = Math.min(1200 / view.width, 1200 / view.height);
  const width = Math.max(1, Math.ceil(view.width * factor)), height = Math.max(1, Math.ceil(view.height * factor));
  clone.setAttribute('xmlns', SVG_NS); clone.setAttribute('width', String(width)); clone.setAttribute('height', String(height)); clone.removeAttribute('style');
  const style = document.createElementNS(SVG_NS, 'style'); style.textContent = fontCss; clone.insertBefore(style, clone.firstChild);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const image = await decode(url), canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0,0,width,height); context.drawImage(image,0,0,width,height);
    return { attachment: { id: `graph-render-${attempt}`, name: `graph-render-${attempt}.png`, data: canvas.toDataURL('image/png') }, issues: ['원본과 렌더의 축·곡선·표기·선 스타일·영역을 비교하고 필요한 부분만 보정하세요.'] };
  } finally { URL.revokeObjectURL(url); }
}
async function analyze(force = false) {
  if (busy || !source || !selection) return;
  const epoch = uiEpoch;
  selectedFallback = false;
  setBusy(true); message('축·곡선·표기를 분석하고 있습니다.');
  try {
    const result = await workflow.analyze({ source, attachment, selection, catalog, force, maxAttempts: byId('compare').checked ? 3 : 1, renderCandidate: renderCandidatePng });
    if (overlay.hidden || epoch !== uiEpoch) return;
    plan = result.plan; renderPreview(); editAxes();
    message(result.blocked ? '해석하지 못한 항목을 확인해 주세요.' : result.metrics.cacheHits ? '이 원본의 기존 분석 결과를 불러왔습니다.' : '분석을 마쳤습니다. 원본과 비교해 주세요.');
    byId('timing').textContent = `분석 ${Math.round(result.metrics.analysisMs)}ms · 분석 요청 ${result.metrics.analysisCalls}회 · 이미지 생성 요청 ${result.metrics.requestedImageCalls}회`;
  } catch (error) {
    if (!overlay.hidden && epoch === uiEpoch) {
      const current = workflow.snapshot();
      const draft = current?.plan || current?.unvalidatedPlan;
      if (draft && typeof draft === 'object') { plan = draft; editAxes(); }
      message(error.message);
    }
  }
  finally { setBusy(workflow.isActive()); renderPreview(); renderAttemptHistory(); }
}
function insert(edit = false) {
  if (busy || !plan || fallbackBlocked()) return;
  const invalid = overlay.querySelector(':invalid');
  if (invalid) { invalid.reportValidity(); invalid.focus(); return; }
  const before = performance.now(), view = state.get().viewBox;
  const frame = plan.source.plotBox;
  const scale = EXAM_STYLE.defaultWidth / frame.w;
  const w = frame.w * scale, h = frame.h * scale;
  const result = insertNativeGraph(state, plan, { stylePreset:'kice-v1', source: bindSource(source), box: { x: view.x + view.w / 2 - w / 2, y: view.y + view.h / 2 - h / 2, w, h } });
  if (!result.ok) { message(result.error); return; }
  byId('timing').textContent += ` · 삽입 ${Math.round(performance.now() - before)}ms`;
  close(); if (edit) openGraphModal(result.planeId);
}
function close() { ++uiEpoch; void workflow?.cancel(); overlay.hidden = true; opener?.focus(); }
function build() {
  overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.id = 'graph-reconstruction-overlay'; overlay.hidden = true;
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="gr-title" style="width:980px;overflow:auto;">
    <h2 id="gr-title" class="modal-title">원본 그래프 가져오기</h2>
    <p>원본의 축·눈금·곡선·표기를 편집 가능한 그래프로 구성합니다. 불확실한 내용은 확인할 항목으로 남습니다.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <label class="modal-btn">원본 이미지 선택<input id="gr-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" style="display:block;max-width:220px;" /></label>
      <button id="gr-selected" type="button" class="modal-btn">선택한 이미지 사용</button>
      <label>모델 <select id="gr-model" class="modal-input" aria-label="그래프 분석 모델"></select></label>
      <label>추론 <select id="gr-effort" class="modal-input" aria-label="그래프 분석 추론"></select></label>
      <button id="gr-models" type="button" class="modal-btn">모델 새로고침</button>
      <button id="gr-analyze" type="button" class="modal-btn modal-btn-primary">그래프 분석</button>
      <button id="gr-reanalyze" type="button" class="modal-btn">다시 분석</button>
      <label><input id="gr-compare" type="checkbox"> 최초 포함 최대 3회 비교 보정</label>
      <button id="gr-cancel" type="button" class="modal-btn" hidden>분석 취소</button>
    </div>
    <p id="gr-source-name"></p><p id="gr-status" role="status" aria-live="polite"></p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;">
      <section><h3>원본</h3><img id="gr-original" hidden alt="분석할 원본 그래프" style="width:100%;height:270px;object-fit:contain;background:#fff;" /></section>
      <section><h3>편집 그래프</h3><div id="gr-preview" style="background:#fff;color:#111;min-height:270px;"></div></section>
    </div>
    <div id="gr-history" aria-label="그래프 분석 이력"></div><ul id="gr-review" aria-label="그래프 확인 항목"></ul><div id="gr-axes"></div>
    <p id="gr-timing" style="font-size:12px;color:var(--text-secondary);"></p>
    <div class="modal-actions"><button id="gr-close" class="modal-btn" type="button">닫기</button><button id="gr-insert" class="modal-btn" type="button">그래프 삽입</button><button id="gr-edit" class="modal-btn modal-btn-primary" type="button">삽입하고 편집</button></div>
  </div>`;
  document.body.append(overlay); registerEscapeLayer(overlay, close);
  byId('close').onclick = close; byId('cancel').onclick = async () => { await workflow?.cancel(); message('분석을 취소했습니다.'); };
  byId('file').onchange = async () => {
    const file = byId('file').files[0]; if (!file) return;
    const epoch = ++uiEpoch; setBusy(true);
    try { if (file.size > 8 * 1024 * 1024) throw new Error('8MB 이하의 이미지를 선택해 주세요.'); await acceptSource(await readDataUrl(file), file.name, epoch); }
    catch (error) { if (epoch === uiEpoch) message(error.message); }
    finally { setBusy(workflow.isActive()); }
  };
  byId('selected').onclick = async () => {
    const current = state.get(), object = current.objects.find(o => current.selectedIds.includes(o.id) && o.type === 'image');
    if (!object?.src) { message('캔버스에서 원본 이미지 하나를 선택해 주세요.'); return; }
    const epoch = ++uiEpoch; setBusy(true);
    try {
      let data = object.src;
      if (!/^data:image\//.test(data)) { const response = await fetch(data); if (!response.ok) throw new Error('선택한 원본을 읽지 못했습니다.'); const blob = await response.blob(); if (blob.size > 8 * 1024 * 1024) throw new Error('8MB 이하의 이미지를 선택해 주세요.'); data = await readDataUrl(blob); }
      if (data.length > 11_000_000) throw new Error('8MB 이하의 이미지를 선택해 주세요.');
      await acceptSource(data, '선택한 이미지', epoch);
    } catch (error) { if (epoch === uiEpoch) message(error.message); }
    finally { setBusy(workflow.isActive()); }
  };
  byId('models').onclick = readModels;
  byId('analyze').onclick = () => analyze(); byId('reanalyze').onclick = () => analyze(true); byId('insert').onclick = () => insert(false); byId('edit').onclick = () => insert(true);
  overlay.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...overlay.querySelectorAll('button,input,select,textarea')].filter(n => !n.disabled && n.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}
export async function openGraphReconstructionModal() {
  if (!overlay) {
    build();
    const scope = 'graph-' + crypto.randomUUID(); bridge = createTaskBridge(window.fiveEDesktop || window.fiveEWebAI, scope);
    const store = typeof indexedDB === 'undefined' ? null : new IndexedDBOutputCacheBackend({ databaseName: '5e-graph-reconstruction', storeName: 'jobs' });
    workflow = createGraphReconstructionWorkflow({ transport: bridge || { send: async () => { throw new Error('AI 연결을 확인해 주세요.'); } }, store });
    bridge?.onEvent(message => workflow.handleEvent(message)); bridge?.onState(event => { if (event.state === 'stopped') workflow.fail(event.message); });
    try {
      const saved = await workflow.recover();
      if (saved) { await acceptSource(saved.attachment.data, saved.attachment.name); plan = saved.plan || saved.unvalidatedPlan; editAxes(); renderPreview(); renderAttemptHistory(saved); message(saved.error || '이전 그래프 분석을 복구했습니다.'); }
    } catch { message('이전 분석의 복구 정보를 읽지 못했습니다.'); }
  }
  opener = document.activeElement; overlay.hidden = false; setBusy(workflow.isActive()); byId('file').focus();
  if (!catalog) void readModels();
}
