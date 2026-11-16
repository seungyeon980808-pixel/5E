// 버벅임 기록(11-04): 로컬 미리보기 서버(127.0.0.1)에서만 켜진다 — 배포된 5E에서는 아무것도 하지 않는다.
// 화면이 0.1초 넘게 멈춘 순간(프레임 간격)과, 누르기·키·휠 뒤 다음 화면까지 0.1초 넘게 걸린 경우를 그 직전 동작·보던 화면과 함께
// 5초마다 /api/local-perf로 보낸다(서버가 _work/perf-safari.log에 한 줄씩). 화면에는 아무것도 보이지 않는다.
const LOCAL = location.hostname === '127.0.0.1' && location.port;
if (LOCAL) {
  const rows = [], recent = [];
  const describe = node => {
    const el = node?.closest?.('button,a,input,textarea,select,[data-cv],[data-cvconvert],[data-cv-open],figure,[role]') || node;
    if (!el?.tagName) return '';
    const data = [...el.attributes].filter(a => a.name.startsWith('data-')).map(a => a.name.slice(5) + (a.value && a.value.length < 24 ? '=' + a.value : '')).slice(0, 3).join(' ');
    const text = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList[0] ? '.' + el.classList[0] : ''}${data ? ' [' + data + ']' : ''}${text ? ' «' + text + '»' : ''}`;
  };
  const screen = () => ['#card-view', '#examd-view', '#library-view', '#exams-view', '#grid-view'].filter(s => { const n = document.querySelector(s); return n && !n.hidden && n.getClientRects().length; }).join(',') || '-';
  const note = (type, e) => { recent.push({ at: Math.round(performance.now()), type, what: describe(e.target) }); if (recent.length > 8) recent.shift(); };
  // 누른 뒤 다음 화면까지(입력 지연): 이벤트 시각 → 두 번째 그림 프레임
  const delay = (type, e) => { note(type, e); const t0 = e.timeStamp, what = describe(e.target);
    requestAnimationFrame(() => requestAnimationFrame(() => { const d = performance.now() - t0; if (d > 100) rows.push({ kind: 'input', ms: Math.round(d), type, what, screen: screen(), at: new Date().toISOString() }); })); };
  addEventListener('pointerdown', e => delay('누르기', e), true);
  addEventListener('keydown', e => delay('키 ' + (e.key.length === 1 ? '글자' : e.key), e), true);
  let wheelAt = 0;addEventListener('wheel', e => { if (performance.now() - wheelAt > 400) note('휠', e); wheelAt = performance.now(); }, { capture: true, passive: true });
  // 프레임 간격(보이는 동안만)
  let last = performance.now();
  const frame = now => { const gap = now - last; last = now;
    if (gap > 100 && document.visibilityState === 'visible') { const before = recent.filter(r => now - r.at < 3000).map(r => `${Math.round((now - r.at) / 100) / 10}초 전 ${r.type} ${r.what}`);
      rows.push({ kind: 'frame', ms: Math.round(gap), screen: screen(), before, at: new Date().toISOString() }); }
    requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
  const flush = () => { if (!rows.length) return; const batch = rows.splice(0, rows.length);
    fetch('/api/local-perf', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-5E-Request': '1' }, body: JSON.stringify(batch), keepalive: true }).catch(() => {}); };
  setInterval(flush, 5000);addEventListener('pagehide', flush);
}
