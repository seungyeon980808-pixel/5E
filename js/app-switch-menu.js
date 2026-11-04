// 맨 위 줄 프로그램 전환 목록(11-04 시안 topbar-switch-1104): 로고 「5E_image ▾」에 마우스를 올리면(0.12초) 세 프로그램 목록이 스르륵 내려온다.
// 떼면 0.3초 뒤 닫힌다(목록으로 내려가는 동안 닫히지 않게). 누르거나 Enter·↓로도 연다. 목록 단추는 data-app-switch라 전환은 app-switch.js가 그대로 한다.
// 예전 줄 위 「exam hwp」 글자(nav.app-switch)는 숨긴다 — 고른 것만 크고 나머지는 작아 서로 다른 프로그램 단추로 안 보였다(11-04 사용자).
// 단축키: 맥 ⌥⌘1·2·3, 윈도우 Ctrl+Alt+1·2·3(⌘1~9는 브라우저 탭 바꾸기와 겹침).
import { IS_MAC } from './platform.js?v=1.7.0-four-session-integration';

// 세 프로그램 목록 맨 아래 「기능 안내 페이지 열기」(11-04: image 목록 기준으로 셋 다 같게).
export const GUIDE_URL = 'https://seungyeon980808-pixel.github.io/personal_site/projects/physics-draw.html';
const ORDER = [['image', '그림·도식 만들기'], ['exam', '문항 만들기·시험지'], ['hwp', '인쇄 전 조판']];
export const appKeyLabel = n => IS_MAC ? `⌥⌘${n}` : `Ctrl+Alt+${n}`;
// 프로그램 전환 단축키: 눌린 키가 맞으면 'image'·'exam'·'hwp', 아니면 null.
export function appSwitchKey(event) {
  if (!event.altKey || event.shiftKey || !(IS_MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)) return null;
  const n = /^Digit([123])$/.exec(event.code || '')?.[1];
  return n ? ORDER[n - 1][0] : null;
}

const CSS = `
.app-menu-trigger{cursor:default}
.app-menu-trigger:focus:not(:focus-visible){outline:none;box-shadow:none}
.app-menu-trigger .app-menu-caret{display:inline-block;width:14px;height:14px;margin-left:7px;flex:none;align-self:center;color:var(--ds-ink-3,#8b95a5);transition:transform .2s,color .2s}
.app-menu-trigger .app-menu-caret svg{display:block;width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.app-menu-trigger:hover .app-menu-caret,.app-menu-trigger.is-open .app-menu-caret{color:var(--ds-ink,#e6edf3)}
.app-menu-trigger.is-open .app-menu-caret{transform:rotate(180deg)}
nav.app-switch.has-app-menu{display:none!important}
/* hwp 로고(글자 칸)도 image·exam처럼 열린 동안 둥근 바탕이 보이게 — 자리를 밀지 않도록 그림자로 넓힌다 */
.exam-brand.app-menu-trigger{border-radius:6px}
.exam-brand.app-menu-trigger:hover,.exam-brand.app-menu-trigger.is-open{background:var(--ds-hover,#1d2633);box-shadow:0 0 0 6px var(--ds-hover,#1d2633)}
.app-menu{position:fixed;z-index:3000;width:280px;box-sizing:border-box;font:400 16px/normal "IBM Plex Sans KR",-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;letter-spacing:normal;text-align:left;background:#141a23;border:1px solid #2b3442;border-radius:12px;padding:6px;box-shadow:0 14px 34px rgba(0,0,0,.5);
  opacity:0;transform:translateY(-6px);pointer-events:none;transition:opacity .18s ease,transform .18s ease}
.app-menu.is-open{opacity:1;transform:none;pointer-events:auto}
.app-menu::before{content:'';position:absolute;left:0;right:0;top:-10px;height:10px}
.app-menu button,.app-menu a{box-sizing:border-box;display:flex;align-items:baseline;gap:12px;width:100%;height:auto;min-height:0;margin:0;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:#e6edf3;font:inherit;line-height:normal;box-shadow:none;text-align:left;text-decoration:none;cursor:pointer}
.app-menu button:hover,.app-menu button:focus-visible,.app-menu a:hover{background:#1d2633;outline:none}
.app-menu button[aria-current="true"]{background:#1a2230;box-shadow:inset 0 0 0 1px #2f3b4d}
.app-menu b{font:italic 700 17px Georgia,"Times New Roman",serif;width:86px;flex:none}
.app-menu span{font-size:12.5px;color:#8b95a5}
.app-menu kbd{margin-left:auto;font:inherit;font-size:11px;color:#6e7681}
.app-menu .app-menu-guide{margin-top:4px;border-top:1px solid #232a35;border-radius:0 0 8px 8px;font-size:12px;color:#8b95a5}
@media (prefers-reduced-motion:reduce){.app-menu{transition:none}}
`;

