// 5E 클립보드(11-14, 시안 clipboard-hub-1114 v4) — 옛 「서랍」(11-13)을 키운 것. 세 프로그램 어디서나 넣고 꺼내 쓰는 작업 중 보관함.
// 저장은 같은 출처의 IndexedDB 하나(옛 서랍과 같은 곳)라서, 서랍에 담아 둔 그림은 그대로 클립보드 항목이 된다(출처 「옛 서랍」).
// 바뀌면 BroadcastChannel로 알려 5E_image·5E_exam(iframe)·5E_hwp의 클립보드가 모두 다시 그린다.
// 항목: {id, src(그림 data:URL), name, w, h, at, kind(img·graph·eq·text·obj), source(5E_image·5E_exam·5E_hwp·라이브러리·밖에서), pinned, moving, objects?(5E 객체 원본), text?}
// moving = ⌘X로 넣은 것: 한 번 넣으면 클립보드에서 빠진다(옮기기). 고정하지 않은 것은 50개를 넘으면 오래된 것부터 빠진다.
export const DRAWER_MIME = 'application/x-5e-drawer';
export const CLIP_MIME = DRAWER_MIME;
const DB = 'fivee-drawer', STORE = 'items', LIMIT = 50;
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
// Node(검사)에서는 이 채널이 프로세스를 붙잡아 검사가 끝나지 않는다 — 브라우저엔 unref가 없어 그대로.
try { channel?.unref?.(); } catch {}
channel?.addEventListener('message', () => listeners.forEach(f => f()));
const changed = () => { listeners.forEach(f => f()); channel?.postMessage('change'); };
const KINDS = new Set(['img', 'graph', 'eq', 'text', 'obj']);
// 옛 서랍 항목(kind·source 없음)도 그대로 읽는다.
const norm = it => it && ({ ...it, kind: KINDS.has(it.kind) ? it.kind : 'img', source: it.source || '옛 서랍', pinned: !!it.pinned, moving: !!it.moving });

export async function clipList() { const all = await tx('readonly', s => s.getAll()); return (all || []).map(norm).sort((a, b) => b.at - a.at); }
export async function clipGet(id) { return norm(await tx('readonly', s => s.get(id))); }
export async function clipAdd({ src, name = '그림', w = 0, h = 0, kind = 'img', source = '5E', objects = null, text = null, moving = false, ref = null } = {}) {
  if (typeof src !== 'string' || !src.startsWith('data:image/')) throw new Error('클립보드에 넣을 그림이 없습니다.');
  const item = { id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, src, name: String(name || '그림').slice(0, 80), w: Math.round(w) || 0, h: Math.round(h) || 0,
    at: Date.now(), kind: KINDS.has(kind) ? kind : 'img', source: String(source).slice(0, 40), pinned: false, moving: !!moving };
  if (Array.isArray(objects) && objects.length) item.objects = objects;
  if (typeof text === 'string' && text) item.text = text.slice(0, 20000);
  if (typeof ref === 'string' && ref) item.ref = ref.slice(0, 40);
  // ⌘X는 하나만 「옮기는 중」으로 둔다 — 새로 잘라 내면 앞의 옮기는 중 표시는 보통 항목이 된다(원래 자리는 ⌘Z로 되돌린다).
  await tx('readwrite', s => s.put(item));
  const all = await clipList(), extra = all.filter(x => !x.pinned).slice(LIMIT);
  await tx('readwrite', s => { extra.forEach(x => s.delete(x.id)); if (moving) all.filter(x => x.moving && x.id !== item.id).forEach(x => s.put({ ...x, moving: false })); });
  changed(); return item;
}
export async function clipRemove(id) { await tx('readwrite', s => s.delete(id)); changed(); }
export async function clipRemoveMany(ids) { await tx('readwrite', s => ids.forEach(id => s.delete(id))); changed(); }
export async function clipPin(id, on) { const it = await clipGet(id); if (!it) return; await tx('readwrite', s => s.put({ ...it, pinned: on == null ? !it.pinned : !!on })); changed(); }
// 넣은 뒤 부른다: 잘라 낸(옮기는 중) 항목이면 클립보드에서 뺀다.
export async function clipConsume(id) { const it = await clipGet(id); if (it?.moving) await clipRemove(id); }
// ⌘X로 잘라 낸 5E 객체를 ⌘V로 붙였을 때: 같은 복사 표(ref)의 옮기는 중 항목을 뺀다.
export async function clipConsumeRef(ref) { if (!ref) return; const it = (await clipList()).find(x => x.ref === ref && x.moving); if (it) await clipRemove(it.id); }
export function onClipChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export const isClipDrag = dt => !!dt && [...(dt.types || [])].includes(CLIP_MIME);
export async function clipFromDrop(dt) { const id = dt?.getData(CLIP_MIME); return id ? clipGet(id) : null; }

// 옛 서랍 이름(받는 곳 코드가 그대로 쓴다).
export const drawerList = clipList, drawerGet = clipGet, drawerRemove = clipRemove, onDrawerChange = onClipChange;
export const drawerAdd = o => clipAdd({ source: '라이브러리', ...o });
export const isDrawerDrag = isClipDrag, drawerFromDrop = clipFromDrop;
