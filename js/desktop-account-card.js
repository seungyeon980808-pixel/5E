// 11-21 시안(2026-11-21_로그인관리-시안): 설치판 오른쪽 위 「AI」를 누르면 그 아래에 뜨는 연결 관리 카드.
// AI 작업대를 열지 않고 보던 화면 위에 뜬다. 상태: 확인 중 · 연결됨 · 로그인 안 됨 · 로그인 기다림 · Codex 없음.
// 바깥을 누르거나 Esc로 닫는다. 로그인·로그아웃이 끝나면 '5e:desktop-auth-changed'를 알려 AI 작업대도 새로 읽게 한다.
// 11-22 시안(2026-11-22_설치-업데이트): Codex가 없으면 「GPT 로그인」 하나로 — 누르면 묻지 않고 설치 → 로그인.
// 설치에 실패했을 때만 이유·「다시 시도」·설치 페이지를 보인다. 맨 아래에 5E 버전 줄(새 버전이면 「업데이트」).
import { installCodex, cancelCodexInstall, codexInstallState, onCodexInstall, canAutoInstallCodex, INSTALL_STEPS, elapsedText, installFailureText } from './codex-auto-install.js?v=1.7.0-four-session-integration';
import { createUpdateRow } from './app-update-ui.js?v=1.7.0-four-session-integration';
export const CODEX_INSTALL_URL = 'https://github.com/openai/codex#readme';

const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; };
const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const resetText = at => {
  const ms = Number(at) * (Number(at) < 1e12 ? 1000 : 1);
  if (!Number.isFinite(ms) || ms <= Date.now()) return '';
  const hours = (ms - Date.now()) / 3_600_000;
  if (hours < 24) return `${Math.max(1, Math.ceil(hours))}시간 뒤 초기화`;
  return `${['일', '월', '화', '수', '목', '금', '토'][new Date(ms).getDay()]}요일 초기화`;
};
const windowName = (item, fallback) => {
  const mins = Number(item?.windowDurationMins);
  if (!Number.isFinite(mins) || mins <= 0) return fallback;
  if (mins <= 360) return `${Math.round(mins / 60)}시간 한도`;
  if (mins >= 10_000 && mins <= 10_200) return '이번 주 한도';
  return `${Math.round(mins / 1440)}일 한도`;
};
const PLAN_NAMES = { plus: 'ChatGPT Plus', pro: 'ChatGPT Pro', team: 'ChatGPT Team', business: 'ChatGPT Business', enterprise: 'ChatGPT Enterprise', edu: 'ChatGPT Edu', free: 'ChatGPT 무료' };

