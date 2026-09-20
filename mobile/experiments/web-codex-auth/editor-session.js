const statusLabel = document.getElementById('web-session-status');
const aiButton = document.getElementById('ai-image-install-open');
if (aiButton) {
  aiButton.disabled = false;
  aiButton.title = 'AI 이미지 생성';
  aiButton.setAttribute('aria-label', 'AI 이미지 생성');
}
async function refreshSession() {
  try {
    const response = await fetch('/api/status', { method: 'POST', headers: { 'X-5E-Request': '1' } });
    const current = await response.json();
    statusLabel.textContent = response.ok && current.signedIn ? 'ChatGPT 연결됨' : '계정에서 다시 로그인해 주세요';
  } catch { statusLabel.textContent = '계정 연결을 확인해 주세요'; }
  setTimeout(refreshSession, 15000);
}
refreshSession();
