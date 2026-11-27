// 11-26 시안 v6 「직접 편집」 도구 격자: 선택·텍스트·지시선 라벨·길이 표시 / 지우개·자르기·가로 정렬·세로 정렬.
// 도구마다 기존 편집기(라벨 편집기·지우개·자르기)를 켜고 끈다. 단축키 V·T·⇧T·⌥C·⇧E(정렬 W·H는 라벨 편집기가 받는다).
import { shortcutKey, isComposingKey } from './platform.js?v=1.7.0-four-session-integration';

const SVG = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
export const EDIT_TOOLS = [
  { id:'select', label:'선택', key:'V', path:'M5 3l13 10-6 1-3 6z' },
  { id:'text', label:'텍스트', key:'T', path:'M4 6V4h16v2M12 4v16m-4 0h8' },
  { id:'leader', label:'지시선 라벨', key:'⇧T', path:'M3 19l7-11h10' },
  { id:'dimension', label:'길이 표시', key:'', path:'M3 7v10m18-10v10M3 12h18m-14-3-4 3 4 3m10-6 4 3-4 3' },
  { id:'erase', label:'지우개', key:'⇧E', path:'M4 14l9-10 7 6-9 10H9zM9 9l7 6m-5 5h10' },
  { id:'crop', label:'자르기', key:'⌥C', path:'M6 2v16h16M2 6h16v16' },
  { id:'align-y', label:'가로 정렬', key:'W', tip:'같은 높이에 정렬', path:'M2 12h20M5 9h4v6H5zM15 6h4v12h-4z' },
  { id:'align-x', label:'세로 정렬', key:'H', tip:'같은 X 위치에 정렬', path:'M12 2v20M9 5h6v4H9zM6 15h12v4H6z' },
];
const LABEL_TOOLS = ['select','text','leader','dimension'];

