// 패널 분리·합치기(11-04 사용자 결정, 1.7.0): 「도구」「속성」 패널을 앱 밖의 별도 창으로 떼어 내 다른 모니터에 둘 수 있다.
//  · 패널 머리줄의 [분리 ↗]로 떼고, 떼어 낸 창의 [합치기 ↙]나 창 닫기로 원래 자리에 돌아온다.
//  · 떼어 낸 동안 그 패널 칸은 0이 되어 캔버스와 남은 패널이 자리를 채운다.
//  · 창 위치·크기는 기억했다가 다음에 그 자리에 연다.
//  · 패널 요소를 그대로 옮기므로(같은 출처 창) 단추·입력에 걸린 동작은 그대로 이어진다.
//    새 창은 폭이 좁아 「넓은 화면(768px 이상)」 조건의 패널 스타일이 꺼지므로, 스타일을 옮길 때 그 조건을 푼다.
const SIDES = { left: { id: 'panel-left', name: '도구', w: 240, h: 760 }, right: { id: 'panel-right', name: '속성', w: 300, h: 760 } };
const KEY = side => `5e.panelDetach.${side}`;
const ICON_OUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-8 8"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/></svg>';
const ICON_IN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14H4m6 0v6m0-6-6 6"/><path d="M14 20h4.5a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 18.5 4h-13A1.5 1.5 0 0 0 4 5.5V10"/></svg>';
const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

// 새 창에 넣을 스타일: 넓은 화면 조건(min-width)은 풀고, 좁은 화면 조건(max-width)은 뺀다. url()은 원래 자리 기준 절대 주소로.
function popupCss() {
  const out = [];
  const abs = (text, base) => text.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => /^(data:|blob:|#)/.test(u) ? m : `url("${new URL(u, base).href}")`);
  const walk = (rules, base) => {
    for (const rule of rules) {
      if (rule instanceof CSSImportRule) { if (rule.styleSheet) { try { walk(rule.styleSheet.cssRules, rule.styleSheet.href || base); } catch {} } continue; }
      if (rule instanceof CSSMediaRule) {
        const cond = rule.conditionText || rule.media.mediaText;
        if (/max-width/.test(cond)) continue;
        if (/min-width/.test(cond) && !/prefers|print|hover|pointer/.test(cond)) { walk(rule.cssRules, base); continue; }
      }
      out.push(abs(rule.cssText, base));
    }
  };
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules, sheet.href || location.href); } catch {} }
  return out.join('\n');
}

// 본 창 코드가 document.getElementById·querySelector(All)로 패널 안 요소를 찾으면, 떼어 낸 창 문서에서도 찾아 준다.
function patchLookups() {
  if (document.__fiveEPanelLookups) return;
  document.__fiveEPanelLookups = true;
  const docs = () => window.__fiveEPanelDocs || [];
  const byId = document.getElementById, one = document.querySelector, all = document.querySelectorAll;
  document.getElementById = function (id) { const hit = byId.call(this, id); if (hit || !docs().length) return hit; for (const d of docs()) { const h = d.getElementById(id); if (h) return h; } return null; };
  document.querySelector = function (sel) { const hit = one.call(this, sel); if (hit || !docs().length) return hit; for (const d of docs()) { const h = d.querySelector(sel); if (h) return h; } return null; };
  document.querySelectorAll = function (sel) { const base = all.call(this, sel); if (!docs().length) return base; const more = docs().flatMap(d => [...d.querySelectorAll(sel)]); return more.length ? [...base, ...more] : base; };
}

