import { initLiteAiControls } from './lite-ai-controls.js?v=lite-main-0925';
// Lite shares the real editor with Pro; AI remains a separate workbench.
export function initLiteShell(state) {
  const root = document.documentElement;
  const header = document.querySelector('.app-shell-header .canvas-toolbar');
  const toolGrid = document.querySelector('#tool-list .tool-section-body');
  if (!header || !toolGrid || document.getElementById('lite-save')) return;
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

  const graph = document.createElement('button');
  graph.id = 'lite-graph-open';
  graph.type = 'button';
  graph.className = 'tool-btn lite-main-only';
  graph.dataset.liteLabel = '좌표·함수';
  graph.setAttribute('aria-label', '좌표·함수');
  graph.innerHTML = `<kbd>${icon('<path d="M4 16V4M4 16h12M6 14c2-5 5-7 10-9"/>')}</kbd>`;
  graph.addEventListener('click', () => document.getElementById('graph-tool-open')?.click());
  toolGrid.append(graph);
  const title = document.createElement('div');
  title.className = 'lite-inspector-title lite-main-only';
  title.textContent = '속성';
  document.getElementById('panel-right').prepend(title);

  const origins = [];
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
