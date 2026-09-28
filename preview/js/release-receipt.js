const release = Object.freeze({
  modifiedAt: '2026.09.29',
  sourceCommit: '',
  changes: '서버 모델 목록 연동 / 중복 오류 정리 / 필터 구분선 / GPT 표시',
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
