import { prepareEditableAssets } from './ai-editable-assets.js';
import { decodeScopedPng } from './ai-scoped-edit-png.js';
import { renderLabeler } from './render/annotations.js?v=1.4.0';
import { DEFAULT_TEXT_FONT, DEFAULT_TEXT_SIZE_MM } from './state.js?v=1.4.0';

const NS = 'http://www.w3.org/2000/svg';
function svgNode(tag, attributes, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function previewViewBoxForLabels(width, height, padding) {
  return `${-padding} ${-padding} ${width + padding * 2} ${height + padding * 2}`;
}

export async function openEditableAssetsDialog({ dataUrl, artboard, isCurrent = () => true, onInsert, initialPrepared = null }) {
  const automatic = Boolean(initialPrepared);
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'aea-dialog';
  dialog.setAttribute('aria-labelledby', 'aea-title');
  dialog.classList.toggle('is-automatic', automatic);
  dialog.innerHTML = `<header class="aea-header"><div><h2 id="aea-title">${automatic ? '분리 결과 확인' : '편집 가능한 객체로 나누기'}</h2><p>${automatic ? '각 PNG와 편집 가능한 이름을 확인한 뒤 페이지에 넣으세요.' : '그림에서 객체를 하나씩 드래그해 선택하세요.'}</p></div><button type="button" data-action="close" aria-label="닫기">×</button></header>
    <div class="aea-tools" role="group" aria-label="선택 도구"${automatic ? ' hidden' : ''}>
      <button type="button" data-mode="region">객체 선택</button><button type="button" data-mode="keep">흰색 보존</button><button type="button" data-mode="anchor">지시선 끝점</button><button type="button" data-mode="label">라벨 위치</button>
    </div><p class="aea-hint" id="aea-hint"${automatic ? ' hidden' : ''}></p>
    <div class="aea-body"><div class="aea-workspace"><div class="aea-stage"><img class="aea-source" alt="객체를 선택할 원본 이미지"><svg class="aea-overlay" aria-label="객체 선택 영역"></svg><svg class="aea-preview" aria-label="투명 배경 미리보기" hidden></svg></div></div>
      <aside class="aea-sidebar"><h3>${automatic ? '분리된 물체' : '선택한 객체'} <span class="aea-count">0</span></h3><div class="aea-list"></div><p class="aea-empty">${automatic ? '확인할 분리 결과가 없습니다.' : '왼쪽 그림에서 객체를 감싸는 사각형을 그리세요.'}</p><button type="button" data-action="clear-keep" hidden>이 객체의 흰색 보존 해제</button></aside></div>
    <p class="aea-status" role="status" aria-live="polite">이미지를 불러오는 중…</p>
    <footer class="aea-footer"><button type="button" data-action="cancel">취소</button><div><button type="button" data-action="preview">${automatic ? '원본 보기' : '미리보기'}</button><button type="button" class="aea-primary" data-action="insert">${automatic ? '페이지에 넣고 닫기' : '페이지에 그룹으로 넣기'}</button></div></footer>`;
  const find = selector => dialog.querySelector(selector);
  const source = find('.aea-source'), overlay = find('.aea-overlay'), preview = find('.aea-preview');
  const status = find('.aea-status'), list = find('.aea-list');
  let regions = [], selected = null, mode = 'region', revision = 0, prepared = automatic ? structuredClone(initialPrepared) : null;
  let width = 0, height = 0, busy = false, closed = false, drag = null, showingPreview = false;
  let finish;
  const result = new Promise(resolve => { finish = resolve; });
  const close = inserted => {
    if (closed) return;
    closed = true;
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
    dialog.querySelectorAll('[data-mode], .aea-list input, .aea-list button, [data-action="clear-keep"]').forEach(node => { node.disabled = busy || !width; });
    find('[data-action="preview"]').disabled = busy || !regions.length || !width;
    find('[data-action="insert"]').disabled = busy || !prepared || !current();
    find('[data-action="clear-keep"]').hidden = !active()?.keepRects.length;
    for (const button of dialog.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  };
  const labelScale = () => artboard ? Math.min(artboard.w * 0.9 / width, artboard.h * 0.9 / height) : DEFAULT_TEXT_SIZE_MM / Math.max(12, width / 55);
  const previewLabelPadding = () => Math.max(16, Math.ceil(DEFAULT_TEXT_SIZE_MM / labelScale()));
  const labelNode = asset => {
    const scale = labelScale();
    return renderLabeler({ p1: asset.anchor, p2: asset.labelPoint, text: asset.label, labelType: 'label',
      fontFamily: DEFAULT_TEXT_FONT, labelSize: DEFAULT_TEXT_SIZE_MM / scale, strokeLevel: 0, strokeWidth: 0.2 / scale });
  };
  const draw = () => {
    overlay.replaceChildren();
    for (const region of regions) {
      const chosen = region.id === selected;
      overlay.append(svgNode('rect', { x: region.x, y: region.y, width: region.width, height: region.height, class: chosen ? 'aea-region is-selected' : 'aea-region' }));
      for (const rect of region.keepRects) overlay.append(svgNode('rect', { ...rect, class: 'aea-keep' }));
      if (region.label.trim()) overlay.append(labelNode(region));
      if (chosen) overlay.append(svgNode('circle', { cx: region.anchor.x, cy: region.anchor.y, r: Math.max(3, width / 180), class: 'aea-anchor' }));
    }
  };
  const drawPrepared = () => {
    preview.replaceChildren();
    for (const asset of prepared.assets) {
      preview.append(svgNode('image', { href: asset.data, x: asset.x, y: asset.y, width: asset.width, height: asset.height }));
      if (asset.label.trim()) preview.append(labelNode(asset));
    }
  };
  const invalidate = () => {
    revision++; prepared = null; showingPreview = false;
    source.hidden = false; preview.toggleAttribute("hidden", true); overlay.toggleAttribute("hidden", false);
    find('[data-action="preview"]').textContent = '미리보기';
    status.textContent = '선택을 바꾼 뒤에는 미리보기를 다시 확인하세요.';
    draw(); controls();
  };
  const renderList = () => {
    list.replaceChildren();
    for (const [index, region] of regions.entries()) {
      const row = document.createElement('div'); row.className = 'aea-row';
      row.dataset.selected = String(region.id === selected);
      const choose = document.createElement('button'); choose.type = 'button'; choose.textContent = String(index + 1);
      choose.setAttribute('aria-label', `객체 ${index + 1} 선택`); choose.setAttribute('aria-pressed', String(region.id === selected));
      choose.onclick = () => { selected = region.id; renderList(); draw(); controls(); };
      const input = document.createElement('input'); input.value = region.label; input.placeholder = '라벨 없음'; input.setAttribute('aria-label', `객체 ${index + 1} 라벨`);
      input.onfocus = () => { selected = region.id; draw(); controls(); };
      input.oninput = () => {
        region.label = input.value;
        if (!automatic) { invalidate(); return; }
        prepared.assets[index].label = input.value;
        row.querySelector('[data-action="download-asset"]')?.setAttribute('aria-label', `${input.value || `물체 ${index + 1}`} PNG 저장`);
        drawPrepared(); controls();
      };
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '삭제'; remove.setAttribute('aria-label', `객체 ${index + 1} 삭제`);
      remove.onclick = () => { regions = regions.filter(item => item !== region); if (selected === region.id) selected = regions.at(-1)?.id ?? null; renderList(); invalidate(); };
      if (automatic) {
        const download = document.createElement('button'); download.type = 'button'; download.dataset.action = 'download-asset'; download.textContent = 'PNG'; download.setAttribute('aria-label', `${region.label} PNG 저장`);
        download.onclick = () => { const link = document.createElement('a'); link.href = prepared.assets[index].data; link.download = `${region.label.replace(/[\\/:*?"<>|]+/g, '-')}.png`; link.click(); };
        row.append(choose, input, download);
      } else row.append(choose, input, remove);
      list.append(row);
    }
    find('.aea-count').textContent = String(regions.length); find('.aea-empty').hidden = !!regions.length;
  };
  const setMode = next => {
    mode = next;
    find('.aea-hint').textContent = { region: '서로 떨어진 객체마다 사각형을 그리세요. 라벨은 오른쪽에서 입력합니다.', keep: '객체를 선택한 뒤, 열린 윤곽 안에서 흰색을 유지할 부분을 드래그하세요.', anchor: '객체를 선택한 뒤, 그림에서 지시선이 닿을 점을 누르세요.', label: '객체를 선택한 뒤, 라벨을 놓을 점을 누르세요.' }[mode];
    controls();
  };
  const point = event => {
    const box = overlay.getBoundingClientRect();
    return { x: Math.round(Math.max(0, Math.min(width, (event.clientX - box.left) * width / box.width))), y: Math.round(Math.max(0, Math.min(height, (event.clientY - box.top) * height / box.height))) };
  };
  const rectangle = (start, end) => ({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) });
  overlay.onpointerdown = event => {
    if (busy || showingPreview || !width || event.button !== 0 || !current()) return;
    if (mode !== 'region' && !active()) { status.textContent = '먼저 객체를 선택해 주세요.'; return; }
    const start = point(event);
    if (mode === 'anchor' || mode === 'label') { active()[mode === 'anchor' ? 'anchor' : 'labelPoint'] = start; invalidate(); return; }
    event.preventDefault(); overlay.setPointerCapture(event.pointerId); drag = { start, id: event.pointerId };
  };
  overlay.onpointermove = event => {
    if (!drag) return;
    draw(); overlay.append(svgNode('rect', { ...rectangle(drag.start, point(event)), class: 'aea-draft' }));
  };
  overlay.onpointerup = event => {
    if (!drag) return;
    const rect = rectangle(drag.start, point(event)); drag = null;
    if (overlay.hasPointerCapture(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
    if (rect.width < 3 || rect.height < 3) { draw(); return; }
    if (mode === 'region') {
      const region = { ...rect, id: crypto.randomUUID(), label: '', anchor: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, labelPoint: { x: rect.x, y: Math.max(16, rect.y - 16) }, keepRects: [] };
      regions.push(region); selected = region.id;
    } else active().keepRects.push(rect);
    renderList(); invalidate();
  };
  overlay.onpointercancel = () => { drag = null; draw(); };
  const runPreview = async () => {
    if (busy || !regions.length || !current()) return;
    if (showingPreview) { showingPreview = false; source.hidden = false; overlay.toggleAttribute("hidden", automatic); preview.toggleAttribute("hidden", true); find('[data-action="preview"]').textContent = automatic ? '분리 결과 보기' : '미리보기'; return; }
    if (automatic) {
      drawPrepared(); showingPreview = true; source.hidden = true; overlay.toggleAttribute('hidden', true); preview.toggleAttribute('hidden', false);
      find('[data-action="preview"]').textContent = '원본 보기'; status.textContent = `${prepared.assets.length}개 물체를 확인했습니다. 이름은 페이지에 함께 들어가며 여기서 수정할 수 있습니다.`; return;
    }
    busy = true; status.textContent = '객체 바깥 배경을 투명하게 만드는 중…'; controls();
    const version = revision;
    try {
      const output = await prepareEditableAssets(dataUrl, structuredClone(regions), { threshold: 240 });
      if (!current() || version !== revision) return;
      prepared = output; preview.replaceChildren();
      for (const asset of output.assets) {
        preview.append(svgNode('image', { href: asset.data, x: asset.x, y: asset.y, width: asset.width, height: asset.height }));
        if (asset.label.trim()) preview.append(labelNode(asset));
      }
      showingPreview = true; source.hidden = true; overlay.toggleAttribute("hidden", true); preview.toggleAttribute("hidden", false);
      find('[data-action="preview"]').textContent = '선택으로 돌아가기';
      status.textContent = `${output.assets.length}개 객체 · 체크무늬는 투명 영역입니다. 흰색 내부와 라벨을 확인한 뒤 넣으세요.`;
    } catch (error) { if (!closed) status.textContent = error instanceof Error ? error.message : '미리보기를 만들지 못했습니다.'; }
    finally { busy = false; if (!closed) controls(); }
  };
  dialog.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.mode) { setMode(button.dataset.mode); return; }
    const action = button.dataset.action;
    if (action === 'close' || action === 'cancel') close(false);
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
    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    preview.setAttribute('viewBox', previewViewBoxForLabels(width, height, previewLabelPadding()));
    if (automatic) {
      if (prepared.width !== width || prepared.height !== height || !Array.isArray(prepared.assets) || !prepared.assets.length || prepared.assets.length > 16) {
        prepared = null; status.textContent = '분리 결과가 원본 PNG와 맞지 않습니다. 원본 PNG를 유지했습니다.'; controls(); return;
      }
      regions = prepared.assets.map((asset, index) => ({ ...asset, label: `물체 ${index + 1}`, keepRects: [] }));
      prepared.assets.forEach((asset, index) => { asset.label = regions[index].label; });
      selected = regions[0].id; renderList(); void runPreview();
    } else status.textContent = '원본은 그대로 유지됩니다. 객체를 선택해 주세요.';
    controls();
  };
  source.onerror = () => { status.textContent = '이미지를 불러오지 못했습니다. 닫고 다시 시도해 주세요.'; };
  document.body.append(dialog); dialog.showModal(); setMode('region');
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
  void loadSource();
  return result;
}
