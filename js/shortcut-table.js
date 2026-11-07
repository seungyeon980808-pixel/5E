// 단축키 표 하나(11-04 시안 tooltip-zoom-1104): 실제로 동작하는 단축키만 모아 두고, 단추 설명에 「이름 (단축키)」로 자동으로 붙인다.
// 단축키를 바꾸면 여기만 고치면 된다. 표기는 맥 ⌘⌥⇧ / 윈도우 Ctrl·Alt·Shift(설정의 단축키 기준을 따른다).
// 키 적는 법: 'Mod' = 맥 ⌘·윈도우 Ctrl, 그 밖은 Alt·Shift·글자. 예: 'Mod+Shift+Z', 'Alt+P', 'E'.
import { IS_MAC } from './platform.js?v=1.7.0-four-session-integration';

export const IMAGE_SHORTCUTS = [
  ['#undo-btn', 'Mod+Z'], ['#redo-btn', 'Mod+Shift+Z'],
  ['[data-tool="V"]', 'V'], ['[data-tool="rotate"]', 'R'], ['[data-tool="O"]', 'O'], ['[data-tool="Y"]', 'Y'],
  ['[data-tool="RECT"]', 'S'], ['[data-tool="L"]', 'L'], ['[data-tool="P"]', 'P'], ['[data-tool="C"]', 'C'],
  ['[data-tool="F"]', 'D'], ['[data-tool="T"]', 'T'], ['[data-tool="CUT"]', 'E'], ['[data-tool="DELAYED_CUT"]', 'Mod+E'],
  ['[data-tool="ERASE"]', 'Shift+E'],
  ['[data-symbol="node"]', 'N'], ['[data-symbol="labeler"]', 'Shift+T'], ['[data-symbol="anglearc"]', 'A'], ['[data-symbol="rightangle"]', 'Shift+A'],
  ['[data-graph-entry="direct"]', 'F'],
  ['#center-view-btn', 'Mod+Space'], ['#fullscreen-toggle', 'Alt+Enter'],
  ['#function-search-btn', 'Mod+K'], ['#object-search-trigger', 'Mod+F'], ['#quick-capture-btn', 'Alt+C'],
  ['#project-save', 'Mod+S'], ['#image-export', 'Alt+P'],
  ['[data-canvas-zoom="out"]', 'Mod+-'], ['[data-canvas-zoom="in"]', 'Mod+='], ['[data-canvas-zoom="fit"]', 'Shift+1'], ['[data-canvas-zoom="default"]', 'Mod+0'],
];

const macLabels = () => IS_MAC;// platform.js의 IS_MAC은 설정의 단축키 기준을 따라 바뀐다
const MAC_KEY = { Enter: '↩', '-': '−', '=': '+' }, WIN_KEY = { '-': '−', '=': '+' };
// 'Mod+Shift+Z' → 맥 「⇧⌘Z」 / 윈도우 「Ctrl+Shift+Z」
export function formatShortcut(spec) {
  const parts = spec.split('+').filter(Boolean), key = parts.pop(), mods = new Set(parts);
  if (macLabels()) return `${mods.has('Alt') ? '⌥' : ''}${mods.has('Shift') ? '⇧' : ''}${mods.has('Mod') ? '⌘' : ''}${MAC_KEY[key] || key}`;
  return [mods.has('Mod') && 'Ctrl', mods.has('Alt') && 'Alt', mods.has('Shift') && 'Shift', WIN_KEY[key] || key].filter(Boolean).join('+');
}

// 단추의 원래 이름(괄호 속 옛 단축키·「· ⌘K」 꼬리 뺀 것)을 한 번만 기억해 두고, 그 뒤로는 그 이름에 붙인다.
const baseName = el => el.dataset.scName ||= (el.getAttribute('title') || el.dataset.tip || el.dataset.shellTip || el.getAttribute('aria-label') || '')
  .replace(/\s*[(（][^()（）]*[)）]\s*$/, '').replace(/\s*·\s*[⌘⌥⇧\w+]+$/, '').trim();

export function applyShortcutTips(table = IMAGE_SHORTCUTS, root = document) {
  for (const [selector, spec] of table) {
    for (const el of root.querySelectorAll(selector)) {
      const name = baseName(el);
      if (!name) continue;
      const tip = `${name} (${formatShortcut(spec)})`;
      el.setAttribute('data-shortcut-label-fixed', '');
      if (el.dataset.shellTip !== undefined) el.dataset.shellTip = tip;
      if (el.dataset.tip !== undefined) el.dataset.tip = tip;
      if (el.dataset.tip === undefined || el.hasAttribute('title')) el.setAttribute('title', tip);
    }
  }
}

// 늦게 생기는 단추(그라파이트 셸·레일 복제본)까지 잡도록 몇 번 더 붙이고, 단축키 기준을 바꾸면 다시 붙인다.
export function initShortcutTips(table = IMAGE_SHORTCUTS) {
  const run = () => applyShortcutTips(table);
  run();
  for (const ms of [400, 1500, 4000]) setTimeout(run, ms);
  window.addEventListener('5e:shortcut-platform-change', run);
  return run;
}
