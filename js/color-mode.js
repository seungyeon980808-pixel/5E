// 화면 색 모드 세 가지: 그라파이트(다크) · 다크네이비(다크, 1.6.x 남색) · 화이트.
// 저장은 기존 키를 그대로 쓴다 — "theme"(dark|light) + "5e.palette"(graphite|classic).
// 다크네이비는 palette "classic"이다. 그림·저장 데이터와는 무관하다.
// "theme"는 main.js와 같은 previewStorage, "5e.palette"는 <head> 스크립트가 읽는 원래 저장소.
import { previewStorage } from './preview-storage.js?v=1.7.0-four-session-integration';
export const COLOR_MODES = ['graphite', 'navy', 'white'];
export const COLOR_MODE_LABELS = { graphite: '그라파이트', navy: '다크네이비', white: '화이트' };

export function getColorMode(root = document.documentElement) {
  if (root.getAttribute('data-theme') === 'light') return 'white';
  return root.getAttribute('data-palette') === 'classic' ? 'navy' : 'graphite';
}

export function nextColorMode(mode = getColorMode()) {
  return COLOR_MODES[(COLOR_MODES.indexOf(mode) + 1) % COLOR_MODES.length];
}

export function syncThemeButton(root = document.documentElement) {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const mode = getColorMode(root);
  const next = nextColorMode(mode);
  const text = `화면 색: ${COLOR_MODE_LABELS[mode]} — 누르면 ${COLOR_MODE_LABELS[next]}`;
  btn.setAttribute('aria-pressed', String(mode === 'white'));
  btn.setAttribute('aria-label', text);
  btn.title = text;
  btn.dataset.colorMode = mode;
}

export function setColorMode(mode, root = document.documentElement) {
  const safe = COLOR_MODES.includes(mode) ? mode : 'graphite';
  const theme = safe === 'white' ? 'light' : 'dark';
  root.setAttribute('data-theme', theme);
  // 화이트로 갈 때는 다크 색(팔레트)을 기억해 둔 채로 둔다.
  if (safe !== 'white') root.setAttribute('data-palette', safe === 'navy' ? 'classic' : 'graphite');
  try {
    previewStorage.setItem('theme', theme);
    if (safe !== 'white') window.localStorage.setItem('5e.palette', safe === 'navy' ? 'classic' : 'graphite');
  } catch {}
  syncThemeButton(root);
  window.dispatchEvent(new CustomEvent('5e:color-mode-change', { detail: { mode: safe } }));
  return safe;
}
