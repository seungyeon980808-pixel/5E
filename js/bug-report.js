import { buildBugReport, cleanReportText, reportImage } from './bug-report-data.js?v=1.7.0-four-session-integration';

const providers = new Map();
export function registerBugReportContext(key, provider) { providers.set(key, provider); }
const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7V5a3 3 0 0 1 6 0v2M8 7h8v8a4 4 0 0 1-8 0zM12 8v11M5 9h3M16 9h3M4 14h4M16 14h4M6 20l3-3M15 17l3 3M6 4l3 3M15 7l3-3"/></svg>';

export function initBugReporter(state) {
  const dialog = document.createElement('dialog');
  dialog.className = 'bug-report-dialog'; dialog.id = 'bug-report-dialog';
  dialog.setAttribute('aria-labelledby', 'bug-report-title');
  dialog.innerHTML = `<form><header><h2 id="bug-report-title">문제 신고</h2><button class="modal-btn" type="button" data-report-close aria-label="문제 신고 닫기">닫기</button></header>
    <p>어떤 이미지에서 어떤 조작을 했을 때 문제가 생겼는지 알려 주세요. 첨부 내용을 확인한 뒤 보냅니다.</p>
    <label>문제 제목<input name="title" required maxlength="160" placeholder="예: 라이브러리에서 선택 영역이 검게 보임"></label>
    <label>발생한 상황<textarea name="description" required maxlength="4000" rows="3" placeholder="무엇을 했고, 화면에 어떤 문제가 보였나요?"></textarea></label>
    <div class="bug-report-columns"><label>재현 순서<textarea name="steps" maxlength="4000" rows="2" placeholder="1. 라이브러리 열기 2. 자료 선택 3. 영역 자르기"></textarea></label><label>기대했던 동작<textarea name="expected" maxlength="4000" rows="2"></textarea></label></div>
    <label class="bug-report-check"><input name="diagnostics" type="checkbox" checked>현재 화면·설정·최근 오류와 조작 기록 첨부</label>
    <details><summary>첨부할 진단 정보 확인</summary><pre data-report-context></pre></details>
    <label class="bug-report-check"><input name="images" type="checkbox">아래 이미지 첨부에 동의</label>
    <div class="bug-report-images" data-report-images></div>
    <label>화면 캡처 추가 <input name="screenshot" type="file" accept="image/png,image/jpeg,image/webp"></label>
    <p class="bug-report-note">계정 인증 정보와 전체 문서는 수집하지 않습니다. 이미지 안의 이름·연락처 등은 보내기 전에 확인해 주세요.</p>
    <footer><span data-report-status role="status" aria-live="polite"></span><button class="modal-btn" type="button" data-report-save>리포트 파일 저장</button><button class="modal-btn" type="submit" data-report-send>리포트 보내기</button></footer></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form'), status = dialog.querySelector('[data-report-status]');
  const errors = [], actions = []; let captured = null, returnFocus = null, sending = false, screenshot = null;
  const push = (list, entry) => { list.push(entry); if (list.length > 20) list.shift(); };
  window.addEventListener('error', event => push(errors, { time: new Date().toISOString(), message: cleanReportText(event.message, 1000) }));
  window.addEventListener('unhandledrejection', event => push(errors, { time: new Date().toISOString(), message: cleanReportText(event.reason?.message || event.reason, 1000) }));
  document.addEventListener('click', event => {
    const control = event.target.closest?.('button,[role="button"]');
    if (!control || dialog.contains(control)) return;
    push(actions, { time: new Date().toISOString(), action: cleanReportText(control.getAttribute('aria-label') || control.title || control.textContent, 160) });
  }, true);
  const endpoint = () => {
    const configured = document.querySelector('meta[name="5e-bug-report-endpoint"]')?.content;
    const value = configured || '/api/bug-reports';
    const url = new URL(value, location.href);
    if (url.username || url.password || !(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1'))) throw new Error('리포트 수신 주소를 확인해 주세요.');
    return url;
  };
  function renderImages() {
    const list = dialog.querySelector('[data-report-images]'); list.replaceChildren();
    for (const image of captured.images) {
      const figure = document.createElement('figure'), img = document.createElement('img'), caption = document.createElement('figcaption');
      img.src = image.data; img.alt = image.name; caption.textContent = `${image.role === 'result' ? '결과' : image.role === 'screenshot' ? '화면 캡처' : '원본'} · ${image.name}`;
      figure.append(img, caption); list.append(figure);
    }
    if (!captured.images.length) list.textContent = '현재 첨부할 이미지가 없습니다. 화면 캡처를 추가할 수 있습니다.';
  }
  function capture() {
    const current = state.get();
    const library = [...document.querySelectorAll('.unified-library-overlay:not([hidden])')].find(node => node.getClientRects().length);
    const visible = library ? null : [...providers.values()].map(provider => provider()).find(Boolean);
    const context = { version: document.querySelector('[data-release-version]')?.textContent,
      change: document.querySelector('[data-change-summary]')?.textContent, route: location.pathname,
      browser: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      screen: visible?.screen || (library ? '라이브러리' : '캔버스'),
      canvas: { artboard: current.artboard, viewBox: current.viewBox, tool: current.tool,
        objectCount: current.objects?.length || 0 },
      task: visible?.task || null, errors: [...errors, ...(visible?.errors || [])].slice(-20), actions: [...actions] };
    const selected = current.objects?.find(object => current.selectedIds?.includes(object.id) && object.type === 'image');
    const preview = [...document.querySelectorAll('.unilib-preview-image img')].find(img => img.getClientRects().length);
    let previewData = null;
    if (preview?.naturalWidth) {
      try { const canvas = document.createElement('canvas'); canvas.width = preview.naturalWidth; canvas.height = preview.naturalHeight; canvas.getContext('2d').drawImage(preview, 0, 0); previewData = canvas.toDataURL('image/png'); } catch {}
    }
    const images = visible?.images || (!library && selected ? [{ name: '선택한 캔버스 이미지', src: selected.src, role: 'original' }]
      : preview ? [{ name: '라이브러리 미리보기', src: previewData, role: 'original' }] : []);
    const safeContext = JSON.parse(JSON.stringify(context, (_, value) => typeof value === 'string' ? cleanReportText(value, 1000) : value));
    return { context: safeContext, images: images.map(reportImage).filter(Boolean).slice(0, 2), id: crypto.randomUUID() };
  }
  function open(event) {
    if (dialog.open) return;
    returnFocus = event?.currentTarget || document.activeElement;
    captured = capture(); if (screenshot) captured.images.push(screenshot); status.textContent = ''; renderImages();
    dialog.querySelector('[data-report-context]').textContent = JSON.stringify(captured.context, null, 2);
    form.elements.images.checked = false; dialog.showModal(); form.elements.title.focus();
  }
  function button(host, className = '') {
    if (!host) return;
    const control = document.createElement('button'); control.type = 'button';
    control.className = `bug-report-open ${className}`; control.title = '문제 신고'; control.setAttribute('aria-label', '문제 신고');
    control.innerHTML = icon; control.addEventListener('click', open); host.append(control);
  }
  button(document.querySelector('.footer-actions'));
  button(document.querySelector('#ai-image-panel .ai-head-status'), 'ai-header-tool modal-btn');
  const libraryHosts = new WeakSet();
  const mountLibrary = root => {
    const host = root.querySelector?.('.unilib-header-actions');
    if (host && !libraryHosts.has(host)) { libraryHosts.add(host); button(host, 'unilib-icon-button'); }
  };
  mountLibrary(document);
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) mountLibrary(node);
  }).observe(document.body, { childList:true });
  document.addEventListener('keydown', event => {
    if (dialog.open && event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); if (!sending) dialog.close();
    }
  }, true);
  dialog.querySelector('[data-report-close]').addEventListener('click', () => { if (!sending) dialog.close(); });
  dialog.addEventListener('cancel', event => { event.stopImmediatePropagation(); if (sending) event.preventDefault(); });
  dialog.addEventListener('keydown', event => { event.stopPropagation(); });
  dialog.addEventListener('close', () => returnFocus?.focus({ preventScroll: true }));
  form.elements.screenshot.addEventListener('change', async event => {
    const file = event.target.files[0];
    screenshot = null; captured.images = captured.images.filter(image => image.role !== 'screenshot'); renderImages();
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 6 * 1024 * 1024) { event.target.value = ''; status.textContent = 'PNG·JPEG·WebP 이미지 6MB 이하를 선택해 주세요.'; return; }
    try {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('화면 캡처를 읽지 못했습니다. 다시 선택해 주세요.')); reader.readAsDataURL(file); });
      if (form.elements.screenshot.files[0] !== file) return;
      screenshot = { name:file.name, data, role:'screenshot' }; captured.images.push(screenshot); renderImages();
    } catch (error) { if (form.elements.screenshot.files[0] === file) { event.target.value = ''; status.textContent = error.message; } }
  });
  const report = () => {
    const fields = { title: form.elements.title.value, description: form.elements.description.value,
      expected: form.elements.expected.value, steps: form.elements.steps.value,
      includeImages: form.elements.images.checked, includeDiagnostics: form.elements.diagnostics.checked };
    const signature = JSON.stringify({ ...fields, images: fields.includeImages ? captured.images : [] });
    if (signature !== captured.signature) {
      captured.id = crypto.randomUUID(); captured.createdAt = new Date().toISOString(); captured.signature = signature;
    }
    return buildBugReport({ ...captured, ...fields });
  };
  dialog.querySelector('[data-report-save]').addEventListener('click', () => {
    try {
      const value = report(), url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `5e-bug-${value.id}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000); status.textContent = '리포트 파일 저장을 요청했습니다.';
    } catch (error) { status.textContent = error.message; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (sending) return;
    let value; try { value = report(); } catch (error) { status.textContent = error.message; return; }
    sending = true; form.querySelector('[data-report-send]').disabled = true;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    status.textContent = '리포트를 보내고 있습니다…';
    try {
      const response = await fetch(endpoint(), { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', 'X-5E-Report': '1' }, body: JSON.stringify(value), signal: controller.signal });
      const receipt = await response.json();
      if (!response.ok || receipt.id !== value.id) throw new Error('리포트 접수 응답을 확인하지 못했습니다.');
      status.textContent = `접수되었습니다. 접수 번호: ${receipt.id.slice(0, 8)}`;
    } catch { status.textContent = '보내지 못했습니다. 입력과 첨부는 유지됩니다. 다시 보내거나 리포트 파일로 저장해 주세요.'; }
    finally { clearTimeout(timer); sending = false; form.querySelector('[data-report-send]').disabled = false; }
  });
}
