import { modKey, shortcutKey, blocksCanvasShortcut, keyLabel, IS_MAC } from './platform.js?v=1.6.1-remediation-0929';

export const SETTINGS_COMMANDS = [
  { id: 'open-screen', label: '환경 설정', key: ',', alt: false, shift: false, shortcut: 'Ctrl+,' },
];

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
  };
  render();
  window.addEventListener('5e:shortcut-platform-change', render);
  document.addEventListener('keydown', event => {
    if (blocksCanvasShortcut(event) || event.repeat || !modKey(event)) return;
    const key = event.code === 'Comma' ? ',' : shortcutKey(event);
    const command = SETTINGS_COMMANDS.find(item => item.key === key && item.alt === event.altKey && item.shift === event.shiftKey);
    if (!command) return;
    event.preventDefault();
    document.getElementById(command.id)?.click();
  });
}
