/* Lite reuses the live editor controls; placeholders preserve their Pro positions. */
export function initLiteShell(state) {
  const root = document.documentElement;
  const center = document.querySelector('.panel-center');
  if (!center || document.getElementById('lite-stepbar')) return;
  const steps = document.createElement('nav');
  steps.id = 'lite-stepbar';
  steps.setAttribute('aria-label', '이미지 제작 순서');
  const targets = ['exam-library-open', 'ai-image-install-open', 'canvas', 'image-export'];
  ['이미지 선택', 'AI 변환', '편집', '저장'].forEach((label, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = `<span class="lite-step-number">${index + 1}</span><span>${label}</span>`;
    button.addEventListener('click', () => {
      const target = document.getElementById(targets[index]);
      if (index === 2) target?.focus();
      else target?.click();
    });
    steps.append(button);
  });
  center.prepend(steps);
  const dock = document.createElement('div');
  dock.id = 'lite-dock';
  dock.setAttribute('aria-label', '편집 도구와 이미지 작업');
  const actions = document.createElement('div');
  actions.className = 'lite-dock-actions';
  const save = document.createElement('button');
  save.id = 'lite-save';
  save.type = 'button';
  save.textContent = '저장';
  save.addEventListener('click', () => document.getElementById('image-export')?.click());
  dock.append(actions, save);
  center.append(dock);
  const context = document.createElement('div');
  context.id = 'lite-context';
  context.setAttribute('aria-label', '선택한 오브젝트 속성');
  center.append(context);
  const moves = [];
  let saved = null;
  function move(id, destination, before = null) {
    const element = id instanceof Element ? id : document.getElementById(id);
    if (!element) return;
    const marker = document.createComment(`lite-origin:${id}`);
    element.before(marker);
    moves.push({ element, marker });
    destination.insertBefore(element, before);
  }
  async function exitFullscreen() {
    try {
      const native = window.fiveEDesktop?.fullscreen;
      if (native) {
        if (await native.get()) await native.toggle();
      } else if (document.fullscreenElement || document.webkitFullscreenElement) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) await exit.call(document);
      }
    } catch (error) {
      console.error('Unable to exit fullscreen for Lite', error);
    }
  }
  function sync() {
    const lite = root.dataset.mode === 'lite';
    if (lite && !saved) {
      saved = { theme: root.getAttribute('data-theme'), grid: { ...state.get().grid } };
      root.setAttribute('data-theme', 'light');
      void exitFullscreen();
      move(document.querySelector('.app-shell-header'), center, steps);
      move('tool-list', dock, actions);
      move('exam-library-open', actions);
      move('ai-image-install-open', actions);
      move('inspector', context);
      state.update((s) => { s.grid.visible = false; });
    } else if (!lite && saved) {
      const previous = saved;
      saved = null;
      moves.splice(0).forEach(({ element, marker }) => marker.replaceWith(element));
      if (previous.theme === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', previous.theme);
      state.update((s) => { s.grid = { ...previous.grid }; });
      const gridButton = document.getElementById('grid-btn');
      gridButton?.classList.toggle('is-active', previous.grid.visible);
      gridButton?.setAttribute('aria-pressed', String(previous.grid.visible));
      const detail = document.getElementById('grid-detail');
      if (detail) detail.hidden = !previous.grid.visible;
    }
    window.dispatchEvent(new Event('resize'));
  }
  state.subscribe((s) => {
    if (saved && root.dataset.mode === 'lite' && s.grid.visible) {
      state.update((next) => { next.grid.visible = false; });
    }
    updateStep();
  });
  function updateStep() {
    const isOpen = (element) => element && !element.hidden && getComputedStyle(element).display !== 'none';
    const current = isOpen(document.getElementById('export-overlay')) ? 3
      : isOpen(document.getElementById('ai-image-panel')) ? 1
      : isOpen(document.getElementById('unilib-title')?.closest('.modal-overlay')) ? 0
      : state.get().objects.length ? 2 : 0;
    [...steps.children].forEach((button, index) => {
      if (index === current) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
  }
  new MutationObserver(updateStep).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('5e:view-mode-change', sync);
  sync();
  updateStep();
}
