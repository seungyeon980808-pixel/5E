import { initLiteAiControls } from './lite-ai-controls.js?v=1.7.0-four-session-integration';
import { previewStorage as storedPreferences, optionalStorage } from './preview-storage.js?v=1.7.0-four-session-integration';
const previewStorage = optionalStorage(storedPreferences);
// Lite shares the real editor with Pro; AI remains a separate workbench.
export function initLiteShell(state) {
  const root = document.documentElement;
  const header = document.querySelector('.app-shell-header .canvas-toolbar');
  const history = header?.querySelector('.toolbar-history');
  const toolGrid = document.querySelector('#tool-list .tool-section-body');
  const toolList = document.getElementById('tool-list');
  if (!header || !history || !toolGrid || !toolList || document.getElementById('lite-save')) return;
  const icon = path => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const brandSlot = document.createElement('div');
  brandSlot.className = 'lite-brand-slot';
  const save = document.createElement('button');
  save.id = 'lite-save';
  save.type = 'button';
  save.innerHTML = `${icon('<path d="M4 3.5h10.5l1.5 1.6v11.4H4zM7 3.5v4h6v-4M7 13h6"/>')}<span>이미지로 저장</span>`;
  save.addEventListener('click', () => document.getElementById('image-export')?.click());
  const saveSlot = document.createElement('div');
  saveSlot.className = 'lite-save-slot';
  saveSlot.append(save);
  header.append(brandSlot, saveSlot);

  const quickActions = document.createElement('div');
  quickActions.className = 'lite-quick-actions lite-main-only';
  quickActions.setAttribute('role', 'group');
  quickActions.setAttribute('aria-label', '추가 기능');
  toolList.querySelector('.tool-section')?.after(quickActions);
  const graph = document.createElement('button');
  graph.id = 'lite-graph-open';
  graph.type = 'button';
  graph.className = 'lite-quick-action';
  graph.setAttribute('aria-label', '좌표·함수');
  graph.innerHTML = `${icon('<path d="M4 16V4M4 16h12M6 14c2-5 5-7 10-9"/>')}<span>좌표·함수</span>`;
  graph.addEventListener('click', () => document.getElementById('graph-tool-open')?.click());
  // 11-14 5E 클립보드: Lite도 같은 클립보드(넣기는 캔버스, ⇧⌘V). 정식판과 같은 아이콘.
  const clip = document.createElement('button');
  clip.id = 'lite-clip-open';
  clip.type = 'button';
  clip.className = 'lite-quick-action';
  clip.setAttribute('aria-label', '클립보드');
  clip.title = `클립보드 — 넣어 둔 그림을 꺼내 쓰기 (${/Mac|iPhone|iPad/.test(navigator.platform || '') ? '⇧⌘V' : 'Ctrl+Shift+V'})`;
  clip.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.6 4.6H6.6a2.1 2.1 0 0 0-2.1 2.1v12.2a2.1 2.1 0 0 0 2.1 2.1h10.8a2.1 2.1 0 0 0 2.1-2.1V6.7a2.1 2.1 0 0 0-2.1-2.1h-2"/><rect x="8.6" y="2.8" width="6.8" height="3.6" rx="1.2"/><path d="M10.4 10.4v-.3c0-.5.4-.9.9-.9h4.4c.5 0 .9.4.9.9v3.6c0 .5-.4.9-.9.9h-.4"/><rect x="7.8" y="11.4" width="6.8" height="5.6" rx=".9"/></svg><span>클립보드</span>`;
  clip.addEventListener('click', () => window.fiveEClipboard?.toggle());
  quickActions.append(graph, clip);

  const hintShell = document.createElement('div');
  hintShell.className = 'lite-hint-shell lite-main-only';
  const hintIcon = document.createElement('span');
  hintIcon.className = 'lite-hint-icon';
  hintIcon.setAttribute('aria-hidden', 'true');
  hintIcon.textContent = 'ⓘ';
  const hintContent = document.createElement('div');
  hintContent.className = 'lite-hint-content';
  const hintToggle = document.createElement('button');
  hintToggle.type = 'button';
  hintToggle.className = 'lite-hint-toggle';
  hintShell.append(hintIcon, hintContent, hintToggle);
  history.append(hintShell);
  let helpVisible = previewStorage.getItem('lite.helpVisible') !== 'false';
  function renderHelp() {
    hintShell.classList.toggle('is-hidden', !helpVisible);
    hintToggle.textContent = helpVisible ? '안내 숨기기' : 'ⓘ 안내 보기';
    hintToggle.setAttribute('aria-label', helpVisible ? '기능 안내 숨기기' : '기능 안내 보기');
    hintToggle.setAttribute('aria-pressed', String(helpVisible));
  }
  hintToggle.addEventListener('click', () => {
    helpVisible = !helpVisible;
    previewStorage.setItem('lite.helpVisible', String(helpVisible));
    renderHelp();
  });
  renderHelp();
  const title = document.createElement('div');
  title.className = 'lite-inspector-title lite-main-only';
  title.textContent = '속성';
  document.getElementById('panel-right').prepend(title);

  const origins = [];
  const historyButtons = [
    { element: document.getElementById('undo-btn'), label: '되돌리기' },
    { element: document.getElementById('redo-btn'), label: '다시 실행' },
  ];
  const move = (element, target) => {
    if (!element) return;
    const marker = document.createComment('lite-header-origin');
    element.before(marker);
    origins.push({ element, marker });
    target.append(element);
  };
  let saved = null;
  function syncMode() {
    const lite = root.dataset.mode === 'lite';
    if (lite && !saved) {
      saved = { theme: root.getAttribute('data-theme'), grid: { ...state.get().grid } };
      move(header.querySelector('.app-brand'), brandSlot);
      move(document.getElementById('mode-toggle-btn'), brandSlot);
      for (const { element, label } of historyButtons) {
        if (!element) continue;
        element.classList.add('tool-btn', 'lite-history-tool');
        element.dataset.liteLabel = label;
        move(element, toolGrid);
      }
      move(document.getElementById('exam-library-open'), quickActions);
      move(document.getElementById('ai-image-install-open'), quickActions);
      move(document.getElementById('tool-hint'), hintContent);
      root.setAttribute('data-theme', 'light');
      state.update(s => { s.grid.visible = false; });
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        void exit?.call(document);
      }
    } else if (!lite && saved) {
      const previous = saved;
      saved = null;
      origins.splice(0).reverse().forEach(({ element, marker }) => marker.replaceWith(element));
      for (const { element } of historyButtons) {
        if (!element) continue;
        element.classList.remove('tool-btn', 'lite-history-tool');
        delete element.dataset.liteLabel;
      }
      if (previous.theme === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', previous.theme);
      state.update(s => { s.grid = previous.grid; });
    }
    window.dispatchEvent(new Event('resize'));
  }
  state.subscribe(s => {
    if (saved && root.dataset.mode === 'lite' && s.grid.visible) state.update(next => { next.grid.visible = false; });
  });
  window.addEventListener('5e:view-mode-change', syncMode);
  syncMode();
  initLiteAiControls();
}
