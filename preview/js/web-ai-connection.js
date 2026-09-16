/* Only a scoped 5E session is retained; OpenAI credentials stay on the runtime. */
(() => {
  if (window.fiveEDesktop) return;
  const origin = 'https://five-e-ai-runtime-probe.onrender.com';
  const key = '5e:web-ai-session';
  let popup, token = '', loginTicket = '', loginTimer, attempt = 0;
  const closeLoginWindows = () => {
    const currentPopup = popup;
    if (!currentPopup || currentPopup.closed) return;
    currentPopup.postMessage({ type: '5e:session-received' }, origin);
    setTimeout(() => { if (!currentPopup.closed) currentPopup.close(); }, 500);
  };
  const progress = detail => window.dispatchEvent(new CustomEvent('5e:web-login-progress', { detail }));
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
    if (message?.type === '5e:login-ready' && /^[a-f0-9]{64}$/.test(message.ticket)) {
      clearTimeout(loginTimer); loginTicket = message.ticket;
      progress({ state: 'ready', authUrl: message.authUrl, userCode: message.userCode });
      void pollLogin(attempt);
    }
    if (message?.type === '5e:login-opening' && loginTicket) progress({ state: 'authenticating' });
    if (message?.type === '5e:login-error') { clearTimeout(loginTimer); closeLoginWindows(); progress({ state: 'error', message: message.message }); }
    if (message?.type === '5e:runtime-session' && /^[a-f0-9]{64}$/.test(message.token)) {
      clearTimeout(loginTimer); save(message.token);
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
  const loginRequest = async (action, ticket) => {
    const response = await fetch(`${origin}/api/web-login-${action}`, {
      method: 'POST', credentials: 'omit', headers: { Authorization: `Bearer ${ticket}`, 'X-5E-Request': '1', 'Content-Type': 'application/json' },
      body: '{}', signal: AbortSignal.timeout(40000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error('로그인 시간이 만료되었거나 연결이 끊겼습니다. 다시 시도해 주세요.');
    return result;
  };
  async function pollLogin(current) {
    const ticket = loginTicket;
    try {
      const result = await loginRequest('status', ticket);
      if (current !== attempt) return;
      if (result.signedIn && /^[a-f0-9]{64}$/.test(result.token)) {
        loginTicket = ''; closeLoginWindows(); save(result.token); return;
      }
      if (popup?.closed || ['cancelled', 'login-failed', 'local-timeout'].includes(result.state)) {
        window.fiveEWebCancelLogin(); return;
      }
      loginTimer = setTimeout(() => void pollLogin(current), 1500);
    } catch (error) {
      if (current !== attempt) return;
      loginTicket = ''; closeLoginWindows(); progress({ state: 'error', message: error.message });
    }
  }
  window.fiveEWebCancelLogin = () => {
    attempt++; clearTimeout(loginTimer); closeLoginWindows();
    const ticket = loginTicket; loginTicket = '';
    if (ticket) void loginRequest('cancel', ticket).catch(() => {});
    progress({ state: 'cancelled' });
  };
  window.fiveEWebContinueLogin = () => {
    if (!popup || popup.closed) { progress({ state: 'cancelled' }); return false; }
    popup.focus();
    return true;
  };
  window.fiveEWebLogin = () => {
    if (token) { window.dispatchEvent(new Event('5e:web-ai-status')); return; }
    if (popup && !popup.closed) { popup.focus(); return; }
    attempt++;
    const width = 420, height = Math.min(700, screen.availHeight || screen.height);
    const left = Math.max(0, Math.round(((screen.availWidth || screen.width) - 996) / 2));
    const top = Math.max(0, Math.round((screen.height - height) / 2));
    popup = window.open(`${origin}/web-connect?editor=${encodeURIComponent(location.origin)}&flow=popup`, 'fivee-chatgpt-login', `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
    if (!popup) throw new Error('로그인 창이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.');
    loginTimer = setTimeout(() => { if (!loginTicket) { closeLoginWindows(); progress({ state: 'error', message: '연결 준비 시간이 초과되었습니다. 다시 시도해 주세요.' }); } }, 45000);
  };
})();
