/* Keep authentication on the runtime origin; no third-party cookies or tokens in the editor. */
(() => {
  if (window.fiveEDesktop) return;
  const origin = 'https://five-e-ai-runtime-probe.onrender.com';
  let popup, ready = false, sequence = 0, signedIn;
  const pending = new Map();
  window.addEventListener('message', event => {
    if (event.origin !== origin || event.source !== popup) return;
    const message = event.data;
    if (message?.type === '5e:runtime-status') {
      if (signedIn !== message.signedIn) { signedIn = message.signedIn; window.dispatchEvent(new Event('5e:web-ai-status')); }
      return;
    }
    if (message?.type === '5e:runtime-ready') { ready = true; return; }
    if (message?.type !== '5e:runtime-response') return;
    const entry = pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer); pending.delete(message.id);
    if (message.error) entry.reject(Object.assign(new Error(message.error), { status: message.status }));
    else entry.resolve(message.result);
  });
  window.fiveEWebRequest = async (action, payload = {}) => {
    if (!popup || popup.closed || !ready) {
      if (action === 'bridge-status') return { login: { loggedIn: false }, server: false };
      throw new Error('ChatGPT 로그인을 눌러 계정 연결 창을 열어 주세요.');
    }
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('서버 응답이 지연되고 있습니다. 자동으로 재요청하지 않습니다.')); }, 40000);
      pending.set(id, { resolve, reject, timer });
      popup.postMessage({ type: '5e:runtime-request', id, action, payload }, origin);
    });
  };
  window.fiveEWebLogin = () => {
    if (popup && !popup.closed) { popup.focus(); return; }
    ready = false;
    popup = window.open(`${origin}/web-connect?editor=${encodeURIComponent(location.origin)}`, '_blank');
    if (!popup) throw new Error('로그인 창이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.');
  };
})();
