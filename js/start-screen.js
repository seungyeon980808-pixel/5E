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
// 한 프레임 쉬기: 다음 그리기 뒤로 넘긴다. 창이 가려져 rAF가 멈춰도 50ms 뒤엔 넘어간다(준비가 멈추지 않게).
const yieldFrame = () => new Promise(resolve => {
  let done = false; const go = () => { if (!done) { done = true; resolve(); } };
  requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 50);
});
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

// 11-20 빛 띠(합성기 전용). 예전 CSS는 글자에 오려 붙인 그라디언트(background-clip:text)의 background-position을 움직였는데,
// 그건 매 프레임 주 스레드에서 다시 그려야 해서 준비 작업(라이브러리·조판 엔진·글꼴)이 주 스레드를 잡으면 띠가 끊기며 좌우로 깜빡였다.
// 같은 띠를 두 층으로 만든다: 띠 창(W, 띠 모양 mask)은 띠 위치로 옮기고, 그 안의 글자 사본(T)은 정확히 반대로 옮겨 글자는 제자리.
// 둘 다 transform 애니메이션이라 주 스레드가 막혀도 합성기에서 부드럽게 돈다. 색은 예전 그라디언트를 흰 층·푸른 층으로 나눠 그대로 되살린다
// (흰 층 위에 푸른 층을 겹치면 premultiplied 보간과 같은 색). 모양 값(각도·배경 크기·위치·멈춤점)은 예전 CSS 값 그대로다.
export const SHINES = {
  // .ss-big.shine::after: linear-gradient(105deg,transparent 40%,#fff 49%,#bcd6ff 51%,transparent 60%) 260% · 140%→-40%
  big: { angle: 105, size: 2.6, from: 1.4, to: -0.4, layers: [
    { color: '#fff', stops: [[0.40, 0], [0.49, 1], [0.51, 1], [0.51, 0]] },
    { color: '#bcd6ff', stops: [[0.49, 0], [0.51, 1], [0.60, 0]] }] },
  // .ss-five::after: (105deg, …rgba(255,255,255,0) 43%,#fff 49%,#bcd6ff 51%,rgba(255,255,255,0) 57%…) 260% · 120%→-20%(6초 중 37%), 되풀이
  five: { angle: 105, size: 2.6, from: 1.2, to: -0.2, layers: [
    { color: '#fff', stops: [[0.43, 0], [0.49, 1], [0.51, 1], [0.51, 0]] },
    { color: '#bcd6ff', stops: [[0.49, 0], [0.51, 1], [0.57, 0]] }] },
  // .ss-sl(다섯 단어): (100deg,transparent 40%,rgba(255,255,255,.9) 48%,#cfe0ff 52%,transparent 60%) 320% · 140%→-40%
  col: { angle: 100, size: 3.2, from: 1.4, to: -0.4, layers: [
    { color: '#fff', stops: [[0.40, 0], [0.48, 0.9], [0.52, 0.9], [0.52, 0]] },
    { color: '#cfe0ff', stops: [[0.48, 0], [0.52, 1], [0.60, 0]] }] },
};
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// host 위에 띠 층을 만들고, 띠를 움직이는 함수(play(frames, options))를 돌려준다. glyph(color)는 글자 사본을 만든다.
// 띠 창(W)은 예전 배경 상자 그대로(가로 size배·세로 100%, 같은 각도의 그라디언트를 알파 mask로)이고, 예전 background-position만큼
// translateX로 옮긴다. 글자 사본(T)은 반대로 옮겨 글자는 제자리. 기울이기(skew) 없이 평행 이동만 써서 글자가 흐려지지 않는다.
export function buildShine(host, spec, glyph) {
  // offsetWidth는 정수로 반올림돼 사본 상자가 0.x px 달라지고, 그 차이가 격자 줄 사이로 퍼져 글자가 어긋난다 — 소수점 크기 그대로 쓴다.
  const { width: w, height: h } = host.getBoundingClientRect();
  if (!w || !h) return null;
  const S = spec.size * w;
  const at = pos => (w - S) * pos; // background-position: pos(비율) → 배경 상자의 왼쪽 끝 위치(px)
  const layers = spec.layers.map(({ color, stops }) => {
    const W = document.createElement('span'); W.className = 'ss-shine-w'; W.setAttribute('aria-hidden', 'true');
    const mask = `linear-gradient(${spec.angle}deg,rgba(0,0,0,0) 0%,${stops.map(([g, a]) => `rgba(0,0,0,${a}) ${(g * 100).toFixed(3)}%`).join(',')},rgba(0,0,0,0) 100%)`;
    Object.assign(W.style, { width: `${S}px`, height: `${h}px`, webkitMaskImage: mask, maskImage: mask });
    const T = glyph(color); T.classList.add('ss-shine-t'); T.setAttribute('aria-hidden', 'true');
    Object.assign(T.style, { width: `${w}px`, height: `${h}px` });
    W.append(T); host.append(W);
    return { W, T };
  });
  const wT = pos => `translateX(${at(pos)}px)`, tT = pos => `translateX(${-at(pos)}px)`;
  layers.forEach(l => { l.W.style.transform = wT(spec.from); l.T.style.transform = tT(spec.from); });
  return {
    play(frames, options) {
      const kf = make => frames.map(([offset, pos, easing]) => ({ offset, transform: make(pos), ...(easing ? { easing } : {}) }));
      return layers.flatMap(l => [l.W.animate(kf(wT), options), l.T.animate(kf(tT), options)]);
    },
  };
}
// 글자 하나(「5E」) 사본: host와 같은 글꼴·자간·안쪽 여백으로 그 자리에 겹친다.
export const textGlyph = host => color => {
  const cs = getComputedStyle(host), t = document.createElement('span');
  t.textContent = host.firstChild?.nodeType === 3 ? host.firstChild.textContent : '5E';
  for (const k of ['fontStyle', 'fontWeight', 'fontSize', 'fontFamily', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) t.style[k] = cs[k];
  Object.assign(t.style, { boxSizing: 'border-box', color, display: 'block' });
  return t;
};

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

function drawBigFiveE(big) {
  if (!big || reducedMotion()) return;
  try {
    const NS = 'http://www.w3.org/2000/svg';
    const W = big.offsetWidth, H = big.offsetHeight;
    if (!W || !H) return;
    big.style.animation = 'none';
    big.style.color = 'transparent';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ss-draw'); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', '0'); text.setAttribute('y', '0'); text.setAttribute('dominant-baseline', 'text-before-edge');
    text.textContent = big.textContent; svg.append(text); big.append(svg);
    const range = document.createRange(); range.selectNodeContents(big.firstChild);
    const real = range.getBoundingClientRect(), box = svg.getBoundingClientRect(), bb = text.getBBox(), k = box.width / W || 1;
    text.setAttribute('x', String((real.left - box.left) / k - bb.x));
    text.setAttribute('y', String((real.top - box.top) / k - bb.y));
    setTimeout(() => { big.style.transition = 'color .25s'; big.style.color = ''; setTimeout(() => { svg.remove(); big.style.transition = ''; }, 300); }, 1800);
  } catch { big.style.color = ''; big.querySelector('.ss-draw')?.remove(); }
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
     <div class="ss-bottom"><div class="ss-ko">과학 평가문항 제작 플랫폼</div><div class="ss-bar"><i></i></div><div class="ss-st"></div></div></div>
    <div class="ss-ready"><span class="ss-five">5E</span></div>
    <div class="ss-mean"><small>과학 평가문항 제작 플랫폼</small><div class="ss-en"><span>sci<b>E</b>nce <b>E</b>ducational</span><span><b>E</b>valuation <b>E</b>xam <b>E</b>ditor</span></div></div>
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
  // 다섯 단어 위를 지나는 빛: 단어 칸 사본(색만 띠 색)을 글자 사본으로 쓴다.
  const colGlyph = color => { const t = colEl.cloneNode(true); t.querySelectorAll('.ss-shine-w').forEach(n => n.remove()); [...t.children].forEach(span => { span.style.color = color; span.style.animation = 'none'; }); return t; };
  // 11-21 사용자 승인(시안 시작화면-인트로): 큰 「5E」 자리에서만 소개 페이지의 「획이 그려지는」 효과 — 같은 글꼴로 윤곽선을
  // 실제 글자 자리에 픽셀 단위로 맞춰 1.5초 그리고 채운 뒤 실제 글자로 넘긴다. 원래의 올라오기·흐림은 이때 끈다(위치가 떠 보였다).
  drawBigFiveE(root.querySelector('.ss-big'));
  const bar = root.querySelector('.ss-bar i'), status = root.querySelector('.ss-st');
  const started = performance.now();
  // 11-20: 진행 막대는 너비(width, 매번 배치 다시 계산·주 스레드) 대신 scaleX로 채운다 — 전환이 합성기에서 돌아 준비 작업 중에도 매끄럽다. 모양은 같다.
  const setBar = p => { bar.style.transform = `scaleX(${Math.max(0, Math.min(1, p)).toFixed(4)})`; };
  // 단계 목록이 오기 전에는 12%까지만 천천히(가끔 멈칫) — 단계 막대가 뒤로 가지 않게.
  let progress = 0.03; setBar(progress);
  const creep = setInterval(() => { if (Math.random() < 0.3) return; progress = Math.min(0.12, progress + (0.12 - progress) * (0.05 + Math.random() * 0.15)); setBar(progress); }, 120);
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
  // 11-17 B3: 시작 창이 떠 있는 동안 .5e가 들어오면(꺼진 앱을 파일 두 번 눌러 켬) 고르기를 기다리지 않고
  // 카드를 고른 것처럼 시작 창을 걷는다 — 파일은 걷힌 뒤 project-launch.js 줄에서 맞는 프로그램으로 열린다.
  // 첫 장면(준비 중)이면 남은 머무는 시간을 건너뛴다(준비 작업은 뒤에서 계속).
  let skipChoice = null, onSkip = null;
  const leaveWith = choice => {
    picked = choice; resolveChoice = null;
    clearInterval(creep);
    void leave();
    document.removeEventListener('keydown', onKey, true);
    return choice;
  };
  function skip(choice = { kind: 'file' }) {
    if (picked || skipChoice) return;
    if (resolveChoice) { finish(choice); return; }
    skipChoice = choice; onSkip?.();
  }
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
    if (skipChoice) return leaveWith(skipChoice);
    const skipped = new Promise(resolve => { onSkip = resolve; });
    const orSkip = work => Promise.race([work, skipped]);
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
    const drift = setInterval(() => { if (Math.random() < 0.18) return; progress += (target - progress) * (0.04 + Math.random() * 0.2); setBar(progress); }, 90);
    const totalWeight = () => tasks.reduce((sum, t) => sum + (t.weight || 1), 0);
    let done = 0;
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i], w = task.weight || 1;
      setStatus(task.label);
      const budget = Math.max(0, MIN_INTRO - 700 - (performance.now() - started)), restWeight = Math.max(w, totalWeight() - done);
      const slot = budget * (w / restWeight) * (0.75 + Math.random() * 0.5);
      target = 0.12 + 0.8 * (done + w) / totalWeight();
      await orSkip(Promise.all([
        Promise.race([task.work, new Promise(r => setTimeout(r, Math.max(0, 25000 - (performance.now() - started))))]),// 25초에서 끊고 들어감(준비는 뒤에서 계속)
        new Promise(r => setTimeout(r, slot)),
      ]));
      if (skipChoice) { clearInterval(drift); return leaveWith(skipChoice); }
      done += w;
    }
    clearInterval(drift);
    setBar(1); setStatus('준비 완료');
    const wait = Math.max(0, MIN_INTRO - (performance.now() - started));
    await orSkip(new Promise(r => setTimeout(r, wait)));
    if (skipChoice) return leaveWith(skipChoice);
    if (!reducedMotion()) {
      const sweepOnce = { duration: 1300, easing: 'ease-in-out', fill: 'both' };
      buildShine(colEl, SHINES.col, colGlyph)?.play([[0, SHINES.col.from], [1, SHINES.col.to]], sweepOnce);
      const bigEl = root.querySelector('.ss-big');
      buildShine(bigEl, SHINES.big, textGlyph(bigEl))?.play([[0, SHINES.big.from], [1, SHINES.big.to]], sweepOnce);
    }
    await orSkip(new Promise(r => setTimeout(r, 450)));
    if (skipChoice) return leaveWith(skipChoice);
    // 큰 「5E」가 왼쪽 칸의 「5E」 자리로 옮겨 가며 줄어든다
    const big = root.querySelector('.ss-big').getBoundingClientRect();
    win.classList.add('is-ready');
    const five = root.querySelector('.ss-five');
    // 왼쪽 칸 「5E」의 되풀이 빛(6초 중 앞 37%에 지나감). 예전엔 숨은 채로도 처음부터 돌았으니, 같은 박자를 이어 받아 지금부터만 돌린다.
    if (!reducedMotion()) {
      const loop = buildShine(five, SHINES.five, textGlyph(five))?.play([[0, SHINES.five.from, 'ease-in-out'], [0.37, SHINES.five.to], [1, SHINES.five.to]], { duration: 6000, iterations: Infinity });
      loop?.forEach(a => { a.currentTime = (performance.now() - started) % 6000; });
    }
    requestAnimationFrame(() => {
      const b = five.getBoundingClientRect();
      five.animate?.([{ transform: `translate(${big.left - b.left + (big.width - b.width) / 2}px,${big.top - b.top + (big.height - b.height) / 2}px) scale(${big.width / b.width})` }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
    return new Promise(resolve => { resolveChoice = resolve; });
  }

  // 시작 화면이 떠 있는 동안 할 준비를 맡긴다(바로 시작하고, 고르기 화면은 끝날 때까지 기다린다).
  // 11-20: 예전엔 waitFor가 부르는 즉시 run()을 시작해 무거운 준비(라이브러리·출제 화면·조판 엔진 WASM·글꼴·클립보드)의 동기 부분이
  // 한 작업 안에 몰렸다 — 그동안 화면(막대·글자)이 멈췄다. 이제 앞 단계의 동기 부분이 끝나면 한 프레임 쉬고 다음 단계를 시작한다.
  // 일 자체는 예전처럼 겹쳐 진행된다(끝날 때까지 기다리지 않음) — 전체 준비 시간은 늘지 않고 시작만 프레임 단위로 나뉜다.
  const tasks = [];
  let startedChain = Promise.resolve();
  function waitFor(label, run, weight = 1) {
    let markStarted;
    const startedHere = new Promise(resolve => { markStarted = resolve; });
    const work = startedChain.then(yieldFrame).then(() => { try { return run(); } finally { markStarted(); } }).catch(() => {});
    startedChain = startedHere;
    tasks.push({ label, work, weight });
    return work;
  }
  return { choose, setStatus, waitFor, skip, get choice() { return picked; }, set onReveal(fn) { onReveal = fn; } };
}
