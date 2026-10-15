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
  if (button.parentElement !== documentGroup || documentGroup.firstElementChild !== button) {
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

export function setPalette(name) {
  const palette = name === 'classic' ? 'classic' : 'graphite';
  document.documentElement.setAttribute('data-palette', palette);
  try { localStorage.setItem('5e.palette', palette); } catch {}
  return palette;
}

export function initGraphiteShell() {
  wireFunctionSearch();
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
