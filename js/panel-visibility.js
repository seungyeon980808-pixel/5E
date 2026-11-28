import { createPanelMotion, cycleFocusIndex } from './panel-motion.js?v=1.7.0-four-session-integration';

const narrow = window.matchMedia('(max-width: 767px)');
const fixedLite = () => document.documentElement.dataset.mode === 'lite';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const preferences = {
  editor: { left: true, right: true, drawer: null },
  image: { left: true, right: true, drawer: null },
};
const layouts = new Set();
// 11-19(시안 그림생성화면 v4 태그 15·16): AI 작업대의 작업 목록·오른쪽 칸 접힘을 기억한다(5E_hwp 왼쪽 칸처럼).
const IMAGE_PANEL_STORE = '5e.aiWorkbench.panels.v1';
try {
  const saved = JSON.parse(localStorage.getItem(IMAGE_PANEL_STORE) || 'null');
  if (saved && typeof saved === 'object') for (const side of ['left', 'right']) if (typeof saved[side] === 'boolean') preferences.image[side] = saved[side];
} catch { /* 저장소가 막혀 있으면 기본(펼침) */ }
const saveImagePanels = () => { try { localStorage.setItem(IMAGE_PANEL_STORE, JSON.stringify({ left: preferences.image.left, right: preferences.image.right })); } catch { /* 기억만 못 함 */ } };
const isMacShortcut = () => /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || '');
const bothPanelsShortcut = () => (isMacShortcut() ? '⇧⌘\\' : 'Ctrl+Shift+\\');
const initialized = new WeakSet();
let serial = 0;

