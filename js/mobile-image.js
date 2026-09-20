export function initMobileImage(aiPanel) {
  if (!aiPanel || !document.documentElement.classList.contains('mobile-image-mode')) return;
  let panel = document.getElementById('ai-image-panel');
  const home = document.createElement('section');
  home.className = 'mobile-image-home';
  home.innerHTML = `<img src="assets/logo.svg" width="40" height="40" alt="5E"><h1>사진으로 시작하는 AI 이미지 변환</h1>
    <p>사진을 고르고 필요한 부분을 잘라 주세요.<br>변환 후 원본과 결과를 비교하고 PNG로 저장할 수 있습니다.</p>
    <button type="button" data-mobile-open>이미지 작업 열기</button><a href="?mobile=0">전체 에디터 열기</a>`;
  document.body.append(home);
  const toolbar = document.createElement('div');
  toolbar.className = 'mobile-image-toolbar';
  toolbar.innerHTML = `<button type="button" data-mobile-photo>사진 선택 · 크롭</button>
    <button type="button" data-mobile-login>ChatGPT 연결</button>
    <input type="file" accept="image/*" data-mobile-file hidden>`;
  panel.querySelector('.ai-head').after(toolbar);
  const photo = toolbar.querySelector('[data-mobile-photo]');
  const picker = toolbar.querySelector('[data-mobile-file]');
  const sharing = document.getElementById('sharing-btn');
  if (sharing) {
    sharing.dataset.mobileShare = '';
    sharing.removeAttribute('data-shell-tip');
    const label = document.createElement('span');
    label.textContent = '공유';
    sharing.append(label);
    toolbar.insertBefore(sharing, picker);
  }
  toolbar.querySelector('[data-mobile-login]').onclick = () => window.dispatchEvent(new Event('5e:web-login-request'));
  home.querySelector('[data-mobile-open]').onclick = () => void aiPanel.open();
  photo.onclick = () => picker.click();
  const blocked = () => panel.dataset.aiBusy === 'true' || panel.dataset.aiSharingMode === 'view';
  const sync = () => {
    const active = document.getElementById('ai-image-panel');
    if (active && active !== panel) {
      panel = active;
      panel.querySelector('.ai-head').after(toolbar);
    }
    photo.disabled = blocked();
    photo.title = panel.dataset.aiSharingMode === 'view' ? '보기 전용 문서에서는 사진을 추가할 수 없습니다.' : '';
  };
  new MutationObserver(sync).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['id', 'data-ai-busy', 'data-ai-sharing-mode'] });
  sync();

  const dialog = document.createElement('dialog');
  dialog.className = 'mobile-crop-dialog';
  dialog.setAttribute('aria-labelledby', 'mobile-crop-title');
  dialog.innerHTML = `<header><h2 id="mobile-crop-title">사진 준비</h2><button type="button" data-crop-cancel aria-label="사진 준비 취소">취소</button></header>
    <p data-crop-status role="status">사진을 불러오는 중…</p>
    <div class="mobile-crop-stage" data-crop-stage><img data-crop-image alt="선택한 사진"><div data-crop-box hidden></div></div>
    <p>손가락으로 필요한 부분을 둘러싸거나 아래 비율을 입력하세요.</p>
    <div class="mobile-crop-fields">${[['x','왼쪽'],['y','위쪽'],['w','너비'],['h','높이']].map(([key,label]) =>
      `<label>${label} %<input type="number" inputmode="decimal" min="0" max="100" step="0.1" data-crop-field="${key}" aria-label="크롭 ${label} 비율"></label>`).join('')}</div>
    <footer><button type="button" data-crop-whole disabled>전체 사진 사용</button><button type="button" data-crop-apply disabled>선택 영역 사용</button></footer>`;
  document.body.append(dialog);
  const image = dialog.querySelector('[data-crop-image]');
  const stage = dialog.querySelector('[data-crop-stage]');
  const box = dialog.querySelector('[data-crop-box]');
  const status = dialog.querySelector('[data-crop-status]');
  const whole = dialog.querySelector('[data-crop-whole]');
  const apply = dialog.querySelector('[data-crop-apply]');
  const fields = [...dialog.querySelectorAll('[data-crop-field]')];
  let selection = null, drag = null, file = null, objectUrl = '', serial = 0, loaded = false;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function renderSelection(updateFields = true) {
    box.hidden = !selection;
    apply.disabled = !loaded || !selection;
    const rect = selection || { x: 0, y: 0, w: 1, h: 1 };
    if (updateFields) for (const field of fields) field.value = String(Math.round(rect[field.dataset.cropField] * 1000) / 10);
    Object.assign(box.style, { left: `${rect.x*100}%`, top: `${rect.y*100}%`, width: `${rect.w*100}%`, height: `${rect.h*100}%` });
    if (loaded) status.textContent = selection
      ? `선택 영역 ${Math.round(rect.w*image.naturalWidth)} × ${Math.round(rect.h*image.naturalHeight)}px`
      : `사진 ${image.naturalWidth} × ${image.naturalHeight}px · 전체 또는 크롭 선택`;
  }
  function close() {
    serial++; loaded = false; drag = null; selection = null;
    image.removeAttribute('src');
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = ''; file = null;
    dialog.close(); photo.focus({ preventScroll: true });
  }
  dialog.querySelector('[data-crop-cancel]').onclick = close;
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  picker.onchange = async () => {
    const selected = picker.files?.[0]; picker.value = '';
    if (!selected || blocked()) return;
    file = selected; loaded = false; selection = null;
    whole.disabled = true; apply.disabled = true;
    fields.forEach(field => { field.disabled = true; });
    box.hidden = true; status.textContent = '사진을 불러오는 중…';
    dialog.showModal();
    const current = ++serial;
    objectUrl = URL.createObjectURL(file); image.src = objectUrl;
    try {
      await image.decode();
      if (current !== serial) return;
      loaded = true; whole.disabled = false;
      fields.forEach(field => { field.disabled = false; });
      renderSelection();
    } catch {
      if (current === serial) status.textContent = '이 사진 형식을 읽을 수 없습니다. 취소 후 JPEG 또는 PNG 사진을 선택해 주세요.';
    }
  };
  for (const field of fields) field.oninput = () => {
    if (fields.some(input => input.value === "" || input.validity.badInput)) return;
    const rect = Object.fromEntries(fields.map(input => [input.dataset.cropField, Number(input.value)/100]));
    if (Object.values(rect).some(value => !Number.isFinite(value))) return;
    rect.x = clamp(rect.x, 0, .99); rect.y = clamp(rect.y, 0, .99);
    rect.w = clamp(rect.w, .01, 1-rect.x); rect.h = clamp(rect.h, .01, 1-rect.y);
    selection = rect; renderSelection(false);
  };
  for (const field of fields) field.onchange = () => renderSelection();
  const point = event => {
    const rect = stage.getBoundingClientRect();
    return { x: clamp((event.clientX-rect.left)/rect.width,0,1), y: clamp((event.clientY-rect.top)/rect.height,0,1) };
  };
  stage.onpointerdown = event => {
    if (!loaded || (event.pointerType === 'mouse' && event.button !== 0) || drag) return;
    drag = { start: point(event), previous: selection, id: event.pointerId };
    stage.setPointerCapture(event.pointerId);
  };
  stage.onpointermove = event => {
    if (!drag || drag.id !== event.pointerId) return;
    const next = point(event), start = drag.start;
    selection = { x: Math.min(next.x,start.x), y: Math.min(next.y,start.y), w: Math.abs(next.x-start.x), h: Math.abs(next.y-start.y) };
    renderSelection();
  };
  stage.onpointerup = event => {
    if (!drag || drag.id !== event.pointerId) return;
    if (!selection || selection.w < .01 || selection.h < .01) selection = drag.previous;
    drag = null; renderSelection();
  };
  stage.onpointercancel = event => {
    if (drag && drag.id === event.pointerId) selection = drag.previous;
    else if (drag) return;
    drag = null; renderSelection();
  };
  async function add(crop) {
    if (!loaded || blocked()) { status.textContent = '현재 작업을 완료한 뒤 사진을 추가해 주세요.'; return; }
    const rect = crop ? selection : { x:0, y:0, w:1, h:1 };
    if (!rect) return;
    const canvas = document.createElement('canvas');
    const x = Math.floor(rect.x*image.naturalWidth), y = Math.floor(rect.y*image.naturalHeight);
    canvas.width = Math.max(1, Math.min(image.naturalWidth-x,Math.round(rect.w*image.naturalWidth)));
    canvas.height = Math.max(1, Math.min(image.naturalHeight-y,Math.round(rect.h*image.naturalHeight)));
    try {
      canvas.getContext('2d').drawImage(image,x,y,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      const name = file.name + (crop ? ' · 크롭' : '');
      whole.disabled = true; apply.disabled = true;
      await aiPanel.open({ reference: { dataUrl, name, sourceKind: 'mobile-photo', source: { crop: crop ? {...rect} : null } } });
      close();
      panel.querySelector('[data-ai-layout-mode="source"]').click();
    } catch (error) {
      status.textContent = `사진을 추가하지 못했습니다. ${error.message}`;
      whole.disabled = false; apply.disabled = !selection;
    }
  }
  whole.onclick = () => void add(false);
  apply.onclick = () => void add(true);
  function viewport() {
    const visible = window.visualViewport;
    if (visible && visible.scale !== 1) return;
    document.documentElement.style.setProperty('--mobile-viewport-height', `${visible?.height || innerHeight}px`);
    document.documentElement.style.setProperty('--mobile-viewport-top', `${visible?.offsetTop || 0}px`);
  }
  window.visualViewport?.addEventListener('resize', viewport);
  window.visualViewport?.addEventListener('scroll', viewport);
  window.addEventListener('resize', viewport); viewport();
  if (!location.hash.startsWith('#share=')) void aiPanel.open();
}
