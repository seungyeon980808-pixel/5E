/* File saves and browser recovery copies have deliberately separate receipts. */
const controllers = new WeakMap();

export function initProjectStatus(state, serialize) {
  if (controllers.has(state)) return controllers.get(state);
  const fingerprint = () => JSON.stringify(serialize(state.get()).pages);
  const initial = fingerprint();
  let file = null;
  let recovery = null;
  let download = null;
  const footer = document.querySelector('.app-footer');
  const label = footer ? document.createElement('span') : null;
  if (label) {
    label.id = 'project-save-status';
    label.className = 'app-footer-credit';
    label.setAttribute('role', 'status');
    label.setAttribute('aria-live', 'polite');
    Object.assign(label.style, { flex: '0 0 auto', maxWidth: '40%', minWidth: '0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
    footer.appendChild(label);
  }
  const text = () => {
    const current = fingerprint();
    if (file === current) return '파일 저장 완료';
    if (download === current) return '파일 다운로드 요청됨 · 저장 위치 확인';
    if (recovery === current) return '자동 복구용 저장됨 · 파일 저장 필요';
    if (file === null && recovery === null && download === null && current === initial) {
      return '새 프로젝트 · 파일 저장 전';
    }
    return '미저장 변경';
  };
  const render = () => {
    if (!label) return;
    const message = text();
    const compact = {
      '새 프로젝트 · 파일 저장 전': '파일 저장 전',
      '파일 다운로드 요청됨 · 저장 위치 확인': '다운로드 요청됨',
      '자동 복구용 저장됨 · 파일 저장 필요': '복구됨 · 파일 미저장',
    };
    label.textContent = compact[message] || message;
    label.title = message;
    label.setAttribute('aria-label', message);
  };
  const controller = {
    text,
    capture: () => ({ pages: state.get().pages, fingerprint: fingerprint() }),
    isFileDirty: () => file !== fingerprint(),
    mark(token, kind) {
      if (!token || token.pages !== state.get().pages) return;
      if (kind === 'file') file = token.fingerprint;
      if (kind === 'recovery') recovery = token.fingerprint;
      if (kind === 'download') download = token.fingerprint;
      render();
    },
  };
  controllers.set(state, controller);
  let pending = false;
  state.subscribe(() => {
    if (!label || pending) return;
    pending = true;
    setTimeout(() => { pending = false; render(); }, 200);
  });
  render();
  return controller;
}

export function captureProjectStatus(state) {
  return controllers.get(state)?.capture();
}

export function markProjectStatus(state, token, kind) {
  controllers.get(state)?.mark(token, kind);
}
