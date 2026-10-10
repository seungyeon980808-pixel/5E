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
  async function poll(scope, sequence = scope.sequence) {
    if (!scope.active || sequence !== scope.sequence) return;
    try {
      const result = await request('bridge-events', { clientScope: scope.clientScope, cursor: scope.cursor });
      // A completed analysis can already have started the image turn while an
      // older poll is in flight. Its cursor/completion belongs to that old turn.
      if (sequence !== scope.sequence) return;
      scope.pollFailures = 0;
      scope.cursor = result.cursor;
      for (const event of result.events) {
        emit('event', event);
        if (event.method === 'turn/completed') scope.active = false;
      }
    } catch (error) {
      if (sequence !== scope.sequence) return;
      // Retry only the read-only status poll, never a generation request.
      if (![401,403].includes(error.status) && ++scope.pollFailures <= 2) {
        setTimeout(() => poll(scope, sequence), scope.pollFailures * 750);
        return;
      }
      scope.active = false;
      emit('event', { clientScope: scope.clientScope, method: 'error',
        params: { turnId: scope.turnId, error: { message: error.message } } });
      emit('state', { clientScope: scope.clientScope, state: 'stopped', message: error.message });
    }
    if (scope.active) setTimeout(() => poll(scope, sequence), 750);
  }
  async function interrupt(payload = {}) {
    const bound = payload.turnId != null || payload.threadId != null;
    if (bound) {
      const scope = scopes.get(payload.clientScope || '');
      // The remote bridge may still implement workspace-wide interruption.
      // Never forward a stale binding or interrupt a replacement awaiting start.
      if (!scope || scope.pendingStarts || !scope.active
        || payload.turnId != null && (typeof payload.turnId !== 'string' || !payload.turnId || payload.turnId !== scope.turnId)
        || payload.threadId != null && (typeof payload.threadId !== 'string' || !payload.threadId || payload.threadId !== scope.threadId)) return { stale: true };
    }
    return request('bridge-interrupt', payload);
  }
  const unavailable = async () => { throw new Error('이 기능은 데스크톱 앱에서 사용할 수 있습니다. 브라우저에서는 이미지 파일을 직접 추가해 주세요.'); };
  const bridge = {
    web: Boolean(window.fiveEWebRequest),
    status: payload => request('bridge-status', payload),
    start: async (payload = {}) => {
      const status = await request('bridge-status', payload);
      return { ok: status.login.loggedIn && status.server };
    },
    stop: interrupt,
    models: payload => request('bridge-models', payload),
    account: payload => request('bridge-account', payload),
    login: async () => {
      if (window.fiveEWebLogin) { window.dispatchEvent(new Event('5e:web-login-request')); return; }
      window.open('/account', '_blank', 'noopener');
    },
    send: async (payload = {}) => {
      const scope = scopeFor(payload);
      const startSequence = scope.startSequence = (scope.startSequence || 0) + 1;
      scope.pendingStarts = (scope.pendingStarts || 0) + 1;
      let result;
      try { result = await request('bridge-send', payload); } finally { scope.pendingStarts--; }
      if (startSequence !== scope.startSequence) return result;
      const sequence = scope.sequence = (scope.sequence || 0) + 1;
      scope.turnId = result.turnId;
      scope.threadId = result.renderThreadId || result.threadId;
      scope.cursor = 0;
      scope.active = true;
      scope.pollFailures = 0;
      setTimeout(() => poll(scope, sequence), 0);
      return result;
    },
    interrupt,
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
