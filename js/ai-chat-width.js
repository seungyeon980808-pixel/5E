// 11-20 V5(시안 대화창v5 태그 4·5): 그림 생성 탭 대화 칸 폭. 기본 598px(결과만 보기 · 460의 30%↑), 레퍼런스가 있으면 424px(326의 30%↑).
// 그림 칸과 대화 칸 사이 경계를 끌어 420~820, 두 번 누르면 처음 폭, 경계에 초점을 두고 ←/→ 8px씩.
// 왼쪽 칸 손잡이(shell-left-width.js)와 같은 모양·같은 방식. 끈 폭은 localStorage 한 값으로 남는다(다시 열어도 그대로).
// 1000px 이하 화면·생성 탭이 아닐 때·대화 칸을 접었을 때는 손잡이를 숨기고 끈 폭을 쓰지 않는다(CSS가 그 조건에서만 폭 변수를 읽음).
export const CHAT_WIDTH_KEY = '5e.aiCreate.chatWidth';
export const CHAT_MIN = 420, CHAT_MAX = 820, CHAT_STEP = 8;
export const CHAT_DEFAULT = 598, CHAT_DEFAULT_WITH_REFS = 424;
const NARROW = 1000;
const VAR = '--ai-create-chat-w';

export function clampChatWidth(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(CHAT_MAX, Math.max(CHAT_MIN, n)) : CHAT_DEFAULT;
}
function readSaved() {
  try { const raw = localStorage.getItem(CHAT_WIDTH_KEY); return raw == null ? null : clampChatWidth(raw); } catch { return null; }
}
function writeSaved(w) {
  try { if (w == null) localStorage.removeItem(CHAT_WIDTH_KEY); else localStorage.setItem(CHAT_WIDTH_KEY, String(w)); } catch { /* 저장소를 못 쓰면 이번 화면에서만 */ }
}

/**
 * 그림 생성 탭 대화 칸 폭 손잡이를 단다. 패널 하나에 한 번.
 * @param {HTMLElement} panel #ai-image-panel
 * @returns {{ set(w: number|null, opts?: {save?: boolean}): void, width(): number|null, grip: HTMLElement, place(): void }}
 */
export function installChatWidth(panel, { signal } = {}) {
  if (!panel || panel.aiChatWidth) return panel?.aiChatWidth;
  const doc = panel.ownerDocument, view = doc.defaultView;
  const workspace = panel.querySelector('.ai-workspace');
  const conversation = panel.querySelector('.ai-conversation');
  if (!workspace || !conversation) return null;
  let saved = readSaved();
  const apply = (w) => { if (w == null) panel.style.removeProperty(VAR); else panel.style.setProperty(VAR, `${w}px`); };
  apply(saved);

  const grip = doc.createElement('div');
  grip.className = 'ai-chat-grip'; grip.hidden = true; grip.tabIndex = 0; grip.dataset.aiChatGrip = '';
  grip.setAttribute('role', 'separator'); grip.setAttribute('aria-orientation', 'vertical');
  grip.setAttribute('aria-label', '대화 칸 폭 — 끌어서 조절, 두 번 누르면 처음 폭');
  grip.setAttribute('aria-valuemin', String(CHAT_MIN)); grip.setAttribute('aria-valuemax', String(CHAT_MAX));
  grip.title = '끌어서 폭 바꾸기 · 두 번 누르면 처음 폭';
  workspace.append(grip);

  const shown = () => panel.dataset.aiCreateUi === 'true' && panel.dataset.rightCollapsed !== 'true' && (view.innerWidth || 0) > NARROW;
  function place() {
    const box = conversation.getBoundingClientRect(), host = workspace.getBoundingClientRect();
    const show = shown() && box.width > 0 && box.height > 0;
    if (grip.hidden !== !show) grip.hidden = !show; // 같은 값을 다시 넣지 않는다(감시가 끝없이 도는 것을 막음)
    if (!show) return;
    grip.style.left = `${Math.round(box.left - host.left)}px`;
    grip.style.top = `${Math.round(box.top - host.top)}px`;
    grip.style.height = `${Math.round(box.height)}px`;
    grip.setAttribute('aria-valuenow', String(Math.round(box.width)));
  }
  const placeSoon = () => view.requestAnimationFrame(place);
  function set(w, { save = true } = {}) {
    const next = w == null ? null : clampChatWidth(w);
    apply(next);
    if (save) { saved = next; writeSaved(next); }
    placeSoon();
  }

  let drag = null;
  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag = { x: event.clientX, w: Math.round(conversation.getBoundingClientRect().width) || saved || CHAT_DEFAULT };
    grip.setPointerCapture?.(event.pointerId); grip.classList.add('is-dragging');
    doc.documentElement.classList.add('ai-chat-resizing');
  });
  grip.addEventListener('pointermove', (event) => {
    if (!drag) return;
    // 대화 칸은 오른쪽에 있다 — 경계를 왼쪽으로 끌면 넓어진다.
    set(drag.w - (event.clientX - drag.x), { save: false });
  });
  const end = (event) => {
    if (!drag) return;
    drag = null; grip.releasePointerCapture?.(event.pointerId); grip.classList.remove('is-dragging');
    doc.documentElement.classList.remove('ai-chat-resizing');
    set(Math.round(conversation.getBoundingClientRect().width));
  };
  grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
  grip.addEventListener('dblclick', () => set(null));
  grip.addEventListener('keydown', (event) => {
    const now = Math.round(conversation.getBoundingClientRect().width) || saved || CHAT_DEFAULT;
    const d = event.key === 'ArrowLeft' ? CHAT_STEP : event.key === 'ArrowRight' ? -CHAT_STEP : 0;
    if (event.key === 'Home') { event.preventDefault(); set(null); return; }
    if (!d) return;
    event.preventDefault(); set(now + d);
  });

  const ro = new view.ResizeObserver(place);
  ro.observe(conversation); ro.observe(workspace);
  const mo = new view.MutationObserver(placeSoon);
  mo.observe(panel, { attributes: true, attributeFilter: ['data-ai-create-ui', 'data-right-collapsed', 'data-ai-result-only', 'hidden', 'class'] });
  view.addEventListener('resize', placeSoon, { signal });
  // 다른 창에서 바꾼 폭도 따라간다.
  view.addEventListener('storage', (event) => { if (event.key === CHAT_WIDTH_KEY) { saved = event.newValue == null ? null : clampChatWidth(event.newValue); apply(saved); placeSoon(); } }, { signal });
  signal?.addEventListener('abort', () => { ro.disconnect(); mo.disconnect(); grip.remove(); });
  placeSoon();
  const api = { set, width: () => saved, grip, place };
  panel.aiChatWidth = api;
  return api;
}
