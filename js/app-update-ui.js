// 11-22 시안(2026-11-22_설치-업데이트): 설치판 앱 안 업데이트 — 시작 화면 왼쪽 아래 단추와 「AI」 카드 맨 아래 버전 줄이 같은 상태를 본다.
// 상태(본체 app-updater.cjs가 'app-update:state'로 알림): none · available · downloading(percent) · ready · opened · error.
// 윈도우는 electron-updater, 맥은 받은 새 5E.app으로 바꿔 넣기(옛 앱은 휴지통) — 둘 다 「다시 시작해 업데이트」로 끝난다.
// 설치판이 아니거나(웹) 본체에 업데이트 기능이 없으면 아무것도 그리지 않는다.
const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; };

let shared = null; // 한 창에서 한 번만 묻고 같이 본다
function store(desktop) {
  if (shared) return shared;
  const api = desktop?.appUpdate;
  const listeners = new Set();
  const state = { state: 'none', current: '', latest: '', percent: 0, message: '', code: '' };
  const emit = () => { for (const fn of listeners) { try { fn({ ...state }); } catch {} } };
  const apply = next => { if (!next || typeof next !== 'object') return; Object.assign(state, next); emit(); };
  api?.onState?.(apply);
  let checked = null;
  shared = {
    supported: Boolean(api && !desktop.web && typeof api.check === 'function'),
    get: () => ({ ...state }),
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    check: () => {
      if (!shared.supported) return Promise.resolve(state);
      if (!checked) checked = Promise.resolve(api.check()).then(result => {
        if (result) apply({ current: result.current || state.current, latest: result.latest || '', mode: result.mode,
          state: result.state || (result.available ? (['none', 'checking'].includes(state.state) ? 'available' : state.state) : state.state) });
        return { ...state };
      }).catch(() => ({ ...state }));
      return checked;
    },
    start: async () => {
      if (!shared.supported) return;
      apply({ state: 'downloading', percent: 0, message: '' });
      try { const result = await api.start(); if (result && typeof result === 'object' && result.state) apply(result); }
      catch (error) { apply({ state: 'error', message: '새 버전을 받지 못했어요.', code: String(error?.code || '') }); }
    },
    installNow: async () => {
      if (!shared.supported) return;
      try { const result = await api.installNow(); if (result && result.ok === false && result.code !== 'UPDATE_NEEDS_MANUAL') apply({ state: 'error', message: result.message || '업데이트를 시작하지 못했어요.', code: result.code || '' }); }
      catch { apply({ state: 'error', message: '업데이트를 시작하지 못했어요.' }); }
    },
  };
  return shared;
}

// 사람이 읽는 한 줄 + 누를 일. 시작 화면·카드가 같이 쓴다.
export function updateView(s) {
  const latest = s.latest || '';
  if (s.state === 'downloading') return { text: `${latest} 받는 중`, percent: Math.max(0, Math.min(100, Math.round(s.percent || 0))), action: null };
  if (s.state === 'verifying') return { text: `${latest} 확인 중`, percent: 100, action: null };
  if (s.state === 'installing') return { text: '5E를 다시 시작하는 중…', action: null };
  if (s.state === 'opened' && s.url) return { text: '받는 페이지를 열었어요', action: null };
  if (s.state === 'ready') return { text: `${latest} 준비됨`, button: '다시 시작해 업데이트', action: 'install', ready: true };
  if (s.state === 'opened') return { text: '새 5E를 열어 두었어요', button: '응용 프로그램 폴더로 끌어 놓기', action: null, ready: true };
  if (s.state === 'error') return { text: s.message || '새 버전을 받지 못했어요.', button: '다시 시도', action: 'start' };
  if (s.state === 'available' && latest) return { text: `${s.current} → ${latest}`, button: '업데이트', action: 'start' };
  return null;
}

// 「AI」 카드 맨 아래 한 줄.
export function createUpdateRow({ desktop, onChange = () => {} }) {
  const s = store(desktop);
  if (!s.supported) return { element: () => null, refresh: () => {} };
  s.subscribe(() => onChange());
  return {
    refresh: () => { void s.check().then(() => onChange()); },
    element: () => {
      const st = s.get();
      const row = el('div', 'dac-ver');
      const view = updateView(st);
      if (!view) { const left = el('span'); left.append('5E ', el('b', '', st.current || ''), st.latest ? ' · 최신이에요' : ''); row.append(left); return st.current ? row : null; }
      const left = el('span');
      if (st.state === 'available') left.append(`5E ${st.current} → `, el('b', '', st.latest)); else left.append(view.text);
      row.append(left);
      if (view.percent != null) { const bar = el('span', 'dac-ver-bar'); const fill = el('i'); fill.style.width = `${view.percent}%`; bar.append(fill); row.append(bar, el('span', 'dac-ver-pct', `${view.percent}%`)); }
      else if (view.button && view.action) {
        const b = el('button', 'dac-btn is-main', view.button); b.type = 'button';
        b.addEventListener('click', () => void (view.action === 'install' ? s.installNow() : s.start()));
        row.append(b);
      }
      return row;
    },
  };
}

// 시작 화면 왼쪽 아래 단추(지금의 「현재 → 최신 [받기]」 자리). 설치판에서만 — 웹은 지금 그대로 둔다.
export function mountStartUpdateButton({ desktop, host, fallbackUrl }) {
  const s = store(desktop);
  if (!s.supported || !host) return false;
  const render = () => {
    const st = s.get();
    const view = updateView(st);
    const old = host.querySelector('.ss-upd');
    if (!view) { old?.remove(); return; }
    const button = el('button', `ss-upd${view.percent != null ? ' is-busy' : ''}${view.ready ? ' is-ready' : ''}`);
    button.type = 'button';
    if (st.state === 'available') button.append(`${st.current} → `, el('b', '', st.latest));
    else if (st.state === 'ready') button.append(el('b', '', st.latest), ' 준비됨');
    else button.append(view.text);
    if (view.percent != null) { const bar = el('span', 'ss-upd-bar'); const fill = el('i'); fill.style.width = `${view.percent}%`; bar.append(fill); button.append(bar, el('span', 'ss-upd-pct', `${view.percent}%`)); button.disabled = true; }
    else if (view.button) button.append(el('span', '', view.button));
    button.title = view.action === 'install' ? '5E를 다시 시작해 새 버전으로 바꿉니다(작업·설정은 그대로)' : view.action === 'start' ? `새 버전 ${st.latest} 받기` : '';
    button.addEventListener('click', () => {
      if (view.action === 'install') void s.installNow();
      else if (view.action === 'start') void s.start();
      else if (st.state === 'opened' && fallbackUrl) window.open(fallbackUrl, '_blank', 'noopener');
    });
    if (old) old.replaceWith(button);
    else { const ver = host.querySelector('.ss-ver'); if (ver) ver.replaceWith(button); else host.prepend(button); }
  };
  s.subscribe(render);
  void s.check().then(render);
  return true;
}
