import { createPanelMotion, cycleFocusIndex } from './panel-motion.js?v=1.6.0-preview-labeler-0917-1111';

const narrow = window.matchMedia('(max-width: 767px)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const preferences = {
  editor: { left: true, right: true, drawer: null },
  image: { left: true, right: true, drawer: null },
};
const layouts = new Set();
const initialized = new WeakSet();
let serial = 0;

function panelIcon(side) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', `M3 3.5h14v13H3z M${side === 'left' ? 7 : 13} 3.5v13`);
  svg.append(path);
  return svg;
}

function setAccessibleState(layout, side, expanded) {
  const { panel, button, name, originalRole, originalAriaModal } = layout[side];
  if (!expanded && panel.contains(document.activeElement)) button.focus();
  panel.classList.toggle('is-open', narrow.matches && expanded);
  if (narrow.matches && expanded) {
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
  } else {
    if (originalRole === null) panel.removeAttribute('role');
    else panel.setAttribute('role', originalRole);
    if (originalAriaModal === null) panel.removeAttribute('aria-modal');
    else panel.setAttribute('aria-modal', originalAriaModal);
  }
  button.setAttribute('aria-expanded', String(expanded));
  button.setAttribute('aria-label', `${name} 패널 ${expanded ? '접기' : '펼치기'}`);
  button.title = `${name} 패널 ${expanded ? '접기' : '펼치기'}`;
}

function moveEditorHeader(root, toolbar) {
  let header = root.querySelector('.app-shell-header');
  if (!header) {
    header = document.createElement('header');
    header.className = 'app-shell-header';
    root.prepend(header);
  }
  header.append(toolbar);

  const history = document.createElement('div');
  history.className = 'toolbar-history';
  history.setAttribute('role', 'group');
  history.setAttribute('aria-label', '작업 기록');
  toolbar.prepend(history);
  for (const id of ['undo-btn', 'redo-btn']) {
    const button = root.querySelector(`#${id}`);
    if (button) history.append(button);
  }
  const inspectorControls = toolbar.querySelector('.toolbar-inspector-controls');
  const menus = document.createElement('div');
  menus.className = 'toolbar-document';
  for (const child of [...toolbar.children]) {
    if (child !== history && child !== inspectorControls) menus.append(child);
  }
  toolbar.insertBefore(menus, inspectorControls);
  const canvasHeader = document.createElement('div');
  canvasHeader.className = 'toolbar-canvas';
  toolbar.insertBefore(canvasHeader, menus);
  canvasHeader.append(menus);
  if (inspectorControls) toolbar.append(inspectorControls);
  root.querySelectorAll('[data-panel-internal-toggle]').forEach(button => button.remove());
  root.querySelectorAll('#panel-left > .panel-utility-bar, #panel-right > .panel-utility-bar').forEach(utility => {
    if (!utility.childElementCount) utility.remove();
  });
}

function drawerFocusables(layout, side) {
  const selector = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
  const candidates = [layout.left.button, layout.right.button,
    ...layout[side].panel.querySelectorAll(selector)];
  return [...new Set(candidates)].filter(element => !element.closest('[hidden]')
    && element.getClientRects().length > 0);
}

function render(layout) {
  const preference = preferences[layout.kind];
  for (const side of ['left', 'right']) {
    const expanded = narrow.matches ? preference.drawer === side : preference[side];
    layout.root.dataset[`${side}Collapsed`] = String(!expanded);
    layout[side].motion.reset(expanded, narrow.matches);
  }
  layout.backdrop.hidden = !narrow.matches || preference.drawer === null;
}

function refresh() {
  for (const layout of layouts) {
    if (!layout.root.isConnected) { layouts.delete(layout); continue; }
    render(layout);
  }
}

function syncPeerLayouts(active) {
  for (const layout of layouts) {
    if (layout !== active && layout.kind === active.kind && layout.root.isConnected) render(layout);
  }
}

function closeDrawer(layout) {
  const side = preferences[layout.kind].drawer;
  preferences[layout.kind].drawer = null;
  if (side) {
    layout[side].motion.setExpanded(false, { overlayOnly: true });
    layout.backdrop.hidden = true;
    layout[side].button.focus();
    syncPeerLayouts(layout);
  }
}

