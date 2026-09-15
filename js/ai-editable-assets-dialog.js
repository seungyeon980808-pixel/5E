import { prepareEditableAssets, effectiveAssetLabelMode } from './ai-editable-assets.js';
import { refinePreparedAssets } from './ai-editable-assets-refinement.js';
import { decodeScopedPng } from './ai-scoped-edit-png.js';
import { renderLabeler } from './render/annotations.js?v=1.4.0';
import { DEFAULT_TEXT_FONT, DEFAULT_TEXT_SIZE_MM } from './state.js?v=1.4.0';
export { refinePreparedAssets };

const NS = 'http://www.w3.org/2000/svg';
const REFINEMENT_GUIDANCE = new Set([
  '분리 결과는 PNG 데이터여야 합니다.',
  '분리 PNG 데이터가 올바르지 않습니다.',
  '분리 결과의 원본 크기를 확인할 수 없습니다.',
  '미세 조정할 물체 수가 허용 범위를 벗어났습니다.',
  '조정 영역은 양의 크기를 가진 정수 좌표여야 합니다.',
  '조정 영역이 원본 이미지 안에 있어야 합니다.',
  '분리된 물체의 위치 또는 식별자가 올바르지 않습니다.',
  '분리 PNG의 크기와 위치 정보가 다릅니다.',
  '분리 PNG에 겹친 픽셀 소속이 있어 안전하게 조정할 수 없습니다.',
  '픽셀이 없는 분리 물체는 조정할 수 없습니다.',
  '선택한 물체를 분리 결과에서 찾을 수 없습니다.',
  '새 물체 식별자를 만들지 못했습니다.',
  '미세 조정 작업을 확인할 수 없습니다.',
  '서로 다른 두 물체를 선택해 주세요.',
  '미세 조정 결과는 128개 물체를 넘을 수 없습니다.',
  '나누기 영역에는 선택한 물체의 일부 픽셀만 포함되어야 합니다.',
  '선택한 영역에 다른 물체의 픽셀이 없습니다.',
  '지원하지 않는 미세 조정 작업입니다.',
  '미세 조정 PNG의 RGBA 검증에 실패했습니다.',
  '페이지에 넣을 물체가 하나 이상 있어야 합니다.',
  '분리 결과의 픽셀 합계가 올바르지 않습니다.',
]);
function svgNode(tag, attributes, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function previewViewBoxForLabels(width, height, padding) {
  return `${-padding} ${-padding} ${width + padding * 2} ${height + padding * 2}`;
}

export function refinementFailureGuidance(error) {
  if (error?.name === 'AbortError') return null;
  if (error?.name === 'PreparedAssetRefinementError' || REFINEMENT_GUIDANCE.has(error?.message)) return error.message;
  return '미세 조정 결과를 만들지 못했습니다. 자동 분리를 다시 실행하거나 원본을 사용해 주세요.';
}

export async function openEditableAssetsDialog({ dataUrl, artboard, isCurrent = () => true, onInsert, initialPrepared = null }) {
  const automatic = Boolean(initialPrepared);
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'aea-dialog';
  dialog.setAttribute('aria-labelledby', 'aea-title');
  dialog.classList.toggle('is-automatic', automatic);
  dialog.innerHTML = `<header class="aea-header"><div><h2 id="aea-title">${automatic ? '분리 결과 확인' : '편집 가능한 객체로 나누기'}</h2><p>${automatic ? '각 PNG와 편집 가능한 이름을 확인한 뒤 페이지에 넣으세요.' : '그림에서 객체를 하나씩 드래그해 선택하세요.'}</p></div><button type="button" data-action="close" aria-label="닫기">×</button></header>
    <div class="aea-tools" role="group" aria-label="선택 도구">
      ${automatic ? '<button type="button" data-action="refine">미세 조정</button><button type="button" data-mode="inspect" hidden>확인</button><button type="button" data-mode="merge" hidden>두 물체 합치기</button><button type="button" data-mode="split" hidden>영역 나누기</button><button type="button" data-mode="reassign" hidden>선택에 옮기기</button><button type="button" data-mode="anchor" hidden>지시선 끝점</button><button type="button" data-mode="label" hidden>라벨 위치</button>' : '<button type="button" data-mode="region">객체 선택</button><button type="button" data-mode="keep">흰색 보존</button><button type="button" data-mode="anchor">지시선 끝점</button><button type="button" data-mode="label">라벨 위치</button>'}
    <span class="aea-view-tools" role="group" aria-label="그림 보기"><button type="button" data-action="zoom-out" aria-label="축소">−</button><output class="aea-zoom" aria-label="확대 비율">100%</output><button type="button" data-action="zoom-in" aria-label="확대">+</button><button type="button" data-action="fit">전체 보기</button><button type="button" data-mode="pan">이동</button></span></div><p class="aea-hint" id="aea-hint"></p>
    <div class="aea-body"><div class="aea-workspace"><div class="aea-stage"><img class="aea-source" alt="객체를 선택할 원본 이미지"><svg class="aea-original" aria-hidden="true"></svg><svg class="aea-overlay" aria-label="객체 선택 영역"></svg><svg class="aea-preview" aria-label="투명 배경 미리보기" hidden></svg></div></div>
      <aside class="aea-sidebar"><h3>${automatic ? '분리된 물체' : '선택한 객체'} <span class="aea-count">0</span></h3><label class="aea-label-toggle"><input type="checkbox" data-disable-labels>전체 라벨 사용 안 함</label><div class="aea-list"></div><p class="aea-empty">${automatic ? '확인할 분리 결과가 없습니다.' : '왼쪽 그림에서 객체를 감싸는 사각형을 그리세요.'}</p><button type="button" data-action="clear-keep" hidden>이 객체의 흰색 보존 해제</button></aside></div>
    <p class="aea-status" role="status" aria-live="polite">이미지를 불러오는 중…</p>
    <footer class="aea-footer"><button type="button" data-action="cancel">취소</button><div><button type="button" data-action="preview">${automatic ? '원본 보기' : '미리보기'}</button><button type="button" class="aea-primary" data-action="insert">${automatic ? '페이지에 넣고 닫기' : '페이지에 각각 넣기'}</button></div></footer>`;
  const find = selector => dialog.querySelector(selector);
  const source = find('.aea-source'), overlay = find('.aea-overlay'), preview = find('.aea-preview');
  const status = find('.aea-status'), list = find('.aea-list'), original = find('.aea-original'), stage = find('.aea-stage');
  let zoom = 1, center = { x: 0, y: 0 }, pan = null;
  const showSource = visible => { source.hidden = !visible; original.toggleAttribute('hidden', !visible); };
  const updateViewport = () => {
    if (!width) return;
    const w = width / zoom, h = height / zoom;
    const viewBox = `${center.x - w / 2} ${center.y - h / 2} ${w} ${h}`;
    original.setAttribute('viewBox', viewBox); overlay.setAttribute('viewBox', viewBox);
    const padding = previewLabelPadding() / zoom;
    preview.setAttribute('viewBox', `${center.x - w / 2 - padding} ${center.y - h / 2 - padding} ${w + padding * 2} ${h + padding * 2}`);
    find('.aea-zoom').textContent = `${Math.round(zoom * 100)}%`;
    find('[data-action="zoom-out"]').disabled = zoom <= 0.25;
    find('[data-action="zoom-in"]').disabled = zoom >= 8;
  };
  const changeZoom = factor => { if (!width || drag || pan) return; zoom = Math.max(0.25, Math.min(8, zoom * factor)); updateViewport(); };
  let regions = [], selected = null, mode = automatic ? 'inspect' : 'region', revision = 0, prepared = automatic ? structuredClone(initialPrepared) : null;
  let labelsDisabled = false;
  let width = 0, height = 0, busy = false, closed = false, drag = null, showingPreview = false, refining = false, mergeSource = null;
  let refinementController = null;
  let finish;
  const result = new Promise(resolve => { finish = resolve; });
  const close = inserted => {
    if (closed) return;
    closed = true;
    refinementController?.abort('dialog-closed');
    source.onload = null; source.onerror = null; source.removeAttribute('src');
    dialog.close(); dialog.remove(); previousFocus?.focus(); finish(inserted);
  };
  const current = () => {
    if (closed) return false;
    if (isCurrent()) return true;
    prepared = null;
    status.textContent = '생성 이미지가 바뀌었습니다. 닫고 새 이미지에서 다시 선택해 주세요.';
    return false;
  };
  const active = () => regions.find(region => region.id === selected);
  const controls = () => {
    dialog.setAttribute('aria-busy', String(busy));
    dialog.querySelectorAll('[data-mode], .aea-list input, .aea-list select, [data-disable-labels], .aea-list button, [data-action="clear-keep"]').forEach(node => { node.disabled = busy || !width; });
    dialog.querySelectorAll('.aea-list input, .aea-list select').forEach(node => { node.disabled = busy || !width || labelsDisabled; });
    find('[data-action="preview"]').disabled = busy || !regions.length || !width;
    find('[data-action="insert"]').disabled = busy || !prepared || !current();
    find('[data-action="clear-keep"]').hidden = !active()?.keepRects.length;
    for (const button of dialog.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  };
  const labelScale = () => artboard ? Math.min(artboard.w * 0.9 / width, artboard.h * 0.9 / height) : DEFAULT_TEXT_SIZE_MM / Math.max(12, width / 55);
  const previewLabelPadding = () => Math.max(16, Math.ceil(DEFAULT_TEXT_SIZE_MM / labelScale()));
  const labelNode = asset => {
    const scale = labelScale();
    return renderLabeler({ p1: effectiveAssetLabelMode(asset) === 'text' ? asset.labelPoint : asset.anchor, p2: asset.labelPoint, text: asset.label, labelType: 'label',
      fontFamily: DEFAULT_TEXT_FONT, labelSize: DEFAULT_TEXT_SIZE_MM / scale, strokeLevel: 0, strokeWidth: 0.2 / scale });
  };
  const draw = () => {
    overlay.replaceChildren();
    for (const region of regions) {
      const chosen = region.id === selected;
      overlay.append(svgNode('rect', { x: region.x, y: region.y, width: region.width, height: region.height, class: chosen ? 'aea-region is-selected' : 'aea-region' }));
      for (const rect of region.keepRects) overlay.append(svgNode('rect', { ...rect, class: 'aea-keep' }));
      if (effectiveAssetLabelMode(region, labelsDisabled) !== 'none') overlay.append(labelNode(region));
      if (chosen) overlay.append(svgNode('circle', { cx: region.anchor.x, cy: region.anchor.y, r: Math.max(3, width / 180), class: 'aea-anchor' }));
    }
  };
  const drawPrepared = () => {
    preview.replaceChildren();
    for (const asset of prepared.assets) {
      preview.append(svgNode('image', { href: asset.data, x: asset.x, y: asset.y, width: asset.width, height: asset.height }));
      if (effectiveAssetLabelMode(asset, labelsDisabled) !== 'none') preview.append(labelNode(asset));
    }
  };
  const invalidate = () => {
    revision++; prepared = null; showingPreview = false;
    showSource(true); preview.toggleAttribute("hidden", true); overlay.toggleAttribute("hidden", false);
    find('[data-action="preview"]').textContent = '미리보기';
    status.textContent = '선택을 바꾼 뒤에는 미리보기를 다시 확인하세요.';
    draw(); controls();
  };
  const syncPreparedRegions = () => {
    regions = prepared.assets.map((asset, index) => ({
      ...asset, label: asset.label?.trim() ? asset.label : `물체 ${index + 1}`, keepRects: [],
    }));
    for (const region of regions) prepared.assets.find(asset => asset.id === region.id).label = region.label;
    if (!regions.some(region => region.id === selected)) selected = regions[0]?.id ?? null;
  };
  const applyRefinement = async (operation, preferredSelection = selected) => {
    if (!automatic || !refining || busy || !prepared || !current()) return;
    busy = true; mergeSource = null; refinementController = new AbortController(); controls();
    status.textContent = operation.type === 'exclude' ? '선택한 물체를 결과에서 제외하는 중…' : '픽셀 소속을 다시 계산하는 중…';
    const version = ++revision;
    try {
      const output = await refinePreparedAssets(prepared, operation, { signal: refinementController.signal });
      if (!current() || version !== revision) return;
      prepared = output; prepared.labelsDisabled = labelsDisabled; selected = preferredSelection;
      syncPreparedRegions(); renderList(); draw(); drawPrepared(); controls();
      status.textContent = `${prepared.assets.length}개 물체 · ${prepared.assignedForegroundPixelCount}개 픽셀 소속을 확인했습니다${prepared.unassignedForegroundPixelCount ? ` · ${prepared.unassignedForegroundPixelCount}개 픽셀 제외됨` : ''}.`;
    } catch (error) {
      const guidance = refinementFailureGuidance(error);
      if (!closed && guidance) status.textContent = guidance;
    } finally {
      refinementController = null; busy = false; if (!closed) controls();
    }
  };
  const beginRefinement = () => {
    if (!automatic || refining || !prepared || !current()) return;
    refining = true; showingPreview = false;
    find('[data-action="refine"]').hidden = true;
    for (const button of dialog.querySelectorAll('[data-mode]')) button.hidden = false;
    showSource(true); preview.toggleAttribute('hidden', true); overlay.toggleAttribute('hidden', false);
    find('[data-action="preview"]').textContent = '분리 결과 보기';
    renderList(); draw(); setMode('inspect');
    status.textContent = '자동 결과는 그대로 보존됩니다. 필요한 부분만 조정하세요.';
  };
  const renderList = () => {
    list.replaceChildren();
    for (const [index, region] of regions.entries()) {
      const row = document.createElement('div'); row.className = 'aea-row';
      row.dataset.selected = String(region.id === selected);
      const choose = document.createElement('button'); choose.type = 'button'; choose.textContent = String(index + 1);
      choose.setAttribute('aria-label', `객체 ${index + 1} 선택`); choose.setAttribute('aria-pressed', String(region.id === selected));
      choose.onclick = async () => {
        if (automatic && refining && mode === 'merge') {
          if (!mergeSource) {
            mergeSource = region.id; selected = region.id; renderList(); draw(); controls();
            status.textContent = '합칠 다른 물체를 목록에서 선택하세요.';
          } else if (mergeSource === region.id) status.textContent = '서로 다른 두 물체를 선택해 주세요.';
          else await applyRefinement({ type: 'merge', targetId: mergeSource, sourceId: region.id }, mergeSource);
          return;
        }
        mergeSource = null; selected = region.id; renderList(); draw(); controls();
      };
      const input = document.createElement('input'); input.value = region.label; input.placeholder = '라벨 없음'; input.setAttribute('aria-label', `객체 ${index + 1} 라벨`);
      input.onfocus = () => { selected = region.id; draw(); controls(); };
      input.oninput = () => {
        region.label = input.value;
        if (!automatic) { invalidate(); return; }
        prepared.assets.find(asset => asset.id === region.id).label = input.value;
        row.querySelector('[data-action="download-asset"]')?.setAttribute('aria-label', `${input.value || `물체 ${index + 1}`} PNG 저장`);
        drawPrepared(); controls();
      };
      const labelMode = document.createElement('select');
      labelMode.setAttribute('aria-label', '객체 ' + (index + 1) + ' 라벨 방식');
      for (const [value, text] of [['leader', '지시선 라벨'], ['text', '텍스트 라벨'], ['none', '사용 안 함']]) {
        const option = document.createElement('option'); option.value = value; option.textContent = text; labelMode.append(option);
      }
      labelMode.value = region.labelMode || 'leader';
      labelMode.onchange = () => {
        region.labelMode = labelMode.value;
        if (prepared) { prepared.assets.find(asset => asset.id === region.id).labelMode = labelMode.value; drawPrepared(); }
        draw(); controls();
      };
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '삭제'; remove.setAttribute('aria-label', `객체 ${index + 1} 삭제`);
      remove.onclick = () => { regions = regions.filter(item => item !== region); if (selected === region.id) selected = regions.at(-1)?.id ?? null; renderList(); invalidate(); };
      if (automatic && !refining) {
        const download = document.createElement('button'); download.type = 'button'; download.dataset.action = 'download-asset'; download.textContent = 'PNG'; download.setAttribute('aria-label', `${region.label} PNG 저장`);
        download.onclick = () => { const link = document.createElement('a'); link.href = prepared.assets[index].data; link.download = `${region.label.replace(/[\\/:*?"<>|]+/g, '-')}.png`; link.click(); };
        row.append(choose, input, download);
      } else {
        if (automatic) { remove.textContent = '제외'; remove.setAttribute('aria-label', `물체 ${index + 1} 결과에서 제외`); remove.onclick = () => applyRefinement({ type: 'exclude', assetId: region.id }); }
        row.append(choose, input, remove);
      }
      row.append(labelMode);
      list.append(row);
    }
    find('.aea-count').textContent = String(regions.length); find('.aea-empty').hidden = !!regions.length;
  };
  const setMode = next => {
    mode = next; mergeSource = null; stage.classList.toggle('is-pan', mode === 'pan');
    find('.aea-hint').textContent = {
      pan: '그림을 드래그해 이동하세요. 전체 보기로 원래 위치에 돌아갑니다.',
      inspect: '목록에서 물체를 선택해 분리 범위를 확인하세요.',
      merge: '오른쪽 목록에서 합칠 두 물체를 차례로 선택하세요.',
      split: '목록에서 물체를 선택한 뒤, 떼어낼 픽셀을 사각형으로 감싸세요.',
      reassign: '목록에서 받을 물체를 선택한 뒤, 그 물체로 옮길 픽셀을 감싸세요.',
      region: '서로 떨어진 객체마다 사각형을 그리세요. 라벨은 오른쪽에서 입력합니다.',
      keep: '객체를 선택한 뒤, 열린 윤곽 안에서 흰색을 유지할 부분을 드래그하세요.',
      anchor: '객체를 선택한 뒤, 그림에서 지시선이 닿을 점을 누르세요.',
      label: '객체를 선택한 뒤, 라벨을 놓을 점을 누르세요.',
    }[mode];
    controls();
  };
  const point = event => {
    const mapped = new DOMPoint(event.clientX, event.clientY).matrixTransform(overlay.getScreenCTM().inverse());
    return { x: Math.round(Math.max(0, Math.min(width, mapped.x))), y: Math.round(Math.max(0, Math.min(height, mapped.y))) };
  };
  const rectangle = (start, end) => ({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) });
  overlay.onpointerdown = event => {
    if (busy || showingPreview || !width || event.button !== 0 || !current()) return;
    if (mode === 'pan') return;
    if (automatic && (mode === 'inspect' || mode === 'merge')) return;
    if (mode !== 'region' && !active()) { status.textContent = '먼저 객체를 선택해 주세요.'; return; }
    const start = point(event);
    if (mode === 'anchor' || mode === 'label') {
      const key = mode === 'anchor' ? 'anchor' : 'labelPoint'; active()[key] = start;
      if (automatic) { prepared.assets.find(asset => asset.id === selected)[key] = start; draw(); drawPrepared(); controls(); }
      else invalidate();
      return;
    }
    event.preventDefault(); overlay.setPointerCapture(event.pointerId); drag = { start, id: event.pointerId };
  };
  overlay.onpointermove = event => {
    if (!drag) return;
    draw(); overlay.append(svgNode('rect', { ...rectangle(drag.start, point(event)), class: 'aea-draft' }));
  };
  overlay.onpointerup = async event => {
    if (!drag) return;
    const rect = rectangle(drag.start, point(event)); drag = null;
    if (overlay.hasPointerCapture(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
    if (rect.width < 3 || rect.height < 3) { draw(); return; }
    if (automatic && mode === 'split') await applyRefinement({ type: 'split', assetId: selected, rect });
    else if (automatic && mode === 'reassign') await applyRefinement({ type: 'reassign', targetId: selected, rect });
    else if (mode === 'region') {
      const region = { ...rect, id: crypto.randomUUID(), label: '', anchor: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, labelPoint: { x: rect.x, y: Math.max(16, rect.y - 16) }, keepRects: [] };
      regions.push(region); selected = region.id;
    } else active().keepRects.push(rect);
    if (!automatic) { renderList(); invalidate(); }
  };
  overlay.onpointercancel = () => { drag = null; draw(); };
  stage.addEventListener('pointerdown', event => {
    if (!width || busy || (mode !== 'pan' && event.button !== 1)) return;
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault(); stage.setPointerCapture(event.pointerId);
    const surface = showingPreview ? preview : original;
    pan = { id: event.pointerId, x: event.clientX, y: event.clientY, center: { ...center }, matrix: surface.getScreenCTM().inverse() };
    stage.classList.add('is-panning');
  });
  stage.addEventListener('pointermove', event => {
    if (!pan || pan.id !== event.pointerId) return;
    const start = new DOMPoint(pan.x, pan.y).matrixTransform(pan.matrix);
    const end = new DOMPoint(event.clientX, event.clientY).matrixTransform(pan.matrix);
    center = { x: pan.center.x + start.x - end.x, y: pan.center.y + start.y - end.y }; updateViewport();
  });
  const endPan = event => {
    if (!pan || pan.id !== event.pointerId) return;
    pan = null; stage.classList.remove('is-panning');
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  };
  stage.addEventListener('pointerup', endPan); stage.addEventListener('pointercancel', endPan);
  stage.addEventListener('wheel', event => { event.preventDefault(); changeZoom(event.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
  const runPreview = async () => {
    if (busy || !regions.length || !current()) return;
    if (showingPreview) { showingPreview = false; showSource(true); overlay.toggleAttribute("hidden", automatic && !refining); preview.toggleAttribute("hidden", true); find('[data-action="preview"]').textContent = automatic ? '분리 결과 보기' : '미리보기'; return; }
    if (automatic) {
      drawPrepared(); showingPreview = true; showSource(false); overlay.toggleAttribute('hidden', true); preview.toggleAttribute('hidden', false);
      find('[data-action="preview"]').textContent = '원본 보기'; status.textContent = `${prepared.assets.length}개 물체를 확인했습니다. 라벨 방식과 표시 여부를 선택한 뒤 페이지에 넣으세요.`; return;
    }
    busy = true; status.textContent = '객체 바깥 배경을 투명하게 만드는 중…'; controls();
    const version = revision;
    try {
      const output = await prepareEditableAssets(dataUrl, structuredClone(regions), { threshold: 240 });
      if (!current() || version !== revision) return;
      prepared = output; prepared.labelsDisabled = labelsDisabled; preview.replaceChildren();
      for (const asset of output.assets) {
        preview.append(svgNode('image', { href: asset.data, x: asset.x, y: asset.y, width: asset.width, height: asset.height }));
        if (effectiveAssetLabelMode(asset, labelsDisabled) !== 'none') preview.append(labelNode(asset));
      }
      showingPreview = true; showSource(false); overlay.toggleAttribute("hidden", true); preview.toggleAttribute("hidden", false);
      find('[data-action="preview"]').textContent = '선택으로 돌아가기';
      status.textContent = `${output.assets.length}개 객체 · 체크무늬는 투명 영역입니다. 흰색 내부와 라벨을 확인한 뒤 넣으세요.`;
    } catch (error) { if (!closed) status.textContent = error instanceof Error ? error.message : '미리보기를 만들지 못했습니다.'; }
    finally { busy = false; if (!closed) controls(); }
  };
  find('[data-disable-labels]').onchange = event => {
    labelsDisabled = event.target.checked;
    if (prepared) { prepared.labelsDisabled = labelsDisabled; drawPrepared(); }
    draw(); controls();
  };
  dialog.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.mode) { setMode(button.dataset.mode); return; }
    const action = button.dataset.action;
    if (action === 'close' || action === 'cancel') close(false);
    if (action === 'zoom-in') changeZoom(1.25);
    if (action === 'zoom-out') changeZoom(0.8);
    if (action === 'fit') { zoom = 1; center = { x: width / 2, y: height / 2 }; updateViewport(); }
    if (action === 'refine') beginRefinement();
    if (action === 'clear-keep' && active()) { active().keepRects = []; invalidate(); }
    if (action === 'preview') await runPreview();
    if (action === 'insert' && prepared && !busy && current()) {
      busy = true; controls();
      try { const inserted = await onInsert(prepared); if (inserted !== false) close(true); }
      catch (error) { if (!closed) status.textContent = error instanceof Error ? error.message : '객체를 넣지 못했습니다.'; }
      finally { busy = false; if (!closed) controls(); }
    }
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(false); });
  dialog.addEventListener('keydown', event => event.stopPropagation());
  source.onload = () => {
    if (!current()) return;
    width = source.naturalWidth; height = source.naturalHeight;
    source.width = width; source.height = height;
    find('.aea-stage').style.aspectRatio = `${width} / ${height}`;
    original.append(svgNode('image', { href: dataUrl, width, height }));
    center = { x: width / 2, y: height / 2 }; updateViewport();
    preview.setAttribute('viewBox', previewViewBoxForLabels(width, height, previewLabelPadding()));
    if (automatic) {
      if (prepared.width !== width || prepared.height !== height || !Array.isArray(prepared.assets) || !prepared.assets.length || prepared.assets.length > 128) {
        prepared = null; status.textContent = '분리 결과가 원본 PNG와 맞지 않습니다. 원본 PNG를 유지했습니다.'; controls(); return;
      }
      syncPreparedRegions(); selected = regions[0].id; renderList(); void runPreview();
    } else status.textContent = '원본은 그대로 유지됩니다. 객체를 선택해 주세요.';
    controls();
  };
  source.onerror = () => { status.textContent = '이미지를 불러오지 못했습니다. 닫고 다시 시도해 주세요.'; };
  document.body.append(dialog); dialog.showModal();
  const loadSource = async () => {
    try {
      if (!current()) return;
      const prefix = 'data:image/png;base64,';
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix) || dataUrl.length - prefix.length > Math.ceil(64 * 1024 * 1024 / 3) * 4) throw new Error('PNG 이미지 형식 또는 크기 제한을 확인해 주세요.');
      const encoded = dataUrl.slice(prefix.length);
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('올바른 PNG 이미지 데이터가 아닙니다.');
      await decodeScopedPng(Uint8Array.from(atob(encoded), character => character.charCodeAt(0)));
      if (current()) source.src = dataUrl;
    } catch (error) {
      if (!closed) status.textContent = error instanceof Error ? error.message : '이미지를 확인하지 못했습니다.';
    }
  };
  if (automatic) find('.aea-hint').textContent = '결과가 만족스럽지 않을 때만 미세 조정을 여세요.';
  else setMode('region');
  void loadSource();
  return result;
}
