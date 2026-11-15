// 위쪽 줄 AI 그림 작업 알림(11-15 사용자: 그림 복원을 걸어 두고 다른 일을 하다가, 끝나면 확인하라고 알려 줘야 — 시안 flow-1115 A).
// 어느 화면에서든: 진행 중이면 「● 5번 그림 복원 중 · 01:12」(누르면 AI 창의 그 작업), 끝나면 「● 그림 변환 끝 N · 확인」 → 목록 → 「결과 보기」
// = 그 문항 카드 + AI 창의 그 결과(고르고 라벨 고친 뒤 「문항 카드에 넣기」). 칸에 넣거나(figure-ready) 작업이 사라지면 목록에서 빠진다.
// 카드 그림 칸의 표시(card-editor.js)는 그대로 둔다 — 카드를 보고 있으면 거기서 바로.
const E = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clock = ms => { const t = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const word = (kind, st) => kind === 'graph' ? (st === 'busy' ? '그래프 복원 중' : st === 'failed' ? '그래프 복원 실패' : '그래프 복원 끝') : (st === 'busy' ? '그림 변환 중' : st === 'failed' ? '그림 변환 실패' : '그림 변환 끝');

export function initAiJobsTop({ host, numberOf, open }) {
  if (!host) return;
  const jobs = new Map(); let menu = null, timer = 0;
  const keyOf = (qid, key) => `${qid}|${key}`;
  function close() { menu?.remove(); menu = null; }
  function paint() {
    clearTimeout(timer);
    const list = [...jobs.values()], busy = list.filter(j => j.state === 'busy').sort((a, b) => b.startedAt - a.startedAt), done = list.filter(j => j.state !== 'busy').sort((a, b) => b.at - a.at);
    host.hidden = !list.length; if (!list.length) { host.innerHTML = ''; close(); return; }
    const b = busy[0];
    host.innerHTML = `${b ? `<button type="button" class="ajt-busy" data-ajt="${E(keyOf(b.qid, b.key))}" title="AI 창의 이 작업 보기 · 창을 닫아도 작업은 계속됩니다"><i class="ajt-dot busy" aria-hidden="true"></i>${E(numberOf(b.qid) ? numberOf(b.qid) + '번 ' : '')}${word(b.kind, 'busy')} · ${clock(Date.now() - b.startedAt)}${busy.length > 1 ? ` 외 ${busy.length - 1}` : ''}</button>` : ''}`
      + `${done.length ? `<button type="button" class="ajt-done${done.some(j => Date.now() - j.at < 2600) ? ' flash' : ''}" data-ajt-menu aria-haspopup="true" aria-expanded="${!!menu}"><i class="ajt-dot${done.every(j => j.state === 'failed') ? ' fail' : ''}" aria-hidden="true"></i>${done.length > 1 ? `AI 결과 ${done.length}개` : word(done[0].kind, done[0].state)} · 확인</button>` : ''}`;
    if (menu) paintMenu();
    if (b || done.some(j => Date.now() - j.at < 2600)) timer = setTimeout(paint, 1000);
  }
  function paintMenu() {
    const done = [...jobs.values()].filter(j => j.state !== 'busy').sort((a, b) => b.at - a.at);
    if (!done.length) { close(); return; }
    if (!menu) { menu = document.createElement('div'); menu.className = 'ajt-menu'; menu.setAttribute('role', 'menu'); document.body.append(menu); }
    const r = host.querySelector('[data-ajt-menu]')?.getBoundingClientRect();
    if (r) { menu.style.top = `${Math.round(r.bottom + 6)}px`; menu.style.left = `${Math.round(Math.max(8, r.right - 320))}px`; }
    menu.innerHTML = done.map(j => `<button type="button" role="menuitem" class="ajt-row" data-ajt="${E(keyOf(j.qid, j.key))}"><span><b>${E(numberOf(j.qid) ? numberOf(j.qid) + '번 ' : '')}${word(j.kind, j.state)}</b><small>${Math.max(1, Math.round((Date.now() - j.at) / 60000))}분 전</small></span><em>${j.state === 'failed' ? '다시 하기 →' : '결과 보기 →'}</em></button>`).join('')
      + `<button type="button" class="ajt-clear" data-ajt-clear>목록 비우기</button>`;
  }
  host.addEventListener('click', e => {
    if (e.target.closest('[data-ajt-menu]')) { if (menu) close(); else paintMenu(); paint(); return; }
    const k = e.target.closest('[data-ajt]')?.dataset.ajt, j = k && jobs.get(k); if (j) open(j);
  });
  document.addEventListener('click', e => {
    if (!menu) return; if (e.target.closest('[data-ajt-clear]')) { for (const [k, j] of jobs) if (j.state !== 'busy') jobs.delete(k); close(); paint(); return; }
    const row = e.target.closest('.ajt-menu [data-ajt]'); if (row) { const j = jobs.get(row.dataset.ajt); close(); if (j) { if (j.state !== 'busy') jobs.delete(row.dataset.ajt); paint(); open(j); } return; }
    if (!e.target.closest('.ajt-menu,[data-ajt-menu]')) close();
  }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape' && menu) { e.preventDefault(); close(); paint(); } }, true);
  window.addEventListener('message', e => {
    const m = e.data; if (e.source !== window.parent || m?.channel !== '5e-question-sheet') return;
    if (m.action === 'ai-job' && typeof m.key === 'string') {
      const k = keyOf(m.qid, m.key), prev = jobs.get(k);
      jobs.set(k, { qid: m.qid, key: m.key, taskId: m.taskId, kind: m.kind, state: m.state, startedAt: m.state === 'busy' && prev?.state === 'busy' && prev.taskId === m.taskId ? prev.startedAt : m.state === 'busy' ? Date.now() : prev?.startedAt || Date.now(), at: m.state !== 'busy' && prev?.state === 'busy' ? Date.now() : prev?.at || Date.now() });
      paint();
    } else if (m.action === 'figure-ready' && typeof m.key === 'string') { const k = keyOf(m.qid, m.key); if (jobs.get(k)?.state !== 'busy') { jobs.delete(k); paint(); } }
    else if (m.action === 'ai-job-gone') { for (const [k, j] of jobs) if (j.taskId === m.taskId) jobs.delete(k); paint(); }
  });
}