function setup(root, kind) {
  if (initialized.has(root)) return;
  initialized.add(root);
  const panels = kind === 'editor'
    ? [root.querySelector('#panel-left'), root.querySelector('#panel-right')]
    : [root.querySelector('.ai-task-rail'), root.querySelector('.ai-conversation')];
  const toolbar = root.querySelector(kind === 'editor' ? '.canvas-toolbar' : '.ai-head');
  if (!panels.every(Boolean) || !toolbar) return;
  if (kind === 'editor') moveEditorHeader(root, toolbar);
  root.dataset.panelLayout = kind;
  const group = toolbar.querySelector('.panel-shell-toggles') || document.createElement('div');
  if (!group.parentElement) {
    group.className = kind === 'image' ? 'panel-shell-toggles panel-toggles' : 'panel-shell-toggles';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', kind === 'image' ? '작업실 패널' : '편집기 패널');
    toolbar.append(group);
  }
  const backdrop = root.querySelector('[data-panel-backdrop]') || document.createElement('button');
  backdrop.type = 'button';
  backdrop.dataset.panelBackdrop = '';
  backdrop.className = 'panel-layout-backdrop';
  backdrop.setAttribute('aria-label', '열린 패널 닫기');
  backdrop.tabIndex = -1;
  root.append(backdrop);
  const layout = {
    root, kind, backdrop,
    surface: root.querySelector(kind === 'editor' ? '.panel-center' : '.ai-results'),
  };
  for (const [index, side] of ['left', 'right'].entries()) {
    const panel = panels[index];
    const name = kind === 'editor' ? ['도구', '속성'][index] : ['작업 목록', '수정 설정'][index];
    panel.id = kind === 'editor' ? panel.id : `image-${side}-panel-${++serial}`;
    panel.dataset.layoutPanel = side;
    const button = group.querySelector(`[data-panel-toggle="${side}"]`)
      || (kind === 'editor' ? document.getElementById(`drawer-${side}-toggle`) : null)
      || document.createElement('button');
    button.type = 'button';
    button.className = 'panel-visibility-toggle';
    button.dataset.panelToggle = side;
    button.setAttribute('aria-controls', panel.id);
    const label = document.createElement('span');
    label.className = 'panel-toggle-label';
    label.textContent = name;
    button.replaceChildren(panelIcon(side), label);
    group.append(button);
    const close = panel.querySelector('.panel-collapse-close') || document.createElement('button');
    close.type = 'button';
    close.className = 'panel-collapse-close';
    close.textContent = `${name} 닫기`;
    close.setAttribute('aria-label', `${name} 패널 닫기`);
    panel.prepend(close);
    layout[side] = {
      panel, button, name,
      originalRole: panel.getAttribute('role'),
      originalAriaModal: panel.getAttribute('aria-modal'),
    };
    layout[side].motion = createPanelMotion({
      panel,
      surface: layout.surface,
      trackRoot: kind === 'editor' ? root : null,
      side,
      reducedMotion: () => reducedMotion.matches,
      mutateLayout: expanded => {
        root.dataset[`${side}Collapsed`] = String(!expanded);
      },
      setAccessibleExpanded: expanded => setAccessibleState(layout, side, expanded),
      beforeLayout: () => {
        const name = kind === 'editor'
          ? '5e:panel-layout-will-change' : '5e:image-panel-layout-will-change';
        window.dispatchEvent(new CustomEvent(name, { detail: { root, side } }));
      },
      afterLayout: () => {
        const name = kind === 'editor'
          ? '5e:panel-layout-did-change' : '5e:image-panel-layout-did-change';
        window.dispatchEvent(new CustomEvent(name, { detail: { root, side } }));
      },
    });
    button.onclick = () => {
      const preference = preferences[kind];
      if (narrow.matches) {
        const previous = preference.drawer;
        preference.drawer = previous === side ? null : side;
        if (previous && previous !== side) layout[previous].motion.setExpanded(false, { overlayOnly: true });
        layout[side].motion.setExpanded(preference.drawer === side, { overlayOnly: true });
        layout.backdrop.hidden = preference.drawer === null;
      } else {
        preference[side] = !preference[side];
        layout[side].motion.setExpanded(preference[side]);
      }
      syncPeerLayouts(layout);
    };
    close.onclick = () => closeDrawer(layout);
  }
  backdrop.onclick = () => closeDrawer(layout);
  if (kind === 'editor') panels[0].addEventListener('click', event => {
    if (narrow.matches && event.target.closest('[data-tool],[data-symbol],#object-search-trigger')) closeDrawer(layout);
  });
  layouts.add(layout);
  render(layout);
}

function discover() {
  const editor = document.querySelector('.app');
  if (editor) setup(editor, 'editor');
  for (const workbench of document.querySelectorAll('.ai-workbench')) setup(workbench.parentElement, 'image');
}

discover();
new MutationObserver(discover).observe(document.body, { childList: true });
narrow.addEventListener('change', () => {
  preferences.editor.drawer = null;
  preferences.image.drawer = null;
  refresh();
});
window.addEventListener('keydown', event => {
  if (!narrow.matches || (event.key !== 'Escape' && event.key !== 'Tab')) return;
  const layout = [...layouts].find(item => !item.root.hidden && preferences[item.kind].drawer
    && (item.kind === 'image' || !document.querySelector('#ai-image-panel:not([hidden])')));
  if (!layout || document.querySelector('dialog[open]')) return;
  if (event.key === 'Tab') {
    const side = preferences[layout.kind].drawer;
    const focusables = drawerFocusables(layout, side);
    const index = cycleFocusIndex(focusables.indexOf(document.activeElement),
      focusables.length, event.shiftKey);
    if (index >= 0) focusables[index].focus();
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  closeDrawer(layout);
  event.stopImmediatePropagation();
  event.preventDefault();
}, true);
