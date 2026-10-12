// One transient menu for the collection. Actions retain the right-clicked owner.
export function createTaskContextMenu({ copy, send, duplicate, remove, onError }) {
  const menu = document.createElement('div');
  menu.className = 'ai-task-context-menu'; menu.role = 'menu'; menu.hidden = true;
  menu.setAttribute('aria-label', '작업대 메뉴');
  menu.innerHTML = '<button type="button" role="menuitem" data-task-action="copy">클립보드 복사</button><button type="button" role="menuitem" data-task-action="send" aria-haspopup="menu" aria-expanded="false">이미지/그래프 변환으로 보내기<span aria-hidden="true">›</span></button><div role="menu" aria-label="변환 대상" data-task-submenu hidden><button type="button" role="menuitem" data-task-action="image">이미지 변환으로 보내기</button><button type="button" role="menuitem" data-task-action="graph">그래프 복원으로 보내기</button></div><button type="button" role="menuitem" data-task-action="delete">작업대에서 삭제</button>';
  document.body.append(menu);
  const duplicateButton=document.createElement('button');duplicateButton.type='button';duplicateButton.role='menuitem';duplicateButton.dataset.taskAction='duplicate';duplicateButton.textContent='현 작업대에 추가';
  menu.querySelector('[data-task-action="send"]').before(duplicateButton);
  const lifetime = new AbortController();
  const submenu = menu.querySelector('[data-task-submenu]');
  const sendButton = menu.querySelector('[data-task-action="send"]');
  let owner = null, opener = null, anchorX = 8, anchorY = 8;
  function position() {
    menu.style.left=`${Math.max(8,Math.min(anchorX,innerWidth-menu.offsetWidth-8))}px`;
    menu.style.top=`${Math.max(8,Math.min(anchorY,innerHeight-menu.offsetHeight-8))}px`;
  }
  function close({ focus = false } = {}) {
    menu.hidden = true; submenu.hidden = true; sendButton.setAttribute('aria-expanded','false'); owner = null;
    if (focus && opener?.isConnected) opener.focus({preventScroll:true});
  }
  function expand() {
    submenu.hidden = false; sendButton.setAttribute('aria-expanded','true');
    position();
    submenu.querySelector('button')?.focus();
  }
  menu.addEventListener('click', event => {
    const button = event.target.closest('[data-task-action]');
    if (!button || button.disabled || !owner) return;
    if (button.dataset.taskAction === 'send') { expand(); return; }
    const target = owner; close();
    // copy() begins clipboard.write synchronously within this user gesture.
    try {
      const operation = button.dataset.taskAction === 'copy' ? copy(target)
        : button.dataset.taskAction === 'duplicate' ? duplicate(target)
        : button.dataset.taskAction === 'delete' ? remove(target) : send(target,button.dataset.taskAction);
      Promise.resolve(operation).catch(onError);
    } catch (error) { onError(error); }
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' || event.key === 'Tab') { if(event.key==='Escape')event.preventDefault();event.stopPropagation();close({focus:true});return; }
    if ((event.key === 'ArrowRight' || event.key === 'Enter') && event.target === sendButton) {event.preventDefault();expand();return;}
    if (event.key === 'ArrowLeft' && event.target.closest('[data-task-submenu]')) {event.preventDefault();submenu.hidden=true;sendButton.setAttribute('aria-expanded','false');position();sendButton.focus();return;}
    if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const container = event.target.closest('[data-task-submenu]') || menu;
    const buttons = [...container.querySelectorAll(':scope > button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 : (index+(event.key==='ArrowUp'?buttons.length-1:1))%buttons.length;
    buttons[next]?.focus();
  });
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))close();},{signal:lifetime.signal});
  window.addEventListener('5e:ai-workspace-activate',()=>close(),{signal:lifetime.signal});
  window.addEventListener('resize',()=>close(),{signal:lifetime.signal});
  return {
    open(event, target, { canCopy = true, readOnly = false, running = false } = {}) {
      event.preventDefault();event.stopPropagation();close();owner=target;opener=event.currentTarget?.querySelector('.ai-task-tab-select') || event.target.closest('.ai-task-tab-select');
      menu.querySelector('[data-task-action="copy"]').disabled=!canCopy;
      sendButton.disabled=readOnly || !canCopy;
      duplicateButton.disabled=readOnly || !canCopy;
      menu.querySelector('[data-task-action="delete"]').disabled=readOnly || running;
      menu.hidden=false;
      const rect=opener?.getBoundingClientRect();
      anchorX=event.clientX || rect?.right || 8;anchorY=event.clientY || rect?.top || 8;
      menu.scrollTop=0;position();
      menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
    },
    dispose() {lifetime.abort();menu.remove();},
  };
}

export function copyTaskImage(dataUrl) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('이 브라우저에서 이미지 클립보드 복사를 사용할 수 없습니다.');
  const png = (async () => {
    // Resolve visible pixels inside the ClipboardItem promise, so write() still
    // starts synchronously in Safari's trusted click. Unsupported browsers never
    // start asynchronous preparation or leave its rejection unhandled.
    const image = new Image();image.src=await (typeof dataUrl === 'function' ? dataUrl() : dataUrl);await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    canvas.getContext('2d').drawImage(image,0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw new Error('클립보드 이미지를 만들지 못했습니다.');return blob;
  })();
  // WebKit can replace the preparation failure with a generic AbortError.
  // Retain its retry guidance, without delaying an early clipboard denial.
  let preparationError;
  png.catch(error=>{preparationError=error;});
  return navigator.clipboard.write([new ClipboardItem({'image/png':png})])
    .catch(error=>{throw preparationError || error;});
}
