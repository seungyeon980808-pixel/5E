// 시작 창(11-04 확정 시안 5e-design-mockups/app-final-1104.html · css/start-screen.css).
//  1) 첫 장면: 큰 「5E」 + E를 세로로 맞춘 다섯 단어(sciEnce Educational Evaluation Exam Editor) + 한글 문구 + 진행 줄.
//     11-14: 최소 6초 — 그동안 출제 화면·조판 엔진·글꼴·클립보드를 미리 준비하고(main.js), 단계 이름을 차례로 보인다. 준비가 길면 25초까지 기다린다.
//  2) 고르기: 새로 만들기(image·exam·hwp) / 이어서 하기(자동 저장 기록) / 다른 파일 열기(⌘O·끌어다 놓기).
//     예전 「작업 복구 / 새로 시작」 확인창 대신 여기서 고른다(autosave.js의 chooseStart).
//  검사 브라우저(navigator.webdriver)·출제/조판 안쪽 화면·모바일에서는 띄우지 않는다(?start=1이면 강제로, ?start=0이면 끔).
import { IS_MAC } from './platform.js?v=1.7.0-four-session-integration';

const WORDS = [['sci', 'nce'], ['', 'ducational'], ['', 'valuation'], ['', 'xam'], ['', 'ditor']];
// 11-14 사용자: 로딩을 6초 → 7초로(「조금 더 늘려도 된다」) — 미리 준비할 시간을 주고, 할 일이 적어도 들어간 뒤 버벅임의 완충지대가 되게. 단계마다 무엇을 하는지 보인다.
const MIN_INTRO = 7000;
// 설치판 새 버전 확인: GitHub 최신 릴리즈(공개 API, 출처 제한 없음 — Access-Control-Allow-Origin: *).
const DESKTOP_LATEST_API = 'https://api.github.com/repos/seungyeon980808-pixel/5E/releases/latest';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function startScreenEnabled() {
  const q = new URLSearchParams(location.search);
  if (q.get('start') === '0') return false;
  if (q.get('start') === '1') return true;
  try { if (sessionStorage.getItem('5e.start') === '1') return true; } catch {}
  if (navigator.webdriver) return false;
  if (q.get('exam') === '1' || q.get('sheet') === '1' || q.get('mobile') === '1') return false;
  if (document.documentElement.classList.contains('mobile-image-mode')) return false;
  return window.matchMedia('(min-width: 760px)').matches;
}

function appVersion() {
  return document.querySelector('[data-release-version]')?.textContent.match(/\d+\.\d+\.\d+/)?.[0] || '';
}
const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