// 그라파이트 아이콘 세트(24칸·선 1.5): 패널 쪽 칸을 채우고, 접히면 채운 칸만 사라진다
// (css/graphite-shell.css의 .ds-fillcol). 작업실(이미지 패널)도 같은 아이콘을 쓴다.
function panelIcon(side) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'ds-ico');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const [name, value] of [['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '1.5'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]) svg.setAttribute(name, value);
  const frame = document.createElementNS(ns, 'rect');
  for (const [name, value] of [['x', '3'], ['y', '4'], ['width', '18'], ['height', '16'], ['rx', '2']]) frame.setAttribute(name, value);
  const fill = document.createElementNS(ns, 'path');
  fill.setAttribute('class', 'ds-fillcol');
  fill.setAttribute('d', side === 'left' ? 'M3.8 4.8h5.2v14.4H3.8z' : 'M15 4.8h5.2v14.4H15z');
  const divider = document.createElementNS(ns, 'path');
  divider.setAttribute('d', side === 'left' ? 'M9 4v16' : 'M15 4v16');
  svg.append(frame, fill, divider);
  return svg;
}

function setAccessibleState(layout, side, expanded) {
  const { panel, button, name, originalRole, originalAriaModal } = layout[side];
  if (!expanded && panel.contains(document.activeElement)) button.focus();
  panel.classList.toggle('is-open', !fixedLite() && narrow.matches && expanded);
  if (!fixedLite() && narrow.matches && expanded) {
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
  // AI 작업대는 편집기처럼 두 칸을 함께 접는 단축키를 단추 설명에 적는다.
  button.title = `${name} 패널 ${expanded ? '접기' : '펼치기'}${layout.kind === 'image' ? ` (두 칸 함께 ${bothPanelsShortcut()})` : ''}`;
  if (layout.kind === 'image') placeImageToggles(layout);
}

// 11-19(시안 v4 태그 15·16): AI 작업대의 접기 단추는 편집기·라이브러리처럼 칸 머리줄 오른쪽 끝(▢)에 둔다.
//  · 작업 목록: 펼침 = 「작업 목록」 머리줄 오른쪽, 접힘 = 44px 줄(.ai-task-mini) 맨 위.
//  · 오른쪽 칸: 펼침 = 「그림 설정」 줄 오른쪽 끝, 접힘 = 맨 위 줄(닫기 단추 앞) — 접힌 칸 안에는 둘 수 없다.
//  · 좁은 화면(서랍)·Lite는 예전 자리.
function placeImageToggles(layout) {
  const { root } = layout;
  const desktop = !narrow.matches && !fixedLite();
  root.classList.toggle('ai-panel-heads', desktop);
  const left = layout.left?.button, right = layout.right?.button;
  const status = root.querySelector('.ai-head-status');
  const group = root.querySelector('.ai-head .panel-shell-toggles');
  if (left) {
    const collapsed = left.getAttribute('aria-expanded') === 'false';
    const target = !desktop ? group : collapsed ? root.querySelector('[data-ai-task-mini-head]') : root.querySelector('.ai-rail-heading');
    if (target && left.parentElement !== target) target.append(left);
  }
  if (right) {
    const collapsed = right.getAttribute('aria-expanded') === 'false';
    const caption = root.querySelector('.ai-conversation-caption');
    const target = desktop && !collapsed && caption ? caption : status;
    if (target === status) { if (status && right.parentElement !== status) status.insertBefore(right, status.querySelector('.ai-close')); }
    else if (right.parentElement !== target) target.append(right);
  }
}

// 접힌 작업 목록 = 44px 줄: 맨 위 ▢(펴기), 작업 칸(번호, 진행 중이면 작은 점), ＋(작업 추가). 실제 작업 탭을 그대로 비춘다.
function mountTaskMini(root) {
  const workspace = root.querySelector('.ai-workspace');
  if (!workspace) return;
  // 복제된 작업 칸 창은 옛 줄을 지우고 새로 단다(관찰자 포함). 옛 줄에 든 접기 단추는 먼저 머리줄로 꺼낸다.
  const stale = root.querySelector('[data-ai-task-mini]');
  stale?.querySelectorAll('[data-panel-toggle]').forEach(button => root.querySelector('.ai-rail-heading')?.append(button));
  stale?.remove();
  // 머리줄: 「작업 목록」 + ▢. 「N개 선택 · 전체 선택 · 삭제」 줄은 그 아래 둘째 줄로.
  const heading = root.querySelector('.ai-rail-heading');
  if (heading && !heading.querySelector('.ai-rail-title')) {
    const title = document.createElement('span'); title.className = 'ai-rail-title'; title.textContent = '작업 목록'; title.setAttribute('aria-hidden', 'true');
    heading.append(title);
    const row = heading.querySelector('.ai-rail-selection-row');
    if (row) heading.after(row);
  }
  const mini = document.createElement('aside');
  mini.className = 'ai-task-mini'; mini.dataset.aiTaskMini = '';
  mini.setAttribute('aria-label', '작업 목록(접힘)');
  const head = document.createElement('div'); head.className = 'ai-task-mini-head'; head.dataset.aiTaskMiniHead = '';
  const list = document.createElement('div'); list.className = 'ai-task-mini-list'; list.setAttribute('role', 'list');
  mini.append(head, list); workspace.append(mini);
  const render = () => {
    const tabs = [...root.querySelectorAll('[data-ai-tab-list] > .ai-task-tab[data-tab-id]')];
    const add = root.querySelector('[data-ai-task-add]');
    const key = JSON.stringify([tabs.map(tab => [tab.dataset.tabId, tab.classList.contains('is-on'), tab.dataset.workState, tab.title]), !!add]);
    if (list.dataset.renderKey === key) return;
    list.dataset.renderKey = key;
    list.replaceChildren(...tabs.map((tab, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'ai-task-mini-tab'; button.setAttribute('role', 'listitem');
      button.textContent = String(index + 1);
      button.dataset.aiMiniTabId = tab.dataset.tabId;
      button.classList.toggle('is-on', tab.classList.contains('is-on'));
      button.setAttribute('aria-current', String(tab.classList.contains('is-on')));
      if (tab.dataset.workState === 'busy') { const dot = document.createElement('i'); dot.className = 'ai-task-mini-dot'; dot.setAttribute('aria-hidden', 'true'); button.append(dot); }
      button.title = tab.title || `작업 ${index + 1}`;
      button.setAttribute('aria-label', button.title);
      button.onclick = () => (tab.querySelector('.ai-task-tab-select') || tab).click();
      return button;
    }), ...(add ? [Object.assign(document.createElement('button'), { type: 'button', className: 'ai-task-mini-add', textContent: '＋', title: add.title || '새 작업', onclick: () => add.click() })] : []));
  };
  render();
  new MutationObserver(render).observe(workspace.querySelector('.ai-task-rail') || root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-work-state', 'title'] });
}

function moveEditorHeader(root, toolbar) {
  if (toolbar.closest('.app-shell-header') && toolbar.querySelector('.toolbar-history')) return;
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
    const expanded = fixedLite() || (narrow.matches ? preference.drawer === side : preference[side]);
    layout.root.dataset[`${side}Collapsed`] = String(!expanded);
    layout[side].motion.reset(expanded, !fixedLite() && narrow.matches);
  }
  layout.backdrop.hidden = fixedLite() || !narrow.matches || preference.drawer === null;
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
  if (kind === 'image' && document.documentElement.classList.contains('mobile-image-mode')) return;
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
    // AI 작업대는 단추를 칸 머리줄로 옮겨 두므로(placeImageToggles) 작업 칸을 복제한 창에서도 창 전체에서 찾는다.
    const button = (kind === 'image' ? root.querySelector(`[data-panel-toggle="${side}"]`) : toolbar.querySelector(`[data-panel-toggle="${side}"]`))
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
    // 11-19(시안 v4): 11-11 「AI 이미지 창의 왼쪽 칸은 항상 펼쳐 둔다」를 풀었다 — 편집기처럼 머리줄 ▢로 접는다.
    button.hidden = false;
    const headerStatus = kind === 'image' && side === 'right'
      ? toolbar.querySelector('.ai-head-status') : null;
    if (headerStatus) headerStatus.insertBefore(button, headerStatus.querySelector('.ai-close'));
    else group.append(button);
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
      if (fixedLite()) return;
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
        if (kind === 'image') saveImagePanels();
      }
      syncPeerLayouts(layout);
    };
    close.onclick = () => closeDrawer(layout);
  }
  backdrop.onclick = () => closeDrawer(layout);
  if (kind === 'editor') panels[0].addEventListener('click', event => {
    if (narrow.matches && event.target.closest('[data-tool],[data-symbol],#object-search-trigger')) closeDrawer(layout);
  });
  if (kind === 'image') mountTaskMini(root);
  layouts.add(layout);
  render(layout);
  if (kind === 'image') placeImageToggles(layout);
}

