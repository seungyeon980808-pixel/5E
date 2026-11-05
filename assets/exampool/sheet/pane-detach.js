// 5E_exam 카드 화면 칸 분리(11-05 사용자): 「참고 자료」(왼쪽)·「문항 카드」(가운데)·「조건」 창을 앱 밖 별도 창으로 떼어 쓴다.
//  · 칸 머리줄의 [분리 ↗]로 떼고, 떼어 낸 창의 [합치기 ↙]나 창 닫기로 돌아온다. 떼어 낸 동안 남은 칸이 자리를 채운다.
//  · 카드 화면은 바뀔 때마다 칸을 통째로 다시 그리므로, 다시 그릴 때마다 새로 그린 칸을 떼어 낸 창으로 옮긴다.
//  · 카드 화면(#card-view)에 걸린 듣기와 문서 듣기(doc-listeners.js가 기록)를 떼어 낸 창에도 걸고,
//    root·document에서 요소를 찾을 때 떼어 낸 창도 찾게 해 단추·입력이 그대로 돈다.
//  · 오른쪽 「AI · 조판」 칸은 한글 엔진 창이 이 창에 붙어 있어 아직 떼지 않는다.
const PANES = {
  left: { sel: ':scope > .cv-left', name: '참고 자료', w: 520, h: 820, head: '.lp-one', before: '.pane-close' },
  center: { sel: ':scope > .cv-center', name: '문항 카드', w: 680, h: 880, head: '.cv-bar' },
  adv: { sel: '[data-cvslot="adv"]', name: '조건', w: 360, h: 380, head: '.lp-adv-foot' },
};
const KEY = k => `5e.exam.paneDetach.${k}`;
const OUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-8 8"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/></svg>';
const IN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14H4m6 0v6m0-6-6 6"/><path d="M14 20h4.5a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 18.5 4h-13A1.5 1.5 0 0 0 4 5.5V10"/></svg>';
const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const hosts = [];// 떼어 낸 창의 칸 그릇(#card-view 복제)
const rootListeners = [];

// 화면에 보이는지·크기가 바뀌었는지 살피는 관찰자는 창(문서)마다 따로 돈다. 떼어 낸 창으로 옮긴 요소는
// 그 창의 관찰자로 살피도록 감싼다(기출 카드 그림이 보일 때 불러오기·칸 폭 맞추기가 떼어 낸 창에서도 돌게).
function crossWindowObserver(name) {
  const Native = window[name];
  if (!Native || Native.__paneWrapped) return;
  class Wrapped {
    constructor(cb, opts) { this.cb = cb; this.opts = opts; this.byWin = new Map(); }
    pick(el) {
      const w = el?.ownerDocument?.defaultView || window, N = w === window ? Native : (w[name] || Native);
      let o = this.byWin.get(w);
      if (!o) { const opts = this.opts?.root && this.opts.root.ownerDocument !== el.ownerDocument ? { ...this.opts, root: null } : this.opts; o = new N((entries) => this.cb(entries, this), opts); this.byWin.set(w, o); }
      return o;
    }
    observe(el, o) { this.pick(el).observe(el, o); }
    unobserve(el) { this.byWin.get(el?.ownerDocument?.defaultView || window)?.unobserve(el); }
    disconnect() { for (const o of this.byWin.values()) o.disconnect(); this.byWin.clear(); }
    takeRecords() { return []; }
  }
  Wrapped.__paneWrapped = true;
  window[name] = Wrapped;
}

// 카드 편집기가 root에 듣기를 걸기 전에 불러 기록해 둔다(떼어 낸 창 그릇에도 같은 듣기를 건다).
export function recordPaneListeners(root) {
  crossWindowObserver('IntersectionObserver'); crossWindowObserver('ResizeObserver');
  if (!root || root.__paneRecorded) return;
  root.__paneRecorded = true;
  const add = root.addEventListener;
  root.addEventListener = function (type, fn, opts) { rootListeners.push([type, fn, opts]); for (const h of hosts) h.addEventListener(type, fn, opts); return add.call(this, type, fn, opts); };
}

