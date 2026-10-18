import { registerEscapeLayer } from './escape-layers.js?v=1.7.0-four-session-integration';
export const PRESERVE_UNREQUESTED = '\n수정 계약: 코멘트와 이번 요청에 명시된 변경만 허용한다. 명시되지 않은 물체·개수·연결·안팎·액체 위치·배치·색조는 선택한 수정 대상 버전대로 보존한다. 최초 원본은 과학적 의미의 근거로 함께 대조한다. 요청하지 않은 변화는 검수 실패 또는 확인 필요로 보고한다. 코멘트 표시와 번호는 출력 그림에 그리지 않는다.';

const BOX_KEYS = ['x', 'y', 'w', 'h'];
const TOOL_NAMES = new Set(['select', 'pan', 'point', 'area', 'free']);
const clamp = value => Math.max(0, Math.min(100, value));
const commentKey = (item, comment) => `${item.id}:${commentDisplayNumber(item, comment)}`;
export const commentDisplayNumber = (item, comment) => (item.comments || []).indexOf(comment) + 1;
const commentText = comment => String(comment?.text || '');

export function normalizeCommentBox(value) {
  if (!value || value.x == null || value.y == null) return null;
  const box = Object.fromEntries(BOX_KEYS.map(key => [key, Number(value?.[key] ?? 0)]));
  if (!Object.values(box).every(Number.isFinite)) return null;
  if (box.x < 0 || box.y < 0 || box.w < 0 || box.h < 0
      || box.x + box.w > 100.001 || box.y + box.h > 100.001) return null;
  if (value?.type === 'area' && (box.w <= 0 || box.h <= 0)) return null;
  return box;
}

function normalizeCompositeRect(value) {
  if (!value || typeof value !== 'object') return null;
  if ('width' in value || 'height' in value || 'canvasWidth' in value || 'canvasHeight' in value) {
    const x = Number(value.x);
    const y = Number(value.y);
    const width = Number(value.width);
    const height = Number(value.height);
    const canvasWidth = Number(value.canvasWidth);
    const canvasHeight = Number(value.canvasHeight);
    if (![x, y, width, height, canvasWidth, canvasHeight].every(Number.isFinite)
        || canvasWidth <= 0 || canvasHeight <= 0) return null;
    return normalizeCommentBox({
      type: 'area',
      x: x / canvasWidth * 100,
      y: y / canvasHeight * 100,
      w: width / canvasWidth * 100,
      h: height / canvasHeight * 100,
    });
  }
  return normalizeCommentBox({ ...value, type: 'area' });
}

export function mapImageCommentToComposite(comment, sourceRect) {
  const box = normalizeCommentBox(comment);
  const rect = normalizeCompositeRect(sourceRect);
  if (!box || !rect) return null;
  const mapped = normalizeCommentBox({
    ...comment,
    x: rect.x + box.x / 100 * rect.w,
    y: rect.y + box.y / 100 * rect.h,
    w: box.w / 100 * rect.w,
    h: box.h / 100 * rect.h,
  });
  return mapped ? { ...comment, ...mapped, ...(comment.polygon ? {polygon:comment.polygon.map(p=>({x:rect.x+p.x/100*rect.w,y:rect.y+p.y/100*rect.h}))} : {}) } : null;
}

export function buildCommentRequest(images = [], { sourceRectsById } = {}) {
  const lines = [];
  for (const item of images) {
    for (const comment of item.comments || []) {
      const hasSourceRect = item.kind === 'reference' && sourceRectsById != null
        && (sourceRectsById instanceof Map
          ? sourceRectsById.has(item.id)
          : Object.hasOwn(sourceRectsById, item.id));
      const sourceRect = hasSourceRect
        ? (sourceRectsById instanceof Map ? sourceRectsById.get(item.id) : sourceRectsById[item.id])
        : null;
      const projected = hasSourceRect ? mapImageCommentToComposite(comment, sourceRect) : comment;
      const box = projected ? normalizeCommentBox(projected) : null;
      if (!commentText(comment).trim() || !box) continue;
      lines.push(`[${item.kind === 'reference' ? '원본' : '선택 버전'} ${item.name}; 이미지ID ${item.id}] ${comment.type === 'point' ? '점' : comment.polygon ? '자유 영역' : '박스'} ${commentDisplayNumber(item, comment)} (x=${box.x}%, y=${box.y}%, w=${box.w}%, h=${box.h}%${projected.polygon ? '; polygon=' + JSON.stringify(projected.polygon) : ''}): ${commentText(comment).trim()}`);
    }
  }
  return lines.length ? `\n\n위치별 코멘트:\n${lines.join('\n')}` : '';
}

