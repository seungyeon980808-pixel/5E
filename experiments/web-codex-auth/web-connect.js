(() => {
  const editor = new URL(location.href).searchParams.get('editor');
  if (editor !== 'https://www.5e.ai.kr' || !window.opener) return;
  const allowed = new Set(['bridge-status', 'bridge-models', 'bridge-account', 'bridge-send', 'bridge-events', 'bridge-interrupt']);
  window.addEventListener('message', async event => {
    if (event.origin !== editor || event.source !== window.opener) return;
    const message = event.data;
    if (message?.type !== '5e:runtime-request' || !Number.isSafeInteger(message.id) || !allowed.has(message.action)) return;
    try {
      const response = await fetch(`/api/${message.action}`, {
        method: 'POST', headers: { 'X-5E-Request': '1', 'Content-Type': 'application/json' },
        body: JSON.stringify(message.payload), signal: AbortSignal.timeout(35000),
      });
      const result = await response.json();
      window.opener.postMessage({ type: '5e:runtime-response', id: message.id,
        ...(response.ok ? { result } : { error: result.error || '서버 요청 실패', status: response.status }) }, editor);
    } catch {
      window.opener.postMessage({ type: '5e:runtime-response', id: message.id, error: '서버 연결이 끊겼습니다.' }, editor);
    }
  });
  window.opener.postMessage({ type: '5e:runtime-ready' }, editor);
})();
