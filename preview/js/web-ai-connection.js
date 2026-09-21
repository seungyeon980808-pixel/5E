/* Only a scoped 5E session is retained; OpenAI credentials stay on the runtime. */
(() => {
  if (window.fiveEDesktop) return;
  const origin = location.hostname === '127.0.0.1' ? location.origin : 'https://five-e-ai-runtime-probe.onrender.com';
  const key = '5e:web-ai-session';
  let popup, token = '', loginTicket = '', loginTimer, attempt = 0;
  let authUrl = '', preparing = false, positioning = false, positionTimer, positionDeadline;
  const closeLoginWindows = () => {
    positioning = false; clearTimeout(positionTimer); clearTimeout(positionDeadline);
    try { if (popup && !popup.closed) popup.close(); } catch {}
    popup = null;
  };
  const progress = detail => window.dispatchEvent(new CustomEvent('5e:web-login-progress', { detail }));
  try { token = sessionStorage.getItem(key) || ''; } catch {}
  if (!/^[a-f0-9]{64}$/.test(token)) token = '';
  const save = value => {
    token = value;
    try { if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key); } catch {}
    window.dispatchEvent(new Event('5e:web-ai-status'));
  };
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
      method: 'POST', credentials: 'omit', headers: { ...(ticket ? { Authorization: `Bearer ${ticket}` } : {}), 'X-5E-Request': '1', 'Content-Type': 'application/json' },
      body: '{}', signal: AbortSignal.timeout(action === 'start' ? 120000 : 40000),
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
      if (['cancelled', 'login-failed', 'local-timeout'].includes(result.state)) {
        window.fiveEWebCancelLogin(); return;
      }
      loginTimer = setTimeout(() => void pollLogin(current), 1500);
    } catch (error) {
      if (current !== attempt) return;
      loginTicket = ''; authUrl = ''; closeLoginWindows();
      void loginRequest('cancel', ticket).catch(() => {});
      progress({ state: 'error', message: error.name === 'TimeoutError' ? '인증 서버 응답이 지연되고 있습니다. 잠시 후 다시 로그인해 주세요.' : error instanceof TypeError ? '인증 서버에 연결하지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.' : error.message });
    }
  }
  window.fiveEWebCancelLogin = () => {
    attempt++; preparing = false; authUrl = ''; clearTimeout(loginTimer); closeLoginWindows();
    const ticket = loginTicket; loginTicket = '';
    if (ticket) void loginRequest('cancel', ticket).catch(() => {});
    progress({ state: 'cancelled' });
  };
  function loginLayout() {
    const availableWidth = screen.availWidth || screen.width || 1280;
    const availableHeight = screen.availHeight || screen.height || 800;
    const viewport = Math.min(window.innerWidth || availableWidth, availableWidth);
    const paired = viewport >= 840;
    const width = paired ? Math.min(480, Math.floor((viewport - 48) * .56)) : Math.min(480, availableWidth);
    const codeWidth = Math.min(420, viewport - width - 48);
    const codeLeft = Math.max(16, Math.round((viewport - codeWidth - width - 16) / 2));
    const height = Math.max(1, Math.min(640, availableHeight - 32));
    const screenLeft = screen.availLeft || 0, screenTop = screen.availTop || 0;
    const left = paired ? Math.min(screenLeft + availableWidth - width, Math.max(screenLeft, (window.screenX || 0) + codeLeft + codeWidth + 16))
      : screenLeft + Math.round((availableWidth - width) / 2);
    const top = screenTop + Math.max(0, Math.round((availableHeight - height) / 2));
    return { paired, codeLeft, codeWidth, width, height, left, top };
  }
  function positionLogin() {
    const layout = loginLayout();
    progress({ state: 'layout', ...layout });
    try { popup.resizeTo(layout.width, layout.height); popup.moveTo(layout.left, layout.top); } catch {}
  }
  function navigateLogin() {
    if (!positioning || !popup || popup.closed) return;
    positionLogin();
    positioning = false; clearTimeout(positionTimer); clearTimeout(positionDeadline);
    popup.location.replace(authUrl);
  }
  window.addEventListener('resize', () => {
    if (!positioning) return;
    clearTimeout(positionTimer);
    positionTimer = setTimeout(navigateLogin, 350);
  });
  window.fiveEWebContinueLogin = async () => {
    if (!loginTicket || !authUrl) return false;
    if (popup && !popup.closed) { popup.focus(); return true; }
    const { width, height, left, top } = loginLayout();
    const name = `fivee-openai-auth-${window.crypto?.randomUUID?.() || `${Date.now()}-${attempt}`}`;
    popup = window.open('about:blank', name, `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
    if (!popup) {
      progress({ state: 'blocked', message: '인증 팝업이 차단되었습니다. 팝업을 허용하고 인증하기를 다시 눌러 주세요.' });
      return false;
    }
    positioning = true;
    positionLogin();
    navigateLogin();
    progress({ state: 'authenticating' });
    return true;
  };
  window.fiveEWebLogin = async () => {
    if (token) { window.dispatchEvent(new Event('5e:web-ai-status')); return; }
    if (preparing || loginTicket) return;
    const current = ++attempt;
    preparing = true;
    clearTimeout(loginTimer);
    try {
      const result = await loginRequest('start');
      if (!/^[a-f0-9]{64}$/.test(result.ticket)) throw new Error('인증 연결 정보를 확인할 수 없습니다.');
      if (current !== attempt) { void loginRequest('cancel', result.ticket).catch(() => {}); return; }
      loginTicket = result.ticket;
      const target = new URL(result.authUrl);
      if (target.protocol !== 'https:' || !['auth.openai.com', 'chatgpt.com'].includes(target.hostname) || target.username || target.password || target.port) throw new Error('인증 주소를 확인할 수 없습니다.');
      authUrl = target.href;
      progress({ state: 'ready', userCode: result.userCode });
      void pollLogin(current);
    } catch (error) {
      if (current !== attempt) return;
      const ticket = loginTicket; loginTicket = ''; authUrl = '';
      if (ticket) void loginRequest('cancel', ticket).catch(() => {});
      progress({ state: 'error', message: error.name === 'TimeoutError' ? '인증 서버 응답이 지연되고 있습니다. 잠시 후 다시 로그인해 주세요.' : error instanceof TypeError ? '인증 서버에 연결하지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.' : error.message });
    } finally { if (current === attempt) preparing = false; }
  };
})();
