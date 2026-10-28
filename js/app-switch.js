import { syncAppLock } from './app-lock.js?v=1.7.0-four-session-integration';
// 5E 세 프로그램 전환(시안 41, 10-20 승인): 맨 위 줄 로고 「5E_단어」 옆에 나머지 두 프로그램 이름(exam · image · hwp)을 두고,
// 누르면 그 프로그램을 연 뒤 지금 프로그램을 닫는다(사이에 그림 화면이 비치지 않게). 지금은 세 프로그램이 한 페이지 안에서 열리므로(그림 화면 위 덧창)
// 각 프로그램의 원래 열기·닫기 단추를 그대로 눌러 전환한다 — 저장·확인 창 같은 원래 동작을 거치게.
export const APPS = [
  ['exam', '출제 — 문항 만들기'],
  ['image', '그림 — 과학 그림·그래프'],
  ['hwp', '조판 — 시험지 인쇄 전 마무리'],
];

export function appSwitchHtml(current) {
  return APPS.filter(([key]) => key !== current)
    .map(([key, title]) => `<button type="button" class="app-switch-btn" data-app-switch="${key}" title="${title}">${key}</button>`).join('');
}

const SURFACE = { exam: 'exampool-sheet-workspace', hwp: 'rhwp-exam-workspace' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function currentApp(doc = document) {
  // 둘이 잠깐 함께 열려 있으면(전환 중) 위에 있는 출제 칸이 지금 프로그램이다.
  if (doc.getElementById(SURFACE.exam)?.hidden === false) return 'exam';
  if (doc.getElementById(SURFACE.hwp)?.hidden === false) return 'hwp';
  return 'image';
}

// 그림 화면(맨 바깥 문서)에서 한 번만 연결한다. 출제(ExamPool) 칸은 iframe이라 postMessage로 부탁한다.
export function initAppSwitch(doc = document) {
  if (doc.documentElement.dataset.appSwitchReady) return;
  doc.documentElement.dataset.appSwitchReady = 'on';
  const win = doc.defaultView;
  const surface = app => doc.getElementById(SURFACE[app]);
  const shown = app => surface(app)?.hidden === false;
  const until = async (test, ms) => { for (let waited = 0; !test() && waited < ms; waited += 50) await sleep(50); return test(); };
  const reduced = () => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // 출제 칸 안 문서가 다 그려졌는지(첫 열기는 iframe을 읽느라 시간이 걸린다)
  const examReady = () => !!surface('exam')?.querySelector('iframe')?.contentDocument?.querySelector('.side [data-pool]');
  // 칸이 한 번이라도 나타났는지: 잠깐 열렸다 닫혀도 놓치지 않게 hidden 속성 바뀜을 직접 지켜본다.
  const appear = (app, ms) => new Promise(resolve => {
    const el = surface(app);
    if (!el || !el.hidden) { resolve(!!el); return; }
    const done = value => { observer.disconnect(); clearTimeout(timer); resolve(value); };
    const observer = new MutationObserver(() => { if (!el.hidden) done(true); });
    observer.observe(el, { attributes: true, attributeFilter: ['hidden'] });
    const timer = setTimeout(() => done(!el.hidden), ms);
  });
  const openApp = async target => {
    // 출제: 숨겨 둔 원래 입구(#exam-pool-open — 준비가 끝나면 켜짐)를 누른다. 아직 준비 중이면 5초까지 기다린다. 누르면 바로 열린다.
    if (target === 'exam') {
      const entry = doc.getElementById('exam-pool-open');
      await until(() => !entry?.disabled, 5000);
      entry?.click();
      return shown('exam');
    }
    // 조판: 다른 작업(저장·「한글에 넣기」 취소 정리 등)으로 바쁜 순간에는 열기 요청을 받지 않으므로, 받아 줄 때까지 0.15초마다 다시 부탁한다.
    const seen = appear('hwp', 5000);
    for (let waited = 0; waited < 5000; waited += 150) {
      const detail = { accepted: false };
      win.dispatchEvent(new CustomEvent('5e:hwp-open', { detail }));
      if (detail.accepted) break;
      await sleep(150);
    }
    return seen;
  };
  // 닫기: 맨 위에 보이는 칸이면 살짝 흐려지며 사라지게 한 뒤 원래 닫기 동작을 거친다(조판은 저장을 마친 뒤 닫힘).
  const closeApp = async (from, fade) => {
    const el = surface(from);
    if (fade && !reduced()) { el.classList.add('app-leaving'); await sleep(170); }
    if (from === 'hwp') el.querySelector('[data-exam-action="close"]')?.click();
    if (from === 'exam') win.dispatchEvent(new CustomEvent('5e:exampool-close'));
    // 2초 안에 안 닫히면(저장 확인 창 등) 그대로 둔다.
    const closed = await until(() => !shown(from), 2000);
    el.classList.remove('app-leaving');
    return closed;
  };
  // 전환 중(약 0.4초)에 다른 이름을 누르면 버리지 않고 마지막으로 누른 것을 기억했다가, 지금 전환이 끝나면 이어서 간다.
  let switching = false, queued = null, last = { from: null, at: 0 };
  // 두 번 누름 막기(M8): 세 맨 위 줄은 같은 자리에 다른 이름이 있어서(그림 [exam|hwp], 출제 [image|hwp], 조판 [exam|image])
  // 이름을 빠르게 두 번 누르면 둘째 클릭이 새 화면에서 「방금 떠나온 프로그램」을 눌러 원래 화면으로 튕겨 돌아갔다.
  const bounce = target => target === last.from && performance.now() - last.at < 350;
  const go = async target => {
    if (bounce(target)) return;
    if (switching) { queued = target; return; }
    const from = currentApp(doc);
    if (target && target !== from) last = { from, at: performance.now() };
    if (!target || target === from) return;
    switching = true;
    try {
      // 조판은 자기 닫기 동작이 흐려지며 사라지므로 여기서는 출제 칸만 흐리게 한다.
      if (target === 'image') { await closeApp(from, from === 'exam'); return; }
      if (from === 'image') { await openApp(target); return; }
      // 두 프로그램 사이: 새 프로그램을 먼저 연 뒤 옛 프로그램을 닫아, 그 사이에 그림 화면이 번쩍 비치지 않게 한다.
      if (!await openApp(target)) return;
      if (target === 'exam') await until(examReady, 3000);
      // 새 칸이 다 나타난(0.18초) 뒤에 옛 칸을 닫는다 — 나타나는 도중에 닫으면 반투명한 틈으로 그림 화면이 비친다.
      if (!reduced()) await sleep(190);
      // 출제 칸이 위(z 1250), 조판이 아래(z 800) — 출제 칸을 닫을 때만 흐려지는 모습이 보인다.
      await closeApp(from, from === 'exam');
      if (target === 'exam') {
        // 그림 화면 잠금은 app-lock.js가 「보이는 칸」만 보고 정한다(전환 중 ✕로 출제 칸이 이미 닫혔으면 잠그지 않음 — H1).
        syncAppLock(doc);
        if (shown('exam')) surface('exam').querySelector('iframe')?.contentWindow?.focus?.();
      }
    } finally {
      switching = false;
      const next = queued; queued = null;
      if (next) void go(next);
    }
  };
  doc.addEventListener('click', event => {
    const button = event.target.closest?.('button[data-app-switch]');
    if (!button) return;
    event.preventDefault();
    if (event.detail > 1) return;
    void go(button.dataset.appSwitch);
  });
  win.addEventListener('message', event => {
    if (event.origin !== win.location.origin || event.data?.channel !== '5e-app-switch') return;
    void go(event.data.app);
  });
}
