const release = Object.freeze({
  modifiedAt: '2026.09.29',
  sourceCommit: 'e310624a636e79c0aa4cbcbcff458f0d400b7665',
  changes: '저장 실패 입력 보존 / 복구 창 Esc 보류 / 크롭 메모리 / 키보드 크롭 / 확대 허용 / GPT 배지 / 데스크톱 보안 / 서버 로그인 제한',
});

const panel = document.querySelector('#ai-image-panel .modal-ai');
if (panel) {
  const receipt = document.createElement('div');
  receipt.setAttribute('data-release-receipt', '');
  panel.append(receipt);
}
for (const receipt of document.querySelectorAll('[data-release-receipt]')) {
  const date = document.createElement('span');
  date.textContent = `${release.modifiedAt} 수정`;
  const changes = document.createElement('span');
  changes.textContent = release.changes;
  const commit = document.createElement(release.sourceCommit ? 'a' : 'span');
  commit.textContent = release.sourceCommit ? `소스 커밋 ${release.sourceCommit.slice(0, 8)}` : '개발 중';
  if (release.sourceCommit) {
    commit.href = `https://github.com/seungyeon980808-pixel/5E/commit/${release.sourceCommit}`;
    commit.target = '_blank';
    commit.rel = 'noopener';
  }
  receipt.dataset.sourceCommit = release.sourceCommit;
  receipt.replaceChildren(date, changes, commit);
}
