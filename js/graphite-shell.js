// 5E_image 그라파이트 셸 — 화면 배치만 다룬다. 기능·저장 데이터·id는 바꾸지 않는다.
//  · Pro/Lite 버튼을 캔버스 칸 맨 앞으로 옮기고 두 칸(Pro | Lite)으로 보이게 한다.
//    이미 선택된 칸을 누르면 아무 일도 하지 않는다(가운데를 누르면 원래처럼 전환).
//  · 기능 검색 버튼은 기존 명령 팔레트(⌘K / Ctrl+K)를 연다.
//  · 화면 색(팔레트) 선택을 localStorage("5e.palette")에 저장한다.
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function placeModeToggle() {
  const button = document.getElementById('mode-toggle-btn');
  const documentGroup = document.querySelector('.app-shell-header .toolbar-document');
  if (!button || !documentGroup) return false;
  // Lite는 이 버튼을 자기 칸으로 옮겼다가 원래 자리로 되돌린다. Lite 중에는 손대지 않는다.
  if (document.documentElement.dataset.mode === 'lite' || button.closest('.lite-brand-slot')) return true;
  // 10-20 세 프로그램 탭: 맨 앞은 로고·이름 → 되돌리기·다시 실행(세 프로그램 공통 자리) → Pro|Lite.
  const redo = document.getElementById('redo-btn');
  if (redo && redo.parentElement === documentGroup) {
    let sep = documentGroup.querySelector('.tb-sep.ds-sep-apps');
    if (!sep) { sep = document.createElement('span'); sep.className = 'tb-sep ds-sep-apps'; sep.setAttribute('aria-hidden', 'true'); }
    if (redo.nextElementSibling !== sep) redo.after(sep);
    if (sep.nextElementSibling !== button) sep.after(button);
  } else if (button.parentElement !== documentGroup || documentGroup.firstElementChild !== button) {
    documentGroup.prepend(button);
  }
  return true;
}

function guardModeHalves() {
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#mode-toggle-btn');
    if (!button || document.documentElement.dataset.mode === 'lite' && button.closest('.lite-brand-slot')) return;
    const rect = button.getBoundingClientRect();
    // 키보드·스크립트 클릭(detail 0 또는 버튼 밖 좌표)은 원래대로 전환한다.
    if (!event.detail || event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom) return;
    const offset = event.clientX - rect.left;
    if (!rect.width || Math.abs(offset - rect.width / 2) < rect.width * 0.2) return;
    const clicked = offset < rect.width / 2 ? 'pro' : 'lite';
    const current = document.documentElement.dataset.mode === 'lite' ? 'lite' : 'pro';
    if (clicked === current) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}

function wireFunctionSearch() {
  const button = document.getElementById('function-search-btn');
  if (!button) return;
  button.title = `기능 검색 (${IS_MAC ? '⌘K' : 'Ctrl+K'})`;
  button.dataset.shellTip = button.title;
  button.addEventListener('click', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'k', code: 'KeyK', metaKey: IS_MAC, ctrlKey: !IS_MAC, bubbles: true, cancelable: true,
    }));
  });
}

