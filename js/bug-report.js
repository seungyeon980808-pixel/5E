const providers = new Map();
export function registerBugReportContext(key, provider) {
  providers.set(key, provider);
  return () => { if (providers.get(key) === provider) providers.delete(key); };
}
const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7V5a3 3 0 0 1 6 0v2M8 7h8v8a4 4 0 0 1-8 0zM12 8v11M5 9h3M16 9h3M4 14h4M16 14h4M6 20l3-3M15 17l3 3M6 4l3 3M15 7l3-3"/></svg>';

// The support board is maintained and deployed separately from the editor.
// Opening it never uploads images, logs, or the user's current document.
export function initBugReporter() {
  const destination = 'https://5e.ai.kr/bug/';
  const mount = (host, className = '', before = null) => {
    if (!host || host.querySelector('.bug-report-open')) return;
    const link = document.createElement('a');
    link.className = `bug-report-open ${className}`;
    link.href = destination; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.title = '5E CS Center · 버그 신고 (새 탭)';
    link.setAttribute('aria-label', link.title);
    link.innerHTML = icon;
    if (before?.parentNode === host) host.insertBefore(link, before); else host.append(link);
  };
  // 11-05: image·hwp는 맨 위 줄 오른쪽(화면 색 단추 왼쪽) — exam(맨 위 줄 ? 옆)·라이브러리·AI·그래프 창과 같은 자리.
  const top = document.querySelector('.canvas-global-controls');
  mount(top, 'topbar-btn icon-btn', top?.querySelector('#theme-toggle'));
  mount(document.querySelector('#ai-image-panel .ai-head-status'), 'ai-header-tool modal-btn');
  const mountLibrary = () => {
    // 라이브러리에서는 위쪽 막대(닫기 옆)에 둔다.
    for (const host of document.querySelectorAll('.unified-library-overlay .unilib-header-actions')) {
      mount(host, 'unilib-icon-button', host.querySelector('[aria-label="라이브러리 닫기"]') || host.lastElementChild);
    }
    // 11-05: 그래프(함수) 만들기 창에도 — 제목 줄 오른쪽, 닫기(×) 왼쪽.
    const graphTitle = document.querySelector('#graph-modal-overlay .modal-title');
    if (graphTitle) mount(graphTitle, 'gm-bug', graphTitle.querySelector('#gm-cancel'));
  };
  mountLibrary();
  new MutationObserver(mountLibrary).observe(document.body, {childList: true, subtree: true});
  window.addEventListener('5e:bug-report-open', () => window.open(destination, '_blank', 'noopener,noreferrer'));
}
