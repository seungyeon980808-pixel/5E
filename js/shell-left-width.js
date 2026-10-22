// 세 앱(그림·출제·한글) 왼쪽 칸 폭 하나 (10-22 시안 shell-layout-1022 B-1).
// 기본 160px, 칸 오른쪽 경계를 끌어 160~320, 경계를 두 번 누르면 160, 경계에 초점을 두고 ←/→ 8px씩.
// 폭은 세 앱이 함께 쓰고(localStorage 한 값) 다시 열어도 남는다. 900px 이하 화면은 끈 폭을 쓰지 않고 160(손잡이도 숨김).
// 출제(ExamPool)는 같은 출처 iframe이라 바깥 문서에서 폭 규칙과 손잡이를 넣는다(ExamPool 파일은 고치지 않는다).
export const LEFT_WIDTH_KEY = '5e.shell.leftWidth';
export const LEFT_MIN = 160, LEFT_MAX = 320, LEFT_STEP = 8;
const NARROW = 900;

export function clampLeftWidth(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(LEFT_MAX, Math.max(LEFT_MIN, n)) : LEFT_MIN;
}
function readWidth() { try { return clampLeftWidth(localStorage.getItem(LEFT_WIDTH_KEY) ?? LEFT_MIN); } catch { return LEFT_MIN; } }
function saveWidth(w) { try { if (w === LEFT_MIN) localStorage.removeItem(LEFT_WIDTH_KEY); else localStorage.setItem(LEFT_WIDTH_KEY, String(w)); } catch {} }

let width = LEFT_MIN;
const docs = new Map(); // 문서 → { style, grips: [{ grip, panel }] }

function styleText(w) {
  // :root:root — 각 문서의 토큰 정의(:root)보다 앞서게. 그림 화면은 --shell-left-panel-size가 칸 폭 트랙이다.
  return `@media (min-width: ${NARROW + 1}px) { :root:root { --ds-panel-left: ${w}px; --shell-left-panel-size: ${w}px; } }
.shell-left-grip { position: fixed; z-index: 30; width: 8px; margin-left: -4px; cursor: col-resize; touch-action: none; outline: none; }
.shell-left-grip[hidden] { display: none; }
.shell-left-grip::after { content: ""; position: absolute; top: 0; bottom: 0; left: 3px; width: 2px; background: transparent; transition: background-color 120ms var(--ds-motion, ease); }
.shell-left-grip:hover::after, .shell-left-grip:focus-visible::after, .shell-left-grip.is-dragging::after { background: var(--ds-focus, #6ba4f8); }
html.shell-left-resizing, html.shell-left-resizing * { cursor: col-resize !important; user-select: none !important; }
html.shell-left-resizing iframe { pointer-events: none; }
@media (max-width: ${NARROW}px) { .shell-left-grip { display: none; } }`;
}

function placeGrips(entry) {
  const view = entry.style.ownerDocument.defaultView;
  const wide = (view?.innerWidth || 0) > NARROW;
  for (const { grip, panel } of entry.grips) {
    const r = panel.isConnected ? panel.getBoundingClientRect() : null;
    // 칸이 보이고 지금 폭으로 펼쳐져 있을 때만(접힘·없음 모드·좁은 띠에는 손잡이 없음)
    const show = wide && r && r.height > 0 && Math.abs(r.width - width) <= 2;
    if (grip.hidden !== !show) grip.hidden = !show; // 같은 값을 다시 넣지 않는다(감시가 다시 불려 끝없이 도는 것을 막음)
    if (!show) continue;
    grip.style.left = `${Math.round(r.right)}px`; grip.style.top = `${Math.round(r.top)}px`; grip.style.height = `${Math.round(r.height)}px`;
    grip.setAttribute('aria-valuenow', String(width));
  }
}

function applyAll() {
  for (const [doc, entry] of docs) {
    if (!doc.defaultView) { docs.delete(doc); continue; }
    entry.style.textContent = styleText(width);
  }
  // 폭 규칙이 그려진 다음 프레임에 손잡이 자리를 잡는다.
  requestAnimationFrame(() => { for (const entry of docs.values()) placeGrips(entry); });
}

export function setLeftWidth(value, { save = true } = {}) {
  width = clampLeftWidth(value);
  if (save) saveWidth(width);
  applyAll();
  return width;
}
export function getLeftWidth() { return width; }

