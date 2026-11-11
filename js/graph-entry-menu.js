// 11-07 G0(시안 graph-hub-1107): 아래 「그래프」 단추에 커서를 0.2초 올리거나 누르면 위로 세 갈래가 펼쳐진다.
// 직접 만들기 → 빈 그래프 편집기(단축키 F 그대로), 사진에서 복원·AI와 대화로 만들기 → AI 창의 그 탭.
// 세 길 모두 결과는 같은 그래프 편집기에서 고친다.
import { openGraphModal } from './graph/graph-modal.js?v=1.7.0-four-session-integration';
import { formatShortcut } from './shortcut-table.js?v=1.7.0-four-session-integration';

const ICON = {
  direct: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="m13.5 8.5 2 2"/>',
  graph: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 16l4.5-4.5 3.5 3.5 2.5-2.5L20 18"/><circle cx="15.5" cy="8.5" r="1.4"/>',
  'graph-create': '<path d="M12 3.5c.6 4.1 2.4 5.9 6.5 6.5-4.1.6-5.9 2.4-6.5 6.5-.6-4.1-2.4-5.9-6.5-6.5 4.1-.6 5.9-2.4 6.5-6.5z"/><path d="M18.5 15.5c.2 1.4.8 2 2.2 2.2-1.4.2-2 .8-2.2 2.2-.2-1.4-.8-2-2.2-2.2 1.4-.2 2-.8 2.2-2.2z"/>',
};
export const GRAPH_ENTRY_ROWS = Object.freeze([
  { kind: 'direct', title: '직접 만들기', detail: '축·식을 넣어 그립니다', shortcut: 'F' },
  { kind: 'graph', title: '사진에서 복원', detail: '기출 그림을 그래프로 되살립니다' },
  { kind: 'graph-create', title: 'AI와 대화로 만들기', detail: '말로 설명하면 그려 줍니다' },
]);
const HOVER_OPEN_MS = 200, LEAVE_CLOSE_MS = 260;

