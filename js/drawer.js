// 서랍(11-13): 라이브러리에서 고른 그림을 담아 두고, 세 프로그램(5E_image·5E_exam·아이디어 판) 어디서나 끌어다 쓴다.
// 담은 그림은 같은 출처의 IndexedDB 하나에 두므로 5E_exam(iframe)과 5E_image가 같은 내용을 본다.
// 바뀌면 BroadcastChannel로 알려 열려 있는 서랍이 모두 다시 그린다.
export const DRAWER_MIME = 'application/x-5e-drawer';
const DB = 'fivee-drawer', STORE = 'items', LIMIT = 60;
let dbp = null;
const db = () => dbp || (dbp = new Promise((resolve, reject) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
  r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
}));
const tx = async (mode, fn) => { const d = await db(); return new Promise((resolve, reject) => {
  const t = d.transaction(STORE, mode), s = t.objectStore(STORE); const out = fn(s);
  t.oncomplete = () => resolve(out?.result ?? out); t.onerror = () => reject(t.error);
}); };
const listeners = new Set();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('5e-drawer') : null;
channel?.addEventListener('message', () => listeners.forEach(f => f()));
const changed = () => { listeners.forEach(f => f()); channel?.postMessage('change'); };

export async function drawerList() { const all = await tx('readonly', s => s.getAll()); return (all || []).sort((a, b) => b.at - a.at); }
export async function drawerGet(id) { return tx('readonly', s => s.get(id)); }
export async function drawerAdd({ src, name = '그림', w = 0, h = 0 }) {
  if (typeof src !== 'string' || !src.startsWith('data:image/')) throw new Error('서랍에 담을 그림이 없습니다.');
  const item = { id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, src, name: String(name).slice(0, 80), w, h, at: Date.now() };
  await tx('readwrite', s => s.put(item));
  const all = await drawerList(); if (all.length > LIMIT) await tx('readwrite', s => all.slice(LIMIT).forEach(x => s.delete(x.id)));
  changed(); return item;
}
export async function drawerRemove(id) { await tx('readwrite', s => s.delete(id)); changed(); }
export function onDrawerChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
// 끌어 놓은 것이 서랍 그림이면 그 그림을, 아니면 null.
export const isDrawerDrag = dt => !!dt && [...(dt.types || [])].includes(DRAWER_MIME);
export async function drawerFromDrop(dt) { const id = dt?.getData(DRAWER_MIME); return id ? drawerGet(id) : null; }

const CSS = `
.dw{position:fixed;z-index:9000;left:var(--dw-left,64px);bottom:16px;width:min(560px,calc(100vw - 96px));border-radius:12px;background:#0d1117;border:1px solid #30363d;box-shadow:0 14px 36px rgba(0,0,0,.5);color:#e6edf3;font:13px/1.4 -apple-system,'Apple SD Gothic Neo','Pretendard Variable',sans-serif;opacity:0;transform:translateY(8px);pointer-events:none;transition:opacity .14s ease,transform .14s ease}
.dw.show{opacity:1;transform:none;pointer-events:auto}
.dw-h{display:flex;align-items:center;gap:8px;height:38px;padding:0 6px 0 12px;border-bottom:1px solid #21262d}
.dw-h b{font-weight:600}.dw-h span{color:#7d8590;font-size:12px}.dw-h .dw-n{margin-left:auto;color:#7d8590;font-size:12px}
.dw-x{width:28px;height:28px;border:0;border-radius:7px;background:none;color:#b1bac4;cursor:pointer;font-size:15px}.dw-x:hover{background:rgba(177,186,196,.08);color:#e6edf3}
.dw-b{display:flex;gap:10px;padding:10px 12px 12px;overflow-x:auto;min-height:104px;align-items:flex-start}
.dw-e{align-self:center;color:#7d8590;font-size:12px}
.dw-c{position:relative;flex:none;width:120px;height:84px;border-radius:8px;background:#fff;display:grid;place-items:center;cursor:grab;box-shadow:0 0 0 1px #30363d;overflow:hidden}
.dw-c img{max-width:100%;max-height:100%;pointer-events:none}
.dw-c small{position:absolute;left:0;right:0;bottom:0;padding:2px 6px;background:rgba(13,17,23,.78);color:#e6edf3;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dw-c .dw-del{position:absolute;top:4px;right:4px;width:20px;height:20px;border:0;border-radius:10px;background:rgba(13,17,23,.82);color:#fff;font-size:12px;line-height:20px;cursor:pointer;opacity:0;transition:opacity .12s}
.dw-c:hover .dw-del,.dw-c:focus-within .dw-del{opacity:1}
`;
// 서랍 띠: host 문서의 화면 아래에 뜨는 판. toggle()/open()/close(). 그림 칸은 끌 수 있다(DRAWER_MIME = 그림 id).
export function mountDrawer(doc = document, { left, onToggle } = {}) {
  if (!doc.getElementById('dw-style')) { const st = doc.createElement('style'); st.id = 'dw-style'; st.textContent = CSS; doc.head.appendChild(st); }
  const el = doc.createElement('div'); el.className = 'dw'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '서랍');
  if (left) el.style.setProperty('--dw-left', left);
  el.innerHTML = `<div class="dw-h"><b>서랍</b><span>끌어서 자료 칸·판·캔버스에 놓습니다</span><span class="dw-n"></span><button type="button" class="dw-x" title="서랍 닫기" aria-label="서랍 닫기">×</button></div><div class="dw-b"></div>`;
  doc.body.appendChild(el);
  const body = el.querySelector('.dw-b'), E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let open = false;
  async function draw() {
    let items = []; try { items = await drawerList(); } catch { }
    el.querySelector('.dw-n').textContent = `${items.length}개`;
    body.innerHTML = items.length ? items.map(i => `<div class="dw-c" draggable="true" data-dw="${E(i.id)}" title="${E(i.name)} — 끌어서 놓기"><img src="${E(i.src)}" alt=""><small>${E(i.name)}</small><button type="button" class="dw-del" data-dwdel="${E(i.id)}" title="서랍에서 빼기" aria-label="서랍에서 빼기">×</button></div>`).join('')
      : '<span class="dw-e">비어 있음 — 라이브러리에서 영역을 고르고 「서랍에 담기」</span>';
  }
  body.addEventListener('dragstart', e => { const c = e.target.closest?.('.dw-c'); if (!c) return; e.dataTransfer.setData(DRAWER_MIME, c.dataset.dw); e.dataTransfer.effectAllowed = 'copy'; const img = c.querySelector('img'); if (img) e.dataTransfer.setDragImage(img, 30, 20); });
  body.addEventListener('click', e => { const d = e.target.closest?.('[data-dwdel]'); if (d) void drawerRemove(d.dataset.dwdel); });
  el.querySelector('.dw-x').onclick = () => set(false);
  doc.addEventListener('keydown', e => { if (open && e.key === 'Escape' && !e.defaultPrevented) { set(false); } });
  onDrawerChange(() => { if (open) void draw(); });
  function set(v) { open = v; el.classList.toggle('show', v); if (v) void draw(); onToggle?.(v); }
  return { open: () => set(true), close: () => set(false), toggle: () => set(!open), isOpen: () => open, el };
}