// getBoundingClientRect is in visual pixels. Markers are positioned in the
// stage's unscaled, scrollable CSS content coordinates (including CSS zoom).
export function getImageStageGeometry(stage, image) {
  const sr = stage.getBoundingClientRect();
  const ir = image.getBoundingClientRect();
  if (!(sr.width > 0 && sr.height > 0 && ir.width > 0 && ir.height > 0)) return null;
  const scaleX = sr.width / (stage.offsetWidth || sr.width);
  const scaleY = sr.height / (stage.offsetHeight || sr.height);
  return {
    left: (ir.left - sr.left) / scaleX + (stage.scrollLeft || 0) - (stage.clientLeft || 0),
    top: (ir.top - sr.top) / scaleY + (stage.scrollTop || 0) - (stage.clientTop || 0),
    width: ir.width / scaleX,
    height: ir.height / scaleY,
    scaleX,
    scaleY,
  };
}

export function isImageCommentTarget(item, selectedId) {
  if (!item) return false;
  if (item.kind === 'reference') return item.referenceRole === undefined || item.referenceRole === 'INPUT_SOURCE';
  return Boolean(selectedId) && item.id === selectedId;
}

export function createImageCommentController({ panel, getImages, getSelectedId, isBusy, selectedTaskCount = () => 0, isTextCreation = () => false, changed, viewChanged, areaOnlyForSelected = false }) {
  const doc = panel.ownerDocument || document;
  const win = doc.defaultView || globalThis;
  const q = selector => panel.querySelector(selector);
  const bindings = new Map();
  const cleanup = [];
  let tool = 'select';
  const scopedTarget = () => areaOnlyForSelected && !isTextCreation() && images().find(item => item.kind === 'generated' && item.id === getSelectedId() && !item.graphResult && !item.sceneResult);
  let markersVisible = false;
  let selected = null;
  let frame = null;
  let destroyed = false;
  const erasing = () => panel.dataset.aiLocalEraseActive === 'true';
  const precisionOpen = new Set();
  // Reuse the anchored editor through marker redraws so typing and caret survive.
  let closeTimer = null;
  let editing = false;
  const popover = doc.createElement('section');
  popover.className = 'ai-comment-popover'; popover.dataset.aiCommentPopover = '';
  popover.setAttribute('role', 'dialog'); popover.setAttribute('aria-label', '위치 코멘트 편집');
  popover.hidden = true;
  const closePopoverButton = doc.createElement('button');
  closePopoverButton.type = 'button'; closePopoverButton.className = 'ai-comment-popover-close';
  closePopoverButton.textContent = '×'; closePopoverButton.setAttribute('aria-label', '코멘트 닫기');
  const deletePopoverButton = doc.createElement('button');
  deletePopoverButton.type = 'button'; deletePopoverButton.dataset.aiInlineDelete = '';
  deletePopoverButton.textContent = '삭제'; deletePopoverButton.setAttribute('aria-label', '선택 코멘트 삭제');
  const popoverActions = doc.createElement('div'); popoverActions.className = 'ai-comment-popover-actions';
  popoverActions.append(deletePopoverButton, closePopoverButton);
  const inlineList = doc.createElement('div'); inlineList.dataset.aiComments = '';
  popover.append(popoverActions, inlineList); panel.append(popover);
  let editorKey = null;
  const cancelClose = () => { win.clearTimeout(closeTimer); closeTimer = null; };
  function hidePopover() {
    cancelClose(); editing = false; popover.hidden = true;
    delete panel.dataset.aiCommentEditing;
    scheduleMarkers();
  }
  function scheduleClose() {
    cancelClose();
    if (editing || popover.contains(doc.activeElement)) return;
    closeTimer = win.setTimeout(hidePopover, 180);
  }
  function positionPopover() {
    if (popover.hidden) return;
    const active = current();
    const pin = bindings.get(active?.item)?.pins?.get(active?.comment.number);
    if (!pin?.isConnected || !markersVisible || panel.hidden) { hidePopover(); return; }
    const bounds = panel.getBoundingClientRect();
    const area = (q('.ai-results') || panel).getBoundingClientRect();
    const anchor = pin.getBoundingClientRect();
    const scale = bounds.width / (panel.offsetWidth || bounds.width) || 1;
    const margin = 8 * scale;
    const left = Math.max(bounds.left, area.left) + margin;
    const right = Math.min(bounds.right, area.right) - margin;
    const top = Math.max(bounds.top, area.top) + margin;
    const bottom = Math.min(bounds.bottom, area.bottom) - margin;
    if (anchor.bottom < top || anchor.top > bottom || anchor.right < left || anchor.left > right) { hidePopover(); return; }
    popover.style.width = `${Math.max(1, Math.min(420, (right - left) / scale))}px`;
    popover.style.maxHeight = `${Math.max(1, (bottom - top) / scale)}px`;
    const size = popover.getBoundingClientRect();
    const x = Math.max(left, Math.min(anchor.left, right - size.width));
    const below = anchor.bottom + margin;
    const y = Math.max(top, Math.min(below + size.height <= bottom ? below : anchor.top - margin - size.height, bottom - size.height));
    popover.style.left = `${(x - bounds.left) / scale}px`;
    popover.style.top = `${(y - bounds.top) / scale}px`;
  }

  function listen(target, event, handler, options) {
    target?.addEventListener(event, handler, options);
    const dispose = () => target?.removeEventListener(event, handler, options);
    cleanup.push(dispose);
    return dispose;
  }

  function images() { return getImages() || []; }
  function allowed() { const result = scopedTarget(); return result ? [result] : images().filter(item => isImageCommentTarget(item, getSelectedId())); }
  function entries() {
    return allowed().flatMap(item => (item.comments || []).map(comment => ({ item, comment })));
  }
  function current() { return entries().find(({ item, comment }) => commentKey(item, comment) === selected); }

  function activateTab(name) {
    const chat = name === 'chat';
    panel.querySelectorAll('[data-ai-side-tab]').forEach(button => {
      const active = button.dataset.aiSideTab === (chat ? 'chat' : 'comments');
      button.classList.toggle('is-on', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (q('[data-ai-chat-panel]')) q('[data-ai-chat-panel]').hidden = !chat;
    if (q('[data-ai-comments-panel]')) q('[data-ai-comments-panel]').hidden = chat;
  }

  function select(item, comment, { focus = false } = {}) {
    if (isBusy()) return;
    cancelClose();
    if (selected !== commentKey(item, comment)) editing = false;
    selected = commentKey(item, comment);
    markersVisible = true;
    popover.hidden = false; panel.dataset.aiCommentEditing = 'true';
    render();
    positionPopover();
    if (focus) { editing = true; popover.querySelector('[data-ai-inline-editor]')?.focus({ preventScroll: true }); }
  }

  function positionBox(element, box, imageGeometry) {
    Object.assign(element.style, {
      left: `${imageGeometry.left + box.x / 100 * imageGeometry.width}px`,
      top: `${imageGeometry.top + box.y / 100 * imageGeometry.height}px`,
      width: `${box.w / 100 * imageGeometry.width}px`,
      height: `${box.h / 100 * imageGeometry.height}px`,
    });
  }

  function renderMarkers(item) {
    const entry = bindings.get(item);
    if (!entry) return;
    const { stage, img } = entry;
    stage.querySelectorAll('.ai-comment-region[data-ai-comment-marker]').forEach(marker => marker.remove());
    entry.pins ||= new Map();
    const numbers = new Set((item.comments || []).map(comment => comment.number));
    for (const [number, pin] of entry.pins) if (!numbers.has(number) || !isImageCommentTarget(item, getSelectedId())) { pin.remove(); entry.pins.delete(number); }
    if (!isImageCommentTarget(item, getSelectedId())) return;
    const imageGeometry = getImageStageGeometry(stage, img);
    if (!imageGeometry) return;
    for (const comment of item.comments || []) {
      const box = normalizeCommentBox(comment);
      if (!box) continue;
      const active = commentKey(item, comment) === selected;
      if (comment.type !== 'point' && box.w > 0 && box.h > 0) {
        const outline = doc.createElement('div');
        outline.dataset.aiCommentMarker = '';
        outline.className = `ai-comment-region${active ? ' is-active' : ''}`;
        outline.setAttribute('aria-hidden', 'true');
        outline.style.pointerEvents = 'none';
        positionBox(outline, box, imageGeometry);
        if (comment.polygon) drawPolygon(outline,comment.polygon,box);
        stage.append(outline);
      }
      let pin = entry.pins.get(comment.number);
      if (!pin) {
        pin = doc.createElement('button'); pin.type = 'button'; entry.pins.set(comment.number, pin);

      }
      pin.dataset.aiCommentMarker = '';
      pin.className = `ai-comment-marker${active ? ' is-active' : ''}`;
      if (pin.textContent !== String(commentDisplayNumber(item, comment))) pin.textContent = String(commentDisplayNumber(item, comment));
      pin.setAttribute('aria-expanded', String(active && !popover.hidden));
      pin.disabled = isBusy();
      pin.setAttribute('aria-label', `${item.name} 코멘트 ${commentDisplayNumber(item, comment)}`);
      pin.setAttribute('aria-pressed', String(active));
      Object.assign(pin.style, {
        left: `${imageGeometry.left + box.x / 100 * imageGeometry.width}px`,
        top: `${imageGeometry.top + box.y / 100 * imageGeometry.height}px`,
      });
      pin.onpointerenter = event => {
        if (event.pointerType === 'touch' || editing && selected !== commentKey(item, comment)) return;
        select(item, comment);
      };
      pin.onpointerleave = event => { if (!popover.contains(event.relatedTarget)) scheduleClose(); };
      pin.onclick = event => { event.stopPropagation(); select(item, comment, {focus: event.detail === 0}); };
      pin.setAttribute('aria-haspopup', 'dialog');
      if (pin.parentElement !== stage) stage.append(pin);
    }
    if (entry.drag?.type === 'area' && entry.drag.box) drawPreview(entry, entry.drag.box);
  }

  function scheduleMarkers() {
    if (frame != null || destroyed) return;
    const callback = () => {
      frame = null;
      for (const item of images()) renderMarkers(item);
      positionPopover();
    };
    frame = win.requestAnimationFrame ? win.requestAnimationFrame(callback) : setTimeout(callback, 0);
  }

  function drawPreview(entry, box) {
    const imageGeometry = getImageStageGeometry(entry.stage, entry.img);
    if (!imageGeometry) return;
    if (!entry.preview) {
      entry.preview = doc.createElement('div');
      entry.preview.className = 'ai-comment-region ai-comment-drag-preview';
      entry.preview.dataset.aiCommentDragPreview = '';
      entry.preview.setAttribute('aria-hidden', 'true');
      entry.stage.append(entry.preview);
    }
    positionBox(entry.preview, box, imageGeometry);
  }

  function clearDrag(entry) {
    entry.drag = null;
    entry.preview?.remove();
    entry.preview = null;
  }

  function renderList(allEntries) {
    const list = q('[data-ai-comments]');
    if (!list) return;
    const activeEntries = allEntries.filter(({item, comment}) => commentKey(item, comment) === selected);
    const key = activeEntries.map(({item, comment}) => commentKey(item, comment) + commentDisplayNumber(item, comment) + JSON.stringify(comment.precisionCheck || null)).join();
    if (editorKey === key && list.children.length) {
      list.querySelectorAll('textarea, button, input, select').forEach(control => { control.disabled = isBusy(); });
      return;
    }
    editorKey = key;
    list.replaceChildren();
    if (!allEntries.length) {
      const text = doc.createElement('p');
      text.className = 'ai-comments-empty';
      const historical = getImages().filter(item => item.kind === 'generated' && item.id !== getSelectedId() && item.comments?.length);
      text.textContent = historical.length
        ? '이 버전에는 새 코멘트가 없습니다. 이전 코멘트는 원래 버전에 보관되어 있습니다. 버전 목록에서 확인할 수 있습니다.'
        : scopedTarget() ? '수정 박스를 그리고 각 박스에 바꿀 내용을 적으세요. 박스 밖은 원본 그대로 유지됩니다.'
        : '점 또는 영역 도구로 그림에 코멘트를 남기세요. 지정하지 않은 부분은 보존합니다.';
      list.append(text);
    }
    for (const { item, comment } of activeEntries) {
      const row = doc.createElement('article');
      row.className = `ai-workbench-comment${commentKey(item, comment) === selected ? ' is-active' : ''}`;
      row.dataset.aiCommentRow = '';
      row.dataset.active = String(commentKey(item, comment) === selected);
      const editor = doc.createElement('textarea');
      editor.dataset.aiInlineEditor = '';
      editor.value = commentText(comment);
      editor.placeholder = '이 위치에서 바꿀 내용을 입력하세요.';
      editor.setAttribute('aria-label', `코멘트 ${commentDisplayNumber(item, comment)} 내용`);
      editor.disabled = isBusy();
      editor.oninput = () => {
        if (isBusy()) return;
        comment.text = editor.value;
        selected = commentKey(item, comment);
        changed();
        updateControls(entries());
      };
      row.append(editor);
      if (scopedTarget() === item && comment.type === 'area') {
        const details = doc.createElement('details');
        details.dataset.aiPrecisionSettings = '';
        const key = commentKey(item, comment);
        details.open = precisionOpen.has(key);
        const summary = doc.createElement('summary');
        summary.textContent = comment.precisionCheck ? '고급 · 수치 검증 설정됨' : '고급 · 수치 검증 실험';
        details.addEventListener('toggle', () => { if (details.isConnected) {
          if (details.open) precisionOpen.add(key); else precisionOpen.delete(key);
        } });
        const typeLabel = doc.createElement('label');
        typeLabel.textContent = '검증할 수정';
        const type = doc.createElement('select');
        type.dataset.aiPrecisionKind = '';
        type.dataset.aiInputMutator = '';
        type.setAttribute('aria-label', `박스 ${commentDisplayNumber(item, comment)} 검증할 수정`);
        for (const [value,text] of [['','사람 검토만'],['move','이동'],['circles','원 추가'],['disconnect','가로선 끊기']]) {
          const option = doc.createElement('option'); option.value=value; option.textContent=text; type.append(option);
        }
        type.value = comment.precisionCheck?.kind || '';
        const img = bindings.get(item)?.img;
        type.disabled = isBusy() || !img?.naturalWidth || !img?.naturalHeight;
        type.onchange = () => {
          if (isBusy()) return;
          if (!type.value) delete comment.precisionCheck;
          else {
            const r = {x0:Math.ceil(comment.x/100*img.naturalWidth),y0:Math.ceil(comment.y/100*img.naturalHeight),
              x1:Math.floor((comment.x+comment.w)/100*img.naturalWidth),y1:Math.floor((comment.y+comment.h)/100*img.naturalHeight)};
            comment.precisionCheck = {kind:type.value,search:r,
              ...(type.value==='move'?{dx:0,dy:0}:type.value==='disconnect'?{gap:30}:
                {diameter:0,centers:[{x:Math.floor((r.x0+r.x1)/2),y:Math.floor((r.y0+r.y1)/2)}]})};
          }
          changed(); render();
        };
        typeLabel.append(type); details.append(summary,typeLabel);
        const check = comment.precisionCheck;
        if (check) {
          const fields = doc.createElement('div'); fields.dataset.aiPrecisionFields='';
          const numeric = (name,value,update,{min,step=1,max}={}) => {
            const label = doc.createElement('label'); label.textContent=name;
            const input = doc.createElement('input'); input.type='number'; input.value=String(value);
            input.dataset.aiInputMutator='';
            input.inputMode=min===undefined?'text':step<1?'decimal':'numeric';
            input.step=String(step); if(min!==undefined)input.min=String(min);
            if(max!==undefined)input.max=String(max);
            input.setAttribute('aria-label',`박스 ${commentDisplayNumber(item, comment)} ${name}`);
            input.disabled=isBusy();
            input.onchange=()=>{
              if(isBusy())return;
              const next=input.value.trim()?Number(input.value):NaN;
              if(!Number.isFinite(next)||!input.validity.valid){input.value=String(value);return;}
              value=next;update(next);changed();
            };
            label.append(input); fields.append(label); return input;
          };
          if (check.kind==='move') {
            numeric('가로 이동 px',check.dx,v=>check.dx=v);
            numeric('세로 이동 px',check.dy,v=>check.dy=v);
          } else if (check.kind==='circles') {
            numeric('추가 개수',check.centers.length,v=>{
              check.centers=Array.from({length:v},(_,i)=>check.centers[i]||{x:0,y:0}); render();
            },{min:1,max:8});
            numeric('지름 px',check.diameter,v=>check.diameter=v,{min:1});
            check.centers.forEach((center,index)=>{
              numeric(`중심 ${index+1} 가로 px`,center.x,v=>center.x=v,{min:0,step:0.5});
              numeric(`중심 ${index+1} 세로 px`,center.y,v=>center.y=v,{min:0,step:0.5});
            });
          } else if (check.kind==='disconnect') numeric('끊을 간격 px',check.gap,v=>check.gap=v,{min:1});
          const searchTitle = doc.createElement('p'); searchTitle.textContent='대상 탐색 범위 · 원본 픽셀';
          fields.append(searchTitle);
          for (const [key,name] of [['x0','왼쪽 px'],['y0','위쪽 px'],['x1','오른쪽 px'],['y1','아래쪽 px']]) {
            numeric(name,check.search[key],v=>check.search[key]=v,{min:0});
          }
          const note = doc.createElement('p');
          const permissionNote=doc.createElement('span');
          permissionNote.textContent='수정 박스를 넓히지 않습니다.';
          permissionNote.style.whiteSpace='nowrap';
          note.append('탐색은 읽기 전용입니다. ',permissionNote,' 숫자 통과 후에도 외관과 다른 대상의 보존을 확인하세요.');
          details.append(fields,note);
        }
        row.append(details);
      }
      list.append(row);
    }
  }

  function updateControls(allEntries) {
    const active = current();
    const busy = isBusy();
    deletePopoverButton.disabled = busy || !active;
    const visibility = q('[data-ai-comment-visibility]');
    if (visibility) {
      visibility.setAttribute('aria-pressed', String(markersVisible));
      visibility.textContent = markersVisible ? '코멘트 표시' : '코멘트 숨김';
    }
    panel.dataset.aiCommentsVisible = String(markersVisible);
    const count = q('[data-ai-comments-count]');
    if (count) count.textContent = String(allEntries.length);
    const status = q('[data-ai-comment-status]');
    if (status) status.textContent = active
      ? `#${commentDisplayNumber(active.item, active.comment)} · ${active.item.kind === 'reference' ? '원본' : active.item.name || '선택 버전'} · ${active.comment.type === 'point' ? '점' : '영역'}${busy ? ' · 작업 중 편집 잠김' : ' · 입력 자동 보관'}`
      : '그림이나 목록에서 코멘트를 선택하세요.';
    const completeCount = allEntries.filter(({ comment }) => commentText(comment).trim() && normalizeCommentBox(comment)).length;
    const apply = q('[data-ai-comments-apply]');
    if (apply) {
      const areas = allEntries.filter(({comment}) => comment.type === 'area');
      const selectedCount = selectedTaskCount();
      if (Number.isInteger(selectedCount) && selectedCount >= 2) {
        apply.textContent = `선택한 작업 ${selectedCount}개 변환하기`;
        apply.disabled = busy || panel.dataset.aiSharingMode === 'view';
      } else if (scopedTarget()) {
        apply.textContent = '수정하기';
        apply.disabled = busy || !areas.length || areas.some(({comment}) => !commentText(comment).trim() || !normalizeCommentBox(comment));
      } else if (isTextCreation()) {
        apply.textContent = '그림 만들기';
        apply.disabled = busy || !q('[data-ai-input]')?.value.trim() || panel.dataset.aiSharingMode === 'view';
      } else {
        apply.textContent = panel.dataset.aiWorkflow === 'graph' ? '그래프 복원' : '변환하기';
        apply.disabled = busy || !allowed().length;
      }
    }
    const applyHint = q('[data-ai-scoped-apply-hint]');
    if (applyHint) {
      const areas = allEntries.filter(({comment}) => comment.type === 'area');
      applyHint.hidden = !scopedTarget() || selectedTaskCount() >= 2;
      applyHint.textContent = !areas.length ? '수정 박스로 영역을 지정하세요.'
        : areas.some(({comment}) => !commentText(comment).trim()) ? '각 박스에 바꿀 내용을 적으세요.' : `박스 ${areas.length}개 · 밖은 그대로 유지`;
    }
    panel.querySelectorAll('[data-ai-comment-tool]').forEach(button => {
      button.disabled = busy;
      button.hidden = false;
      button.classList.toggle('is-on', !erasing() && button.dataset.aiCommentTool === tool);
      button.setAttribute('aria-pressed', String(!erasing() && button.dataset.aiCommentTool === tool));
    });
    const toolbar = q('.ai-annotation-toolbar');
    toolbar?.toggleAttribute('data-escape-layer', tool !== 'select' || Boolean(selected && markersVisible));
  }


  function render() {
    if (destroyed) return;
    const resultId = scopedTarget()?.id || null;

    if (resultId) activateTab('comments');
    for (const [item, entry] of bindings) {
      if (entry.img.isConnected === false) { entry.dispose(); bindings.delete(item); }
    }
    for (const item of images()) renderMarkers(item);
    const allEntries = entries();
    if (!allEntries.some(({ item, comment }) => commentKey(item, comment) === selected)) { selected = null; hidePopover(); }
    renderList(allEntries);
    updateControls(allEntries);
    positionPopover();
  }

  function imagePoint(event, img) {
    const rect = img.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return null;
    return { x: clamp((event.clientX - rect.left) / rect.width * 100), y: clamp((event.clientY - rect.top) / rect.height * 100) };
  }

  function polygonBox(points) {
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    return {x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs)-Math.min(...xs), h: Math.max(...ys)-Math.min(...ys)};
  }
  function drawPolygon(node,points,box) {
    const ns='http://www.w3.org/2000/svg';
    let svg=node.querySelector('svg');
    if(!svg) {svg=doc.createElementNS(ns,'svg');const path=doc.createElementNS(ns,'polygon');path.setAttribute('vector-effect','non-scaling-stroke');svg.append(path);node.append(svg);}
    node.style.border='0';node.style.background='transparent';
    svg.setAttribute('viewBox',`${box.x} ${box.y} ${Math.max(.001,box.w)} ${Math.max(.001,box.h)}`);svg.setAttribute('preserveAspectRatio','none');
    Object.assign(svg.style,{width:'100%',height:'100%',overflow:'visible'});
    svg.firstChild.setAttribute('points',points.map(p=>`${p.x},${p.y}`).join(' '));
    svg.firstChild.setAttribute('fill','var(--ai-comment-region-fill, #2f81f711)');svg.firstChild.setAttribute('stroke','var(--accent, #2f81f7)');svg.firstChild.setAttribute('stroke-width','1');
  }

  function dragBox(from, to) {
    return { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) };
  }

  function bind(item, stage, img) {
    bindings.get(item)?.dispose();
    const entry = { stage, img, drag: null, preview: null, dispose: null };
    const disposers = [];
    const on = (target, event, handler) => {
      target.addEventListener(event, handler);
      disposers.push(() => target.removeEventListener(event, handler));
    };
    bindings.set(item, entry);
    on(stage, 'pointerdown', event => {
      if (tool === 'select') return;
      if (erasing() || isBusy() || !allowed().includes(item) || (event.button != null && event.button !== 0) || event.isPrimary === false) return;
      if (event.target.closest?.('[data-ai-comment-marker]')) return;
      if (event.target !== img && event.target !== stage) return;
      const point = imagePoint(event, img);
      if (!point) return;
      event.preventDefault();
      const parent = stage.parentElement;
      const scrollTarget = parent && (parent.scrollWidth > parent.clientWidth || parent.scrollHeight > parent.clientHeight) ? parent : stage;
      const rect = scrollTarget.getBoundingClientRect();
      entry.drag = tool === 'pan'
        ? { type: 'pan', pointerId: event.pointerId, x: event.clientX, y: event.clientY, scrollTarget, left: scrollTarget.scrollLeft, top: scrollTarget.scrollTop, scaleX: rect.width / (scrollTarget.offsetWidth || rect.width), scaleY: rect.height / (scrollTarget.offsetHeight || rect.height) }
        : { type: tool, pointerId: event.pointerId, from: point, points: [point] };
      try { stage.setPointerCapture?.(event.pointerId); } catch { /* detached pointer */ }
    });
    on(stage, 'pointermove', event => {
      const drag = entry.drag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (erasing() || isBusy() || !allowed().includes(item)) { clearDrag(entry); return; }
      if (drag.type === 'pan') {
        drag.scrollTarget.scrollLeft = drag.left - (event.clientX - drag.x) / drag.scaleX;
        drag.scrollTarget.scrollTop = drag.top - (event.clientY - drag.y) / drag.scaleY;
        return;
      }
      if (drag.type === 'free') {
        const to = imagePoint(event, img);
        if (to && drag.points.length < 4096) drag.points.push(to);
        drag.box = polygonBox(drag.points);
        drawPreview(entry, drag.box);
        drawPolygon(entry.preview,drag.points,drag.box);
      }
      if (drag.type === 'area') {
        const to = imagePoint(event, img);
        if (to) { drag.box = dragBox(drag.from, to); drawPreview(entry, drag.box); }
      }
    });
    on(stage, 'pointerup', event => {
      const drag = entry.drag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      clearDrag(entry);
      if (drag.type === 'pan' || erasing() || isBusy() || !allowed().includes(item)) return;
      const to = imagePoint(event, img);
      if (!to) return;
      if (drag.type === 'free') drag.points.push(to);
      const box = drag.type === 'point' ? { ...to, w: 0, h: 0 } : drag.type === 'free' ? polygonBox(drag.points) : dragBox(drag.from, to);
      if (drag.type !== 'point' && (box.w < 0.1 || box.h < 0.1)) return;
      if (!normalizeCommentBox({ ...box, type: drag.type })) return;
      item.comments ||= [];
      const number = Math.max(Number(item.nextCommentNumber) || 1, ...item.comments.map(comment => (Number(comment.number) || 0) + 1));
      const comment = { number, type: drag.type === 'free' ? 'area' : drag.type, ...box, text: '', imageId: item.id, ...(drag.type === 'free' ? { polygon: drag.points } : {}) };
      item.nextCommentNumber = number + 1;
      item.comments.push(comment);
      changed();
      select(item, comment);
    });
    on(stage, 'pointercancel', () => clearDrag(entry));
    on(stage, 'lostpointercapture', () => clearDrag(entry));
    on(stage, 'scroll', scheduleMarkers);
    on(stage, 'transitionend', scheduleMarkers);
    on(img, 'load', scheduleMarkers);
    if (win.ResizeObserver) {
      const resize = new win.ResizeObserver(scheduleMarkers);
      resize.observe(img);
      resize.observe(stage);
      disposers.push(() => resize.disconnect());
    }
    if (win.MutationObserver) {
      const mutations = new win.MutationObserver(scheduleMarkers);
      for (const node of [stage, img]) mutations.observe(node, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
      disposers.push(() => mutations.disconnect());
    }
    entry.dispose = () => { clearDrag(entry); disposers.forEach(dispose => dispose()); };
    renderMarkers(item);
  }

  function closeCommentMode() {
    hidePopover(); tool = 'select';
    for (const entry of bindings.values()) clearDrag(entry);
    updateControls(entries()); viewChanged?.();
  }
  const escapeComment = () => { deleteSelectedComment(); closeCommentMode(); };
  cleanup.push(registerEscapeLayer(popover, escapeComment));
  const commentToolbar = q('.ai-annotation-toolbar');
  if (commentToolbar) cleanup.push(registerEscapeLayer(commentToolbar, escapeComment));

  listen(deletePopoverButton, 'click', deleteSelectedComment);
  listen(popover, 'pointerenter', cancelClose);
  listen(popover, 'pointerleave', scheduleClose);
  listen(popover, 'focusin', () => { cancelClose(); editing = true; });
  listen(doc, 'pointerdown', event => {
    if (!popover.hidden && !popover.contains(event.target) && !event.target.closest?.('[data-ai-comment-marker]')) hidePopover();
  });

  listen(closePopoverButton, 'click', () => {
    const active = current();
    hidePopover(); bindings.get(active?.item)?.pins?.get(active?.comment.number)?.focus({preventScroll:true});
  });
  listen(popover, 'keydown', event => {
    if (event.key === 'Escape') {
      event.stopImmediatePropagation();
      if (!event.isComposing) { event.preventDefault(); escapeComment(); }
    }
  });
  listen(panel, 'click', event => {
    if (event.target.closest?.('[data-ai-comment-visibility]')) {
      markersVisible = !markersVisible;
      if (!markersVisible) hidePopover();
      updateControls(entries());
      viewChanged?.();
      return;
    }
    const button = event.target.closest?.('[data-ai-comment-tool]');
    if (button && !isBusy() && TOOL_NAMES.has(button.dataset.aiCommentTool)) {

      tool = tool === button.dataset.aiCommentTool ? 'select' : button.dataset.aiCommentTool;
      if (tool !== 'pan' && tool !== 'select') markersVisible = true;
      for (const entry of bindings.values()) clearDrag(entry);
      updateControls(entries());
      viewChanged?.();
    }
    const tab = event.target.closest?.('[data-ai-side-tab]');
    if (tab) activateTab(tab.dataset.aiSideTab);
  });
  function deleteSelectedComment() {
    const active = current();
    if (!active || isBusy()) return;
    active.item.comments = active.item.comments.filter(comment => comment !== active.comment);
    selected = null; hidePopover();
    changed();
    render();
  }
  listen(panel, 'keydown', event => {
    if (!['Delete', 'Backspace'].includes(event.key) || event.isComposing || event.defaultPrevented) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || panel.querySelector('dialog[open]')) return;
    if (!current() || isBusy()) return;
    event.preventDefault(); event.stopPropagation();
    deleteSelectedComment();
  });
  listen(panel, '5e:ai-local-erase-tool-change', () => { for (const entry of bindings.values()) clearDrag(entry); updateControls(entries()); });
  listen(panel, '5e:ai-candidate-select', () => { for (const entry of bindings.values()) clearDrag(entry); selected = null; render(); });
  listen(win, 'resize', scheduleMarkers);
  if (win.MutationObserver) {
    const layout = new win.MutationObserver(scheduleMarkers);
    for (const node of [panel, q('.ai-results')].filter(Boolean)) {
      layout.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    }
    cleanup.push(() => layout.disconnect());
  }
  activateTab('comments');
  render();
  return {
    bind,
    render,
    cancelTool: closeCommentMode,
    refreshControls: () => updateControls(entries()),
    getViewState: () => ({version:2,tool,selected,markersVisible,tab:q('[data-ai-chat-panel]')?.hidden===false?'chat':'comments'}),
    restoreViewState(value) {
      tool = panel.dataset.aiSharingMode === 'view' ? 'select'
        : value?.tool === 'pan' && value.version !== 2 ? 'select'
        : TOOL_NAMES.has(value?.tool) ? value.tool : 'select';
      selected=typeof value?.selected==='string'?value.selected:null;
      markersVisible=value?.markersVisible === true;
      activateTab(value?.tab);
      render();
    },
    reset() { for (const entry of bindings.values()) clearDrag(entry); selected = null; activateTab('comments'); render(); },
    destroy() {
      destroyed = true; cancelClose(); popover.remove();
      if (frame != null) {
        if (win.cancelAnimationFrame) win.cancelAnimationFrame(frame);
        else clearTimeout(frame);
      }
      for (const entry of bindings.values()) entry.dispose();
      bindings.clear();
      cleanup.forEach(dispose => dispose());
    },
  };
}