function discover() {
  const editor = document.querySelector('.app');
  if (editor) setup(editor, 'editor');
  for (const workbench of document.querySelectorAll('.ai-workbench')) setup(workbench.parentElement, 'image');
}

discover();
// 11-04: 데스크톱 Pro에서는 접기 단추를 패널 머리줄로(떠 있는 카드 방식) — js/panel-heads.js
import('./panel-heads.js?v=1.7.0-four-session-integration').then(m => m.initPanelHeads());
new MutationObserver(discover).observe(document.body, { childList: true });
narrow.addEventListener('change', () => {
  preferences.editor.drawer = null;
  preferences.image.drawer = null;
  refresh();
  for (const layout of layouts) if (layout.kind === 'image') placeImageToggles(layout);
});
// ⇧⌘\(윈도우 Ctrl+Shift+\): AI 작업대가 떠 있으면 편집기처럼 두 칸을 함께 접거나 편다 — 하나라도 펼쳐져 있으면 둘 다 접음.
// 편집기 쪽 같은 단축키(panel-heads.js)보다 먼저 받아 뒤의 편집기 칸은 건드리지 않는다.
window.addEventListener('keydown', event => {
  if (fixedLite() || narrow.matches || event.code !== 'Backslash' || !event.shiftKey || event.altKey) return;
  if (!(isMacShortcut() ? event.metaKey : event.ctrlKey)) return;
  const layout = [...layouts].find(item => item.kind === 'image' && item.root.isConnected && !item.root.hidden && !item.root.inert);
  if (!layout || document.querySelector('dialog[open]')) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const preference = preferences.image;
  const open = ['left', 'right'].filter(side => preference[side]);
  const expand = !open.length;
  for (const side of ['left', 'right']) {
    if (preference[side] === expand) continue;
    preference[side] = expand;
    layout[side].motion.setExpanded(expand);
  }
  saveImagePanels();
  syncPeerLayouts(layout);
}, true);
window.addEventListener('5e:view-mode-change', refresh);
window.addEventListener('keydown', event => {
  if (fixedLite()) return;
  if (!narrow.matches || (event.key !== 'Escape' && event.key !== 'Tab')) return;
  // The detailed text dialog owns cancellation and font-navigation keys.
  if (event.target instanceof Element && event.target.closest('.unified-text-editor')) return;
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
