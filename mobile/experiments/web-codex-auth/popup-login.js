(() => {
  const editor = new URL(location.href).searchParams.get('editor');
  if (editor !== 'https://www.5e.ai.kr' || !window.opener) return;
  document.querySelector('main').innerHTML = `<p class="eyebrow">5E / ChatGPT 연결</p>
    <h1>코드를 보면서 인증하세요</h1>
    <p>옆에 열리는 OpenAI 화면에 아래 코드를 입력해 주세요. 이 창은 그대로 남아 있습니다.</p>
    <section aria-label="계정 연결"><p id="status" role="status">연결을 준비하고 있습니다…</p>
      <div id="login-steps" hidden><h2>1. 인증 코드 복사</h2>
      <div class="login-code-row"><strong id="code"></strong><button id="copy-code" class="secondary">복사</button></div>
      <p id="copy-status" role="status">복사하지 않고 코드를 직접 입력해도 됩니다.</p>
      <h2>2. 옆 창에서 계정 인증</h2>
      <button id="open-auth">OpenAI 인증 화면 열기 →</button></div></section>
    <p class="note">인증이 완료되면 두 창이 자동으로 닫히고, 편집 화면의 AI 버튼이 사용 가능한 상태로 바뀝니다.</p>`;
  const status = document.getElementById('status');
  let authWindow, authAttempt = 0;
  const geometry = (width, height, left, top) => {
    const displayLeft = screen.availLeft || 0, displayTop = screen.availTop || 0;
    const availableWidth = screen.availWidth || screen.width || 1280;
    const availableHeight = screen.availHeight || screen.height || 800;
    width = Math.min(width, availableWidth); height = Math.min(height, availableHeight);
    return { width, height,
      left: Math.max(displayLeft, Math.min(left, displayLeft + availableWidth - width)),
      top: Math.max(displayTop, Math.min(top, displayTop + availableHeight - height)) };
  };
  const place = (popup, box) => {
    // Browser preferences can override these best-effort window requests.
    try { popup.resizeTo(box.width, box.height); } catch {}
    try { popup.moveTo(box.left, box.top); } catch {}
  };
  place(window, geometry(420, 700, window.screenX, window.screenY));
  const close = () => { authWindow?.close(); window.close(); };
  window.addEventListener('pagehide', () => authWindow?.close());
  const watch = setInterval(() => { if (window.opener.closed) { clearInterval(watch); close(); } }, 1000);
  window.addEventListener('message', event => {
    if (event.origin === editor && event.source === window.opener && event.data?.type === '5e:session-received') close();
  });
  const request = async action => {
    const response = await fetch(`/api/${action}`, { method: 'POST', headers: { 'X-5E-Request': '1' } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '연결을 준비하지 못했습니다.');
    return result;
  };
  void (async () => {
    try {
      await request('session');
      const result = await request('web-login-start');
      const target = new URL(result.authUrl);
      if (target.protocol !== 'https:' || !['auth.openai.com', 'chatgpt.com'].includes(target.hostname) || target.username || target.password || target.port) throw new Error('인증 주소를 확인할 수 없습니다.');
      document.getElementById('code').textContent = result.userCode || '';
      document.getElementById('login-steps').hidden = false;
      status.textContent = '코드를 복사한 뒤 인증 화면을 열어 주세요.';
      window.opener.postMessage({ type: '5e:login-ready', ...result }, editor);
      document.getElementById('copy-code').addEventListener('click', async event => {
        try {
          await navigator.clipboard.writeText(result.userCode);
          event.target.textContent = '✓ 복사됨';
          document.getElementById('copy-status').textContent = '이제 아래 버튼으로 인증 화면을 열고 코드를 붙여넣어 주세요.';
        } catch { document.getElementById('copy-status').textContent = '코드를 직접 선택해 복사하거나, 옆 인증 창에 그대로 입력해 주세요.'; }
      });
      const open = document.getElementById('open-auth');
      open.addEventListener('click', () => {
        if (authWindow && !authWindow.closed) { authWindow.focus(); return; }
        const box = geometry(560, 700, window.screenX + window.outerWidth + 16, window.screenY);
        const name = `fivee-openai-auth-${window.crypto?.randomUUID?.() || `${Date.now()}-${++authAttempt}-${Math.random().toString(36).slice(2)}`}`;
        authWindow = window.open('about:blank', name, `popup=yes,width=${box.width},height=${box.height},left=${box.left},top=${box.top}`);
        if (!authWindow) { status.textContent = '인증 창이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 눌러 주세요.'; return; }
        place(authWindow, box);
        authWindow.location.replace(target.href);
        open.textContent = '인증 창 다시 보기 →';
        status.textContent = '옆 인증 창에 코드를 입력해 주세요. 완료 여부를 자동으로 확인합니다.';
        window.opener.postMessage({ type: '5e:login-opening' }, editor);
      });
    } catch (error) {
      status.textContent = error.message;
      window.opener.postMessage({ type: '5e:login-error', message: error.message }, editor);
    }
  })();
})();
