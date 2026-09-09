const byId = id => document.getElementById(id);
let timer;
let busy = false;
const labels = {
  'signed-out': '계정이 연결되지 않았습니다.', waiting: 'OpenAI에서 로그인해 주세요.',
  'signed-in': 'ChatGPT 계정이 연결되었습니다.', cancelled: '로그인을 취소했습니다.',
  'login-failed': '로그인에 실패했습니다.',
  'local-timeout': '로그인 대기 시간이 지났습니다.', completed: '계정 연결을 확인하고 있습니다.'
};
async function request(action, popup) {
  if (busy) return;
  busy = true;
  clearTimeout(timer);
  for (const button of document.querySelectorAll('button')) button.disabled = true;
  try {
    const response = await fetch('/api/' + action, { method: 'POST', headers: { 'X-5E-Request': '1' } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (result.signedIn && document.body.dataset.editorUrl) {
      location.replace(document.body.dataset.editorUrl);
      return;
    }
    byId('status').textContent = labels[result.state] || '연결 상태를 확인하고 있습니다.';
    byId('browser-login').hidden = !result.authUrl;
    byId('auth-link').href = result.authUrl || '#';
    const userCode = result.authUrl && result.state === 'waiting' ? result.userCode || '' : '';
    if (byId('code').textContent !== userCode) byId('copy-status').textContent = '';
    byId('code').textContent = userCode;
    byId('device-login').hidden = !userCode;
    byId('browser-instructions').hidden = !!userCode;
    if (action === 'login' && popup) {
      if (result.authUrl) popup.location.replace(result.authUrl);
      else popup.close();
    }
    byId('login').hidden = result.signedIn || !!result.authUrl;
    byId('cancel').hidden = !result.authUrl;
    byId('logout').hidden = !result.signedIn;
    byId('reload').hidden = true;
    timer = setTimeout(() => request('status'), 3000);
  } catch (error) {
    byId('status').textContent = '연결이 끊겼습니다.';
    if (popup) popup.close();
    byId('browser-login').hidden = true;
    byId('code').textContent = '';
    byId('copy-status').textContent = '';
    byId('device-login').hidden = true;
    for (const id of ['login', 'cancel', 'logout']) byId(id).hidden = true;
    byId('reload').hidden = false;
  } finally {
    busy = false;
    for (const button of document.querySelectorAll('button')) button.disabled = false;
  }
}
byId('login').addEventListener('click', () => {
  if (busy) return;
  const popup = window.open('about:blank', '_blank');
  if (popup) popup.opener = null;
  request('login', popup);
});
for (const id of ['cancel', 'logout']) byId(id).addEventListener('click', () => request(id));
byId('reload').addEventListener('click', () => request('session'));
byId('copy-code').addEventListener('click', async () => {
  const code = byId('code').textContent;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    if (byId('code').textContent === code) byId('copy-status').textContent = '코드를 복사했습니다.';
  } catch {
    if (byId('code').textContent === code) byId('copy-status').textContent = '코드를 직접 선택해 복사해 주세요.';
  }
});
request('session');
