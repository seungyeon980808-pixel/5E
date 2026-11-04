// 패널 접기 단추를 맨 위 줄에서 패널 머리줄로 옮긴다(11-04 시안 app-final-1104 · Figma 방식).
//  · 펼침: 각 패널 맨 위 「도구 ▢」 「속성 ▢」 줄의 오른쪽 아이콘으로 접는다.
//  · 접힘: 패널 자리가 가장자리에 붙은 44px 줄(.ds-rail)로 줄어들고, 그 맨 위에 ▢(펴기)가 온다(11-04 확정 시안 panel-rail-1104).
//  · 단추 자체(#drawer-left-toggle 등)는 panel-visibility.js가 만든 그대로 — 자리만 옮긴다.
//  · 좁은 화면(서랍)과 Lite에서는 원래 자리(맨 위 줄)로 돌려놓는다.
const narrow = window.matchMedia('(max-width: 767px)');
const NAMES = { left: '도구', right: '속성' };

function ensure(app, side) {
  const panel = document.getElementById(side === 'left' ? 'panel-left' : 'panel-right');
  if (!panel) return null;
  let head = panel.querySelector(':scope > .pf-head');
  if (!head) {
    head = document.createElement('div');
    head.className = 'pf-head';
    head.innerHTML = `<span class="pf-title">${NAMES[side]}</span>`;
    panel.prepend(head);
  }
  let mini = app.querySelector(`:scope > .pf-mini-${side}`);
  if (!mini) {
    mini = document.createElement('div');
    mini.className = `pf-mini pf-mini-${side}`;
    mini.innerHTML = `<span class="pf-title">${NAMES[side]}</span>`;
    app.append(mini);
  }
  return { head, mini };
}

export function initPanelHeads() {
  const app = document.querySelector('.app');
  if (!app) return;
  const place = () => {
    const group = document.querySelector('.app-shell-header .panel-shell-toggles');
    const desktop = !narrow.matches && document.documentElement.dataset.mode !== 'lite';
    app.classList.toggle('pf-on', desktop);
    for (const side of ['left', 'right']) {
      const button = document.getElementById(`drawer-${side}-toggle`);
      const slots = ensure(app, side);
      if (!button || !slots) continue;
      if (!desktop) {
        if (group && button.parentElement !== group) side === 'left' ? group.prepend(button) : group.append(button);
        continue;
      }
      const rail = app.querySelector(`:scope > .ds-rail-${side}`);
      const collapsed = app.dataset[`${side}Collapsed`] === 'true';
      if (collapsed && rail) { if (rail.firstElementChild !== button) rail.prepend(button); }
      else { const target = collapsed ? slots.mini : slots.head; if (button.parentElement !== target) target.append(button); }
    }
  };
  place();
  new MutationObserver(place).observe(app, { attributes: true, attributeFilter: ['data-left-collapsed', 'data-right-collapsed', 'data-panel-layout'] });
  narrow.addEventListener?.('change', place);
  window.addEventListener('5e:view-mode-change', () => requestAnimationFrame(place));
  // ⇧⌘\(윈도우 Ctrl+Shift+\): 두 패널을 한꺼번에 줄이거나 펼침 — 하나라도 펼쳐져 있으면 둘 다 줄임.
  document.addEventListener('keydown', event => {
    const mod = /Mac|iPhone|iPad/.test(navigator.platform || '') ? event.metaKey : event.ctrlKey;
    if (!mod || !event.shiftKey || event.altKey || event.code !== 'Backslash') return;
    if (!app.classList.contains('pf-on')) return;
    event.preventDefault();
    const open = ['left', 'right'].filter(side => app.dataset[`${side}Collapsed`] !== 'true');
    const targets = open.length ? open : ['left', 'right'];
    for (const side of targets) document.getElementById(`drawer-${side}-toggle`)?.click();
  });
}
