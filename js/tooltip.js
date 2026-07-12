/* ===== CUSTOM TOOLTIP: 네이티브 title= 을 앱 톤의 툴팁으로 대체 =====
 *
 * 앱 전역의 title 속성은 브라우저 기본 툴팁(스타일 불가)으로 떠서 디자인과
 * 어울리지 않는다. 이 모듈은 [title]/[data-tip] 요소에 hover/focus 시,
 * 앱 색 토큰(bg-panel·border·text)으로 그린 커스텀 툴팁을 띄운다.
 *
 * 방식
 *   · 위임 리스너(mouseover/focusin) 하나로 전 요소를 커버한다.
 *   · 첫 hover 때 el.title → el.dataset.tip 으로 옮기고 title 을 비워
 *     네이티브 툴팁이 이중으로 뜨지 않게 한다. title 이 JS로 갱신되는
 *     요소(테마 토글 등)는 매 hover 마다 다시 읽어 최신 문구를 반영한다.
 *   · fixed 위치. 기본은 요소 위, 공간이 없으면 아래. 좌우는 뷰포트 클램프.
 */

const SHOW_DELAY = 320; // ms — 스치듯 지나갈 때 안 뜨게 하는 지연
let tipEl = null;
let curTarget = null;
let showTimer = 0;

function ensureTip() {
  if (tipEl) return tipEl;
  tipEl = document.createElement("div");
  tipEl.className = "app-tooltip";
  tipEl.setAttribute("role", "tooltip");
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  return tipEl;
}

// 네이티브 title 을 흡수해 문구를 돌려준다(이중 툴팁 방지). 없으면 data-tip 사용.
function textFor(el) {
  const native = el.getAttribute("title");
  if (native) {
    el.dataset.tip = native;
    el.setAttribute("title", ""); // 브라우저 기본 툴팁 억제
  }
  return el.dataset.tip || "";
}

function place(el) {
  const r = el.getBoundingClientRect();
  const t = tipEl;
  t.hidden = false; // 측정 위해 먼저 표시
  const tw = t.offsetWidth;
  const th = t.offsetHeight;
  const M = 8; // 요소와의 간격
  let top = r.top - th - M;
  let below = false;
  if (top < 6) { top = r.bottom + M; below = true; }
  let left = r.left + r.width / 2 - tw / 2;
  left = Math.max(6, Math.min(left, window.innerWidth - tw - 6));
  t.style.top = `${Math.round(top)}px`;
  t.style.left = `${Math.round(left)}px`;
  t.dataset.place = below ? "below" : "above";
}

function show(el) {
  const txt = textFor(el);
  if (!txt) return;
  const t = ensureTip();
  t.textContent = txt;
  place(el);
  t.classList.add("is-visible");
}

function hide() {
  clearTimeout(showTimer);
  showTimer = 0;
  curTarget = null;
  if (tipEl) {
    tipEl.classList.remove("is-visible");
    tipEl.hidden = true;
  }
}

function onEnter(e) {
  const el = e.target.closest && e.target.closest("[title],[data-tip]");
  if (!el || el === curTarget) return;
  hide();
  curTarget = el;
  showTimer = setTimeout(() => {
    if (curTarget === el && el.isConnected) show(el);
  }, SHOW_DELAY);
}

function onLeave(e) {
  if (!curTarget) return;
  // 같은 대상의 자식 사이를 오갈 때는 유지(깜빡임 방지)
  const to = e.relatedTarget;
  if (to && curTarget.contains(to)) return;
  hide();
}

export function initTooltips() {
  ensureTip();
  document.addEventListener("mouseover", onEnter, true);
  document.addEventListener("mouseout", onLeave, true);
  document.addEventListener("focusin", onEnter, true);
  document.addEventListener("focusout", hide, true);
  // 스크롤·클릭·Esc·창 이탈 시 즉시 감춤(위치 어긋남/잔상 방지)
  window.addEventListener("scroll", hide, true);
  document.addEventListener("mousedown", hide, true);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  window.addEventListener("blur", hide);
}
