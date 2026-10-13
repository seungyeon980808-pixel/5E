import { splitRegion, rasterizeSplit } from './image-split-geometry.js?v=1.7.0-four-session-integration';

export function initManualImageSplit({ panel, button, getContext, isCurrent, onApply }) {
  const dialog = document.createElement('dialog'); dialog.className = 'manual-split-dialog';
  const titleId = `manual-split-title-${crypto.randomUUID()}`; dialog.setAttribute('aria-labelledby', titleId);
  dialog.innerHTML = `<header><h2 id="${titleId}">원본 이미지 분할</h2><button type="button" data-split-close>닫기</button></header>
    <p>영역을 드래그해서 추가하세요. 자유 그리기는 손을 떼면 영역을 닫습니다. 원본은 그대로 두고 영역마다 새 작업을 만듭니다.</p>
    <div class="manual-split-tools"><label>원본 <select data-split-source aria-label="분할할 원본"></select></label><div role="group" aria-label="분할 방식"><button type="button" data-split-mode="rectangle" aria-pressed="true">사각형 자르기</button><button type="button" data-split-mode="freehand" aria-pressed="false">자유 그리기</button></div><button type="button" data-split-clear>영역 모두 지우기</button></div>
    <div class="manual-split-body"><div class="manual-split-stage"><svg aria-label="영역을 드래그해 추가하는 이미지" role="img"></svg></div><aside aria-label="분할 영역"><ol data-split-regions></ol></aside></div>
    <footer><span data-split-status role="status" aria-live="polite"></span><button type="button" data-split-cancel>취소</button><button type="button" data-split-apply disabled>새 작업으로 분할</button></footer>`;
  panel.append(dialog);
  const sourceSelect = dialog.querySelector('[data-split-source]'), image = new Image(), svg = dialog.querySelector('svg');
  image.alt = '분할할 원본'; image.hidden = true; dialog.querySelector('.manual-split-stage').prepend(image);
  const list = dialog.querySelector('[data-split-regions]'), status = dialog.querySelector('[data-split-status]'), apply = dialog.querySelector('[data-split-apply]');
  let snapshot = null, regions = [], draft = null, mode = 'rectangle', imageReady = false, applying = false, serial = 0, loadEpoch = 0;
  const selectedSource = () => snapshot?.sources.find(source => source.id === sourceSelect.value);
  const svgElement = (name, attributes) => { const el = document.createElementNS('http://www.w3.org/2000/svg', name); for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value); return el; };
  function paint() {
    svg.replaceChildren();
    for (const region of [...regions, ...(draft ? [draft] : [])]) {
      let shape;
      if (region.mode === 'freehand') shape = svgElement('polygon', { points: region.points.map(point => `${point.x},${point.y}`).join(' ') });
      else shape = svgElement('rect', { x:region.x, y:region.y, width:region.width, height:region.height });
      svg.append(shape);
      if (region.number) {
        const scale = image.naturalWidth / (svg.getBoundingClientRect().width || image.naturalWidth);
        const label = svgElement('text', { x:region.x + 3 * scale, y:region.y + 18 * scale, 'vector-effect':'non-scaling-stroke' }); label.style.fontSize = `${16 * scale}px`; label.textContent = region.number; svg.append(label);
      }
    }
  }
  function refresh() {
    list.replaceChildren();
    for (const region of regions) {
      const row = document.createElement('li'), label = document.createElement('label'), input = document.createElement('input'), remove = document.createElement('button');
      label.append(document.createTextNode(`영역 ${region.number} · ${region.width}×${region.height}px`));
      input.value = region.name; input.maxLength = 80; input.setAttribute('aria-label', `영역 ${region.number} 이름`); input.addEventListener('input', () => { region.name = input.value; }); label.append(input);
      remove.type = 'button'; remove.textContent = '삭제'; remove.setAttribute('aria-label', `영역 ${region.number} 삭제`); remove.addEventListener('click', () => { regions = regions.filter(item => item !== region); refresh(); }); row.append(label, remove); list.append(row);
    }
    if (!regions.length) { const item = document.createElement('li'); item.textContent = '이미지에서 필요한 영역을 그려 주세요.'; list.append(item); }
    apply.disabled = !imageReady || !regions.length || applying;
    dialog.querySelector('[data-split-clear]').disabled = applying || !regions.length;
    paint();
  }
  function loadSource() {
    const epoch = ++loadEpoch; imageReady = false; image.hidden = true; regions = []; draft = null; serial = 0; status.textContent = '원본을 불러오는 중입니다.'; refresh();
    image.onload = () => {
      if (epoch !== loadEpoch || !dialog.open) return;
      if (image.naturalWidth * image.naturalHeight > 40000000) { status.textContent = '이미지가 너무 큽니다. 필요한 부분을 먼저 잘라 주세요.'; return; }
      imageReady = true; image.hidden = false; svg.setAttribute('viewBox', `0 0 ${image.naturalWidth} ${image.naturalHeight}`); dialog.querySelector('.manual-split-stage').style.setProperty('--split-aspect', image.naturalWidth / image.naturalHeight); status.textContent = '사각형 또는 자유 그리기로 영역을 추가하세요.'; refresh();
    };
    image.onerror = () => { if (epoch === loadEpoch) status.textContent = '이미지를 읽지 못했습니다. 원본을 다시 추가해 주세요.'; };
    image.src = selectedSource().data;
  }
  function close() { if (applying) return; ++loadEpoch; dialog.close(); button.focus(); }
  button.addEventListener('click', () => {
    const context = getContext(); if (!context?.sources.length || !context.editable) return;
    snapshot = context; pointer = null; sourceSelect.replaceChildren();
    for (const source of snapshot.sources) { const option = document.createElement('option'); option.value = source.id; option.textContent = source.name; sourceSelect.append(option); }
    if (snapshot.sources.some(source => source.id === snapshot.selectedSourceId)) sourceSelect.value = snapshot.selectedSourceId;
    dialog.showModal(); loadSource();
  });
  sourceSelect.addEventListener('change', loadSource);
  for (const control of dialog.querySelectorAll('[data-split-mode]')) control.addEventListener('click', () => { mode = control.dataset.splitMode; for (const item of dialog.querySelectorAll('[data-split-mode]')) item.setAttribute('aria-pressed', String(item === control)); });
  dialog.querySelector('[data-split-clear]').addEventListener('click', () => { regions = []; refresh(); });
  dialog.querySelector('[data-split-close]').addEventListener('click', close); dialog.querySelector('[data-split-cancel]').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); }); dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('close', () => { ++loadEpoch; snapshot = null; pointer = null; regions = []; draft = null; imageReady = false; image.removeAttribute('src'); });
  let pointer = null;
  const resize = new ResizeObserver(paint); resize.observe(svg);
  const point = event => { const bounds = svg.getBoundingClientRect(); return { x:Math.max(0, Math.min(image.naturalWidth, (event.clientX - bounds.left) * image.naturalWidth / bounds.width)), y:Math.max(0, Math.min(image.naturalHeight, (event.clientY - bounds.top) * image.naturalHeight / bounds.height)) }; };
  svg.addEventListener('pointerdown', event => {
    if (!imageReady || applying || event.button !== 0 || pointer || regions.length >= 32) return;
    event.preventDefault(); pointer = { id:event.pointerId, mode, points:[point(event)] }; svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', event => {
    if (pointer?.id !== event.pointerId) return;
    const next = point(event); if (pointer.mode === 'rectangle') pointer.points = [pointer.points[0], next];
    else if (pointer.points.length < 4000 && Math.hypot(next.x - pointer.points.at(-1).x, next.y - pointer.points.at(-1).y) >= 1) pointer.points.push(next);
    draft = splitRegion(pointer.mode, pointer.points, image.naturalWidth, image.naturalHeight); paint();
  });
  svg.addEventListener('pointerup', event => {
    if (pointer?.id !== event.pointerId) return;
    pointer.points.push(point(event)); const region = splitRegion(pointer.mode, pointer.points, image.naturalWidth, image.naturalHeight);
    pointer = null; draft = null;
    if (region) { region.number = ++serial; region.name = `${selectedSource().name} · 영역 ${serial}`.slice(0,80); regions.push(region); status.textContent = `${regions.length}개 영역 · 각 영역은 새 작업으로 추가됩니다.`; }
    else status.textContent = '영역이 너무 작거나 닫힌 면적이 없습니다. 다시 그려 주세요.';
    refresh();
  });
  const cancelPointer = () => { pointer = null; draft = null; paint(); };
  svg.addEventListener('pointercancel', cancelPointer); svg.addEventListener('lostpointercapture', cancelPointer);
  apply.addEventListener('click', async () => {
    if (apply.disabled || !isCurrent(snapshot)) { status.textContent = '원본이나 작업 상태가 바뀌었습니다. 닫고 다시 분할해 주세요.'; return; }
    applying = true; refresh();
    for (const control of dialog.querySelectorAll('button,input,select')) control.disabled = true;
    try {
      if (regions.reduce((sum, region) => sum + region.width * region.height, 0) > 40000000) throw new Error('선택 영역의 합계가 너무 큽니다. 영역을 나눠서 분할해 주세요.');
      const source = selectedSource();
      const references = regions.map(region => ({ name:region.name.trim() || `영역 ${region.number}`, data:rasterizeSplit(image, region), sourceKind:'manual-split', source:{ parentTaskId:snapshot.taskId, sourceId:source.id, imageKind:source.imageKind, originalName:source.name, originalWidth:image.naturalWidth, originalHeight:image.naturalHeight, region:{ ...region } } }));
      if (!isCurrent(snapshot)) throw new Error('원본이나 작업 상태가 바뀌었습니다. 닫고 다시 분할해 주세요.');
      await onApply(references, snapshot); applying = false; close();
    } catch (error) { status.textContent = error.message || '분할하지 못했습니다. 원본은 유지됩니다. 다시 시도해 주세요.'; }
    finally { applying = false; for (const control of dialog.querySelectorAll('button,input,select')) control.disabled = false; refresh(); }
  });
  return { refresh() { const context = getContext(); button.disabled = !context?.editable || !context.sources.length; }, destroy() { ++loadEpoch; resize.disconnect(); dialog.remove(); } };
}
