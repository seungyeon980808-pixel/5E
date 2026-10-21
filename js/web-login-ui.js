import { DESKTOP_RELEASE_URL } from './ai-install-guide.js?v=1.7.0-four-session-integration';
import { createModalSurfaceMotion } from './modal-surface-motion.js?v=1.7.0-four-session-integration';

export function initWebLoginUi({ openAi }) {
  if (!window.fiveEWebAI) return null;
  const aiButton = document.getElementById('ai-image-install-open');
  const badge = document.createElement('button');
  badge.className = 'topbar-btn web-account-status'; badge.type = 'button';
  badge.innerHTML = '<span class="web-account-dot" aria-hidden="true"></span><span data-account-label>ChatGPT 연결</span>';
  const badgeHost = document.querySelector('.app-shell-header .toolbar-inspector-controls .canvas-global-controls')
    || document.querySelector('.panel-utility-bar-right')
    || document.querySelector('.canvas-global-controls');
  const zoom = badgeHost?.querySelector('#zoom-readout');
  if (zoom) zoom.after(badge); else badgeHost?.prepend(badge);
  const dialog = document.createElement('dialog');
  dialog.className = 'web-login-dialog'; dialog.setAttribute('aria-labelledby', 'web-login-title');
  dialog.innerHTML = `<button type="button" class="web-login-close" aria-label="연결 안내 닫기">×</button>
    <h2 id="web-login-title" tabindex="-1">AI 기능을 시작하세요</h2>
    <div data-install-guide><p>설치형에서는 라이브러리에 내 컴퓨터의 폴더를 연결하고 AI&nbsp;기능을 편리하게 사용할 수 있습니다.</p>
      <a class="web-login-download ai-action-motion" data-ai-orbit="true" href="${DESKTOP_RELEASE_URL}" target="_blank" rel="noopener noreferrer"><span class="ai-action-motion-label">설치형 다운로드</span></a></div>
    <p data-login-message role="status">웹에서도 기존 ChatGPT 계정으로 연결할 수 있습니다.</p>
    <p class="web-login-account-note">별도 API 키 없이 연결하며, ChatGPT 계정의 이용 한도와 제한이 적용됩니다.</p>
    <div data-login-code hidden><span>1. 인증 코드 복사</span><div class="web-login-code-row"><strong></strong><button type="button" data-copy-code>복사</button></div><p>옆 인증 창에 붙여넣거나, 이 코드를 직접 입력해 주세요.</p></div>
    <div class="web-login-actions"><button type="button" data-login-later>나중에</button><button type="button" data-login-start><img data-login-logo src="${new URL('../assets/chatgpt-login.svg', import.meta.url).href}" width="20" height="20" alt="" aria-hidden="true"><span data-login-start-label>ChatGPT로 로그인</span></button></div>`;
  document.body.append(dialog);
  const motion = createModalSurfaceMotion({ overlay: dialog });
  const mobile = document.documentElement.classList.contains('mobile-image-mode');
  if (mobile) dialog.querySelector('[data-login-code] p').textContent = '새 인증 탭에 코드를 입력하세요. 인증이 끝나면 이 5E 탭으로 돌아와 주세요.';
  const toast = document.createElement('div');
  toast.className = 'web-login-toast'; toast.hidden = true;
  toast.innerHTML = '<span role="status"></span><button type="button" hidden>전체화면으로 돌아가기</button>';
  document.body.append(toast);
  const restore = toast.querySelector('button');
  const label = badge.querySelector('[data-account-label]'), message = dialog.querySelector('[data-login-message]');
  const title = dialog.querySelector('h2'), codeBox = dialog.querySelector('[data-login-code]');
  const start = dialog.querySelector('[data-login-start]'), copy = dialog.querySelector('[data-copy-code]');
  let connected = false, userCode = '', phase = 'idle', wasFullscreen = false, toastTimer, preparationTimer, pairFrame, authenticating = false, pendingAiAction = null;
  let connectionObserver = null;
  dialog.addEventListener('close', () => { connectionObserver?.disconnect(); connectionObserver = null; });
  async function runPendingAiAction() {
    const pending = pendingAiAction;
    if (!pending || pending.started || !connected) return;
    pending.started = true;
    message.textContent = '로그인되었습니다. 이미지 작업대로 돌아갑니다.';
    try {
      const result = await pending.action({ signal: pending.controller.signal });
      if (pending !== pendingAiAction || pending.controller.signal.aborted) return;
      pendingAiAction = null;
      motion.hide({ onHidden: resetPairedLayout });
      pending.resolve(result);
    } catch (error) {
      if (pending !== pendingAiAction) return;
      pendingAiAction = null;
      pending.reject(error);
      if (error?.name !== 'AbortError') render('error', `이미지 작업대를 열지 못했습니다: ${error.message}`);
    }
  }
  function resetCopyStage() {
    copy.textContent = '복사';
    delete copy.dataset.copied;
    delete start.dataset.copyReady;
    delete start.dataset.authenticating;
  }
  function resetPairedLayout() {
    cancelAnimationFrame(pairFrame);
    dialog.classList.remove('web-login-paired', 'web-login-pair-shift', 'web-login-pair-settle', 'web-login-completing');
    dialog.style.removeProperty('--login-pair-shift-x');
    dialog.style.removeProperty('--login-complete-x');
    dialog.style.removeProperty('--login-complete-y');
  }
  function shiftToPairedLayout(paired) {
    const before = dialog.open ? dialog.getBoundingClientRect() : null;
    dialog.classList.toggle('web-login-paired', paired);
    if (!before || !paired || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const shift = Math.round(before.left - dialog.getBoundingClientRect().left);
    if (!shift) return;
    cancelAnimationFrame(pairFrame);
    dialog.style.setProperty('--login-pair-shift-x', `${shift}px`);
    dialog.classList.add('web-login-pair-shift');
    pairFrame = requestAnimationFrame(() => {
      dialog.classList.add('web-login-pair-settle');
      dialog.style.setProperty('--login-pair-shift-x', '0px');
    });
  }
  function scheduleCompletionClose() {
    if (pendingAiAction) { void runPendingAiAction(); return; }
    motion.hide({ onHidden: () => { resetPairedLayout(); badge.focus({ preventScroll: true }); } });
  }
  function render(next, text) {
    phase = next; badge.dataset.state = next;
    dialog.dataset.phase = next;
    clearInterval(preparationTimer);
    if (next === 'starting') {
      const began = Date.now();
      preparationTimer = setInterval(() => {
        const seconds = Math.floor((Date.now() - began) / 1000);
        message.textContent = seconds < 5 ? `인증 코드를 요청하고 있습니다. ${seconds}초 경과` : `인증 서버의 응답을 기다리고 있습니다. ${seconds}초 경과 · 준비가 끝나면 코드가 표시됩니다.`;
      }, 1000);
    }
    if (next !== 'waiting') resetPairedLayout();
    label.textContent = next === 'connected' ? 'ChatGPT 연결됨' : ['waiting', 'starting'].includes(next) ? '로그인 중…' : next === 'error' ? '연결 확인' : 'ChatGPT 연결';
    badge.title = connected ? 'ChatGPT 연결됨 · 계정과 이용 한도 보기' : label.textContent;
    badge.setAttribute('aria-label', badge.title);
    if (aiButton) {
      aiButton.dataset.loginState = next;
      aiButton.title = connected ? 'AI 이미지/그래프 · 사용 가능' : 'AI 이미지/그래프 · ChatGPT 연결 필요';
      aiButton.setAttribute('aria-label', aiButton.title);
    }
    if (text) message.textContent = text;
    dialog.querySelector('[data-install-guide]').hidden = next !== 'idle';
    start.disabled = next === 'starting';
    start.querySelector('[data-login-start-label]').textContent = next === 'starting' ? '인증 창 준비 중…' : next === 'waiting' ? authenticating ? '인증 창으로 돌아가기' : '2. OpenAI 인증하기 →' : next === 'connected' ? '닫기' : next === 'error' ? '다시 로그인' : 'ChatGPT로 로그인';
    start.querySelector('[data-login-logo]').hidden = !['idle', 'error'].includes(next);
    title.textContent = mobile && ['waiting', 'starting'].includes(next) ? '인증 후 5E로 돌아오세요' : next === 'connected' ? pendingAiAction ? '이제 AI 기능을 이용할 수 있습니다.' : '연결 정보' : ['waiting', 'starting'].includes(next) ? '코드를 보면서 인증하세요' : 'AI 기능을 시작하세요';
    codeBox.hidden = !userCode || next !== 'waiting';
    codeBox.querySelector('strong').textContent = userCode;
  }
  function notify(text) {
    clearTimeout(toastTimer); toast.hidden = false; toast.querySelector('span').textContent = text;
    restore.hidden = !wasFullscreen || Boolean(document.fullscreenElement);
    if (restore.hidden) toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
  }
  restore.addEventListener('click', async () => {
    try {
      await document.documentElement.requestFullscreen();
      wasFullscreen = false; toast.hidden = true;
    } catch { toast.querySelector('span').textContent = '상단 전체화면 버튼으로 다시 전환해 주세요.'; }
  });
  function show(forAi = false) {
    if (connected && forAi) { void refresh(); return; }
    if (!motion.isOpen()) wasFullscreen = Boolean(document.fullscreenElement);
    motion.show({ origin: forAi ? aiButton : badge });
    if (connected) render('connected', 'ChatGPT 계정이 연결되었습니다.');
    title.focus({ preventScroll: true });
  }
  badge.addEventListener('click', () => {
    show();
    connectionObserver?.disconnect(); connectionObserver = null;
    const summary = document.querySelector('[data-ai-account]')?.closest('.ai-account-summary');
    dialog.querySelector('[data-main-connection-summary]')?.remove();
    if (connected && summary) {
      const copy = document.createElement('div'); copy.dataset.mainConnectionSummary = '';
      const update = () => {
        copy.replaceChildren(...Array.from(summary.children, node => {
          const field = node.cloneNode(true); for (const key of Object.keys(field.dataset)) delete field.dataset[key]; return field;
        }));
      };
      update(); message.after(copy);
      connectionObserver = new MutationObserver(update);
      connectionObserver.observe(summary, {subtree:true, childList:true, characterData:true});
      window.dispatchEvent(new Event('5e:web-ai-status'));
    }
  });
  function dismiss() {
    const pending = pendingAiAction;
    pendingAiAction = null;
    if (pending) {
      pending.controller.abort();
      pending.reject(new DOMException('로그인이 취소되었습니다. 선택한 이미지는 그대로 유지됩니다.', 'AbortError'));
    }
    if (['starting', 'waiting'].includes(phase)) {
      window.fiveEWebCancelLogin?.();
      userCode = ''; authenticating = false; resetCopyStage(); render('idle');
    }
    clearInterval(preparationTimer);
    motion.hide({ onHidden: resetPairedLayout });
    if (wasFullscreen && !document.fullscreenElement) notify('편집 화면으로 돌아왔습니다.');
  }
  dialog.querySelector('.web-login-close').addEventListener('click', dismiss);
  dialog.querySelector('[data-login-later]').addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault(); dismiss();
  });
  copy.addEventListener('click', async () => {
    const currentCode = userCode;
    try {
      await navigator.clipboard.writeText(currentCode);
      if (phase === 'waiting' && userCode === currentCode) {
        copy.textContent = '✓ 복사됨';
        copy.dataset.copied = 'true';
        if (!authenticating) start.dataset.copyReady = 'true';
      }
    } catch { if (phase === 'waiting') message.textContent = '코드를 직접 선택해 복사하거나 인증 창에 그대로 입력해 주세요.'; }
  });
  start.addEventListener('click', () => {
    // 연결된 뒤 「닫기」는 1.6.3처럼 AI 단추로 초점을 돌려준다(키보드 사용자가 길을 잃지 않게, 점검 하).
    if (connected) { if (pendingAiAction) void runPendingAiAction(); else { dismiss(); aiButton?.focus(); } return; }
    if (phase === 'waiting') { window.fiveEWebContinueLogin?.(); return; }
    userCode = ''; authenticating = false; resetCopyStage();
    render('starting', '인증 코드를 요청하고 있습니다. 편집 내용은 그대로 유지됩니다.');
    try { window.fiveEWebLogin(); } catch (error) { render('error', error.message); }
  });
  window.addEventListener('5e:web-login-progress', event => {
    const data = event.detail;
    if (data.state === 'layout') {
      dialog.style.setProperty('--login-code-left', `${data.codeLeft}px`);
      dialog.style.setProperty('--login-code-width', `${data.codeWidth}px`);
      shiftToPairedLayout(data.paired);
    } else if (data.state === 'ready') {
      userCode = data.userCode || '';
      authenticating = false;
      resetCopyStage();
      render('waiting', mobile ? '코드를 복사한 뒤 OpenAI 인증하기를 눌러 새 탭에서 인증하세요.' : '코드를 복사한 뒤 아래 OpenAI 인증하기를 누르세요. 인증 팝업 하나가 열립니다.');
    } else if (data.state === 'authenticating') {
      authenticating = true;
      delete start.dataset.copyReady;
      start.dataset.authenticating = 'true';
      render('waiting', mobile ? '새 탭에서 인증을 완료한 뒤 5E 탭으로 돌아와 주세요. 연결 상태를 확인합니다.' : '인증이 끝나면 이 안내와 인증 창이 자동으로 닫히고 편집기로 돌아갑니다.');
    } else if (data.state === 'blocked') {
      authenticating = false;
      delete start.dataset.authenticating;
      if (copy.dataset.copied === 'true') start.dataset.copyReady = 'true';
      render('waiting', data.message);
    }
    else if (['error', 'cancelled'].includes(data.state)) {
      userCode = ''; authenticating = false; resetCopyStage(); render(data.state === 'error' ? 'error' : 'idle', data.message || '로그인이 취소되었습니다. 다시 시작할 수 있습니다.');
    }
  });
  let checking;
  async function refresh() {
    if (checking) return checking;
    checking = (async () => {
      try {
        const result = await window.fiveEWebAI.status();
        const wasConnected = connected; connected = result.login?.loggedIn === true;
        if (connected) {
          const autoReturning = !wasConnected && dialog.open;
          render('connected', autoReturning ? '이제 AI 기능을 이용할 수 있습니다.' : 'ChatGPT 계정이 연결되었습니다.');
          if (pendingAiAction || !wasConnected && motion.isOpen()) {
            scheduleCompletionClose();
          }
        } else {
          if (!['starting', 'waiting'].includes(phase)) render('idle');
          if (pendingAiAction && !motion.isOpen()) show(true);
        }
      } catch {
        connected = false;
        render('error', '연결 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        if (pendingAiAction && !motion.isOpen()) show(true);
      }
      finally { checking = null; }
    })();
    return checking;
  }
  window.addEventListener('5e:web-ai-status', () => void refresh());
  function requireAi(action) {
    if (typeof action !== 'function') return Promise.reject(new TypeError('로그인 후 이어갈 작업이 필요합니다.'));
    if (pendingAiAction) return Promise.reject(new Error('진행 중인 로그인을 먼저 완료하거나 취소해 주세요.'));
    const operation = new Promise((resolve, reject) => {
      pendingAiAction = { action, resolve, reject, started: false, controller: new AbortController() };
    });
    if (connected) {
      // Local workspace reveal need not wait for another remote status read.
      // Generation still checks its connection when a request is submitted.
      void runPendingAiAction();
      void refresh();
    } else show(true);
    // Status may have changed in another tab since the last UI refresh.
    if (!connected) void refresh();
    return operation;
  }
  window.addEventListener('5e:web-login-request', event => {
    if (typeof event.detail?.resumeAi === 'function') {
      void requireAi(event.detail.resumeAi).catch(error => {
        if (error?.name !== 'AbortError') notify(error.message);
      });
    } else show();
  });
  window.addEventListener('focus', () => { if (!dialog.open) void refresh(); });
  void refresh();
  return {
    openAi: options => requireAi(() => openAi(options)),
    requireAi,
  };
}
