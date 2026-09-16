/* Only a scoped 5E session is retained; OpenAI credentials stay on the runtime. */
(() => {
  if (window.fiveEDesktop) return;
  const origin = 'https://five-e-ai-runtime-probe.onrender.com';
  const key = '5e:web-ai-session';
  let popup, token = '';
  try { token = sessionStorage.getItem(key) || ''; } catch {}
  if (!/^[a-f0-9]{64}$/.test(token)) token = '';
  const save = value => {
    token = value;
    try { if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key); } catch {}
    window.dispatchEvent(new Event('5e:web-ai-status'));
  };
  window.addEventListener('message', event => {
    if (event.origin !== origin || event.source !== popup) return;
    const message = event.data;
    if (message?.type === '5e:runtime-session' && /^[a-f0-9]{64}$/.test(message.token)) {
      save(message.token);
      popup.postMessage({ type: '5e:session-received' }, origin);
    }
    if (message?.type === '5e:runtime-status' && message.signedIn === false) save('');
  });
  window.fiveEWebRequest = async (action, payload = {}) => {
    if (!token) {
      if (action === 'bridge-status') return { login: { loggedIn: false }, server: false };
      throw new Error('ChatGPT 로그인을 눌러 계정을 연결해 주세요.');
    }
    if (!['bridge-status', 'bridge-models', 'bridge-account', 'bridge-send', 'bridge-events', 'bridge-interrupt'].includes(action)) throw new Error('허용되지 않은 요청입니다.');
    const response = await fetch(`${origin}/api/${action}`, {
      method: 'POST', credentials: 'omit',
      headers: { Authorization: `Bearer ${token}`, 'X-5E-Request': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(40000),
    });
    if (response.status === 401) {
      save('');
      if (action === 'bridge-status') return { login: { loggedIn: false }, server: false };
    }
    const result = await response.json();
    if (action === 'bridge-status' && result.login?.loggedIn === false && token) save('');
    if (!response.ok) throw Object.assign(new Error(result.error || '서버 연결에 실패했습니다.'), { status: response.status });
    return result;
  };
  window.fiveEWebLogin = () => {
    if (token) { window.dispatchEvent(new Event('5e:web-ai-status')); return; }
    if (popup && !popup.closed) { popup.focus(); return; }
    popup = window.open(`${origin}/web-connect?editor=${encodeURIComponent(location.origin)}`, '_blank');
    if (!popup) throw new Error('로그인 창이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.');
  };
})();