function when(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date(), day = 864e5;
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= start) return `오늘 ${hm}`;
  if (ts >= start - day) return `어제 ${hm}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function createStartScreen({ desktopReleaseUrl = '', lite = false } = {}) {
  const desktopWindow = window.fiveEDesktop?.startWindow;
  if (!startScreenEnabled()) { document.documentElement.classList.remove('ss-boot'); void desktopWindow?.expand?.().catch?.(() => {}); return null; }
  const mod = IS_MAC ? '⌘' : 'Ctrl+';
  const root = document.createElement('div');
  root.id = 'start-screen';
  root.className = desktopWindow ? 'start-screen is-desktop' : 'start-screen';
  // 11-06: 설치판에서 시작 창이 뜰 때 창이 작업 크기로 커져 있으면(새로 고침 등) 시작 창 크기 960×560으로 되돌린다.
  void desktopWindow?.shrink?.()?.catch?.(() => {});
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '5E 시작');
  const col = WORDS.map(([p, s]) => `<span class="ss-pre">${p}</span><span class="ss-e">E</span><span class="ss-suf">${s}</span>`).join('');
  root.innerHTML = `<div class="ss-win">
   <div class="ss-left"><div class="ss-grid"></div>
    <div class="ss-intro"><span class="ss-big">5E</span><div class="ss-col">${col}</div>
     <div class="ss-bottom"><div class="ss-ko">과학 교육을 위한 평가 문항 편집기</div><div class="ss-bar"><i></i></div><div class="ss-st"></div></div></div>
    <div class="ss-ready"><span class="ss-five">5E</span></div>
    <div class="ss-mean"><small>과학 교육을 위한 평가 문항 편집기</small><div class="ss-en"><span>sci<b>E</b>nce <b>E</b>ducational</span><span><b>E</b>valuation <b>E</b>xam <b>E</b>ditor</span></div></div>
    <div class="ss-foot"><span class="ss-ver">버전 ${esc(appVersion())}</span><span class="ss-cpy">© 2026 서울특별시교육청 박승연</span></div>
   </div>
   <div class="ss-right">
    <div><p class="ss-lbl">새로 만들기</p><div class="ss-cards">
     <button type="button" class="ss-card" data-ss-new="image"><span class="tg">NEW</span><span class="go">시작 →</span><span class="en">image</span><span class="ko">새 그림 만들기</span><ul class="guide"><li>실험 장치·도식 그리기</li><li>AI로 그림·그래프 만들기</li><li>기출 그림 가져와 고치기</li></ul></button>
     <button type="button" class="ss-card" data-ss-new="exam"><span class="tg">NEW</span><span class="go">시작 →</span><span class="en">exam</span><span class="ko">새 시험지 만들기</span><ul class="guide"><li>기출·내 문항 담기</li><li>변형 문항 만들기</li><li>쪽 배치·정답표·인쇄</li></ul></button>
     <button type="button" class="ss-card" data-ss-new="hwp"><span class="tg">OPEN</span><span class="go">열기 →</span><span class="en">hwp</span><span class="ko">한글 파일 열기</span><ul class="guide"><li>.hwp·.hwpx 열기</li><li>인쇄 전 조판 다듬기</li><li>PDF·한글로 저장</li></ul></button>
    </div></div>
    <div style="min-height:0"><p class="ss-lbl">이어서 하기</p><div class="ss-list">
     <button type="button" class="ss-o1" data-ss-open><span class="ss-k">open</span><span class="ss-nm">다른 파일 열기…</span><span class="ss-meta">${mod}O</span><span></span></button>
     <div data-ss-recent></div>
    </div></div>
    <div class="ss-note"><i></i>자동 저장은 ${globalThis.fiveEDesktop ? '이 컴퓨터의 5E 안에만' : '이 브라우저에만'} 남습니다 · 끄기 전에 ${mod}S로 파일에 저장하세요</div>
   </div></div>`;
  document.body.append(root);
  document.documentElement.classList.remove('ss-boot');
  const win = root.querySelector('.ss-win');
  const colEl = root.querySelector('.ss-col');
  // 단어는 위에서부터 0.12초 간격으로
  [...colEl.children].forEach((span, i) => { span.style.animationDelay = `${0.15 + Math.floor(i / 3) * 0.12}s`; });
  const sweep = colEl.cloneNode(true); sweep.classList.add('ss-sl'); colEl.append(sweep);
  const bar = root.querySelector('.ss-bar i'), status = root.querySelector('.ss-st');
  const started = performance.now();
  // 단계 목록이 오기 전에는 12%까지만 천천히(가끔 멈칫) — 단계 막대가 뒤로 가지 않게.
  let progress = 0.03; bar.style.width = '3%';
  const creep = setInterval(() => { if (Math.random() < 0.3) return; progress = Math.min(0.12, progress + (0.12 - progress) * (0.05 + Math.random() * 0.15)); bar.style.width = `${(progress * 100).toFixed(2)}%`; }, 120);
  const setStatus = text => { status.textContent = text; };
  setStatus('작업 공간 준비 중…');
  // 업데이트 알림: 더 새 버전이 있으면 왼쪽 아래 버전 글자 자리에 「1.7.0 → 1.7.1 [받기]」(11-17 승인 시안 K/업데이트알림-설치판.html).
  //  웹: 배포 채널(release-channels.json)에서 가장 새 버전.
  //  설치판: GitHub 최신 릴리즈(=[받기]를 눌러 열리는 페이지에 실제로 있는 판)의 태그. 받기·설치는 사용자가 직접(자동 업데이트 아님).
  //   앱 안 release-channels.json은 설치판 자기 판이라 쓸모가 없고, www.5e.ai.kr에는 그 파일이 올라가지 않는다(404).
  //  인터넷이 없거나 응답이 이상하면 조용히 지금 모습 그대로. 시작을 기다리게 하지 않는다(뒤에서 읽음).
  const current = appVersion();
  const latestVersion = globalThis.fiveEDesktop
    ? () => fetch(DESKTOP_LATEST_API, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } }).then(r => r.ok ? r.json() : null).then(json => {
      const tag = String(json?.tag_name || '').replace(/^v/, '');
      return !json?.draft && !json?.prerelease && /^\d+\.\d+\.\d+$/.test(tag) ? tag : '';
    })
    : () => fetch(new URL('release-channels.json', document.baseURI), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(json => {
      const versions = Object.values(json?.channels || {}).map(c => c?.version).filter(v => /^\d+\.\d+\.\d+$/.test(v || ''));
      return versions.sort((a, b) => newer(a, b) ? -1 : 1)[0] || '';
    });
  if (current) latestVersion().then(latest => {
    if (!latest || !newer(latest, current)) return;
    const ver = root.querySelector('.ss-ver');
    if (!ver) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'ss-upd';
    button.innerHTML = `${esc(current)} → <b>${esc(latest)}</b><span>받기</span>`;
    button.title = `새 버전 ${latest} 받기`;
    button.addEventListener('click', () => window.open(desktopReleaseUrl || 'https://www.5e.ai.kr/', '_blank', 'noopener'));
    ver.replaceWith(button);
  }).catch(() => {});

  let resolveChoice = null, picked = null;
  const finish = choice => {
    if (!resolveChoice) return;
    picked = choice;
    const resolve = resolveChoice; resolveChoice = null;
    // 11-04 부드럽게: 작업 화면을 바로 드러내지 않는다. 설치형은 창이 다 커질 때까지 시작 창 색으로 덮어 두고(그동안 앱이
    // 몇 번씩 다시 배치되는 것과 도화지가 튀는 것을 가림), 다 커지면 도화지 크기를 한 번만 맞춘 뒤 0.28초에 한 번에 드러낸다.
    void leave();
    document.removeEventListener('keydown', onKey, true);
    resolve(choice);
  };
  let onReveal = null;
  const settle = () => new Promise(resolve => {
    let timer = 0; const started = performance.now();
    const done = () => { window.removeEventListener('resize', bump); resolve(); };
    const bump = () => { clearTimeout(timer); timer = setTimeout(done, performance.now() - started > 1400 ? 0 : 180); };
    window.addEventListener('resize', bump); bump();
  });
  async function leave() {
    root.classList.add('is-covering');
    if (desktopWindow) { await desktopWindow.expand?.().catch?.(() => {}); await settle(); }
    else await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    try { onReveal?.(); } catch {}
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    root.classList.add('is-leaving');
    setTimeout(() => root.remove(), 320);
  }
  const onKey = event => {
    if (!resolveChoice || !win.classList.contains('is-ready')) return;
    const m = IS_MAC ? event.metaKey : event.ctrlKey;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish({ kind: 'new', app: 'image' }); }
    else if (m && !event.shiftKey && !event.altKey && (event.key === 'o' || event.code === 'KeyO')) { event.preventDefault(); event.stopPropagation(); finish({ kind: 'open' }); }
  };
  document.addEventListener('keydown', onKey, true);
  // Lite는 그림(image)과 라이브러리만 쓴다 — exam·hwp 카드를 빼고 image 카드 하나만 넓게 둔다(11-14).
  if (lite) { root.querySelectorAll('[data-ss-new]:not([data-ss-new="image"])').forEach(card => card.remove()); const cards = root.querySelector('.ss-cards'); if (cards) cards.style.gridTemplateColumns = '1fr'; }
  root.addEventListener('click', event => {
    const card = event.target.closest('[data-ss-new]');
    if (card) return finish({ kind: 'new', app: card.dataset.ssNew });
    if (event.target.closest('[data-ss-open]')) return finish({ kind: 'open' });
    const item = event.target.closest('[data-ss-item]');
    if (item) return finish(item._choice);
  });
  const openRow = root.querySelector('[data-ss-open]');
  root.addEventListener('dragover', event => { if (event.dataTransfer?.types?.includes('Files')) { event.preventDefault(); openRow.classList.add('over'); } });
  root.addEventListener('dragleave', event => { if (event.target === root || !root.contains(event.relatedTarget)) openRow.classList.remove('over'); });
  root.addEventListener('drop', event => {
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    event.preventDefault(); openRow.classList.remove('over');
    finish({ kind: 'open', file });
  });

  // 준비가 끝나면 autosave.js가 부른다: 자동 저장 기록을 받아 목록을 채우고 다음 장면으로.
  async function choose({ checkpoints = [], latest = null, remove = null } = {}) {
    const list = root.querySelector('[data-ss-recent]');
    const rows = [];
    if (latest) rows.push({ label: latest.label, meta: `${latest.pageCount || 1}쪽 · ${when(latest.ts)}`, choice: { kind: 'latest' } });
    for (const checkpoint of checkpoints) rows.push({ label: checkpoint.label || '이전 작업', meta: `${checkpoint.pageCount || 1}쪽 · ${when(checkpoint.ts)}${checkpoint.source === 'legacy' ? ' · 이전 버전' : ''}`, choice: { kind: 'checkpoint', checkpoint } });
    list.className = 'ss-list';
    list.style.display = 'contents';
    if (!rows.length) list.innerHTML = '<div class="ss-empty">자동 저장된 작업이 없습니다.</div>';
    for (const row of rows.slice(0, 5)) {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.ssItem = '';
      button.innerHTML = `<span class="ss-k">image</span><span class="ss-nm">${esc(row.label)}</span><span class="ss-meta">${esc(row.meta)}</span><span class="ss-open">열기 →</span>`;
      button._choice = row.choice;
      // 마우스를 올리면 오른쪽 끝에 × — 누르면 그 줄이 「지우면 되돌릴 수 없습니다 [지우기] [취소]」로 바뀐다
      const wrap = document.createElement('div');
      wrap.className = 'ss-row';
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'ss-del'; del.title = '이 기록 지우기'; del.setAttribute('aria-label', `${row.label} 기록 지우기`);
      del.innerHTML = '<svg viewBox="0 0 12 12"><path d="M3 3l6 6M9 3 3 9"/></svg>';
      del.hidden = typeof remove !== 'function';
      del.addEventListener('click', event => {
        event.stopPropagation();
        const ask = document.createElement('div');
        ask.className = 'ss-ask';
        ask.innerHTML = `<span>「${esc(row.label)}」 기록을 지우면 되돌릴 수 없습니다.</span><button type="button" class="ss-ask-yes">지우기</button><button type="button" class="ss-ask-no">취소</button>`;
        wrap.replaceChildren(ask);
        ask.querySelector('.ss-ask-no').addEventListener('click', e => { e.stopPropagation(); wrap.replaceChildren(button, del); });
        ask.querySelector('.ss-ask-yes').addEventListener('click', async e => {
          e.stopPropagation();
          try { await remove(row.choice); wrap.remove(); if (!list.querySelector('.ss-row')) list.innerHTML = '<div class="ss-empty">자동 저장된 작업이 없습니다.</div>'; }
          catch { ask.querySelector('span').textContent = '지우지 못했습니다. 다시 해 보세요.'; }
        });
        ask.querySelector('.ss-ask-no').focus();
      });
      wrap.append(button, del);
      list.append(wrap);
    }
    // 11-09: 들어가기 전에 무거운 준비(라이브러리 자료·검색 색인)를 끝낸다 — 들어간 뒤 멈칫하지 않게.
    // 너무 오래 걸리면(네트워크 등) 15초에서 끊고 들어간다(준비는 뒤에서 계속).
    // 단계마다 이름을 보이고, 최소 시간(MIN_INTRO)을 단계 무게대로 나눠 머문다 — 일이 빨리 끝나도 무엇을 준비하는지 읽을 수 있게.
    // 11-14 사용자: 0.8초씩 똑같이 오르니 답답 — 단계마다 머무는 시간에 무게·흔들림을 주고, 막대도 들쭉날쭉(가끔 멈칫) 차오르게.
    clearInterval(creep);
    let target = Math.max(progress, 0.12);
    const drift = setInterval(() => { if (Math.random() < 0.18) return; progress += (target - progress) * (0.04 + Math.random() * 0.2); bar.style.width = `${(progress * 100).toFixed(2)}%`; }, 90);
    const totalWeight = () => tasks.reduce((sum, t) => sum + (t.weight || 1), 0);
    let done = 0;
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i], w = task.weight || 1;
      setStatus(task.label);
      const budget = Math.max(0, MIN_INTRO - 700 - (performance.now() - started)), restWeight = Math.max(w, totalWeight() - done);
      const slot = budget * (w / restWeight) * (0.75 + Math.random() * 0.5);
      target = 0.12 + 0.8 * (done + w) / totalWeight();
      await Promise.all([
        Promise.race([task.work, new Promise(r => setTimeout(r, Math.max(0, 25000 - (performance.now() - started))))]),// 25초에서 끊고 들어감(준비는 뒤에서 계속)
        new Promise(r => setTimeout(r, slot)),
      ]);
      done += w;
    }
    clearInterval(drift);
    bar.style.width = '100%'; setStatus('준비 완료');
    const wait = Math.max(0, MIN_INTRO - (performance.now() - started));
    await new Promise(r => setTimeout(r, wait));
    sweep.classList.add('go'); root.querySelector('.ss-big').classList.add('shine');
    await new Promise(r => setTimeout(r, 450));
    // 큰 「5E」가 왼쪽 칸의 「5E」 자리로 옮겨 가며 줄어든다
    const big = root.querySelector('.ss-big').getBoundingClientRect();
    win.classList.add('is-ready');
    const five = root.querySelector('.ss-five');
    requestAnimationFrame(() => {
      const b = five.getBoundingClientRect();
      five.animate?.([{ transform: `translate(${big.left - b.left + (big.width - b.width) / 2}px,${big.top - b.top + (big.height - b.height) / 2}px) scale(${big.width / b.width})` }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
    return new Promise(resolve => { resolveChoice = resolve; });
  }

  // 시작 화면이 떠 있는 동안 할 준비를 맡긴다(바로 시작하고, 고르기 화면은 끝날 때까지 기다린다).
  const tasks = [];
  function waitFor(label, run, weight = 1) { let work; try { work = Promise.resolve(run()).catch(() => {}); } catch { work = Promise.resolve(); } tasks.push({ label, work, weight }); return work; }
  return { choose, setStatus, waitFor, get choice() { return picked; }, set onReveal(fn) { onReveal = fn; } };
}
