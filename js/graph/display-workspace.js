// The list stays stable while one properties panel follows the current selection.
export function appendDisplayHeading(row, title, label, onDelete) {
  title.title=title.textContent;
  const heading = document.createElement('div');
  heading.className = 'gm-display-heading';
  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'gm-display-remove';
  remove.setAttribute('aria-label', `${label} 삭제`); remove.title = `${label} 삭제`;
  remove.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  remove.onclick = () => {
    const overlay = row.closest('#graph-modal-overlay');
    const buttons = [...overlay.querySelectorAll('#gm-display-list .gm-display-select')];
    const index = buttons.indexOf(title);
    onDelete();
    const next = [...overlay.querySelectorAll('#gm-display-list .gm-display-select')];
    (next[Math.min(index, next.length - 1)] || overlay.querySelector('#gm-ann-marker')).focus({ preventScroll: true });
  };
  heading.append(title, remove); row.append(heading);
}

export function syncDisplayProperties(overlay) {
  const panel = overlay.querySelector('#gm-display-properties');
  if (!panel) return;
  const selected = overlay.querySelector('#gm-display-list .gm-display-select[aria-pressed="true"]');
  panel.hidden = !selected;
  panel.querySelector('#gm-display-properties-title').textContent = selected?.textContent || '';
}
