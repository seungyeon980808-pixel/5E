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

/* 위치를 잡는다. 잡을 수 없으면 false를 돌려주고 호출부가 툴팁을 띄우지 않는다.
 *
 * 2026-07-27: 툴팁이 엉뚱한 곳에 뜬다는 지적을 고쳤다. 두 가지였다.
 *   ① 대상이 접힌 섹션 안에 있으면 rect가 0×0이라 좌표가 화면 구석으로 튀었다 → 안 띄운다.
 *   ② 좁은 도구 팔레트에서는 위/아래로 띄우면 **옆 아이콘을 덮는다** → 대상이 좌측 패널
 *      안이면 패널 오른쪽 끝 바깥에 세로 중앙으로 붙인다(세부 도구 팝오버와 같은 규약).
 * 위치는 띄울 때마다 매번 다시 계산한다 — 예전엔 같은 대상이면 건너뛰어, 그 사이 패널이
 * 접히거나 펼쳐져 버튼이 움직여도 툴팁이 옛 좌표에 남았다. */
function place(el) {
  const r = el.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return false;
  const t = tipEl;
  t.hidden = false; // 측정 위해 먼저 표시
  const tw = t.offsetWidth;
  const th = t.offsetHeight;
  const M = 8; // 요소와의 간격
  const clampTop = (v) => Math.max(6, Math.min(v, window.innerHeight - th - 6));

  const panel = el.closest && el.closest(".panel-left");
  if (panel) {
    const pr = panel.getBoundingClientRect();
    const left = Math.max(pr.right, r.right) + M;
    if (left + tw <= window.innerWidth - 6) {
      t.style.left = `${Math.round(left)}px`;
      t.style.top = `${Math.round(clampTop(r.top + r.height / 2 - th / 2))}px`;
      t.dataset.place = "right";
      return true;
    }
  }

  let top = r.top - th - M;
  let below = false;
  if (top < 6) { top = r.bottom + M; below = true; }
  let left = r.left + r.width / 2 - tw / 2;
  left = Math.max(6, Math.min(left, window.innerWidth - tw - 6));
  t.style.top = `${Math.round(clampTop(top))}px`;
  t.style.left = `${Math.round(left)}px`;
  t.dataset.place = below ? "below" : "above";
  return true;
}

function show(el) {
  /* 튜토리얼이 도는 동안에는 툴팁을 띄우지 않는다.
   * 튜토리얼은 이미 그 자리를 짚고 설명 창으로 안내하고 있어서, 그 위에 툴팁이
   * 하나 더 뜨면 안내가 둘로 갈라지고 짚어 놓은 자리를 가린다(사용자 지적). */
  if (document.querySelector(".tut-layer")) return;
  const txt = textFor(el);
  if (!txt) return;
  const t = ensureTip();
  t.textContent = txt;
  if (!place(el)) { t.hidden = true; return; }
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
  if (!el) return;
  if (el === curTarget) {
    // 같은 대상 안에서 움직이는 중. 타이머는 그대로 두되, 이미 떠 있으면 위치만 다시 잡는다
    // (그 사이 패널이 접히거나 스크롤돼 대상이 움직였을 수 있다).
    if (tipEl && tipEl.classList.contains("is-visible") && !place(el)) hide();
    return;
  }
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
