import { DESKTOP_RELEASE_URL } from './ai-install-guide.js';

export function initWebLoginUi({ openAi }) {
  if (!window.fiveEWebAI) return null;
  const aiButton = document.getElementById('ai-image-install-open');
  const badge = document.createElement('button');
  badge.className = 'topbar-btn web-account-status'; badge.type = 'button';
  badge.innerHTML = '<span class="web-account-dot" aria-hidden="true"></span><span data-account-label>ChatGPT 연결</span>';
  document.querySelector('.canvas-global-controls')?.prepend(badge);
  const dialog = document.createElement('dialog');
  dialog.className = 'web-login-dialog'; dialog.setAttribute('aria-labelledby', 'web-login-title');
  dialog.innerHTML = `<button type="button" class="web-login-close" aria-label="연결 안내 닫기">×</button>
    <h2 id="web-login-title" tabindex="-1">AI 기능을 시작하세요</h2>
    <div data-install-guide><p>설치형에서는 라이브러리에 내 컴퓨터의 폴더를 연결하고 AI 기능을 편리하게 사용할 수 있습니다.</p>
      <a class="web-login-download" href="${DESKTOP_RELEASE_URL}" target="_blank" rel="noopener noreferrer">설치형 다운로드</a></div>
    <p data-login-message role="status">웹에서도 기존 ChatGPT 계정으로 연결할 수 있습니다.</p>
    <p class="web-login-account-note">별도 API 키 없이 연결하며, ChatGPT 계정의 이용 한도와 제한이 적용됩니다.</p>
    <div data-login-code hidden><span>1. 인증 코드 복사</span><div class="web-login-code-row"><strong></strong><button type="button" data-copy-code>복사</button></div><p>옆 인증 창에 붙여넣거나, 이 코드를 직접 입력해 주세요.</p></div>
    <div class="web-login-actions"><button type="button" data-login-later>나중에</button><button type="button" data-login-start><img data-login-logo src="${new URL('../assets/chatgpt-login.svg', import.meta.url).href}" width="20" height="20" alt="" aria-hidden="true"><span data-login-start-label>ChatGPT로 로그인</span></button></div>`;
  document.body.append(dialog);
  const toast = document.createElement('div');
  toast.className = 'web-login-toast'; toast.hidden = true;
  toast.innerHTML = '<span role="status"></span><button type="button" hidden>전체화면으로 돌아가기</button>';
  document.body.append(toast);
  const restore = toast.querySelector('button');
  const label = badge.querySelector('[data-account-label]'), message = dialog.querySelector('[data-login-message]');
  const title = dialog.querySelector('h2'), codeBox = dialog.querySelector('[data-login-code]');
  const start = dialog.querySelector('[data-login-start]'), copy = dialog.querySelector('[data-copy-code]');
  let connected = false, userCode = '', phase = 'idle', wasFullscreen = false, toastTimer;
  function render(next, text) {
    phase = next; badge.dataset.state = next;
    label.textContent = next === 'connected' ? 'ChatGPT 연결됨' : ['waiting', 'starting'].includes(next) ? '로그인 중…' : next === 'error' ? '연결 확인' : 'ChatGPT 연결';
    badge.title = label.textContent;
    if (aiButton) {
      aiButton.dataset.loginState = next;
      aiButton.title = connected ? 'AI 이미지 변환 · 사용 가능' : 'AI 이미지 변환 · ChatGPT 연결 필요';
      aiButton.setAttribute('aria-label', aiButton.title);
    }
    if (text) message.textContent = text;
    dialog.querySelector('[data-install-guide]').hidden = next !== 'idle';
    start.disabled = next === 'starting';
    start.querySelector('[data-login-start-label]').textContent = next === 'starting' ? '인증 창 준비 중…' : next === 'waiting' ? '2. 인증 창 보기 →' : next === 'connected' ? 'AI 작업 열기' : next === 'error' ? '다시 로그인' : 'ChatGPT로 로그인';
    start.querySelector('[data-login-logo]').hidden = !['idle', 'error'].includes(next);
    title.textContent = next === 'connected' ? 'AI 기능을 사용할 수 있습니다' : ['waiting', 'starting'].includes(next) ? '코드를 보면서 인증하세요' : 'AI 기능을 시작하세요';
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
    if (connected && forAi) { openAi(); return; }
    if (!dialog.open) { wasFullscreen = Boolean(document.fullscreenElement); dialog.showModal(); }
    title.focus({ preventScroll: true });
  }
  badge.addEventListener('click', () => show());
  function dismiss() {
    if (['starting', 'waiting'].includes(phase)) window.fiveEWebCancelLogin?.();
    dialog.close();
    if (wasFullscreen && !document.fullscreenElement) notify('편집 화면으로 돌아왔습니다.');
  }
  dialog.querySelector('.web-login-close').addEventListener('click', dismiss);
  dialog.querySelector('[data-login-later]').addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  copy.addEventListener('click', async () => {
    const currentCode = userCode;
    try {
      await navigator.clipboard.writeText(currentCode);
      if (phase === 'waiting' && userCode === currentCode) copy.textContent = '✓ 복사됨';
    } catch { if (phase === 'waiting') message.textContent = '코드를 직접 선택해 복사하거나 인증 창에 그대로 입력해 주세요.'; }
  });
  start.addEventListener('click', () => {
    if (connected) { dialog.close(); openAi(); return; }
    if (phase === 'waiting') { window.fiveEWebContinueLogin?.(); return; }
    userCode = ''; copy.textContent = '복사';
    render('starting', '코드 안내 창을 준비하고 있습니다. 편집 내용은 그대로 유지됩니다.');
    try { window.fiveEWebLogin(); } catch (error) { render('error', error.message); }
  });
  window.addEventListener('5e:web-login-progress', event => {
    const data = event.detail;
    if (data.state === 'ready') {
      userCode = data.userCode || '';
      render('waiting', '코드 안내 창에서 인증 화면 열기를 누르면 두 창을 나란히 볼 수 있습니다.');
    } else if (data.state === 'authenticating') render('waiting', '인증 완료 후 두 창이 닫히고 메인 화면의 AI 버튼이 활성화됩니다.');
    else if (['error', 'cancelled'].includes(data.state)) {
      userCode = ''; render(data.state === 'error' ? 'error' : 'idle', data.message || '로그인이 취소되었습니다. 다시 시작할 수 있습니다.');
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
          render('connected', '메인 화면의 AI 버튼을 눌러 작업을 시작하세요.');
          if (!wasConnected && dialog.open) {
            dialog.close(); aiButton?.focus();
            notify('ChatGPT 연결 완료 · AI 버튼을 눌러 작업을 시작하세요.');
          }
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
