const VIEW_CONTROLS = '[data-ai-close],[data-ai-layout-mode],[data-ai-zoom-action],[data-ai-zoom-value],[data-ai-zoom-linked],[data-ai-zoom-target],[data-ai-source-select],[data-ai-version-button],[data-ai-candidate-option],[data-ai-side-tab],[data-ai-save-selected],[data-ai-save-all],[data-ai-save-candidate],[data-ai-save],[data-ai-compare],[data-ai-comment-tool="pan"],[data-ai-comment-marker],.ai-comment-row > button:first-child';
export function restrictSharedWorkspace(panel) {
  if (panel.dataset.aiSharingGuard) return;
  panel.dataset.aiSharingGuard = 'true';
  const badge=document.createElement('span');badge.className='ai-sharing-access';badge.hidden=true;
  badge.title='이 브라우저에 저장된 수신 문서입니다. AI 실행은 본인 계정을 사용합니다.';
  panel.querySelector('.ai-head-status')?.prepend(badge);
  const readonly = () => panel.dataset.aiSharingMode === 'view';
  const permitted = target => target.closest?.(VIEW_CONTROLS) || target.closest?.('.ai-task-tab') && !target.closest?.('.ai-task-delete');
  const block = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  panel.addEventListener('click', event => {
    if (readonly() && event.target.closest?.('button,input,select,textarea,[role="button"],.ai-task-delete') && !permitted(event.target)) block(event);
  }, true);
  for (const type of ['drop', 'paste', 'dragstart']) panel.addEventListener(type, event => { if (readonly()) block(event); }, true);
  panel.addEventListener('pointerdown', event => {
    if (readonly() && event.target.closest?.('.ai-preview-stage,.ai-comment-marker,[data-ai-reference-move]') && !permitted(event.target) && panel.querySelector('[data-ai-comment-tool="pan"]')?.getAttribute('aria-pressed') !== 'true') block(event);
  }, true);
  window.addEventListener('keydown', event => {
    if (!readonly() || panel.hidden) return;
    if (['Delete', 'Backspace'].includes(event.key) || (event.ctrlKey || event.metaKey) && ['v', 'x', 'z', 'y'].includes(event.key.toLowerCase())) block(event);
  }, true);
  const sync = () => {
    const mode=panel.dataset.aiSharingMode;
    if(badge.hidden!==!mode)badge.hidden=!mode;
    const label=mode==='view'?'보기 전용':mode==='edit'?'내 복사본 · 편집 가능':'';
    if(badge.textContent!==label)badge.textContent=label;
    if (!readonly()) return;
    for (const control of panel.querySelectorAll('button,input,select,textarea')) {
      if (permitted(control)) continue;
      if (!control.disabled) control.disabled = true;
      if (control.tagName === 'TEXTAREA' || control.tagName === 'INPUT') control.readOnly = true;
    }
    for (const editable of panel.querySelectorAll('[contenteditable="true"]')) editable.contentEditable = 'false';
  };
  new MutationObserver(sync).observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'contenteditable', 'data-ai-sharing-mode'] });
  sync();
}
