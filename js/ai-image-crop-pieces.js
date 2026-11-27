// 11-26 시안 v6 「자르기」: 사각형·자유형으로 영역을 그리고 「조각 분리」(Enter)를 누르면 그 부분이 따로 옮길 수 있는 조각이 된다.
// 떼어 낸 자리는 흰색으로 남는다. 조각은 그림 층에만 있어 라벨은 따라 움직이지 않는다(11-26 사용자). 분리·옮기기·지우기는 각각 실행 취소 한 단계.
import { getImageStageGeometry } from './ai-image-comments.js?v=1.7.0-four-session-integration';
import { splitPiece } from './ai-image-pieces-core.js?v=1.7.0-four-session-integration';
import { shortcutKey } from './platform.js?v=1.7.0-four-session-integration';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createCropPieces({ panel, getTarget, getPlan, eraser, status, afterSplit = () => {}, signal }) {
  const doc = panel.ownerDocument, win = doc.defaultView;
  let active = false, shape = 'rect', pending = null, drag = null, selectedPiece = null, splitting = false, layer = null;
  const options = doc.createElement('section');
  options.className = 'ai-crop-options'; options.dataset.aiCropOptions = ''; options.hidden = true; options.setAttribute('aria-label','자르기 설정');
  options.innerHTML = `<div class="ai-erase-modes" role="group" aria-label="자르기 모양"><button type="button" data-ai-crop-shape="rect" aria-pressed="true">사각형</button><button type="button" data-ai-crop-shape="loop" aria-pressed="false">자유형</button></div>
    <button type="button" class="ai-crop-apply" data-ai-crop-apply disabled>조각 분리</button>
    <small>떼어 낼 곳을 둘러싼 뒤 조각 분리(Enter)를 누르세요. 조각은 선택 도구로 끌어 옮깁니다. Esc: 선택 도구</small>`;
  panel.querySelector('.ai-manual-tools')?.append(options);

  const eligible = item => item?.kind === 'generated' && !item.graphResult && !item.sceneResult && typeof item.data === 'string' && item.data.startsWith('data:image/png;base64,');
  const stageOf = item => item?.card?.querySelector('.ai-preview-stage');
  const imageOf = item => stageOf(item)?.querySelector(':scope > img');
  const pieces = item => eraser.getDraft(item)?.pieces || [];

  function ensureLayer(item) {
    const stage = stageOf(item), img = imageOf(item);
    if (!stage || !img?.naturalWidth) { layer?.root.remove(); layer = null; return null; }
    if (layer?.stage !== stage || layer.img !== img) {
      layer?.root.remove();
      const root = doc.createElement('div'); root.className = 'ai-crop-layer'; root.dataset.aiCommentDragPreview = '';
      const svg = doc.createElementNS(SVG_NS,'svg'); svg.classList.add('ai-crop-outline'); svg.setAttribute('aria-hidden','true');
      root.append(svg); stage.append(root);
      layer = { root, svg, stage, img };
    }
    const g = getImageStageGeometry(stage, img);
    if (g) Object.assign(layer.root.style,{ left:`${g.left}px`, top:`${g.top}px`, width:`${g.width}px`, height:`${g.height}px` });
    layer.svg.setAttribute('viewBox',`0 0 ${img.naturalWidth} ${img.naturalHeight}`);
    return layer;
  }
  function render() {
    const item = getTarget();
    const list = eligible(item) ? pieces(item).filter(piece => !piece.deleted) : [];
    const manual = panel.dataset.aiResultMode === 'manual' && !panel.hidden;
    if (!list.length && !active) { layer?.root.remove(); layer = null; selectedPiece = null; syncOptions(); return; }
    const L = ensureLayer(item); if (!L) return;
    const W = L.img.naturalWidth, H = L.img.naturalHeight;
    for (const el of [...L.root.querySelectorAll('img[data-ai-piece]')]) if (!list.some(p => p.id === el.dataset.aiPiece)) el.remove();
    for (const piece of list) {
      let el = L.root.querySelector(`img[data-ai-piece="${piece.id}"]`);
      if (!el) { el = doc.createElement('img'); el.dataset.aiPiece = piece.id; el.alt = ''; el.draggable = false; L.root.insertBefore(el, L.svg); }
      if (el.getAttribute('src') !== piece.data) el.src = piece.data;
      Object.assign(el.style,{ left:`${piece.x/W*100}%`, top:`${piece.y/H*100}%`, width:`${piece.w/W*100}%`, height:`${piece.h/H*100}%`, transform:'' });
    }
    L.root.classList.toggle('is-movable', manual && !active && panel.dataset.aiLocalEraseActive !== 'true');
    L.root.classList.toggle('is-cropping', active);
    paintOutline();
    syncOptions();
  }
  function paintOutline() {
    if (!layer) return;
    const svg = layer.svg; svg.replaceChildren();
    const item = getTarget(), piece = pieces(item).find(p => p.id === selectedPiece && !p.deleted);
    if (piece && !active) {
      const r = doc.createElementNS(SVG_NS,'rect'); r.classList.add('ai-crop-selected');
      for (const [k,v] of Object.entries({x:piece.x,y:piece.y,width:piece.w,height:piece.h})) r.setAttribute(k,v);
      r.setAttribute('vector-effect','non-scaling-stroke'); svg.append(r);
    }
    const points = drag?.kind === 'region' ? drag.points : pending;
    if (active && points?.length > 1) {
      const p = doc.createElementNS(SVG_NS,'path'); p.classList.add('ai-crop-region'); p.setAttribute('vector-effect','non-scaling-stroke');
      p.setAttribute('d',points.map((q,i) => `${i ? 'L' : 'M'}${q.x} ${q.y}`).join(' ') + 'Z'); svg.append(p);
    }
  }
  function syncOptions() {
    options.hidden = !active;
    for (const b of options.querySelectorAll('[data-ai-crop-shape]')) b.setAttribute('aria-pressed',String(b.dataset.aiCropShape === shape));
    options.querySelector('[data-ai-crop-apply]').disabled = !pending || splitting;
  }
  function open() {
    const item = getTarget(); if (!eligible(item)) { status('이미지 수정본을 선택하면 자를 수 있습니다.','warn'); return; }
    active = true; pending = null; selectedPiece = null; panel.dataset.aiCropActive = 'true';
    panel.dispatchEvent(new CustomEvent('5e:ai-crop-tool-change')); render();
  }
  function close() {
    if (!active) return;
    active = false; pending = null; drag = null; delete panel.dataset.aiCropActive;
    panel.dispatchEvent(new CustomEvent('5e:ai-crop-tool-change')); render();
  }
  const pointOf = (event,img) => { const r = img.getBoundingClientRect(); return { x:(event.clientX-r.left)/r.width*img.naturalWidth, y:(event.clientY-r.top)/r.height*img.naturalHeight }; };

  async function applySplit() {
    const item = getTarget(); if (!pending || splitting || !eligible(item)) return;
    splitting = true; syncOptions();
    const polygon = pending.map(p => ({...p}));
    try {
      const draft = eraser.getDraft(item), source = draft?.data || await eraser.resolveSource(item);
      const { base, piece } = await splitPiece(source, polygon);
      // 11-26 사용자: 조각은 그림 층에만 있다 — 영역 안의 라벨도 함께 옮기던 것(시안 v6)은 하지 않는다.
      const labelIds = [];
      const id = `piece-${crypto.randomUUID()}`;
      const ok = await eraser.updateDraft(item,{ data:base, pieces:[...(draft?.pieces || []), { id, ...piece, labelIds }],
        operations:[...(draft?.operations || []), { mode:'piece', points:polygon }] },'조각을 분리했습니다. 끌어서 옮기세요.');
      // 자른 직후에는 조각을 고른 채로 둬 잘린 모양을 확인하게 한다(사용자 11-26). 밖을 누르면 풀린다.
      if (ok) { pending = null; selectedPiece = id; close(); afterSplit(); render(); }
    } catch (error) { status(error.message || '조각을 분리하지 못했습니다. 다시 시도하세요.','warn'); }
    finally { splitting = false; syncOptions(); }
  }
  async function commitMove(item, id, dx, dy) {
    const draft = eraser.getDraft(item); if (!draft) return;
    const list = draft.pieces.map(p => p.id === id ? { ...p, x:Math.round(p.x+dx), y:Math.round(p.y+dy) } : p);
    await eraser.updateDraft(item,{ pieces:list },'조각을 옮겼습니다.');
    render();
  }
  async function removePiece(item, id) {
    const draft = eraser.getDraft(item); if (!draft) return;
    selectedPiece = null;
    await eraser.updateDraft(item,{ pieces:draft.pieces.filter(p => p.id !== id) },'조각을 지웠습니다.');
    render();
  }
  panel.addEventListener('pointerdown',event => {
    if (event.button !== 0 || splitting) return;
    const item = getTarget(); if (!eligible(item) || panel.dataset.aiResultMode !== 'manual') return;
    const pieceEl = event.target.closest?.('img[data-ai-piece]');
    if (pieceEl && !active && layer?.root.classList.contains('is-movable')) {
      event.preventDefault(); event.stopImmediatePropagation();
      const piece = pieces(item).find(p => p.id === pieceEl.dataset.aiPiece); if (!piece) return;
      selectedPiece = piece.id; paintOutline();
      drag = { kind:'piece', id:piece.id, el:pieceEl, start:pointOf(event,layer.img), dx:0, dy:0, pointerId:event.pointerId };
      try { layer.root.setPointerCapture(event.pointerId); } catch {}
      return;
    }
    if (!active) return;
    const img = imageOf(item); if (!img || !stageOf(item)?.contains(event.target)) return;
    const p = pointOf(event,img); if (p.x < 0 || p.y < 0 || p.x > img.naturalWidth || p.y > img.naturalHeight) return;
    event.preventDefault(); event.stopImmediatePropagation();
    pending = null; drag = { kind:'region', start:p, points:[p], pointerId:event.pointerId };
    try { stageOf(item).setPointerCapture(event.pointerId); } catch {}
    paintOutline(); syncOptions();
  },{capture:true,signal});
  panel.addEventListener('pointermove',event => {
    if (!drag || drag.pointerId !== event.pointerId || !layer) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const p = pointOf(event,layer.img);
    if (drag.kind === 'piece') {
      drag.dx = p.x - drag.start.x; drag.dy = p.y - drag.start.y;
      const r = layer.root.getBoundingClientRect();
      drag.el.style.transform = `translate(${drag.dx/layer.img.naturalWidth*r.width}px, ${drag.dy/layer.img.naturalHeight*r.height}px)`;
      const outline = layer.svg.querySelector('.ai-crop-selected'); if (outline) outline.setAttribute('transform',`translate(${drag.dx} ${drag.dy})`);
      return;
    }
    const clamp = (v,max) => Math.max(0,Math.min(max,v)), q = { x:clamp(p.x,layer.img.naturalWidth), y:clamp(p.y,layer.img.naturalHeight) }, a = drag.start;
    drag.points = shape === 'rect' ? [a,{x:q.x,y:a.y},q,{x:a.x,y:q.y}] : [...drag.points, q];
    paintOutline();
  },{capture:true,signal});
  const finish = (event, accept) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const d = drag; drag = null; event.preventDefault(); event.stopImmediatePropagation();
    if (d.kind === 'piece') {
      if (accept && Math.hypot(d.dx,d.dy) >= 1) void commitMove(getTarget(), d.id, d.dx, d.dy);
      else render();
      return;
    }
    const xs = d.points.map(p => p.x), ys = d.points.map(p => p.y);
    pending = accept && d.points.length >= 3 && Math.max(...xs)-Math.min(...xs) > 2 && Math.max(...ys)-Math.min(...ys) > 2 ? d.points : null;
    paintOutline(); syncOptions();
  };
  // 11-26 사용자: 조각 밖을 누르면 선택 점선을 지운다. 라벨 편집기가 같은 누름을 먼저 가져가도 놓치지 않게 문서 단계에서 본다.
  doc.addEventListener('pointerdown',event => {
    if (selectedPiece && !event.target.closest?.('img[data-ai-piece]')) { selectedPiece = null; paintOutline(); }
  },{capture:true,signal});
  panel.addEventListener('pointerup',event => finish(event,true),{capture:true,signal});
  panel.addEventListener('pointercancel',event => finish(event,false),{capture:true,signal});
  options.addEventListener('click',event => {
    const b = event.target.closest('[data-ai-crop-shape]');
    if (b) { shape = b.dataset.aiCropShape; pending = null; paintOutline(); syncOptions(); }
    if (event.target.closest('[data-ai-crop-apply]')) void applySplit();
  },{signal});
  doc.addEventListener('keydown',event => {
    if (panel.hidden || panel.inert || panel.dataset.aiResultMode !== 'manual' || event.isComposing) return;
    const t = event.target;
    if (t.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    if (active && event.key === 'Enter' && pending) { event.preventDefault(); event.stopImmediatePropagation(); void applySplit(); return; }
    if (active && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (pending) { pending = null; paintOutline(); syncOptions(); } else { close(); afterSplit(); } return; }
    if (!active && selectedPiece && ['Delete','Backspace'].includes(event.key) && !event.metaKey && !event.ctrlKey && shortcutKey(event)) {
      event.preventDefault(); event.stopImmediatePropagation(); void removePiece(getTarget(), selectedPiece);
    }
  },{capture:true,signal});
  for (const name of ['5e:ai-edit-draft-change','5e:ai-workbench-geometry-change','5e:ai-candidate-select','5e:ai-local-erase-tool-change']) panel.addEventListener(name,() => win.requestAnimationFrame(render),{signal});
  const observer = new win.MutationObserver(() => render());
  observer.observe(panel,{attributes:true,attributeFilter:['data-ai-result-mode','hidden']});
  signal?.addEventListener('abort',() => { observer.disconnect(); layer?.root.remove(); options.remove(); },{once:true});
  return { open, close, active:() => active, render };
}
