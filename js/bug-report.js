import { buildSimpleBugReport, cleanReportText, reportImage } from './bug-report-data.js?v=1.7.0-four-session-integration';

const providers = new Map();
export function registerBugReportContext(key, provider) { providers.set(key, provider); }
const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7V5a3 3 0 0 1 6 0v2M8 7h8v8a4 4 0 0 1-8 0zM12 8v11M5 9h3M16 9h3M4 14h4M16 14h4M6 20l3-3M15 17l3 3M6 4l3 3M15 7l3-3"/></svg>';

export function initBugReporter(state) {
  const dialog = document.createElement('dialog');
  dialog.className = 'bug-report-dialog'; dialog.id = 'bug-report-dialog';
  dialog.setAttribute('aria-labelledby', 'bug-report-title');
  dialog.innerHTML = `<form><header><h2 id="bug-report-title">문제 신고</h2><button class="modal-btn" type="button" data-report-close aria-label="문제 신고 닫기">닫기</button></header>
    <label>하고 싶은 말<textarea name="description" maxlength="4000" rows="4" placeholder="불편했던 점을 자유롭게 적어 주세요."></textarea></label>
    <label>이미지 첨부<input name="screenshot" type="file" accept="image/png,image/jpeg,image/webp" multiple></label>
    <div class="bug-report-images" data-report-images></div>
    <p class="bug-report-note" data-report-note></p>
    <details data-report-errors hidden><summary data-report-error-summary>오류 로그</summary><pre data-report-context></pre></details>
    <footer><span data-report-status role="status" aria-live="polite"></span><button class="modal-btn" type="submit" data-report-send>보내기</button></footer></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form'), status = dialog.querySelector('[data-report-status]');
  const errors = [], actions = [], uploads = [], controls = new Set();
  let captured = null, returnFocus = null, sending = false, reading = false;
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
    const url = new URL(configured || '/api/bug-reports', location.href);
    if (url.username || url.password || !(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1'))) throw new Error('리포트 수신 주소를 확인해 주세요.');
    return url;
  };
  function renderImages() {
    const list = dialog.querySelector('[data-report-images]'); list.replaceChildren();
    captured.images.forEach((image, index) => {
      const figure = document.createElement('figure'), img = document.createElement('img'), caption = document.createElement('figcaption'), remove = document.createElement('button');
      img.src = image.data; img.alt = image.name;
      caption.textContent = `${image.role === 'result' ? '결과' : image.role === 'screenshot' ? '첨부' : '원본'} · ${image.name}`;
      remove.type = 'button'; remove.className = 'bug-report-remove'; remove.disabled = sending || reading;
      remove.setAttribute('aria-label', `${image.name} 첨부 제외`);
      remove.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>';
      remove.onclick = () => { if (sending || reading) return; captured.images.splice(index, 1); const upload = uploads.indexOf(image); if (upload >= 0) uploads.splice(upload, 1); renderImages(); };
      figure.append(img, caption, remove); list.append(figure);
    });
    dialog.querySelector('[data-report-note]').textContent = captured.images.length
      ? '아래 보내기를 누르면 위 이미지와 최근 오류 로그가 함께 전송됩니다. 원하지 않는 이미지는 제외해 주세요.'
      : '이미지 없이 글만 보내도 됩니다. 최근 오류 로그는 함께 첨부됩니다.';
  }
  function capture(trigger) {
    const current = state.get();
    const library = trigger?.closest?.('.unified-library-overlay') || (!trigger?.closest?.('.modal-ai')
      && [...document.querySelectorAll('.unified-library-overlay:not([hidden])')].find(node => node.getClientRects().length));
    const visible = library ? null : [...providers.values()].map(provider => provider(trigger)).find(Boolean);
    const context = { version: document.querySelector('[data-release-version]')?.textContent,
      change: document.querySelector('[data-change-summary]')?.textContent, route: location.pathname,
      browser: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      screen: visible?.screen || (library ? '라이브러리' : '캔버스'),
      canvas: { artboard: current.artboard, viewBox: current.viewBox, tool: current.tool, objectCount: current.objects?.length || 0 },
      task: visible?.task || null, errors: [...errors, ...(visible?.errors || [])].slice(-20), actions: [...actions] };
    const selected = current.objects?.find(object => current.selectedIds?.includes(object.id) && object.type === 'image');
    const preview = [...document.querySelectorAll('.unilib-preview-image img')].find(img => img.getClientRects().length);
    let previewData = null;
    if (preview?.naturalWidth) {
      try { const canvas = document.createElement('canvas'); canvas.width = preview.naturalWidth; canvas.height = preview.naturalHeight; canvas.getContext('2d').drawImage(preview, 0, 0); previewData = canvas.toDataURL('image/png'); } catch {}
    }
    const images = visible?.images || (!library && selected ? [{ name: '선택한 캔버스 이미지', src: selected.src, role: 'original' }]
      : preview ? [{ name: '라이브러리 미리보기', src: previewData, role: 'original' }] : []);
    const safeContext = JSON.parse(JSON.stringify(context, (_, value) => typeof value === 'string' ? cleanReportText(value, 12000) : value));
    return { context: safeContext, images: images.map(reportImage).filter(Boolean).slice(0, 2), id: crypto.randomUUID() };
  }
  function open(event) {
    if (dialog.open) return;
    const trigger = event?.currentTarget || event?.detail?.trigger || document.activeElement;
    returnFocus = trigger;
    captured = capture(trigger); captured.images.push(...uploads.slice(0, 3 - captured.images.length));
    status.textContent = ''; renderImages();
    const logs = captured.context.errors;
    dialog.querySelector('[data-report-errors]').hidden = !logs.length;
    dialog.querySelector('[data-report-errors]').open = false;
    dialog.querySelector('[data-report-error-summary]').textContent = `오류 로그 ${logs.length}건 첨부 · 보기`;
    dialog.querySelector('[data-report-context]').textContent = logs.map(row => row.log || [row.time, row.message].filter(Boolean).join('\n')).join('\n\n');
    dialog.showModal(); form.elements.description.focus();
  }
  function updateControl(control, count) {
    const label = count ? `문제 신고 · 오류 ${count}건` : '문제 신고';
    control.title = label; control.setAttribute('aria-label', label);
    control.dataset.errorCount = String(count); control.classList.toggle('has-errors', Boolean(count));
    const badge = control.querySelector('[data-report-error-count]'); badge.hidden = !count; badge.textContent = count > 99 ? '99+' : String(count);
  }
  function button(host, className = '') {
    if (!host) return;
    const control = document.createElement('button'); control.type = 'button';
    control.className = `bug-report-open ${className}`;
    control.setAttribute('aria-haspopup', 'dialog'); control.innerHTML = icon + '<span data-report-error-count hidden aria-hidden="true"></span>';
    control.addEventListener('click', open); host.append(control); controls.add(control); updateControl(control, 0);
  }
  button(document.querySelector('.footer-actions'));
  button(document.querySelector('#ai-image-panel .ai-head-status'), 'ai-header-tool modal-btn');
  const libraryHosts = new WeakSet();
  const mountLibrary = root => {
    const host = root.querySelector?.('.unilib-header-actions');
    if (host && !libraryHosts.has(host)) { libraryHosts.add(host); button(host, 'unilib-icon-button'); }
  };
  mountLibrary(document);
  new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) mountLibrary(node); }).observe(document.body, { childList: true });
  document.addEventListener('5e:ai-error-record', event => {
    for (const control of controls) if (event.target.contains(control) || control.closest('.footer-actions')) updateControl(control, event.detail.count);
  });
  document.addEventListener('5e:bug-report-open', event => open({ currentTarget: event.detail?.trigger || event.target }));
  document.addEventListener('keydown', event => {
    if (dialog.open && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (!sending && !reading) dialog.close(); }
  }, true);
  dialog.querySelector('[data-report-close]').addEventListener('click', () => { if (!sending && !reading) dialog.close(); });
  dialog.addEventListener('cancel', event => { event.stopImmediatePropagation(); if (sending || reading) event.preventDefault(); });
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('close', () => returnFocus?.isConnected && returnFocus.focus?.({ preventScroll: true }));
  form.elements.screenshot.addEventListener('change', async event => {
    const files = [...event.target.files]; if (!files.length || sending || reading) return;
    if (captured.images.length + files.length > 3) { status.textContent = '이미지는 최대 3장입니다. 기존 첨부를 제외한 뒤 추가해 주세요.'; event.target.value = ''; return; }
    reading = true; form.querySelector('[data-report-send]').disabled = true;
    try {
      for (const file of files) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 6 * 1024 * 1024) throw new Error('PNG·JPEG·WebP 이미지 6MB 이하를 선택해 주세요.');
        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다. 다시 선택해 주세요.')); reader.readAsDataURL(file); });
        const image = reportImage({ name: file.name, data, role: 'screenshot' });
        if (!image) throw new Error('첨부 이미지의 형식을 확인해 주세요.');
        uploads.push(image); captured.images.push(image);
      }
      status.textContent = '';
    } catch (error) { status.textContent = error.message; }
    finally { reading = false; event.target.value = ''; form.querySelector('[data-report-send]').disabled = false; renderImages(); }
  });
  const report = () => {
    const description = form.elements.description.value;
    const signature = JSON.stringify({ description, images: captured.images });
    if (signature !== captured.signature) { captured.id = crypto.randomUUID(); captured.createdAt = new Date().toISOString(); captured.signature = signature; }
    return buildSimpleBugReport({ ...captured, description });
  };
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (sending || reading) return;
    let value; try { value = report(); } catch (error) { status.textContent = error.message; return; }
    sending = true; form.querySelector('[data-report-send]').disabled = true;
    form.elements.description.disabled = true; form.elements.screenshot.disabled = true; renderImages();
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    status.textContent = '보내고 있습니다…';
    try {
      const response = await fetch(endpoint(), { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', 'X-5E-Report': '1' }, body: JSON.stringify(value), signal: controller.signal });
      const receipt = await response.json();
      if (!response.ok || receipt.id !== value.id) throw new Error('리포트 접수 응답을 확인하지 못했습니다.');
      status.textContent = `접수되었습니다. 접수 번호: ${receipt.id.slice(0, 8)}`;
    } catch { status.textContent = '보내지 못했습니다. 글과 첨부는 유지됩니다. 다시 보내기를 눌러 주세요.'; }
    finally { clearTimeout(timer); sending = false; form.querySelector('[data-report-send]').disabled = false; form.elements.description.disabled = false; form.elements.screenshot.disabled = false; renderImages(); }
  });
}