// 새 창 스타일: 넓은 화면(min-width) 조건은 풀고 좁은 화면(max-width) 조건은 뺀다. url()은 절대 주소로.
function popupCss() {
  const out = [], abs = (t, base) => t.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => /^(data:|blob:|#)/.test(u) ? m : `url("${new URL(u, base).href}")`);
  const walk = (rules, base) => {
    for (const r of rules) {
      if (r instanceof CSSImportRule) { try { walk(r.styleSheet.cssRules, r.styleSheet.href || base); } catch {} continue; }
      if (r instanceof CSSMediaRule) {
        const c = r.conditionText || r.media.mediaText;
        if (/max-width/.test(c)) continue;
        if (/min-width/.test(c) && !/prefers|print|hover|pointer/.test(c)) { walk(r.cssRules, base); continue; }
      }
      out.push(abs(r.cssText, base));
    }
  };
  for (const s of document.styleSheets) { try { walk(s.cssRules, s.href || location.href); } catch {} }
  return out.join('\n');
}

export function initPaneDetach(root, { render, refreshLibrary }) {
  if (!root) return null;
  const live = {};
  const origQS = Element.prototype.querySelector, origQSA = Element.prototype.querySelectorAll;
  // root·document에서 못 찾은 요소는 떼어 낸 창 그릇에서 찾는다.
  root.querySelector = function (sel) { const hit = origQS.call(this, sel); if (hit || !hosts.length) return hit; for (const h of hosts) { const x = origQS.call(h, sel); if (x) return x; } return null; };
  root.querySelectorAll = function (sel) { const base = origQSA.call(this, sel); if (!hosts.length) return base; const more = hosts.flatMap(h => [...origQSA.call(h, sel)]); return more.length ? [...base, ...more] : base; };
  const dq = document.querySelector, dqa = document.querySelectorAll, dbi = document.getElementById;
  document.querySelector = function (sel) { const hit = dq.call(this, sel); if (hit || !hosts.length) return hit; for (const h of hosts) { const x = origQS.call(h, sel); if (x) return x; } return null; };
  document.querySelectorAll = function (sel) { const base = dqa.call(this, sel); if (!hosts.length) return base; const more = hosts.flatMap(h => [...origQSA.call(h, sel)]); return more.length ? [...base, ...more] : base; };
  document.getElementById = function (id) { const hit = dbi.call(this, id); if (hit || !hosts.length) return hit; for (const h of hosts) { const x = h.ownerDocument.getElementById(id); if (x && h.contains(x)) return x; } return null; };

  const btn = key => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pane-detach'; b.dataset.paneDetach = key;
    const on = !!live[key];
    b.innerHTML = on ? IN : OUT;
    b.title = on ? `${PANES[key].name} 합치기 — 원래 자리로` : `${PANES[key].name} 분리 — 별도 창으로 떼어 내기`;
    b.setAttribute('aria-label', b.title);
    b.addEventListener('click', e => { e.stopPropagation(); live[key] ? merge(key) : detach(key); });
    return b;
  };
  // 칸마다 머리줄에 [분리]/[합치기] 단추(다시 그릴 때마다 새로 넣는다).
  const decorate = () => {
    for (const key of Object.keys(PANES)) {
      const spec = PANES[key], pane = live[key] ? live[key].host.firstElementChild : findPane(key);
      const head = pane && (pane.matches?.(spec.head) ? pane : origQS.call(pane, spec.head));
      if (!head) continue;
      const old = origQS.call(head, `:scope > [data-pane-detach="${key}"]`);
      if (old && old.dataset.state === String(!!live[key])) continue;
      old?.remove();
      const b = btn(key); b.dataset.state = String(!!live[key]);
      const before = spec.before && origQS.call(head, `:scope > ${spec.before}`);
      head.insertBefore(head.ownerDocument.adoptNode(b), before || null);
    }
  };
  const findPane = key => {
    const spec = PANES[key];
    let pane = origQS.call(root, spec.sel);
    if (!pane && key === 'adv' && live.left) pane = origQS.call(live.left.host, spec.sel);
    return pane;
  };
  // 다시 그린 칸을 떼어 낸 창으로 옮긴다.
  const sync = () => {
    for (const key of ['left', 'center', 'adv']) {
      const entry = live[key];
      if (!entry) continue;
      const pane = findPane(key);
      if (pane && pane.parentNode !== entry.host) {
        entry.host.replaceChildren(entry.doc.adoptNode(pane));
        if (key === 'adv') pane.hidden = false;
        // 옮긴 목록은 그 창의 관찰자로 다시 살펴야 그림이 불려 온다 — 목록만 한 번 다시 채운다.
        if (key === 'left') queueMicrotask(() => refreshLibrary?.());
      }
    }
    root.toggleAttribute('data-det-left', !!live.left);
    root.toggleAttribute('data-det-center', !!live.center);
    decorate();
  };
  let pending = false;
  const later = () => { if (pending) return; pending = true; queueMicrotask(() => { pending = false; sync(); }); };
  new MutationObserver(later).observe(root, { childList: true, subtree: true });

  function detach(key) {
    const spec = PANES[key];
    if (live[key]) return;
    if (key === 'left' && !findPane('left')) root.querySelector('[data-cv="toggle-lib"]')?.click();
    if (key === 'adv') { const pop = findPane('adv'); if (pop) pop.hidden = false; }
    const saved = read(KEY(key)) || {};
    const top = window.top || window;
    const w = saved.w || spec.w, h = saved.h || spec.h;
    const x = saved.x ?? top.screenX + 60, y = saved.y ?? top.screenY + 80;
    const win = window.open('', `five-e-pane-${key}`, `popup,width=${w},height=${h},left=${x},top=${y}`);
    if (!win) { window.parent?.dispatchEvent?.(new CustomEvent('5e:toast', { detail: { message: '새 창을 열지 못했습니다. 팝업 허용을 켜 주세요.' } })); return; }
    const doc = win.document;
    doc.open(); doc.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>5E_exam · ${spec.name}</title></head><body></body></html>`); doc.close();
    for (const { name, value } of document.documentElement.attributes) doc.documentElement.setAttribute(name, value);
    const style = doc.createElement('style');
    style.textContent = popupCss() + `
html,body{margin:0;height:100%;overflow:hidden;background:var(--ds-panel,#0d1117)}
#card-view.pane-host{position:fixed!important;inset:0!important;display:flex!important;flex-direction:column;width:auto!important;height:auto!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;transform:none!important}
#card-view.pane-host>*{flex:1 1 auto!important;width:auto!important;max-width:none!important;min-width:0!important;height:100%!important;margin:0!important;border-radius:0!important}
#card-view.pane-host>[data-cvslot="adv"]{position:static!important;inset:auto!important;display:block!important;box-shadow:none!important;border:0!important;overflow:auto;padding:12px}
#card-view.pane-host .pane-close{display:none!important}`;
    doc.head.append(style);
    const host = doc.createElement('div');
    host.id = 'card-view';
    host.className = `${root.className} pane-host`;
    host.style.cssText = root.style.cssText;
    host.dataset.pane = key;
    doc.body.append(host);
    for (const [type, fn, opts] of rootListeners) { try { host.addEventListener(type, fn, opts); } catch {} }
    for (const [type, fn, opts] of window.__fiveEDocListeners || []) { try { doc.addEventListener(type, fn, opts); } catch {} }
    (window.__fiveEPanelDocs ||= []).push(doc);
    hosts.push(host);
    // 떼어 낸 창의 단축키는 출제 창 window 듣기로 넘긴다(문서 듣기는 위에서 이미 걸렸다). 글 쓰는 칸 안에서는 넘기지 않는다.
    doc.addEventListener('keydown', ev => {
      if (ev.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      const copy = new KeyboardEvent('keydown', { key: ev.key, code: ev.code, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, altKey: ev.altKey, shiftKey: ev.shiftKey, bubbles: true, cancelable: true });
      if (!window.dispatchEvent(copy)) ev.preventDefault();
    });
    const attrs = new MutationObserver(() => { for (const { name, value } of document.documentElement.attributes) doc.documentElement.setAttribute(name, value); host.className = `${root.className} pane-host`; });
    attrs.observe(document.documentElement, { attributes: true }); attrs.observe(root, { attributes: true, attributeFilter: ['class'] });
    const inner = new MutationObserver(later); inner.observe(host, { childList: true, subtree: true });
    live[key] = { win, doc, host, attrs, inner, closing: false };
    const remember = () => write(KEY(key), { x: win.screenX, y: win.screenY, w: win.innerWidth, h: win.innerHeight });
    win.addEventListener('resize', remember);
    win.addEventListener('pagehide', () => { if (!live[key]?.closing) merge(key, { fromPopup: true }); });
    sync();
    win.focus();
  }

  function merge(key, { fromPopup = false } = {}) {
    const entry = live[key];
    if (!entry) return;
    entry.closing = true;
    try { write(KEY(key), { x: entry.win.screenX, y: entry.win.screenY, w: entry.win.innerWidth, h: entry.win.innerHeight }); } catch {}
    entry.attrs.disconnect(); entry.inner.disconnect();
    hosts.splice(hosts.indexOf(entry.host), 1);
    const docs = window.__fiveEPanelDocs || [], at = docs.indexOf(entry.doc); if (at >= 0) docs.splice(at, 1);
    delete live[key];
    // 조건 창은 원래 자리(참고 자료 칸)로 옮겨 두고 닫는다. 칸들은 다시 그려서 제자리에 둔다.
    if (key === 'adv') { const pop = origQS.call(entry.host, PANES.adv.sel); const lib = findPane('left'); const foot = lib && origQS.call(lib, '.lp-one'); if (pop && foot) { pop.hidden = true; foot.after(document.adoptNode(pop)); } }
    if (!fromPopup) { try { entry.win.close(); } catch {} }
    render();
    sync();
  }

  sync();
  window.addEventListener('pagehide', () => { for (const k of Object.keys(live)) { try { live[k].win.close(); } catch {} } });
  return { detach, merge, isDetached: k => !!live[k] };
}
