// 층: 라이브러리 창(10050) 위·공용 작업대(10140) 아래 — 작업대에서 고를 때는 작업대를 잠시 숨긴다.
// 5E 클립보드 화면(11-14, 시안 clipboard-hub-1114 v4): 오른쪽 서랍 + 가운데 「크게 보기」 + 고르기(가져오기 자리에서 「클립보드에서」).
// 원칙: AI로 처리할 것은 작업대, 그 밖에 옮기는 모든 것은 클립보드. 넣는 자리는 지금 화면이 정한다(hosts).
// ⇧⌘V(윈도우 Ctrl+Shift+V) 열기·한 번 더 = 크게 보기, Enter·두 번 누르기 = 넣기, Space = 한 장 크게, Delete = 빼기, Esc = 닫기.
import { registerEscapeLayer } from './escape-layers.js?v=1.7.0-four-session-integration';
import { clipList, clipAdd, clipRemove, clipRemoveMany, clipPin, clipConsume, onClipChange, CLIP_MIME } from './drawer.js?v=1114';

export const CLIP_ICON = '<svg class="clip-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.6 4.6H6.6a2.1 2.1 0 0 0-2.1 2.1v12.2a2.1 2.1 0 0 0 2.1 2.1h10.8a2.1 2.1 0 0 0 2.1-2.1V6.7a2.1 2.1 0 0 0-2.1-2.1h-2"/><rect x="8.6" y="2.8" width="6.8" height="3.6" rx="1.2"/><path d="M10.4 10.4v-.3c0-.5.4-.9.9-.9h4.4c.5 0 .9.4.9.9v3.6c0 .5-.4.9-.9.9h-.4"/><rect x="7.8" y="11.4" width="6.8" height="5.6" rx=".9"/><circle cx="9.9" cy="13.4" r=".75" fill="currentColor" stroke="none"/></svg>';
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
export const clipKey = mac => IS_MAC ? mac : mac.replace('⇧⌘', 'Ctrl+Shift+').replace('⌘', 'Ctrl+');
const OS_NAME = IS_MAC ? '맥' : '윈도우';
const PIN = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z"/><path d="M12 14v6"/></svg>';
const KIND = { img: '그림', graph: '그래프', eq: '수식', text: '글', obj: '5E 그림' };
const FOLLOW_KEY = 'fivee-clip-follow', SIG_KEY = 'fivee-clip-os-sig';
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { } } };
export const clipFollowOn = () => store.get(FOLLOW_KEY, '1') !== '0';
const E = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ago = t => { const m = Math.round((Date.now() - t) / 60000); if (m < 1) return '방금'; if (m < 60) return `${m}분 전`; const h = Math.round(m / 60); if (h < 24) return `${h}시간 전`; if (h < 48) return '어제'; const d = new Date(t); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const editable = t => !!t?.closest?.('input,textarea,select,[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]');
export const isOpenClipKey = e => (IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && e.shiftKey && !e.altKey && (e.code === 'KeyV' || e.key === 'V' || e.key === 'v');
const readAsDataUrl = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
const sizeOf = src => new Promise(res => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res([0, 0]); i.src = src; });
export async function clipAddFiles(files, source = '밖에서') {
  let n = 0;
  for (const f of [...files || []]) { if (!/^image\//.test(f.type)) continue; const src = await readAsDataUrl(f); const [w, h] = await sizeOf(src); await clipAdd({ src, name: (f.name || '그림').replace(/\.[a-z0-9]+$/i, ''), w, h, source }); n++; }
  return n;
}

const CSS = `
.clp{--c-bg:var(--ds-raise,#161b22);--c-panel:var(--ds-panel,#0d1117);--c-line:var(--ds-line,#30363d);--c-ink:var(--ds-ink,#e6edf3);--c-ink3:var(--ds-ink-3,#7d8590);--c-sel:var(--ds-selected,rgba(177,186,196,.12));--c-acc:#58a6ff;
  position:fixed;z-index:10100;top:var(--clp-top,56px);right:12px;bottom:12px;width:340px;max-width:calc(100vw - 24px);display:flex;flex-direction:column;border-radius:12px;background:var(--c-bg);border:1px solid var(--c-line);box-shadow:0 18px 44px rgba(0,0,0,.45);color:var(--c-ink);font:13px/1.4 -apple-system,'Apple SD Gothic Neo','Pretendard',sans-serif;
  opacity:0;visibility:hidden;transform:translateX(24px);pointer-events:none;transition:opacity .26s cubic-bezier(.32,.72,0,1),transform .32s cubic-bezier(.32,.72,0,1),visibility 0s linear .32s}
.clp.show{opacity:1;visibility:visible;transform:none;pointer-events:auto;transition-delay:0s}
.clp .clip-ico{width:16px;height:16px;flex:none}
.clp-h{display:flex;align-items:center;gap:6px;height:44px;padding:0 6px 0 12px;border-bottom:1px solid var(--c-line);flex:none}
.clp-h b{font-weight:600}.clp-h .clp-n{color:var(--c-ink3);font-size:12px;margin-right:auto}
.clp-ib{height:28px;min-width:28px;padding:0 8px;border:0;border-radius:7px;background:none;color:var(--c-ink3);cursor:pointer;font:inherit;font-size:12.5px;display:inline-flex;align-items:center;gap:4px}
.clp-ib:hover{background:var(--c-sel);color:var(--c-ink)}.clp-ib[aria-pressed=true]{background:var(--c-sel);color:var(--c-ink)}
.clp-menu{position:absolute;top:40px;right:8px;z-index:2;min-width:230px;padding:6px;border-radius:9px;background:var(--c-bg);border:1px solid var(--c-line);box-shadow:0 12px 30px rgba(0,0,0,.4)}
.clp-menu label{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;cursor:pointer}.clp-menu label:hover{background:var(--c-sel)}
.clp-menu small{display:block;padding:2px 8px 6px;color:var(--c-ink3);font-size:11.5px}
.clp-b{flex:1;min-height:0;overflow:auto;padding:6px 8px 8px;outline:none}
.clp-g{padding:8px 6px 4px;color:var(--c-ink3);font-size:11.5px}
.clp-i{position:relative;display:flex;gap:10px;align-items:center;padding:6px;border-radius:9px;cursor:pointer;outline:none}
.clp-i:hover{background:var(--c-sel)}.clp-i[aria-selected=true]{background:var(--c-sel);box-shadow:inset 0 0 0 1px var(--c-acc)}
.clp-t{flex:none;width:64px;height:48px;border-radius:6px;background:#fff;display:grid;place-items:center;overflow:hidden;box-shadow:0 0 0 1px var(--c-line)}
.clp-t img{max-width:100%;max-height:100%;pointer-events:none}
.clp-m{flex:1;min-width:0}.clp-m b{display:block;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.clp-m span{display:flex;gap:6px;align-items:center;margin-top:3px;color:var(--c-ink3);font-size:11.5px;white-space:nowrap;overflow:hidden}
.clp-k{padding:0 6px;border-radius:4px;background:var(--c-sel);color:var(--c-ink);font-size:11px;line-height:18px}
.clp-mv{padding:0 6px;border-radius:4px;background:rgba(210,153,34,.18);color:#d29922;font-size:11px;line-height:18px}
.clp-a{display:flex;flex-direction:column;gap:2px;opacity:0;transition:opacity .12s}.clp-i:hover .clp-a,.clp-i[aria-selected=true] .clp-a,.clp-a .on{opacity:1}
.clp-a button{display:grid;place-items:center;width:24px;height:22px;border:0;border-radius:5px;background:none;color:var(--c-ink3);cursor:pointer;font-size:12px}.clp-a button:hover{background:var(--c-sel);color:var(--c-ink)}
.clp-a button.on{color:var(--c-acc)}
.clp-e{padding:28px 14px;color:var(--c-ink3);font-size:12.5px;line-height:1.7;text-align:center}
.clp-f{flex:none;border-top:1px solid var(--c-line);padding:10px}
.clp-go{width:100%;height:34px;border:0;border-radius:8px;background:#1f6feb;color:#fff;font:inherit;font-weight:600;cursor:pointer}
.clp-go:disabled{background:var(--c-sel);color:var(--c-ink3);cursor:default;font-weight:500}
.clp-f p{margin:7px 2px 0;color:var(--c-ink3);font-size:11.5px;line-height:1.5}
.clp.drop,.clpb.drop .clpb-p{box-shadow:0 0 0 2px var(--c-acc),0 18px 44px rgba(0,0,0,.45)}
.clpb{position:fixed;inset:0;z-index:10120;display:grid;place-items:center;background:rgba(1,4,9,.55);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .22s cubic-bezier(.32,.72,0,1),visibility 0s linear .22s;font:13px/1.4 -apple-system,'Apple SD Gothic Neo','Pretendard',sans-serif}
.clpb.show{opacity:1;visibility:visible;pointer-events:auto;transition-delay:0s}
.clpb-p{--c-bg:var(--ds-raise,#161b22);--c-line:var(--ds-line,#30363d);--c-ink:var(--ds-ink,#e6edf3);--c-ink3:var(--ds-ink-3,#7d8590);--c-sel:var(--ds-selected,rgba(177,186,196,.12));--c-acc:#58a6ff;
  width:min(1240px,94vw);height:min(860px,88vh);display:flex;flex-direction:column;border-radius:14px;background:var(--c-bg);border:1px solid var(--c-line);box-shadow:0 30px 80px rgba(0,0,0,.55);color:var(--c-ink);transform:scale(.97);transition:transform .32s cubic-bezier(.32,.72,0,1)}
.clpb.show .clpb-p{transform:none}
.clpb-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 12px 10px 16px;border-bottom:1px solid var(--c-line)}
.clpb-h b{font-weight:600;font-size:14px;margin-right:6px}
.clpb-q{height:30px;width:200px;padding:0 10px;border-radius:7px;border:1px solid var(--c-line);background:transparent;color:var(--c-ink);font:inherit}
.clpb-c{height:28px;padding:0 10px;border-radius:7px;border:0;background:none;color:var(--c-ink3);cursor:pointer;font:inherit;font-size:12.5px}
.clpb-c:hover{color:var(--c-ink);background:var(--c-sel)}.clpb-c[aria-pressed=true]{background:var(--c-sel);color:var(--c-ink)}
.clpb-sp{flex:1}
.clpb-g{outline:none;flex:1;min-height:0;overflow:auto;padding:14px 16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));grid-auto-rows:max-content;gap:14px}
.clpb-i{position:relative;border-radius:10px;padding:8px;cursor:pointer;outline:none}
.clpb-i:hover{background:var(--c-sel)}.clpb-i[aria-selected=true]{background:var(--c-sel);box-shadow:inset 0 0 0 1.5px var(--c-acc)}
.clpb-i .clpb-t{height:150px;border-radius:7px;background:#fff;display:grid;place-items:center;overflow:hidden;box-shadow:0 0 0 1px var(--c-line)}
.clpb-i .clpb-t img{max-width:100%;max-height:100%;pointer-events:none}
.clpb-i b{display:block;margin-top:7px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.clpb-i span{display:flex;gap:6px;align-items:center;margin-top:3px;color:var(--c-ink3);font-size:11.5px;white-space:nowrap;overflow:hidden}
.clpb-x{position:absolute;top:13px;left:13px;width:18px;height:18px;border-radius:5px;border:1.5px solid #8b949e;background:rgba(255,255,255,.9);display:grid;place-items:center;font-size:12px;color:#fff}
.clpb-i[aria-selected=true] .clpb-x{background:#1f6feb;border-color:#1f6feb}
.clpb-pin{position:absolute;top:12px;right:12px;font-size:12px;color:var(--c-acc)}
.clpb-e{grid-column:1/-1;padding:60px 0;text-align:center;color:var(--c-ink3)}
.clpb-f{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid var(--c-line)}
.clpb-f .clpb-n{color:var(--c-ink3);margin-right:auto}
.clpb-go{height:32px;padding:0 16px;border:0;border-radius:8px;background:#1f6feb;color:#fff;font:inherit;font-weight:600;cursor:pointer}.clpb-go:disabled{background:var(--c-sel);color:var(--c-ink3);cursor:default}
.clpb-one{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(1,4,9,.82);z-index:2}
.clpb-one.show{display:flex}.clpb-one img{max-width:86vw;max-height:76vh;background:#fff;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.clpb-one p{color:#e6edf3;margin:0}
.clp-toast{position:fixed;z-index:10200;left:50%;bottom:28px;transform:translate(-50%,8px);opacity:0;padding:9px 14px;border-radius:9px;background:#161b22;color:#e6edf3;border:1px solid #30363d;box-shadow:0 12px 30px rgba(0,0,0,.4);font:13px -apple-system,'Apple SD Gothic Neo',sans-serif;transition:opacity .2s,transform .28s cubic-bezier(.32,.72,0,1);pointer-events:none}
.clp-toast.show{opacity:1;transform:translate(-50%,0)}
:root[data-mode="lite"] .clp,:root[data-mode="lite"] .clpb-p{--c-bg:#fff;--c-line:#d8dee4;--c-ink:#1f2328;--c-ink3:#656d76;--c-sel:rgba(9,105,218,.08)}
@media (prefers-reduced-motion:reduce){.clp,.clpb,.clpb-p,.clp-toast{transition:none}}
`;

// 지금 화면이 받는 자리. hosts는 [{active(), label, accepts?(item), insert(item)}] — 앞의 것부터 active()인 것 하나를 쓴다.
export function mountClipboard(doc = document, { hosts = [], top, onToggle, followOS = null, title = '클립보드' } = {}) {
  if (!doc.getElementById('clp-style')) { const st = doc.createElement('style'); st.id = 'clp-style'; st.textContent = CSS; doc.head.appendChild(st); }
  const el = doc.createElement('aside'); el.className = 'clp'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', title); el.tabIndex = -1;
  if (top != null) el.style.setProperty('--clp-top', typeof top === 'number' ? `${top}px` : top);
  el.innerHTML = `<div class="clp-h">${CLIP_ICON}<b>${E(title)}</b><span class="clp-n"></span>
    <button type="button" class="clp-ib" data-clp="big" title="크게 보기 (${clipKey('⇧⌘V')} 한 번 더)">크게 보기</button>
    ${followOS ? `<button type="button" class="clp-ib" data-clp="menu" aria-haspopup="true" aria-expanded="false" title="클립보드 설정" aria-label="클립보드 설정">⋯</button>` : ''}
    <button type="button" class="clp-ib" data-clp="close" title="닫기 (Esc)" aria-label="닫기">×</button></div>
    ${followOS ? `<div class="clp-menu" hidden><label><input type="checkbox" data-clp="follow"> ${OS_NAME} 클립보드 따라 넣기</label><small>밖에서 캡처·복사한 그림을 5E로 돌아올 때 맨 위에 「밖에서 · 캡처」로 넣습니다.</small></div>` : ''}
    <div class="clp-b" role="listbox" aria-label="클립보드 항목" tabindex="0"></div>
    <div class="clp-f"><button type="button" class="clp-go" data-clp="go" disabled>넣기</button><p>끌어서 놓아도 됩니다 · 그림 파일을 여기로 끌어 오면 넣어 둡니다 · 고정하지 않은 것은 50개를 넘으면 오래된 것부터 빠집니다</p></div>`;
  doc.body.appendChild(el);
  const big = doc.createElement('div'); big.className = 'clpb'; big.setAttribute('role', 'dialog'); big.setAttribute('aria-label', `${title} 크게 보기`);
  big.innerHTML = `<section class="clpb-p"><div class="clpb-h"><b>${E(title)} · 크게 보기</b><input class="clpb-q" type="search" placeholder="이름·출처 찾기" aria-label="이름·출처 찾기">
    <span class="clpb-kinds"></span><span class="clpb-srcs"></span><span class="clpb-sp"></span>
    <button type="button" class="clpb-c" data-clpb="side" title="옆 서랍으로 (Esc)">옆 서랍으로</button><button type="button" class="clpb-c" data-clpb="close" aria-label="닫기">×</button></div>
    <div class="clpb-g" role="listbox" aria-multiselectable="true" tabindex="0"></div>
    <div class="clpb-f"><span class="clpb-n"></span><button type="button" class="clpb-c" data-clpb="pin">고정</button><button type="button" class="clpb-c" data-clpb="del">빼기</button><button type="button" class="clpb-c" data-clpb="clear">고르기 풀기</button><button type="button" class="clpb-go" data-clpb="go" disabled>넣기</button></div>
    <div class="clpb-one" aria-hidden="true"><img alt=""><p></p></div></section>`;
  doc.body.appendChild(big);
  const toast = doc.createElement('div'); toast.className = 'clp-toast'; toast.setAttribute('role', 'status'); doc.body.appendChild(toast);
  const body = el.querySelector('.clp-b'), grid = big.querySelector('.clpb-g'), one = big.querySelector('.clpb-one');
  let open = false, bigOn = false, items = [], sel = null, multi = new Set(), filters = { kind: '', src: '', q: '' }, picking = null, oneIdx = -1;
  const host = () => hosts.find(h => { try { return h.active(); } catch { return false; } }) || null;
  const say = (msg, ms = 2400) => { toast.textContent = msg; toast.classList.add('show'); clearTimeout(say.t); say.t = setTimeout(() => toast.classList.remove('show'), ms); };
  const meta = it => `<span class="clp-k">${E(KIND[it.kind] || '그림')}</span>${it.moving ? '<span class="clp-mv" title="잘라 낸 것 — 한 번 넣으면 클립보드에서 빠집니다">옮기는 중</span>' : ''}<span>${E(it.source === '밖에서' ? '밖에서' : it.source)} · ${ago(it.at)}</span>`;
  const row = it => `<div class="clp-i" role="option" draggable="true" tabindex="-1" data-clp-id="${E(it.id)}" aria-selected="${sel === it.id}" title="${E(it.name)} — 두 번 누르면 넣기, 끌어서 놓기"><div class="clp-t"><img src="${E(it.src)}" alt=""></div><div class="clp-m"><b>${E(it.name)}</b><span>${meta(it)}</span></div><div class="clp-a"><button type="button" data-clp-pin class="${it.pinned ? 'on' : ''}" title="${it.pinned ? '고정 풀기' : '고정 — 50개 규칙에서 빠지지 않음'}" aria-label="고정">${PIN}</button><button type="button" data-clp-del title="빼기 (Delete)" aria-label="빼기">×</button></div></div>`;
  async function load() { try { items = await clipList(); } catch { items = []; } if (sel && !items.some(i => i.id === sel)) sel = null; for (const id of [...multi]) if (!items.some(i => i.id === id)) multi.delete(id); }
  function drawSide() {
    el.querySelector('.clp-n').textContent = `${items.length}개${items.some(i => i.pinned) ? ` · 고정 ${items.filter(i => i.pinned).length}` : ''}`;
    const pinned = items.filter(i => i.pinned), rest = items.filter(i => !i.pinned);
    body.innerHTML = items.length ? `${pinned.length ? `<div class="clp-g">고정</div>${pinned.map(row).join('')}` : ''}${rest.length ? `<div class="clp-g">최근 · ${clipKey('⌘V')}는 맨 위 것</div>${rest.map(row).join('')}` : ''}`
      : `<div class="clp-e">비어 있음<br>객체를 고르고 ${clipKey('⌘C')}(복사)·${clipKey('⌘X')}(잘라내기)로 넣거나,<br>라이브러리에서 「클립보드에 넣기」, 그림 파일을 여기로 끌어 오세요.</div>`;
    const h = host(), it = items.find(i => i.id === sel), go = el.querySelector('[data-clp="go"]');
    go.disabled = !h || !it || (h.accepts && !h.accepts(it));
    go.textContent = picking ? '고르기' : h ? `넣기 · ${h.label}` : '넣기';
    go.title = !h ? '지금 화면에는 넣을 자리가 없습니다 — 끌어서 원하는 칸에 놓거나, 넣을 화면을 연 뒤 넣기' : 'Enter · 두 번 누르기';
  }
  const visible = () => items.filter(i => (!filters.kind || i.kind === filters.kind) && (!filters.src || i.source === filters.src) && (!filters.q || `${i.name} ${i.source}`.toLowerCase().includes(filters.q.toLowerCase())) && (!picking?.kinds || picking.kinds.includes(i.kind)));
  function drawBig() {
    const kinds = [...new Set(items.map(i => i.kind))], srcs = [...new Set(items.map(i => i.source))];
    big.querySelector('.clpb-kinds').innerHTML = `<button type="button" class="clpb-c" data-clpb-kind="" aria-pressed="${!filters.kind}">전체</button>${kinds.map(k => `<button type="button" class="clpb-c" data-clpb-kind="${k}" aria-pressed="${filters.kind === k}">${E(KIND[k] || k)}</button>`).join('')}`;
    big.querySelector('.clpb-srcs').innerHTML = srcs.length > 1 ? `<button type="button" class="clpb-c" data-clpb-src="" aria-pressed="${!filters.src}">모든 출처</button>${srcs.map(s => `<button type="button" class="clpb-c" data-clpb-src="${E(s)}" aria-pressed="${filters.src === s}">${E(s)}</button>`).join('')}` : '';
    const list = visible();
    grid.innerHTML = list.length ? list.map(it => `<div class="clpb-i" role="option" draggable="true" tabindex="-1" data-clp-id="${E(it.id)}" aria-selected="${multi.has(it.id)}" title="${E(it.name)} — ⌘·⇧ 누르기로 여러 개, Space 한 장 크게"><div class="clpb-t"><img src="${E(it.src)}" alt=""></div><span class="clpb-x">${multi.has(it.id) ? '✓' : ''}</span>${it.pinned ? `<span class="clpb-pin">${PIN}</span>` : ''}<b>${E(it.name)}</b><span>${meta(it)}</span></div>`).join('')
      : `<div class="clpb-e">${items.length ? '조건에 맞는 항목이 없습니다' : '비어 있음 — 그림 파일을 여기로 끌어 오면 넣어 둡니다'}</div>`;
    const h = host(), chosen = items.filter(i => multi.has(i.id)), go = big.querySelector('[data-clpb="go"]');
    big.querySelector('.clpb-n').textContent = chosen.length ? `${chosen.length}개 고름` : `${list.length}개`;
    go.textContent = picking ? (picking.label || '고르기') : h ? `넣기 · ${h.label}` : '넣기';
    go.disabled = !chosen.length || (!picking && (!h || (h.accepts && chosen.some(i => !h.accepts(i)))));
    for (const k of ['pin', 'del', 'clear']) big.querySelector(`[data-clpb="${k}"]`).disabled = !chosen.length;
  }
  async function refresh() { await load(); if (open) drawSide(); if (bigOn) drawBig(); onCount?.(items.length); }
  let onCount = null;
  onClipChange(() => void refresh());
  async function insert(list) {
    if (picking) { const p = picking; picking = null; closeBig(); p.resolve(list); return; }
    const h = host(); if (!h) { say('지금 화면에는 넣을 자리가 없습니다 — 원하는 칸으로 끌어 놓으세요'); return; }
    let done = 0;
    for (const it of list) { if (h.accepts && !h.accepts(it)) continue; try { await h.insert(it); done++; await clipConsume(it.id); } catch (e) { say(e?.message || '넣지 못했습니다'); return; } }
    if (done) say(`${h.label.replace(/에 넣기$/, '')}에 넣었습니다 · ${clipKey('⌘Z')}로 되돌리기`);
  }
  function set(v) { open = v; el.classList.toggle('show', v); if (v) { void refresh(); requestAnimationFrame(() => body.focus({ preventScroll: true })); void followOS?.(); } onToggle?.(v); }
  function openBig({ pick = null } = {}) { picking = pick; multi.clear(); if (pick) filters = { kind: '', src: '', q: '' }; bigOn = true; big.classList.add('show'); void refresh(); requestAnimationFrame(() => grid.focus({ preventScroll: true })); if (!pick) void followOS?.(); }
  function closeBig() { bigOn = false; big.classList.remove('show'); one.classList.remove('show'); oneIdx = -1; if (picking) { const p = picking; picking = null; p.resolve([]); } }
  function showOne(i) { const list = visible(); if (!list.length) return; oneIdx = (i + list.length) % list.length; const it = list[oneIdx]; one.querySelector('img').src = it.src; one.querySelector('p').textContent = `${it.name} · ${KIND[it.kind] || '그림'} · ${it.source} — ← → 넘기기 · Esc 돌아가기`; one.classList.add('show'); }
  // 서랍: 고르기·넣기·고정·빼기·끌기
  body.addEventListener('click', e => { const r = e.target.closest('.clp-i'); if (!r) return; const id = r.dataset.clpId;
    if (e.target.closest('[data-clp-pin]')) { void clipPin(id); return; } if (e.target.closest('[data-clp-del]')) { void clipRemove(id); return; }
    sel = id; drawSide(); });
  body.addEventListener('dblclick', e => { const r = e.target.closest('.clp-i'); if (!r || e.target.closest('button')) return; const it = items.find(i => i.id === r.dataset.clpId); if (it) void insert([it]); });
  const dragStart = e => { const r = e.target.closest?.('[data-clp-id]'); if (!r) return; e.dataTransfer.setData(CLIP_MIME, r.dataset.clpId); e.dataTransfer.effectAllowed = 'copy'; const img = r.querySelector('img'); if (img) e.dataTransfer.setDragImage(img, 20, 20); };
  body.addEventListener('dragstart', dragStart); grid.addEventListener('dragstart', dragStart);
  el.addEventListener('click', e => { const b = e.target.closest('[data-clp]'); if (!b) return; const k = b.dataset.clp;
    if (k === 'close') set(false); else if (k === 'big') openBig(); else if (k === 'go') { const it = items.find(i => i.id === sel); if (it) void insert([it]); }
    else if (k === 'menu') { const m = el.querySelector('.clp-menu'); m.hidden = !m.hidden; b.setAttribute('aria-expanded', String(!m.hidden)); m.querySelector('[data-clp="follow"]').checked = clipFollowOn(); } });
  el.querySelector('[data-clp="follow"]')?.addEventListener('change', e => { store.set(FOLLOW_KEY, e.target.checked ? '1' : '0'); say(e.target.checked ? `${OS_NAME} 클립보드 그림을 따라 넣습니다` : `${OS_NAME} 클립보드는 따라 넣지 않습니다`); if (e.target.checked) void followOS?.(); });
  // 파일 끌어 놓기(서랍·크게 보기)
  const dropZone = (zone, mark) => { zone.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); mark.classList.add('drop'); } });
    zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) mark.classList.remove('drop'); });
    zone.addEventListener('drop', async e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); mark.classList.remove('drop'); const n = await clipAddFiles(e.dataTransfer.files); say(n ? `그림 ${n}개를 클립보드에 넣었습니다` : '그림 파일만 넣을 수 있습니다'); }); };
  dropZone(el, el); dropZone(big.querySelector('.clpb-p'), big);
  // 크게 보기
  big.addEventListener('click', e => { if (e.target === big) { closeBig(); return; }
    const kb = e.target.closest('[data-clpb-kind]'); if (kb) { filters.kind = kb.dataset.clpbKind; drawBig(); return; }
    const sb = e.target.closest('[data-clpb-src]'); if (sb) { filters.src = sb.dataset.clpbSrc; drawBig(); return; }
    const b = e.target.closest('[data-clpb]'); if (b) { const k = b.dataset.clpb, chosen = items.filter(i => multi.has(i.id));
      if (k === 'close') { closeBig(); set(false); } else if (k === 'side') { closeBig(); set(true); } else if (k === 'go') void insert(chosen);
      else if (k === 'pin') { chosen.forEach(i => void clipPin(i.id, !chosen.every(x => x.pinned))); } else if (k === 'del') { void clipRemoveMany(chosen.map(i => i.id)); multi.clear(); } else if (k === 'clear') { multi.clear(); drawBig(); } return; }
    if (e.target.closest('.clpb-one')) { one.classList.remove('show'); return; }
    const card = e.target.closest('.clpb-i'); if (!card) return; const id = card.dataset.clpId;
    if (picking && !picking.multiple) { multi.clear(); multi.add(id); }
    else if (e.metaKey || e.ctrlKey || e.shiftKey || e.target.closest('.clpb-x')) { multi.has(id) ? multi.delete(id) : multi.add(id); }
    else { const only = multi.size === 1 && multi.has(id); multi.clear(); if (!only) multi.add(id); }
    drawBig(); });
  big.addEventListener('dblclick', e => { const card = e.target.closest('.clpb-i'); if (!card) return; const it = items.find(i => i.id === card.dataset.clpId); if (it) void insert([it]); });
  big.querySelector('.clpb-q').addEventListener('input', e => { filters.q = e.target.value.trim(); drawBig(); });
  // 열쇠: ⇧⌘V 열기·한 번 더 = 크게 보기, 서랍·크게 보기 안 움직임
  doc.addEventListener('keydown', e => {
    if (isOpenClipKey(e)) { if (editable(e.target) && !el.contains(e.target) && !big.contains(e.target)) return; e.preventDefault(); e.stopPropagation();
      if (bigOn) { closeBig(); set(true); } else if (open) { set(false); openBig(); } else set(true); return; }
    if (bigOn) {
      if (e.target.closest?.('.clpb-q')) { if (e.key === 'Escape') { e.preventDefault(); e.target.blur(); } return; }
      if (one.classList.contains('show')) { if (e.key === 'Escape' || e.key === ' ') { e.preventDefault(); one.classList.remove('show'); } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); showOne(oneIdx + (e.key === 'ArrowRight' ? 1 : -1)); } return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const p = picking; closeBig(); if (!p) set(true); return; }
      const list = visible(), first = [...multi][0], i = Math.max(0, list.findIndex(x => x.id === first));
      if (e.key === ' ') { e.preventDefault(); showOne(i); return; }
      if (e.key === 'Enter') { e.preventDefault(); const chosen = items.filter(x => multi.has(x.id)); if (chosen.length) void insert(chosen); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (multi.size) { void clipRemoveMany([...multi]); multi.clear(); } return; }
      if (/^Arrow/.test(e.key) && list.length) { e.preventDefault(); const cols = Math.max(1, Math.floor(grid.clientWidth / 214)); const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key]; const n = list[Math.min(list.length - 1, Math.max(0, i + d))]; multi.clear(); multi.add(n.id); drawBig(); grid.querySelector(`[data-clp-id="${CSS.escape(n.id)}"]`)?.scrollIntoView({ block: 'nearest' }); }
      return; }
    if (!open || !(el.contains(e.target) || e.target === doc.body)) return;
    if (e.key === 'Escape') { e.preventDefault(); set(false); return; }
    const i = items.findIndex(x => x.id === sel);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const pinned = items.filter(x => x.pinned), order = [...pinned, ...items.filter(x => !x.pinned)]; const j = order.findIndex(x => x.id === sel); const n = order[Math.min(order.length - 1, Math.max(0, j + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) { sel = n.id; drawSide(); body.querySelector(`[data-clp-id="${CSS.escape(n.id)}"]`)?.scrollIntoView({ block: 'nearest' }); } return; }
    if (i < 0) return; const it = items[i];
    if (e.key === 'Enter') { e.preventDefault(); void insert([it]); } else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); void clipRemove(it.id); } else if (e.key === ' ') { e.preventDefault(); openBig(); multi.add(it.id); showOne(visible().findIndex(x => x.id === it.id)); }
  }, true);
  // 공통 Esc 처리기(escape-layers)가 「닫기」 단추를 대신 누르지 않게 직접 등록: 크게 보기 Esc = 옆 서랍으로(고르기 중이면 그냥 닫기), 서랍 Esc = 닫기.
  registerEscapeLayer(big, () => { if (!bigOn) { if (open) set(false); return; } if (one.classList.contains('show')) { one.classList.remove('show'); return; } const p = picking; closeBig(); if (!p) set(true); });
  registerEscapeLayer(el, () => { if (bigOn) { closeBig(); if (!picking) set(true); return; } set(false); });// 사라지는 중(0.2초)에 또 누른 Esc도 지금 상태대로
  void refresh();
  return {
    open: () => set(true), close: () => set(false), toggle: () => set(!open), isOpen: () => open, openBig, el, say,
    // 가져오기 자리의 「클립보드에서」: 크게 보기를 고르기 모드로 열어 고른 항목을 돌려준다.
    pick: ({ kinds = ['img', 'graph', 'obj'], multiple = false, label = '고르기' } = {}) => new Promise(resolve => { if (open) set(false); openBig({ pick: { kinds, multiple, label, resolve } }); }),
    onCount: fn => { onCount = fn; fn(items.length); }, refresh,
  };
}

// 설치판: 5E로 돌아올 때 맥·윈도우 클립보드의 그림을 「밖에서 · 캡처」로 넣는다(켜고 끄기). 같은 그림은 한 번만.
export function makeOSFollower(readImage) {
  if (typeof readImage !== 'function') return null;
  let busy = false;
  return async ({ force = false } = {}) => {
    if (busy || (!force && !clipFollowOn())) return; busy = true;
    try { const r = await readImage(); if (!r?.dataUrl || !r.sig) return; const seen = store.get(SIG_KEY, ''); if (r.sig === seen) return; store.set(SIG_KEY, r.sig);
      if (r.own) return; await clipAdd({ src: r.dataUrl, name: '밖에서 · 캡처', w: r.width || 0, h: r.height || 0, source: '밖에서' }); }
    catch { } finally { busy = false; }
  };
}
// 5E가 맥 클립보드에 그림을 쓴 직후 부른다 — 우리가 쓴 그림을 「밖에서」로 다시 넣지 않게 서명만 기억한다.
export function markOSClipboardOwn(sig) { if (sig) store.set(SIG_KEY, sig); }