// brand: 로고 요소(「5E_image」 등) · current: 지금 프로그램 · guide: 목록 맨 아래 안내 페이지 주소
// toggleOnClick: 로고를 누르면 목록을 여닫음(출제 로고는 보관함으로 가는 원래 동작을 지키려고 false).
export function attachAppMenu(brand, current, { guide = GUIDE_URL, toggleOnClick = true } = {}) {
  if (!brand || brand.dataset.appMenu) return null;
  const doc = brand.ownerDocument, win = doc.defaultView;
  brand.dataset.appMenu = 'on';
  if (!doc.getElementById('app-menu-style')) { const s = doc.createElement('style'); s.id = 'app-menu-style'; s.textContent = CSS; doc.head.append(s); }
  doc.querySelectorAll('nav.app-switch').forEach(nav => nav.classList.add('has-app-menu'));
  // 로고의 옛 설명(「기능 안내 페이지」)은 목록과 겹쳐 두 번 뜨므로 지운다 — 안내 페이지는 목록 맨 아래에 있다.
  brand.removeAttribute('title'); delete brand.dataset.tip;
  brand.classList.add('app-menu-trigger');
  brand.setAttribute('aria-haspopup', 'menu'); brand.setAttribute('aria-expanded', 'false');
  if (!brand.querySelector('.app-menu-caret')) brand.insertAdjacentHTML('beforeend', '<i class="app-menu-caret" aria-hidden="true"><svg viewBox="0 0 14 14"><path d="M3.5 5.5 7 9l3.5-3.5"/></svg></i>');
  const menu = doc.createElement('div');
  menu.className = 'app-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('data-shortcut-label-fixed', '');// platform.js가 ⌥⌘를 「Alt+⌘」로 다시 쓰지 않게 menu.setAttribute('aria-label', '5E 프로그램');
  menu.innerHTML = ORDER.map(([key, what], i) => `<button type="button" role="menuitem" data-app-switch="${key}" aria-current="${key === current}"><b>${key}</b><span>${what}</span><kbd>${appKeyLabel(i + 1)}</kbd></button>`).join('')
    + (guide ? `<a class="app-menu-guide" role="menuitem" href="${guide}" target="_blank" rel="noopener">기능 안내 페이지 열기</a>` : '');
  doc.body.append(menu);
  let timer = 0;
  const inset = brand.classList.contains('exam-brand') ? 6 : 0;// hwp 로고 바탕은 그림자로 6px 넓혔으니 목록도 그 바탕 왼쪽에 맞춘다
  const place = () => { const r = brand.getBoundingClientRect(); menu.style.left = `${Math.max(6, r.left - inset)}px`; menu.style.top = `${r.bottom + 6}px`; };
  const open = () => { clearTimeout(timer); place(); menu.classList.add('is-open'); brand.classList.add('is-open'); brand.setAttribute('aria-expanded', 'true'); };
  const close = () => { clearTimeout(timer); menu.classList.remove('is-open'); brand.classList.remove('is-open'); brand.setAttribute('aria-expanded', 'false'); };
  const later = (fn, ms) => { clearTimeout(timer); timer = win.setTimeout(fn, ms); };
  brand.addEventListener('mouseenter', () => later(open, 120));
  brand.addEventListener('mouseleave', () => later(close, 300));
  menu.addEventListener('mouseenter', () => clearTimeout(timer));
  menu.addEventListener('mouseleave', () => later(close, 300));
  // 로고를 누르면 목록을 열고 닫는다(원래 가던 곳 — 안내 페이지 — 은 목록 맨 아래로). 출제 로고(보관함으로)는 원래 동작 그대로.
  if (toggleOnClick) brand.addEventListener('click', event => { event.preventDefault(); menu.classList.contains('is-open') ? close() : open(); });
  brand.addEventListener('keydown', event => {
    if (['Enter', ' ', 'ArrowDown'].includes(event.key) && (toggleOnClick || event.key === 'ArrowDown')) { event.preventDefault(); open(); menu.querySelector('button')?.focus(); }
  });
  menu.addEventListener('keydown', event => {
    const items = [...menu.querySelectorAll('button,a')], at = items.indexOf(doc.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
    if (event.key === 'Escape') { event.preventDefault(); close(); brand.focus?.(); }
  });
  menu.addEventListener('click', () => close());
  doc.addEventListener('pointerdown', event => { if (!menu.contains(event.target) && !brand.contains(event.target)) close(); }, true);
  win.addEventListener('blur', close);
  return { open, close, menu };
}