export function createDesktopAccountCard({ desktop, badge, onAuthChanged = () => {} }) {
  const card = el('div', 'desktop-account-card');
  card.hidden = true; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'AI 연결 관리');
  document.body.append(card);
  let open = false, state = 'checking', loginStartedAt = 0, ticker = null, epoch = 0;
  let overview = null, badgeTitle = null, installFailure = null;
  const autoInstall = canAutoInstallCodex(desktop);
  const updateRow = createUpdateRow({ desktop, onChange: () => { if (open) render(); } });

  const place = () => {
    const box = badge.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    // 시안처럼 카드 오른쪽 끝을 창 오른쪽(16px 안)에 맞추고, 꼬리는 「AI」 단추 가운데를 가리킨다.
    const x = Math.max(12, window.innerWidth - width - 16); // 「AI」는 늘 오른쪽 위에 있다
    card.style.width = `${width}px`; card.style.left = `${x}px`; card.style.top = `${box.bottom + 10}px`;
    card.style.setProperty('--tail-x', `${Math.max(14, Math.min(width - 24, box.left + box.width / 2 - x - 5))}px`);
  };
  const head = (avatar, avatarClass, title, sub, stateText, stateClass) => {
    const row = el('div', 'dac-row');
    const pic = el('div', `dac-avatar ${avatarClass || ''}`, avatar);
    const who = el('div', 'dac-who'); who.append(el('b', '', title), el('span', '', sub));
    row.append(pic, who);
    if (stateText) { const s = el('span', `dac-state ${stateClass || ''}`); if (stateClass === 'is-on') s.append(el('i', 'dac-dot')); s.append(stateText); row.append(s); }
    return row;
  };
  const button = (text, cls, onClick) => { const b = el('button', `dac-btn ${cls || ''}`, text); b.type = 'button'; b.addEventListener('click', onClick); return b; };
  const sep = () => el('div', 'dac-sep');

  const render = () => {
    clearInterval(ticker); ticker = null;
    card.replaceChildren();
    card.dataset.state = state;
    if (state === 'checking') {
      card.append(head('…', 'is-muted', '연결 확인 중', 'Codex 연결 상태를 읽고 있어요'));
    } else if (state === 'connected') {
      const account = overview?.account?.account || overview?.account || {};
      const named = account.email || account.name || (account.type === 'apiKey' ? 'API 키 계정' : '');
      const email = named || 'ChatGPT 계정';
      const plan = PLAN_NAMES[String(account.planType || '').toLowerCase()] || (account.planType ? `ChatGPT ${account.planType}` : (overview ? '로그인되어 있어요' : '계정 정보를 읽는 중…'));
      const offline = navigator.onLine === false;
      card.append(head(named ? String(named).trim().charAt(0).toUpperCase() : '✓', '', email, plan, offline ? '인터넷 없음' : '연결됨', offline ? 'is-off' : 'is-on'));
      if (offline) card.append(el('p', 'dac-note dac-message', '인터넷이 끊겨 지금은 AI를 쓸 수 없어요. 연결되면 바로 다시 씁니다.'));
      const root = overview?.limits?.rateLimits || overview?.limits;
      const limits = [[root?.primary, '5시간 한도'], [root?.secondary, '이번 주 한도']]
        .filter(([item]) => Number.isFinite(Number(item?.usedPercent)));
      // 11-22: 한도가 바닥나면 Codex는 크레딧에서 쓴다 — 카드에 크레딧이 없어서 밤새 쓴 양이 숫자에 안 보였다(한도 숫자는 맞았음).
      const credits = root?.credits;
      const balance = Number(credits?.balance);
      const hasCredits = Boolean(credits?.hasCredits) && (credits?.unlimited || Number.isFinite(balance));
      if (limits.length || hasCredits) {
        card.append(sep());
        for (const [item, fallback] of limits) {
          const left = Math.max(0, Math.min(100, Math.round(100 - Number(item.usedPercent))));
          const box = el('div', 'dac-limit');
          const usingCredits = left <= 0 && hasCredits;
          const lbl = el('div', 'dac-limit-lbl'); lbl.append(el('span', '', windowName(item, fallback)), el('b', usingCredits ? 'is-credit' : '', [usingCredits ? '다 씀 · 크레딧 사용 중' : `${left}% 남음`, resetText(item.resetsAt)].filter(Boolean).join(' · ')));
          const bar = el('div', 'dac-bar'), fill = el('i'); fill.style.width = `${left}%`; bar.append(fill);
          box.append(lbl, bar); card.append(box);
        }
        if (hasCredits) {
          const row = el('div', 'dac-limit-lbl dac-credit');
          row.append(el('span', '', '크레딧'), el('b', '', credits.unlimited ? '무제한' : `${Math.floor(balance).toLocaleString('ko-KR')} 남음`));
          row.title = '5시간·이번 주 한도를 다 쓰면 AI는 크레딧에서 씁니다.';
          card.append(row);
        }
      }
      card.append(sep());
      const acts = el('div', 'dac-acts');
      acts.append(button('↻ 다른 계정으로 로그인', 'is-quiet', () => void switchAccount()), button('⎋ 로그아웃', 'is-danger', () => confirmLogout()));
      card.append(acts);
    } else if (state === 'logged-out') {
      card.append(head('?', 'is-muted', '로그인이 필요해요', 'AI 그림·그래프·변환에 씁니다', '연결 안 됨', 'is-off'), sep());
      card.append(el('p', 'dac-note', 'ChatGPT 계정으로 로그인합니다. 누르면 브라우저가 열리고, 로그인을 마치면 여기로 돌아와 바로 이어서 씁니다.'));
      const acts = el('div', 'dac-acts is-spaced'); acts.append(button('GPT 로그인', 'is-main', () => void login())); card.append(acts);
    } else if (state === 'logging-in') {
      card.append(head('?', 'is-muted', '브라우저에서 로그인 중', '열린 창에서 계정을 고르세요'), sep());
      const acts = el('div', 'dac-acts');
      const wait = el('button', 'dac-btn is-main is-waiting'); wait.type = 'button'; wait.disabled = true;
      const spin = el('span', 'dac-spin'), label = el('span', '', `로그인 기다리는 중 · ${clock(Date.now() - loginStartedAt)}`);
      wait.append(spin, label);
      acts.append(wait, button('브라우저 창 다시 열기', 'is-quiet', () => void reopenLogin()), button('취소', 'is-quiet', () => void cancelLogin()));
      card.append(acts);
      ticker = setInterval(() => { label.textContent = `로그인 기다리는 중 · ${clock(Date.now() - loginStartedAt)}`; }, 1000);
    } else if (state === 'missing' && autoInstall) {
      card.append(head('?', 'is-muted', '로그인이 필요해요', 'AI 그림·그래프·변환에 씁니다', '연결 안 됨', 'is-off'), sep());
      card.append(el('p', 'dac-note', 'ChatGPT 계정으로 로그인합니다. 처음 한 번은 AI 연결 프로그램(Codex)을 먼저 설치해요(1~3분).'));
      const acts = el('div', 'dac-acts is-spaced'); acts.append(button('GPT 로그인', 'is-main', () => void login())); card.append(acts);
    } else if (state === 'installing') {
      const info = codexInstallState();
      card.append(head('…', 'is-muted', 'AI 연결 준비 중', 'Codex 설치 · 1~3분 걸려요'), sep());
      const steps = el('div', 'dac-steps');
      const order = INSTALL_STEPS.map(([key]) => key);
      const at = Math.max(0, order.indexOf(info.step === 'done' ? 'install' : info.step));
      let timer = null;
      INSTALL_STEPS.forEach(([key, label], index) => {
        const row = el('div', index < at || info.step === 'done' ? 'done' : index === at ? 'on' : '');
        const mark = el('i');
        if (row.className === 'done') mark.textContent = '✓'; else if (row.className === 'on') mark.append(el('span', 'dac-spin')); else mark.textContent = '·';
        const text = el('span', '', label);
        if (row.className === 'on') timer = text;
        row.append(mark, text); steps.append(row);
      });
      const last = el('div'); last.append(el('i', '', '·'), el('span', '', '브라우저에서 로그인')); steps.append(last);
      card.append(steps);
      const acts = el('div', 'dac-acts'); acts.append(button('취소', 'is-quiet', () => void cancelCodexInstall(desktop))); card.append(acts);
      if (timer && info.startedAt) {
        const base = timer.textContent;
        const tick = () => { timer.textContent = `${base} · ${elapsedText(Date.now() - info.startedAt)}`; };
        tick(); ticker = setInterval(tick, 1000);
      }
    } else if (state === 'install-failed') {
      card.append(head('!', 'is-warn', 'Codex를 설치하지 못했어요', installFailureText(installFailure)), sep());
      const acts = el('div', 'dac-acts');
      acts.append(button('다시 시도', 'is-main', () => void login()), button('설치 페이지 열기 ↗', '', () => window.open(CODEX_INSTALL_URL, '_blank')));
      card.append(acts);
      const more = el('details', 'dac-more'); more.append(el('summary', 'dac-note', '직접 설치하기(명령어)'), el('div', 'dac-code', navigator.platform?.startsWith('Win') ? 'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"' : 'curl -fsSL https://chatgpt.com/codex/install.sh | sh'));
      card.append(more);
    } else if (state === 'missing') {
      card.append(head('!', 'is-warn', 'Codex를 먼저 설치해 주세요', '5E의 AI는 Codex로 연결됩니다'), sep());
      const acts = el('div', 'dac-acts');
      acts.append(button('Codex 설치 페이지 열기 ↗', 'is-main', () => window.open(CODEX_INSTALL_URL, '_blank')),
        button('설치했어요 · 다시 찾기', '', () => void locate()));
      card.append(acts);
      const more = el('details', 'dac-more'); more.append(el('summary', 'dac-note', '직접 설치하기(명령어)'), el('div', 'dac-code', navigator.platform?.startsWith('Win') ? 'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"' : 'curl -fsSL https://chatgpt.com/codex/install.sh | sh'));
      card.append(more);
    } else if (state === 'error') {
      card.append(head('!', 'is-warn', '연결 상태를 읽지 못했어요', '잠시 뒤 다시 눌러 주세요'), sep());
      const acts = el('div', 'dac-acts'); acts.append(button('다시 확인', '', () => void check())); card.append(acts);
    }
    if (card.dataset.message) card.append(el('p', 'dac-note dac-message', card.dataset.message));
    if (state !== 'checking') { const row = updateRow.element(); if (row) card.append(sep(), row); }
    if (open) place();
  };
  const setState = (next, message = '') => { state = next; if (message) card.dataset.message = message; else delete card.dataset.message; render(); };

  async function check() {
    const mine = ++epoch;
    if (state !== 'logging-in') setState(state === 'connected' && overview ? 'connected' : 'checking');
    let status;
    try { status = await desktop.status(); } catch { if (mine === epoch) setState('error'); return null; }
    if (mine !== epoch) return status;
    const login = status?.login || {};
    if (codexInstallState().running) { setState('installing'); return status; }
    if (status?.installed === false || login.installed === false) { if (state !== 'install-failed') setState('missing'); return status; }
    if (!login.loggedIn) { if (state !== 'logging-in') setState('logged-out'); return status; }
    if (state !== 'connected') { overview = null; setState('connected'); }
    try { overview = await desktop.account?.(); } catch { overview = overview || {}; }
    if (mine === epoch && state === 'connected') render();
    return status;
  }
  async function login() {
    if (!desktop.login) return;
    // Codex가 없으면(또는 설치 중이면) 먼저 설치하고, 끝나면 그대로 로그인으로 잇는다.
    if (autoInstall && (state === 'missing' || state === 'install-failed' || state === 'installing' || codexInstallState().running)) {
      installFailure = null; setState('installing');
      const result = await installCodex(desktop);
      if (!result?.ok) {
        if (result?.code === 'CODEX_INSTALL_CANCELLED') { setState('missing', '설치를 취소했어요.'); return; }
        installFailure = result; setState('install-failed'); return;
      }
      onAuthChanged('installed');
    }
    loginStartedAt = Date.now(); setState('logging-in');
    let result;
    try { result = await desktop.login(); } catch (error) { result = { ok: false, message: error?.message }; }
    if (result?.cancelled) return; // 취소·다시 열기가 화면을 이미 바꿨다
    if (result?.ok) { overview = null; setState('connected'); onAuthChanged('login'); void check(); return; }
    if (/NOT_FOUND/.test(String(result?.code || ''))) { setState('missing'); return; }
    setState('logged-out', result?.code === 'CODEX_LOGIN_TIMEOUT' ? '로그인을 10분 안에 마치지 못했어요. 다시 눌러 주세요.' : '로그인을 마치지 못했어요. 다시 눌러 주세요.');
  }
  async function cancelLogin() {
    try { await desktop.cancelLogin?.(); } catch {}
    setState('logged-out');
  }
  async function reopenLogin() {
    try { await desktop.cancelLogin?.(); } catch {}
    void login();
  }
  async function switchAccount() {
    const ok = await logout({ quiet: true });
    if (ok) void login();
  }
  async function logout({ quiet = false } = {}) {
    if (!desktop.logout) return false;
    setState('checking');
    let result;
    try { result = await desktop.logout(); } catch (error) { result = { ok: false, message: error?.message }; }
    overview = null;
    onAuthChanged('logout');
    if (result?.ok) { if (!quiet) setState('logged-out', '로그아웃했어요.'); return true; }
    await check();
    if (!quiet) card.dataset.message = '로그아웃하지 못했어요. 잠시 뒤 다시 눌러 주세요.', render();
    return false;
  }
  function confirmLogout() {
    const back = el('div', 'dac-confirm');
    const box = el('div', 'dac-confirm-box'); box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-label', '로그아웃 확인');
    box.append(el('h3', '', '로그아웃할까요?'), el('p', '', '이 컴퓨터의 Codex 로그인이 풀립니다. Codex를 쓰는 다른 프로그램도 다시 로그인해야 합니다. 진행 중인 AI 작업은 멈춥니다.'));
    const two = el('div', 'dac-confirm-acts');
    const close = () => back.remove();
    two.append(button('취소', '', close), button('로그아웃', 'is-red', () => { close(); void logout(); }));
    box.append(two); back.append(box);
    back.addEventListener('pointerdown', event => { if (event.target === back) close(); });
    back.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    document.body.append(back);
    two.firstChild?.focus();
  }
  async function locate() {
    setState('checking');
    try { await desktop.locateCodex?.(); } catch {}
    await check();
  }

  const onOutside = event => { if (!open) return; if (card.contains(event.target) || badge.contains(event.target) || event.target.closest?.('.dac-confirm')) return; hide(); };
  const onKey = event => { if (open && event.key === 'Escape' && !document.querySelector('.dac-confirm')) { event.preventDefault(); hide(); badge.focus(); } };
  function show() {
    if (open) return;
    open = true; card.hidden = false; place();
    badgeTitle = badge.getAttribute('title'); badge.removeAttribute('title'); // 열려 있는 동안 단추 말풍선이 카드를 가리지 않게
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    badge.setAttribute('aria-expanded', 'true');
    void check();
    updateRow.refresh();
  }
  function hide() {
    open = false; card.hidden = true;
    if (badgeTitle && !badge.getAttribute('title')) badge.setAttribute('title', badgeTitle);
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    badge.setAttribute('aria-expanded', 'false');
    if (state !== 'logging-in' && state !== 'installing') { clearInterval(ticker); ticker = null; }
  }
  // 다른 곳(AI 작업대)에서 시작한 설치도 카드에 보인다.
  // 11-22: 인터넷이 끊기거나 돌아오면 열린 카드도 바로 바꾼다.
  window.addEventListener('online', () => { if (open) void check(); });
  window.addEventListener('offline', () => { if (open) render(); });
  onCodexInstall(info => {
    if (info.running) { if (state !== 'installing') setState('installing'); else render(); return; }
    if (state === 'installing') void check(); // 다른 곳에서 시작한 설치가 끝남 → 지금 상태로
  });
  render();
  return { show, hide, toggle: () => (open ? hide() : show()), isOpen: () => open, element: card, check };
}
