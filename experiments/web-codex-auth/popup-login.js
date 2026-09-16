(() => {
  const editor = new URL(location.href).searchParams.get('editor');
  if (editor !== 'https://www.5e.ai.kr' || !window.opener) return;
  const status = document.getElementById('status');
  for (const element of document.querySelectorAll('button, #browser-login')) element.hidden = true;
  status.textContent = '연결을 준비하고 있습니다…';
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
      window.opener.postMessage({ type: '5e:login-ready', ...result }, editor);
      status.textContent = '이 창에서 인증을 마치면 자동으로 닫힙니다.';
      if (result.authUrl) {
        const target = new URL(result.authUrl);
        if (target.protocol !== 'https:' || !['auth.openai.com', 'chatgpt.com'].includes(target.hostname) || target.username || target.password || target.port) throw new Error('인증 주소를 확인할 수 없습니다.');
        document.getElementById('browser-login').hidden = false;
        document.getElementById('device-login').hidden = !result.userCode;
        document.getElementById('browser-instructions').hidden = true;
        document.getElementById('code').textContent = result.userCode || '';
        document.querySelector('#device-login p').textContent = '다음 OpenAI 화면에서 이 코드를 한 번 입력해 주세요.';
        const link = document.getElementById('auth-link');
        link.href = target.href; link.removeAttribute('target');
        link.textContent = result.userCode ? '코드 복사 후 로그인' : 'ChatGPT로 로그인';
        let manualCopy = false;
        link.addEventListener('click', async event => {
          event.preventDefault();
          if (result.userCode && !manualCopy) {
            try { await navigator.clipboard.writeText(result.userCode); }
            catch {
              manualCopy = true;
              status.textContent = '위 코드를 직접 복사한 뒤 아래 버튼으로 계속해 주세요.';
              link.textContent = '복사 완료, 로그인 계속';
              return;
            }
          }
          window.opener.postMessage({ type: '5e:login-opening' }, editor);
          location.replace(target.href);
        });
      }
    } catch (error) {
      status.textContent = error.message;
      window.opener.postMessage({ type: '5e:login-error', message: error.message }, editor);
    }
  })();
  window.addEventListener('message', event => {
    if (event.origin === editor && event.source === window.opener && event.data?.type === '5e:session-received') window.close();
  });
})();