export function createEditTools({ panel, labelEditor, eraser, crop, signal }) {
  const doc = panel.ownerDocument;
  const host = panel.querySelector('.ai-manual-tools');
  if (!host) return { sync() {} };
  const grid = doc.createElement('div');
  grid.className = 'ai-edit-tools'; grid.setAttribute('role','toolbar'); grid.setAttribute('aria-label','편집 도구');
  grid.innerHTML = EDIT_TOOLS.map(t => {
    const align = t.id.startsWith('align');
    const name = `${t.label}${t.key ? ` (${t.key})` : ''}`;
    return `<button type="button" data-ai-edit-tool="${t.id}" ${align ? 'aria-disabled="true"' : 'aria-pressed="false"'} aria-label="${name}"${t.key ? ` aria-keyshortcuts="${t.key.replace('⇧','Shift+').replace('⌥','Alt+')}"` : ''} data-tip="${align ? `${name} · 라벨 두 개 이상 선택` : name}">${SVG(t.path)}<span>${t.label}</span></button>`;
  }).join('');
  host.prepend(grid);
  const button = id => grid.querySelector(`[data-ai-edit-tool="${id}"]`);

  // 11-26 레이어 원칙: 라벨 층이 꺼져 있으면(라벨 OFF) 라벨을 만들거나 고르는 도구는 쓸 수 없다. 지우개·자르기(그림 층)는 그대로.
  const labelLayerOn = () => panel.dataset.aiLabelLayer !== 'off';
  function current() {
    if (crop?.active?.()) return 'crop';
    if (panel.dataset.aiLocalEraseActive === 'true') return 'erase';
    if (panel.dataset.aiLabelEditing === 'true') return labelEditor.tool();
    return panel.dataset.aiResultMode === 'manual' ? 'select' : null;
  }
  function sync() {
    const now = current();
    for (const t of EDIT_TOOLS) {
      const b = button(t.id);
      const name = `${t.label}${t.key ? ` (${t.key})` : ''}`;
      if (t.id.startsWith('align')) {
        const ok = labelLayerOn() && panel.dataset.aiLabelEditing === 'true' && labelEditor.alignAvailable();
        b.setAttribute('aria-disabled',String(!ok));
        b.dataset.tip = `${name} · ${!labelLayerOn() ? '라벨을 켜면 쓸 수 있습니다' : ok ? `${t.tip} · 첫 선택 라벨 기준` : '라벨 두 개 이상 선택'}`;
      } else {
        b.setAttribute('aria-pressed',String(t.id === now));
        const blocked = ['text','leader','dimension'].includes(t.id) && !labelLayerOn();
        b.setAttribute('aria-disabled',String(blocked));
        b.dataset.tip = blocked ? `${name} · 라벨을 켜면 쓸 수 있습니다` : name;
      }
    }
  }
  function ensureLabelEditor() {
    if (crop?.active?.()) crop.close();
    if (panel.dataset.aiLocalEraseActive === 'true') eraser.cancel?.();
    if (panel.dataset.aiLabelEditing !== 'true') panel.querySelector('[data-ai-label-edit]')?.click();
    return panel.dataset.aiLabelEditing === 'true';
  }
  function choose(id) {
    if (id === 'align-y' || id === 'align-x') {
      if (button(id).getAttribute('aria-disabled') === 'false') void labelEditor.align(id === 'align-y' ? 'y' : 'x');
      return;
    }
    if (id === 'select' && !labelLayerOn()) {
      // 라벨이 꺼져 있으면 선택은 그림 조각만 고른다 — 라벨 편집기를 켜지(라벨을 다시 켜지) 않는다.
      crop?.close?.(); if (panel.dataset.aiLocalEraseActive === 'true') eraser.cancel?.();
      if (panel.dataset.aiLabelEditing === 'true') labelEditor.close();
    } else if (LABEL_TOOLS.includes(id)) {
      if (!labelLayerOn()) return;
      if (ensureLabelEditor()) labelEditor.setTool(id);
    }
    else if (id === 'erase') {
      crop?.close?.();
      if (panel.dataset.aiLabelEditing === 'true') labelEditor.close();
      if (panel.dataset.aiLocalEraseActive !== 'true') panel.querySelector('[data-ai-local-erase]')?.click();
    } else if (id === 'crop' && crop) {
      if (panel.dataset.aiLabelEditing === 'true') labelEditor.close();
      if (panel.dataset.aiLocalEraseActive === 'true') eraser.cancel?.();
      crop.open();
    }
    sync();
  }
  grid.addEventListener('click',event => {
    const id = event.target.closest('[data-ai-edit-tool]')?.dataset.aiEditTool;
    // 누른 단추에 초점이 남으면 고른 도구와 함께 두 칸이 눌린 것처럼 보였다 — 초점은 그림 쪽으로 돌린다.
    if (id) { choose(id); if (event.detail) event.target.closest('button')?.blur(); }
  },{signal});
  // 11-26 시안: ⌘S(Ctrl+S)로 수정 저장. 저장할 편집이 있을 때만 가로챈다(없으면 원래 저장 단축키 그대로).
  doc.addEventListener('keydown',event => {
    if (panel.hidden || panel.inert || isComposingKey(event) || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
    if (shortcutKey(event) !== 's' || panel.dataset.aiEditDraft !== 'true') return;
    const save = panel.querySelector('[data-ai-edit-save]');
    event.preventDefault(); event.stopImmediatePropagation();
    const typing = doc.activeElement?.matches?.('.ai-label-inplace');
    if (typing) doc.activeElement.blur(); // 치던 글자를 먼저 반영한 뒤 저장
    setTimeout(() => { if (save && !save.disabled) save.click(); }, typing ? 300 : 0);
  },{capture:true,signal});
  doc.addEventListener('keydown',event => {
    if (panel.hidden || panel.inert || panel.dataset.aiResultMode !== 'manual' || isComposingKey(event)) return;
    if (event.metaKey || event.ctrlKey || event.repeat) return;
    // 11-27 사용자: 자르기는 ⌥C(Alt+C). 다른 도구는 ⌥ 없이.
    if (event.altKey && (event.shiftKey || shortcutKey(event) !== 'c')) return;
    const t = event.target;
    if (!(panel.contains(t) || t === doc.body || t === doc.documentElement)) return;
    if (t.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    if (doc.querySelector('dialog[open],.modal-overlay:not([hidden]):not(#ai-image-panel)')) return;
    const key = shortcutKey(event);
    const id = event.altKey ? 'crop' : key === 'v' ? 'select' : key === 't' ? (event.shiftKey ? 'leader' : 'text') : key === 'e' && event.shiftKey ? 'erase' : null;
    if (!id || (id === 'crop' && !crop)) return;
    event.preventDefault(); event.stopImmediatePropagation(); choose(id);
  },{capture:true,signal});
  for (const name of ['5e:ai-label-tool-change','5e:ai-local-erase-tool-change','5e:ai-crop-tool-change','5e:ai-label-selection-change']) panel.addEventListener(name,sync,{signal});
  const observer = new MutationObserver(() => {
    // 라벨을 끄면 라벨 편집(만들던 도구 포함)도 닫는다.
    if (!labelLayerOn() && panel.dataset.aiLabelEditing === 'true') labelEditor.close();
    sync();
  });
  observer.observe(panel,{attributes:true,attributeFilter:['data-ai-label-editing','data-ai-local-erase-active','data-ai-result-mode','data-ai-label-layer']});
  signal?.addEventListener('abort',() => observer.disconnect(),{once:true});
  sync();
  return { sync, choose, grid };
}
