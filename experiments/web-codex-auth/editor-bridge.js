/* Browser transport for the existing 5E AI workspaces. */
(() => {
  if (window.fiveEDesktop) return;
  const listeners = { event: new Set(), state: new Set(), log: new Set() };
  const scopes = new Map();
  async function request(action, payload = {}) {
    if (window.fiveEWebRequest) return window.fiveEWebRequest(action, { clientScope: "", ...payload });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`/api/${action}`, {
        method: 'POST', headers: { 'X-5E-Request': '1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientScope: "", ...payload }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw Object.assign(new Error(result.error || '계정 연결을 확인해 주세요.'), { status: response.status });
      return result;
    } catch (error) {
      if (controller.signal.aborted) throw new Error('서버 응답 확인 시간이 초과되었습니다. 서버에서 작업이 계속될 수 있어 자동으로 다시 요청하지 않습니다.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function emit(type, event) { for (const callback of listeners[type]) callback(event); }
  function subscribe(type, callback) {
    listeners[type].add(callback);
    return () => listeners[type].delete(callback);
  }
  function scopeFor(payload) {
    const clientScope = payload.clientScope || '';
    if (!scopes.has(clientScope)) scopes.set(clientScope, { clientScope, cursor: 0, active: false });
    return scopes.get(clientScope);
  }
  async function poll(scope) {
    try {
      const result = await request('bridge-events', { clientScope: scope.clientScope, cursor: scope.cursor });
      scope.cursor = result.cursor;
      for (const event of result.events) {
        emit('event', event);
        if (event.method === 'turn/completed') scope.active = false;
      }
    } catch (error) {
      scope.active = false;
      emit('event', { clientScope: scope.clientScope, method: 'error',
        params: { turnId: scope.turnId, error: { message: error.message } } });
      emit('state', { clientScope: scope.clientScope, state: 'stopped', message: error.message });
    }
    if (scope.active) setTimeout(() => poll(scope), 750);
  }
  const unavailable = async () => { throw new Error('이 기능은 데스크톱 앱에서 사용할 수 있습니다. 브라우저에서는 이미지 파일을 직접 추가해 주세요.'); };
  const bridge = {
    web: Boolean(window.fiveEWebRequest),
    status: payload => request('bridge-status', payload),
    start: async (payload = {}) => {
      const status = await request('bridge-status', payload);
      return { ok: status.login.loggedIn && status.server };
    },
    stop: payload => request('bridge-interrupt', payload),
    models: payload => request('bridge-models', payload),
    account: payload => request('bridge-account', payload),
    login: async () => {
      if (window.fiveEWebLogin) return window.fiveEWebLogin();
      window.open('/account', '_blank', 'noopener');
    },
    send: async (payload = {}) => {
      const scope = scopeFor(payload);
      const result = await request('bridge-send', payload);
      scope.turnId = result.turnId;
      scope.cursor = 0;
      if (!scope.active) {
        scope.active = true;
        setTimeout(() => poll(scope), 0);
      }
      return result;
    },
    interrupt: payload => request('bridge-interrupt', payload),
    onEvent: callback => subscribe('event', callback),
    onState: callback => subscribe('state', callback),
    onLog: callback => subscribe('log', callback),
    captureSources: unavailable,
    pickLocalImageFolder: unavailable,
    listLocalImages: unavailable,
    localImageThumbnail: unavailable,
    readLocalImage: unavailable,
  };
  if (window.fiveEWebRequest) window.fiveEWebAI = bridge;
  else window.fiveEDesktop = bridge;
})();
