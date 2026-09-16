export function initWebLoginUi({ openAi }) {
  if (!window.fiveEWebAI) return null;
  const badge = document.createElement('button');
  badge.className = 'topbar-btn web-account-status';
  badge.type = 'button';
  badge.innerHTML = '<span class="web-account-dot" aria-hidden="true"></span><span data-account-label>ChatGPT 연결</span>';
  document.querySelector('.canvas-global-controls')?.prepend(badge);
  const dialog = document.createElement('dialog');
  dialog.className = 'web-login-dialog';
  dialog.setAttribute('aria-labelledby', 'web-login-title');
  dialog.innerHTML = `<button type="button" class="web-login-close" aria-label="연결 안내 닫기">×</button>
    <h2 id="web-login-title">ChatGPT 연결이 필요합니다</h2>
    <p data-login-message role="status">로그인 후 이 작업을 바로 이어갑니다.</p>
    <div data-login-code hidden><span>일회용 인증 코드</span><strong></strong><p>OpenAI 인증 화면에서 이 코드를 한 번 입력해 주세요.</p></div>
    <div class="web-login-actions"><button type="button" data-login-later>나중에</button><button type="button" data-login-start>ChatGPT로 로그인</button></div>`;
  document.body.append(dialog);
  const toast = document.createElement('div');
  toast.className = 'web-login-toast'; toast.setAttribute('role', 'status'); toast.hidden = true;
  document.body.append(toast);
  const label = badge.querySelector('[data-account-label]');
  const message = dialog.querySelector('[data-login-message]');
  const title = dialog.querySelector('h2');
  const codeBox = dialog.querySelector('[data-login-code]');
  const start = dialog.querySelector('[data-login-start]');
  let connected = false, pendingAi = false, authUrl = '', userCode = '', phase = 'idle', manualCopy = false, continuation = 0, toastTimer;
  function render(next, text) {
    phase = next;
    badge.dataset.state = next;
    label.textContent = next === 'connected' ? 'ChatGPT 연결됨' : next === 'waiting' || next === 'starting' ? '로그인 중…' : next === 'error' ? '연결 확인' : 'ChatGPT 연결';
    badge.title = label.textContent;
    if (text) message.textContent = text;
    start.disabled = next === 'starting';
    start.textContent = next === 'starting' ? '연결 준비 중…' : next === 'waiting' ? (authUrl ? '코드 복사 후 인증하기' : '인증 창 보기') : next === 'connected' ? 'AI 작업 열기' : 'ChatGPT로 로그인';
    title.textContent = next === 'connected' ? 'ChatGPT가 연결되었습니다' : next === 'waiting' || next === 'starting' ? 'ChatGPT 연결 중' : 'ChatGPT 연결이 필요합니다';
    codeBox.hidden = !userCode || next !== 'waiting';
    codeBox.querySelector('strong').textContent = userCode;
  }
  function show(forAi = false) {
    pendingAi ||= forAi;
    if (connected && forAi) { pendingAi = false; openAi(); return; }
    if (!dialog.open) dialog.showModal();
    start.focus();
  }
  badge.addEventListener('click', () => show());
  function dismiss() {
    continuation++;
    pendingAi = false;
    if (phase === 'starting' || phase === 'waiting') window.fiveEWebCancelLogin?.();
    dialog.close();
  }
  dialog.querySelector('.web-login-close').addEventListener('click', dismiss);
  dialog.querySelector('[data-login-later]').addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  start.addEventListener('click', async () => {
    if (connected) { dialog.close(); pendingAi = false; openAi(); return; }
    if (phase === 'waiting') {
      const current = continuation;
      const stillWaiting = () => current === continuation && dialog.open && phase === 'waiting';
      if (authUrl && userCode && !manualCopy) {
        try { await navigator.clipboard.writeText(userCode); }
        catch {
          if (!stillWaiting()) return;
          manualCopy = true;
          message.textContent = '위 코드를 직접 복사한 뒤 아래 버튼으로 계속해 주세요.';
          start.textContent = '복사 완료, 인증하기';
          return;
        }
      }
      if (!stillWaiting()) return;
      try { if (window.fiveEWebContinueLogin?.(authUrl) === false) return; } catch (error) { render('error', error.message); return; }
      authUrl = '';
      render('waiting', '인증이 끝나면 창이 자동으로 닫히고 이 작업으로 돌아옵니다.');
      return;
    }
    continuation++;
    authUrl = ''; userCode = ''; manualCopy = false;
    render('starting', '작은 인증 창을 준비하고 있습니다. 편집 화면은 그대로 유지됩니다.');
    try { window.fiveEWebLogin(); } catch (error) { render('error', error.message); }
  });
  window.addEventListener('5e:web-login-progress', event => {
    const data = event.detail;
    if (data.state === 'ready') {
      authUrl = data.authUrl || ''; userCode = data.userCode || '';
      render('waiting', userCode ? '코드를 복사하고 인증 창에서 붙여넣어 주세요.' : '인증 창에서 로그인을 완료해 주세요.');
    } else if (data.state === 'authenticating') {
      authUrl = '';
      render('waiting', '인증이 끝나면 창이 자동으로 닫히고 이 작업으로 돌아옵니다.');
    } else if (data.state === 'error' || data.state === 'cancelled') {
      continuation++;
      authUrl = ''; userCode = ''; render(data.state === 'error' ? 'error' : 'idle', data.message || '로그인이 취소되었습니다. 다시 시작할 수 있습니다.');
    }
  });
  let checking;
  async function refresh() {
    if (checking) return checking;
    checking = (async () => {
      try {
        const result = await window.fiveEWebAI.status();
        const wasConnected = connected;
        connected = result.login?.loggedIn === true;
        if (connected) {
          render('connected', '이 브라우저에서 AI 기능을 사용할 수 있습니다.');
          if (!wasConnected && dialog.open) {
            dialog.close(); toast.hidden = false; toast.textContent = 'ChatGPT에 연결되었습니다. AI 작업을 시작할 수 있습니다.';
            clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
          }
          if (pendingAi) { pendingAi = false; openAi(); }
        } else if (!['starting', 'waiting'].includes(phase)) render('idle');
      } catch { render('error', '연결 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
      finally { checking = null; }
    })();
    return checking;
  }
  window.addEventListener('5e:web-ai-status', () => void refresh());
  window.addEventListener('5e:web-login-request', () => show());
  window.addEventListener('focus', () => { if (!dialog.open) void refresh(); });
  void refresh();
  return { openAi: () => show(true) };
}