// 패널 레일: 패널을 접으면 그 자리에 52px 줄을 보여 준다. 접힌 패널 자체는 기존대로
// hidden·inert로 두고, 레일 버튼은 숨은 원래 버튼을 대신 눌러 준다(기능·id 그대로).
//  · 왼쪽: 공통 도구를 한 열로. 선택 메뉴가 있는 묶음 버튼은 패널을 연 뒤 원래 버튼을 누른다.
//  · 오른쪽: 섹션 아이콘. 누르면 패널을 열고 그 섹션을 펼쳐 보여 준다.
const RIGHT_RAIL_SECTIONS = [
  { label: '이미지 관리', match: /이미지 관리/, icon: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m20.5 16-5-5-8 8"/>' },
  { label: '아트보드', match: /아트보드/, icon: '<path d="M7 3v14a1 1 0 0 0 1 1h13M3 7h14a1 1 0 0 1 1 1v13"/>' },
  { label: '레이어', match: /레이어/, icon: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>' },
];
const svgIcon = body => `<svg class="ds-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

// 패널을 열고, 패널이 실제로 보이게 된 뒤 then()을 부른다(열림 동작이 끝날 때까지 최대 1초).
function openPanel(side, then) {
  const toggle = document.getElementById(side === 'left' ? 'drawer-left-toggle' : 'drawer-right-toggle');
  const panel = document.getElementById(side === 'left' ? 'panel-left' : 'panel-right');
  if (toggle && toggle.getAttribute('aria-expanded') === 'false') toggle.click();
  const started = performance.now();
  const wait = () => {
    const ready = panel && !panel.hidden && !panel.inert && !panel.classList.contains('is-panel-moving');
    if (ready || performance.now() - started > 1000) then?.();
    else requestAnimationFrame(wait);
  };
  requestAnimationFrame(wait);
}

function buildLeftRail(app) {
  const rail = document.createElement('nav');
  rail.className = 'ds-rail ds-rail-left';
  rail.setAttribute('aria-label', '공통 도구 (접힌 패널)');
  const section = document.querySelector('#tool-list .tool-section');
  if (!section) return null;
  const sources = [...section.querySelectorAll('.tool-btn')].filter(btn => !btn.classList.contains('lite-tool-direct'));
  const pairs = sources.map(source => {
    const proxy = document.createElement('button');
    proxy.type = 'button';
    proxy.className = 'ds-rail-btn';
    const label = source.title || source.getAttribute('aria-label') || '';
    proxy.title = label;
    proxy.setAttribute('aria-label', label);
    const svg = source.querySelector('svg');
    if (svg) proxy.append(svg.cloneNode(true));
    proxy.addEventListener('click', () => {
      if (source.getAttribute('aria-haspopup') === 'true') {
        openPanel('left', () => source.click());
      } else {
        source.click();
      }
    });
    rail.append(proxy);
    return [source, proxy];
  });
  const sync = () => pairs.forEach(([source, proxy]) => {
    proxy.classList.toggle('is-active', source.classList.contains('is-active'));
    const svg = source.querySelector('svg');
    if (svg && proxy.firstElementChild?.outerHTML !== svg.outerHTML) proxy.replaceChildren(svg.cloneNode(true));
  });
  new MutationObserver(sync).observe(section, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
  sync();
  return rail;
}

function buildRightRail() {
  const rail = document.createElement('nav');
  rail.className = 'ds-rail ds-rail-right';
  rail.setAttribute('aria-label', '속성 섹션 (접힌 패널)');
  for (const item of RIGHT_RAIL_SECTIONS) {
    const proxy = document.createElement('button');
    proxy.type = 'button';
    proxy.className = 'ds-rail-btn';
    proxy.title = item.label;
    proxy.setAttribute('aria-label', item.label);
    proxy.innerHTML = svgIcon(item.icon);
    proxy.addEventListener('click', () => {
      openPanel('right', () => {
        const details = [...document.querySelectorAll('#inspector details.insp-section')]
          .find(el => el.offsetParent && item.match.test(el.querySelector('summary')?.textContent || ''));
        if (!details) return;
        details.open = true;
        details.scrollIntoView({ block: 'nearest' });
        details.querySelector('summary')?.focus({ preventScroll: true });
      });
    });
    rail.append(proxy);
  }
  return rail;
}

function installRails() {
  const app = document.querySelector('.app');
  if (!app || app.querySelector(':scope > .ds-rail')) return;
  const left = buildLeftRail(app);
  if (left) app.append(left);
  app.append(buildRightRail());
}

export function setPalette(name) {
  const palette = name === 'graphite' ? 'graphite' : 'classic';
  document.documentElement.setAttribute('data-palette', palette);
  try { localStorage.setItem('5e.palette', palette); } catch {}
  return palette;
}

export function initGraphiteShell() {
  wireFunctionSearch();
  installRails();
  guardModeHalves();
  if (!placeModeToggle()) {
    const header = document.querySelector('.app-shell-header') || document.body;
    const observer = new MutationObserver(() => { if (placeModeToggle()) observer.disconnect(); });
    observer.observe(header, { childList: true, subtree: true });
  }
  window.addEventListener('5e:view-mode-change', () => requestAnimationFrame(placeModeToggle));
  window.fiveEPalette = { set: setPalette, get: () => document.documentElement.getAttribute('data-palette') };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGraphiteShell, { once: true });
else initGraphiteShell();