function attachGrip(doc, entry, panel) {
  if (entry.grips.some(g => g.panel === panel)) return;
  const grip = doc.createElement('div');
  grip.className = 'shell-left-grip'; grip.hidden = true; grip.tabIndex = 0;
  grip.setAttribute('role', 'separator'); grip.setAttribute('aria-orientation', 'vertical');
  grip.setAttribute('aria-label', '왼쪽 칸 폭 — 끌어서 조절, 두 번 누르면 기본 폭');
  grip.setAttribute('aria-valuemin', String(LEFT_MIN)); grip.setAttribute('aria-valuemax', String(LEFT_MAX));
  grip.title = '끌어서 왼쪽 칸 폭 조절 · 두 번 누르면 기본 폭';
  let drag = null;
  grip.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag = { x: event.clientX, w: width };
    grip.setPointerCapture?.(event.pointerId); grip.classList.add('is-dragging');
    doc.documentElement.classList.add('shell-left-resizing');
  });
  grip.addEventListener('pointermove', event => {
    if (!drag) return;
    setLeftWidth(drag.w + event.clientX - drag.x, { save: false });
  });
  const end = event => {
    if (!drag) return;
    drag = null; grip.releasePointerCapture?.(event.pointerId); grip.classList.remove('is-dragging');
    doc.documentElement.classList.remove('shell-left-resizing');
    setLeftWidth(width);
  };
  grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
  grip.addEventListener('dblclick', () => setLeftWidth(LEFT_MIN));
  grip.addEventListener('keydown', event => {
    const d = event.key === 'ArrowLeft' ? -LEFT_STEP : event.key === 'ArrowRight' ? LEFT_STEP : 0;
    if (event.key === 'Home') { event.preventDefault(); setLeftWidth(LEFT_MIN); return; }
    if (!d) return;
    event.preventDefault(); setLeftWidth(width + d);
  });
  // 칸이 든 겹 화면(한글 작업 공간 등) 안에 둔다 — 그 화면이 덮으면 아래 앱의 손잡이도 같이 가려진다.
  (panel.parentElement?.closest('#rhwp-exam-workspace') || doc.body).append(grip);
  entry.grips.push({ grip, panel });
  const ro = new doc.defaultView.ResizeObserver(() => placeGrips(entry));
  ro.observe(panel); ro.observe(doc.documentElement);
}

// doc 안에서 selectors에 맞는 왼쪽 칸마다 손잡이를 단다. 칸이 나중에 생겨도 잡는다.
export function installLeftWidth(doc, selectors) {
  if (!doc?.documentElement) return;
  let entry = docs.get(doc);
  if (!entry) {
    const style = doc.createElement('style'); style.id = 'shell-left-width-style';
    (doc.head || doc.documentElement).append(style);
    entry = { style, grips: [] }; docs.set(doc, entry);
    doc.defaultView.addEventListener('resize', () => placeGrips(entry));
    // 접기·모드 바꾸기·화면 바꾸기는 class·hidden·data-*로 일어난다 → 그때 손잡이 자리를 다시 본다.
    let queued = false;
    new doc.defaultView.MutationObserver(records => {
      if (queued || records.every(r => r.target.classList?.contains('shell-left-grip'))) return; queued = true;
      requestAnimationFrame(() => { queued = false; for (const s of selectors) for (const p of doc.querySelectorAll(s)) attachGrip(doc, entry, p); placeGrips(entry); });
    }).observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'data-tool-mode'] });
  }
  entry.style.textContent = styleText(width);
  for (const s of selectors) for (const p of doc.querySelectorAll(s)) attachGrip(doc, entry, p);
  requestAnimationFrame(() => placeGrips(entry));
}

export function initShellLeftWidth(doc = document) {
  width = readWidth();
  installLeftWidth(doc, ['#panel-left', '#rhwp-exam-workspace .exam-sidebar']);
  // 출제 칸 iframe: 처음 열 때 생기고, 안 문서가 다 읽히면 그 문서에 넣는다.
  const hookFrame = frame => {
    if (frame.dataset.shellLeftWidth) return; frame.dataset.shellLeftWidth = '1';
    const install = () => { const d = frame.contentDocument; if (d?.body) installLeftWidth(d, ['.side']); };
    frame.addEventListener('load', install);
    if (frame.contentDocument?.readyState === 'complete') install();
  };
  const scan = () => doc.querySelectorAll('#exampool-sheet-workspace iframe').forEach(hookFrame);
  scan();
  new MutationObserver(scan).observe(doc.body, { childList: true });
  // 다른 탭에서 바꾼 폭도 따라간다.
  doc.defaultView.addEventListener('storage', event => { if (event.key === LEFT_WIDTH_KEY) setLeftWidth(event.newValue ?? LEFT_MIN, { save: false }); });
}