export function initGraphEntryMenu({ button = document.getElementById('graph-tool-open'), openAiWorkflow } = {}) {
  if (!button || button.dataset.graphEntryMenu === 'true') return null;
  button.dataset.graphEntryMenu = 'true';
  const menu = document.createElement('div');
  menu.className = 'graph-entry-menu'; menu.id = 'graph-entry-menu';
  menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', '그래프 만들기');
  menu.hidden = true;
  menu.innerHTML = GRAPH_ENTRY_ROWS.map(row => `<button type="button" role="menuitem" tabindex="-1" class="graph-entry-row" data-graph-entry="${row.kind}"${row.shortcut ? ` title="${row.title}" aria-keyshortcuts="${row.shortcut}"` : ''}>
      <span class="graph-entry-ico" data-tone="${row.kind === 'direct' ? 'direct' : 'ai'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[row.kind]}</svg></span>
      <span class="graph-entry-text"><strong>${row.title}</strong><span>${row.detail}</span></span>
      ${row.shortcut ? `<kbd class="graph-entry-key" data-graph-entry-key>${formatShortcut(row.shortcut)}</kbd>` : ''}
    </button>`).join(''); // 11-11: 아래 설명 줄 삭제
  document.body.append(menu);
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-controls', menu.id);
  button.setAttribute('aria-expanded', 'false');
  const rows = [...menu.querySelectorAll('[data-graph-entry]')];
  let openTimer = 0, closeTimer = 0, openedBy = null, openedAt = 0;
  const clearTimers = () => { clearTimeout(openTimer); clearTimeout(closeTimer); openTimer = closeTimer = 0; };
  const isOpen = () => !menu.hidden;
  // 숨은 단추(Lite 화면에서 다른 단추가 대신 누름)·모바일에서는 메뉴 없이 예전처럼 편집기를 바로 연다.
  const canShowMenu = () => button.getClientRects().length > 0 && document.documentElement.dataset.mode !== 'lite'
    && !document.documentElement.classList.contains('mobile-image-mode');

  function place() {
    const rect = button.getBoundingClientRect();
    const width = menu.offsetWidth || 300;
    menu.style.left = `${Math.round(Math.max(8, Math.min(rect.left - 6, innerWidth - width - 8)))}px`;
    menu.style.bottom = `${Math.round(innerHeight - rect.top + 8)}px`;
  }
  function open(how, { focus = false } = {}) {
    clearTimers();
    if (!isOpen()) {
      menu.hidden = false; openedBy = how; openedAt = performance.now();
      button.setAttribute('aria-expanded', 'true'); button.dataset.graphMenuOpen = 'true';
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('keydown', escape, true);
      addEventListener('resize', close); addEventListener('blur', close);
    }
    place();
    if (focus) rows[0]?.focus({ preventScroll: true });
  }
  function close({ restoreFocus = false } = {}) {
    clearTimers();
    if (!isOpen()) return;
    const hadFocus = menu.contains(document.activeElement);
    menu.hidden = true; openedBy = null;
    button.setAttribute('aria-expanded', 'false'); delete button.dataset.graphMenuOpen;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escape, true);
    removeEventListener('resize', close); removeEventListener('blur', close);
    if (restoreFocus || hadFocus) button.focus({ preventScroll: true });
  }
  function outside(event) {
    if (!menu.contains(event.target) && !button.contains(event.target)) close();
  }
  function escape(event) {
    if (event.key !== 'Escape' || !isOpen()) return;
    event.preventDefault(); event.stopPropagation();
    close({ restoreFocus: true });
  }
  const scheduleClose = () => { clearTimeout(openTimer); openTimer = 0; if (isOpen()) { clearTimeout(closeTimer); closeTimer = setTimeout(() => close(), LEAVE_CLOSE_MS); } };
  const keepOpen = () => { clearTimeout(closeTimer); closeTimer = 0; };

  function choose(kind) {
    close();
    if (kind === 'direct') openGraphModal();
    else openAiWorkflow?.(kind);
  }

  button.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse' || !canShowMenu()) return;
    keepOpen();
    if (!isOpen() && !openTimer) openTimer = setTimeout(() => { openTimer = 0; open('hover'); }, HOVER_OPEN_MS);
  });
  button.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') scheduleClose(); });
  menu.addEventListener('pointerenter', keepOpen);
  menu.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') scheduleClose(); });
  button.addEventListener('click', event => {
    if (!canShowMenu()) { close(); openGraphModal(); return; }
    const keyboard = event.detail === 0;
    if (isOpen()) {
      // 올려서 막 펼쳐진 메뉴를 바로 누르면 닫지 않는다(올림 → 누름이 한 동작처럼 이어지게).
      if (openedBy === 'hover' && performance.now() - openedAt < 700) { openedBy = 'click'; if (keyboard) rows[0]?.focus(); return; }
      close({ restoreFocus: keyboard });
      return;
    }
    open(keyboard ? 'keyboard' : 'click', { focus: keyboard });
  });
  button.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key) || !canShowMenu()) return;
    event.preventDefault();
    open('keyboard', { focus: true });
    if (event.key === 'ArrowUp') rows.at(-1)?.focus();
  });
  menu.addEventListener('click', event => {
    const row = event.target.closest('[data-graph-entry]');
    if (row) choose(row.dataset.graphEntry);
  });
  menu.addEventListener('keydown', event => {
    const index = rows.indexOf(document.activeElement);
    const go = next => { event.preventDefault(); rows[(next + rows.length) % rows.length]?.focus(); };
    if (event.key === 'ArrowDown') go(index + 1);
    else if (event.key === 'ArrowUp') go(index < 0 ? rows.length - 1 : index - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(rows.length - 1);
    else if (event.key === 'Tab') close();
  });
  menu.addEventListener('focusout', event => {
    if (isOpen() && !menu.contains(event.relatedTarget) && event.relatedTarget !== button && event.relatedTarget) close();
  });
  // ⌘K 명령 팔레트의 그래프 항목도 같은 세 갈래로 간다.
  window.addEventListener('5e:graph-entry', event => choose(event.detail?.kind || 'direct'));
  window.addEventListener('5e:shortcut-platform-change', () => {
    const key = menu.querySelector('[data-graph-entry-key]');
    if (key) key.textContent = formatShortcut('F');
  });
  return { open, close, isOpen, menu };
}