export function initPanelDetach() {
  const app = document.querySelector('.app');
  if (!app) return;
  const live = {}, buttons = {};
  // 단추는 이 모듈이 들고 있는다(떼어 낸 뒤에는 본 창 문서에서 찾을 수 없으므로).
  const button = side => {
    let b = buttons[side];
    if (!b) {
      b = buttons[side] = document.createElement('button');
      b.type = 'button'; b.className = 'pf-detach'; b.dataset.panelDetach = side;
      b.addEventListener('click', () => (live[side] ? merge(side) : detach(side)));
    }
    const on = !!live[side];
    b.innerHTML = on ? ICON_IN : ICON_OUT;
    b.title = on ? `${SIDES[side].name} 패널 합치기 — 원래 자리로` : `${SIDES[side].name} 패널 분리 — 별도 창으로 떼어 내기`;
    b.setAttribute('aria-label', b.title);
    return b;
  };
  // 머리줄(.pf-head, panel-heads.js가 만든 것)에 단추를 넣는다 — 제목 오른쪽, 접기 단추 앞.
  const place = () => {
    for (const side of Object.keys(SIDES)) {
      const panel = live[side]?.panel || document.getElementById(SIDES[side].id);
      const head = panel?.querySelector(':scope > .pf-head');
      if (!head) continue;
      const b = button(side);
      const toggle = head.querySelector('.panel-visibility-toggle');
      if (b.parentElement !== head || (toggle && b.nextElementSibling !== toggle)) head.insertBefore(b, toggle || null);
    }
  };

  function detach(side) {
    const spec = SIDES[side], panel = document.getElementById(spec.id);
    if (!panel || live[side]) return;
    window.dispatchEvent(new Event('blur'));// 단추 설명 풍선이 본 창에 남지 않게(tooltip.js는 창 blur에 닫힌다)
    // 접혀 있으면 먼저 펼친다(떼어 낸 창에는 내용이 다 보여야 한다).
    if (app.dataset[`${side}Collapsed`] === 'true') document.getElementById(`drawer-${side}-toggle`)?.click();
    const saved = read(KEY(side)) || {};
    const w = saved.w || spec.w, h = saved.h || Math.min(spec.h, screen.availHeight - 80);
    const x = saved.x ?? (side === 'left' ? window.screenX + 40 : window.screenX + window.outerWidth - w - 40);
    const y = saved.y ?? window.screenY + 80;
    const win = window.open('', `five-e-panel-${side}`, `popup,width=${w},height=${h},left=${x},top=${y}`);
    if (!win) { window.dispatchEvent(new CustomEvent('5e:toast', { detail: { message: '새 창을 열지 못했습니다. 브라우저의 팝업 허용을 켜 주세요.' } })); return; }
    const doc = win.document;
    doc.open();
    doc.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>5E · ${spec.name}</title></head><body></body></html>`);
    doc.close();
    for (const { name, value } of document.documentElement.attributes) doc.documentElement.setAttribute(name, value);
    const style = doc.createElement('style');
    style.textContent = popupCss() + `
html,body{margin:0;height:100%;overflow:hidden;background:var(--ds-panel,#0d1117)}
.app.pf-detached-host{display:flex!important;flex-direction:column;height:100vh!important;width:100vw!important;grid-template-columns:none!important}
.app.pf-detached-host>aside{position:relative!important;inset:auto!important;transform:none!important;display:flex!important;flex-direction:column;flex:1;width:100%!important;min-width:0!important;max-width:none!important;height:100%!important;visibility:visible!important;opacity:1!important;border:0!important;overflow:auto}
.app.pf-detached-host .panel-visibility-toggle{display:none!important}`;
    doc.head.append(style);
    const host = doc.createElement('div');
    host.className = `${app.className} pf-on pf-detached-host`;
    for (const k of ['mode', 'panelLayout']) if (app.dataset[k] !== undefined) host.dataset[k] = app.dataset[k];
    doc.body.append(host);
    const anchor = document.createComment(`panel-detach:${side}`);
    panel.before(anchor);
    host.append(doc.adoptNode(panel));
    // 화면 색·모드가 바뀌면 떼어 낸 창도 따라간다.
    const attrs = new MutationObserver(() => { for (const { name, value } of document.documentElement.attributes) doc.documentElement.setAttribute(name, value); });
    attrs.observe(document.documentElement, { attributes: true });
    // 떼어 낸 창에서 누른 단축키(되돌리기 등)는 본 창 window 듣기로 넘긴다(문서 듣기는 아래에서 이 창에도 걸린다). 글을 쓰는 칸 안에서는 넘기지 않는다.
    const forward = event => {
      const t = event.target;
      if (t?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      const copy = new KeyboardEvent(event.type, { key: event.key, code: event.code, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey, repeat: event.repeat, bubbles: true, cancelable: true });
      if (!window.dispatchEvent(copy)) event.preventDefault();
    };
    doc.addEventListener('keydown', forward);
    for (const [type, fn, opts] of window.__fiveEDocListeners || []) { try { doc.addEventListener(type, fn, opts); } catch {} }
    (window.__fiveEPanelDocs ||= []).push(doc);
    patchLookups();
    live[side] = { win, doc, panel, anchor, attrs, closing: false };
    app.dataset[`${side}Detached`] = 'true';
    const remember = () => { try { write(KEY(side), { x: win.screenX, y: win.screenY, w: win.innerWidth, h: win.innerHeight }); } catch {} };
    win.addEventListener('resize', remember);
    win.addEventListener('pagehide', () => { if (!live[side]?.closing) merge(side, { fromPopup: true }); });
    place();
    win.focus();
  }

  function merge(side, { fromPopup = false } = {}) {
    const entry = live[side];
    if (!entry) return;
    entry.closing = true;
    try { write(KEY(side), { x: entry.win.screenX, y: entry.win.screenY, w: entry.win.innerWidth, h: entry.win.innerHeight }); } catch {}
    entry.attrs.disconnect();
    const docs = window.__fiveEPanelDocs || [], at = docs.indexOf(entry.doc); if (at >= 0) docs.splice(at, 1);
    entry.anchor.replaceWith(document.adoptNode(entry.panel));
    delete live[side];
    delete app.dataset[`${side}Detached`];
    if (!fromPopup) { try { entry.win.close(); } catch {} }
    place();
  }

  place();
  new MutationObserver(place).observe(app, { attributes: true, attributeFilter: ['data-left-collapsed', 'data-right-collapsed', 'data-panel-layout', 'class'] });
  window.addEventListener('pagehide', () => { for (const side of Object.keys(live)) { try { live[side].win.close(); } catch {} } });
  return { detach, merge, isDetached: side => !!live[side] };
}
