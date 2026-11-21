// 11-21 시안(2026-11-21_로그인관리-시안): 설치판 오른쪽 위 「AI」를 누르면 그 아래에 뜨는 연결 관리 카드.
// AI 작업대를 열지 않고 보던 화면 위에 뜬다. 상태: 확인 중 · 연결됨 · 로그인 안 됨 · 로그인 기다림 · Codex 없음.
// 바깥을 누르거나 Esc로 닫는다. 로그인·로그아웃이 끝나면 '5e:desktop-auth-changed'를 알려 AI 작업대도 새로 읽게 한다.
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
  let overview = null, badgeTitle = null;

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
      card.append(head(named ? String(named).trim().charAt(0).toUpperCase() : '✓', '', email, plan, '연결됨', 'is-on'));
      const root = overview?.limits?.rateLimits || overview?.limits;
      const limits = [[root?.primary, '5시간 한도'], [root?.secondary, '이번 주 한도']]
        .filter(([item]) => Number.isFinite(Number(item?.usedPercent)));
      if (limits.length) {
        card.append(sep());
        for (const [item, fallback] of limits) {
          const left = Math.max(0, Math.min(100, Math.round(100 - Number(item.usedPercent))));
          const box = el('div', 'dac-limit');
          const lbl = el('div', 'dac-limit-lbl'); lbl.append(el('span', '', windowName(item, fallback)), el('b', '', [`${left}% 남음`, resetText(item.resetsAt)].filter(Boolean).join(' · ')));
          const bar = el('div', 'dac-bar'), fill = el('i'); fill.style.width = `${left}%`; bar.append(fill);
          box.append(lbl, bar); card.append(box);
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
    } else if (state === 'missing') {
      card.append(head('!', 'is-warn', 'Codex를 먼저 설치해 주세요', '5E의 AI는 Codex로 연결됩니다'), sep());
      const acts = el('div', 'dac-acts');
      acts.append(button('Codex 설치 페이지 열기 ↗', 'is-main', () => window.open(CODEX_INSTALL_URL, '_blank')),
        button('설치했어요 · 다시 찾기', '', () => void locate()));
      card.append(acts);
      const more = el('details', 'dac-more'); more.append(el('summary', 'dac-note', '직접 설치하기(명령어)'), el('div', 'dac-code', 'npm i -g @openai/codex'));
      card.append(more);
    } else if (state === 'error') {
      card.append(head('!', 'is-warn', '연결 상태를 읽지 못했어요', '잠시 뒤 다시 눌러 주세요'), sep());
      const acts = el('div', 'dac-acts'); acts.append(button('다시 확인', '', () => void check())); card.append(acts);
    }
    if (card.dataset.message) card.append(el('p', 'dac-note dac-message', card.dataset.message));
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
    if (status?.installed === false || login.installed === false) { setState('missing'); return status; }
    if (!login.loggedIn) { if (state !== 'logging-in') setState('logged-out'); return status; }
    if (state !== 'connected') { overview = null; setState('connected'); }
    try { overview = await desktop.account?.(); } catch { overview = overview || {}; }
    if (mine === epoch && state === 'connected') render();
    return status;
  }
  async function login() {
    if (!desktop.login) return;
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
  }
  function hide() {
    open = false; card.hidden = true;
    if (badgeTitle && !badge.getAttribute('title')) badge.setAttribute('title', badgeTitle);
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    badge.setAttribute('aria-expanded', 'false');
    if (state !== 'logging-in') { clearInterval(ticker); ticker = null; }
  }
  render();
  return { show, hide, toggle: () => (open ? hide() : show()), isOpen: () => open, element: card, check };
}
