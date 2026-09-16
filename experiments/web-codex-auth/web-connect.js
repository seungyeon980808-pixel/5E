(() => {
  const editor = new URL(location.href).searchParams.get('editor');
  if (editor !== 'https://www.5e.ai.kr' || !window.opener) return;
  let transferring = false, connected = false;
  window.addEventListener('5e:account-status', async event => {
    if (!event.detail?.signedIn) { connected = false; return; }
    if (transferring || connected) return;
    transferring = true;
    try {
      const response = await fetch('/api/web-session', { method: 'POST', headers: { 'X-5E-Request': '1' } });
      const result = await response.json();
      if (!response.ok || !/^[a-f0-9]{64}$/.test(result.token)) throw new Error('Session transfer failed');
      window.opener.postMessage({ type: '5e:runtime-session', token: result.token }, editor);
    } catch {
      document.getElementById('status').textContent = '계정 연결을 편집기에 전달하지 못했습니다. 잠시 후 다시 시도합니다.';
    } finally { transferring = false; }
  });
  window.addEventListener('message', event => {
    if (event.origin !== editor || event.source !== window.opener || event.data?.type !== '5e:session-received') return;
    connected = true;
    document.getElementById('status').textContent = '편집기에 연결되었습니다. 이제 이 창을 닫아도 됩니다.';
  });
})();
