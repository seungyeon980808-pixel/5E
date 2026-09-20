import { modKey, shortcutKey, blocksCanvasShortcut, keyLabel, IS_MAC } from './platform.js?v=1.6.0-preview-labeler-0917-1111';

export const SETTINGS_COMMANDS = [
  { id: 'open-defaults', label: '도구 기본값', key: 'd', alt: true, shift: true, shortcut: 'Ctrl+Alt+Shift+D' },
  { id: 'open-screen', label: '환경 설정', key: ',', alt: false, shift: false, shortcut: 'Ctrl+,' },
  { id: 'settings-export', label: '백업 파일 만들기', key: 'b', alt: true, shift: true, shortcut: 'Ctrl+Alt+Shift+B' },
  { id: 'settings-import', label: '백업에서 복원', key: 'r', alt: true, shift: true, shortcut: 'Ctrl+Alt+Shift+R' },
  { id: 'open-shortcuts', label: '키보드 단축키', key: 'k', alt: true, shift: true, shortcut: 'Ctrl+Alt+Shift+K' },
];

export const WORKFLOW_COMMANDS = [
  { id: 'exam-library-open', label: '라이브러리', key: 'l', alt: true, shift: true, shortcut: 'Ctrl+Alt+Shift+L' },
  { id: 'image-objectify-open', label: '이미지 객체화', key: 't', alt: true, shift: true, shortcut: 'Ctrl+Alt+Shift+T' },
  { id: 'ai-image-install-open', label: 'AI 이미지 변환', key: 'a', alt: true, shift: true, shortcut: 'Ctrl+Alt+Shift+A' },
];

export function workflowShortcutRows() {
  return WORKFLOW_COMMANDS.map(command => [command.label, commandKeyLabel(command.shortcut)]);
}

export function commandKeyLabel(shortcut) {
  return IS_MAC ? shortcut.replace('Ctrl+', '⌘').replace('Alt+', '⌥').replace('Shift+', '⇧') : keyLabel(shortcut);
}

export function settingsShortcutRows() {
  return SETTINGS_COMMANDS.map(command => [command.label, commandKeyLabel(command.shortcut)]);
}

export function initSettingsShortcuts() {
  const render = () => {
    for (const command of SETTINGS_COMMANDS) {
      const button = document.getElementById(command.id);
      if (!button) continue;
      const label = document.createElement('span');
      label.textContent = command.label;
      const shortcut = document.createElement('kbd');
      shortcut.textContent = commandKeyLabel(command.shortcut);
      shortcut.style.cssText = 'margin-left:auto;padding-left:16px;font:inherit;font-size:.75em;color:var(--text-secondary)';
      button.style.display = 'flex';
      button.style.alignItems = 'center';
      button.replaceChildren(label, shortcut);
      button.title = `${command.label} (${commandKeyLabel(command.shortcut)})`;
    }
    for (const command of WORKFLOW_COMMANDS) {
      const button = document.getElementById(command.id);
      if (!button) continue;
      button.title = `${command.label} (${commandKeyLabel(command.shortcut)})`;
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-keyshortcuts', `${IS_MAC ? 'Meta' : 'Control'}+Alt+Shift+${command.key.toUpperCase()}`);
    }
  };
  render();
  window.addEventListener('5e:shortcut-platform-change', render);
  document.addEventListener('keydown', event => {
    if (blocksCanvasShortcut(event) || event.repeat || !modKey(event)) return;
    const key = event.code === 'Comma' ? ',' : shortcutKey(event);
    const command = [...SETTINGS_COMMANDS, ...WORKFLOW_COMMANDS].find(item => item.key === key && item.alt === event.altKey && item.shift === event.shiftKey);
    if (!command) return;
    event.preventDefault();
    document.getElementById(command.id)?.click();
  });
}
