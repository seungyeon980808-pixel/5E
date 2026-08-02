/* ===== TUTORIAL ENGINE (따라하기) — 실제 화면 위에서 한 곳씩 짚어 주는 안내 =====
 *
 * 레퍼런스: 31_hwp_palette/tutorial.py (같은 사용자가 만든 데스크톱 판의 웹 이식).
 *
 * 방식: 화면 전체를 살짝 흐리게 덮되, 지금 짚는 대상 자리만 "구멍"으로 비워
 * 밝게 두고 파란 테두리를 두른다. 그 옆에 설명 창(코치)이 붙는다.
 *   · 덮개를 아예 안 쓰면 복잡한 화면에서 시선이 분산되고,
 *   · 대상까지 덮어 버리면 "어디였던 거지?"가 된다 — 그래서 구멍을 판다.
 *   · 구멍은 진짜로 비어 있으므로 실습 단계에서 사용자가 그 자리를 직접 누를 수 있다.
 *
 * 흐림은 <div> 4장(위/아래/왼/오른)으로 만든다. SVG 마스크보다 단순하고,
 * 구멍이 물리적으로 비어 있어 클릭 통과를 따로 구현할 필요가 없다.
 *
 * ⚠ 레이어는 document.body 가 아니라 documentElement 에 붙인다 —
 *   style.css 가 body{zoom:var(--ui-zoom)} 를 걸어 두어, body 밑에 붙이면
 *   getBoundingClientRect(뷰포트 실측 px)와 좌표계가 어긋난다.
 *
 * ⚠ 살아 있는 튜토리얼은 항상 하나뿐이어야 한다. HwpPalette 에서 이전 것을 안 끄고
 *   새로 시작해 흐림 패널이 겹쳐 남는 문제가 실제로 있었다(tutorial.py 주석).
 */

import { state } from "./state.js?v=1.4.0";
import { addPage, switchPage } from "./pages.js?v=1.4.0";
import { showConfirm } from "./ui-dialogs.js?v=1.4.0";
import { buildExportSvg } from "./svg-export.js?v=1.4.0";
import { COURSES, getCourse } from "./tutorial-courses.js?v=1.4.0";

/* ===== 저장 (localStorage) ===== */

const K_DONE = "5e.tutorial.done";           // 완료한 코스 id 목록
// 중단 지점(이어하기)은 쓰지 않는다 — 한 세션은 언제나 처음부터 한다(사용자 방침).
// 예전 버전이 남겨 둔 값이 있으면 시작할 때 지운다.
const K_RESUME_LEGACY = "5e.tutorial.resume";
const K_BANNER = "5e.tutorial.bannerSeen";   // 첫 방문 배너를 이미 보여줬는가
// 난이도(5e.tutorial.level)는 없앴다 — 아래 '단일 모드' 주석 참고.
const K_LEVEL_LEGACY = "5e.tutorial.level";
const K_MODE = "5e.mode";                    // view-mode.js 와 같은 키(Pro/Lite)

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* ignore */ }
}
function removeKey(key) {
  try { localStorage.removeItem(key); } catch (_) { /* ignore */ }
}

function doneCourses() {
  const a = readJSON(K_DONE, []);
  return Array.isArray(a) ? a : [];
}
function markDone(courseId) {
  const a = doneCourses();
  if (!a.includes(courseId)) { a.push(courseId); writeJSON(K_DONE, a); }
}

/* ===== 단일 모드 =====
 * 예전에는 난이도가 둘이었다 — '쉬움'(앱이 대신 그리고 눈으로만 따라감)과 '어려움'(직접 만듦).
 * 쉬움은 폐지했다: 관람은 손에 남지 않고, 두 갈래를 유지하느라 엔진 곳곳에
 * "쉬움이면 판정하지 않는다" 같은 예외가 갈라져 실제 버그의 온상이었다.
 * 지금은 **한 가지 흐름**이다 — 직접 해 보되, 못 해도 [다음]으로 언제든 나간다.
 * 대신 해 주는 일(글자 타이핑 등)은 난이도가 아니라 단계별 [자동으로 하기] 단추로 남는다. */


/* ===== 레이아웃 상수 ===== */

const HOLE_PAD = 6;    // 구멍이 대상보다 얼마나 큰가 (테두리보다 커야 대상이 안 가린다)
const COACH_GAP = 14;  // 구멍과 설명 창 사이 간격
const EDGE = 12;       // 화면 가장자리 최소 여백

/* 통과했을 때 바로 넘기지 않고 이만큼 머문다(ms).
 * 80ms 틱으로 판정하므로 조건이 참이 되는 순간 화면이 바뀌어 버려, 방금 자기가 무엇을
 * 했는지 확인할 틈이 없었다. 초록으로 굳은 안내선과 '✓ 됐습니다'를 보고 넘어가게 한다. */
const PASS_HOLD = 700;

/* ── 단계 전환 연출 시간표 (css/tutorial.css 의 --tut-t-* 와 같은 값) ──
 * 사라짐 250ms → 테두리가 새 자리에서 먼저 pop(560ms) → 150ms 뒤 설명 창 pop → 850ms 뒤 커서.
 * '대상 먼저, 설명 다음' — 눈은 밝아지는 곳을 따라가므로 이 순서가 시선을 이끈다.
 * 한 번만 보는 화면이라 일반 UI보다 느긋하게 잡았다(빈도가 낮을수록 길어도 된다). */
const T_EXIT = 250;
const T_ENTER = 560;
const STAGGER = 150;
const DEMO_DELAY = 850;

/* ===== 지금 돌고 있는 튜토리얼 (하나만 살아 있어야 한다) ===== */
let _run = null;

/* 마우스를 누르고 있는가 — 끄는 도중에 단계가 넘어가지 않게 하는 잠금.
 *
 * ⚠ pointerup 하나만 믿으면 잠금이 걸린 채 굳는다: 모달이 pointerdown 에서 사라지면
 *   이어질 pointerup 은 이미 떨어져 나간 노드로 가서 window 까지 오지 않는다.
 *   실제로 '객체로 삽입' 뒤 단계가 안 넘어가는 증상이 이것이었다.
 *   그래서 buttons===0 인 pointermove·click 으로도 반드시 풀어 준다(자가 복구).
 */
let _pointerDown = false;
let _pointerDownAt = 0;
const MAX_HOLD_MS = 2500;   // 이보다 오래 '눌린 채'면 놓친 것으로 본다

const _releasePointer = () => { _pointerDown = false; };
window.addEventListener("pointerdown", (e) => {
  if (e.isPrimary !== false) { _pointerDown = true; _pointerDownAt = performance.now(); }
}, true);
window.addEventListener("pointerup", _releasePointer, true);
window.addEventListener("pointercancel", _releasePointer, true);
window.addEventListener("click", _releasePointer, true);
window.addEventListener("blur", _releasePointer);
window.addEventListener("pointermove", (e) => { if (!e.buttons) _pointerDown = false; }, true);

/* 지금 정말로 끌고 있는 중인가.
 * pointerup 을 못 받는 경우가 실제로 있어(모달이 pointerdown 에서 사라지는 등)
 * 잠금이 굳으면 튜토리얼이 영영 안 넘어간다. 오래 눌린 상태는 놓친 것으로 보고 푼다 —
 * 최악이라도 '조금 일찍 넘어감'이지, '영영 멈춤'은 아니게. */
function isDragging() {
  if (!_pointerDown) return false;
  if (performance.now() - _pointerDownAt > MAX_HOLD_MS) { _pointerDown = false; return false; }
  return true;
}

/* ===== 레이어 DOM ===== */

function buildLayer() {
  const root = document.createElement("div");
  root.className = "tut-layer";
  root.innerHTML = `
    <div class="tut-dim" data-side="top"></div>
    <div class="tut-dim" data-side="bottom"></div>
    <div class="tut-dim" data-side="left"></div>
    <div class="tut-dim" data-side="right"></div>
    <svg class="tut-guide" aria-hidden="true"></svg>
    <div class="tut-ghost" hidden aria-hidden="true">
      <span class="tut-ghost-ring"></span>
      <svg class="tut-ghost-arrow" viewBox="0 0 16 22" aria-hidden="true">
        <path d="M1 1 L1 17 L5.2 13.2 L7.8 19.6 L10.6 18.4 L8.1 12.2 L14 12 Z" />
      </svg>
      <span class="tut-ghost-mod" hidden></span>
    </div>
    <div class="tut-modkey" hidden></div>
    <div class="tut-shield" hidden></div>
    <div class="tut-halo" hidden></div>
    <div class="tut-coach" role="dialog" aria-modal="false" aria-live="polite">
      <div class="tut-coach-head">
        <span class="tut-coach-course"></span>
        <span class="tut-coach-count"></span>
      </div>
      <div class="tut-coach-bar" aria-hidden="true"><i></i></div>
      <h3 class="tut-coach-title"></h3>
      <div class="tut-coach-text"></div>
      <div class="tut-coach-do" hidden>직접 해 보세요</div>
      <button type="button" class="tut-coach-auto" hidden></button>
      <div class="tut-coach-foot">
        <button type="button" class="tut-btn tut-btn-quit">그만</button>
        <span class="tut-spacer"></span>
        <button type="button" class="tut-btn tut-btn-prev">이전</button>
        <button type="button" class="tut-btn tut-btn-primary tut-btn-next">다음</button>
      </div>
    </div>`;
  document.documentElement.appendChild(root);
  return {
    root,
    dims: {
      top: root.querySelector('[data-side="top"]'),
      bottom: root.querySelector('[data-side="bottom"]'),
      left: root.querySelector('[data-side="left"]'),
      right: root.querySelector('[data-side="right"]'),
    },
    guide: root.querySelector(".tut-guide"),
    modKey: root.querySelector(".tut-modkey"),
    shield: root.querySelector(".tut-shield"),
    ghost: root.querySelector(".tut-ghost"),
    ghostRing: root.querySelector(".tut-ghost-ring"),
    ghostMod: root.querySelector(".tut-ghost-mod"),
    halo: root.querySelector(".tut-halo"),
    coach: root.querySelector(".tut-coach"),
    course: root.querySelector(".tut-coach-course"),
    count: root.querySelector(".tut-coach-count"),
    bar: root.querySelector(".tut-coach-bar > i"),
    title: root.querySelector(".tut-coach-title"),
    text: root.querySelector(".tut-coach-text"),
    doChip: root.querySelector(".tut-coach-do"),
    autoBtn: root.querySelector(".tut-coach-auto"),
    btnQuit: root.querySelector(".tut-btn-quit"),
    btnPrev: root.querySelector(".tut-btn-prev"),
    btnNext: root.querySelector(".tut-btn-next"),
  };
}

/* ===== 대상 찾기 =====
 * target 은 함수다 — 튜토리얼을 켜는 시점이 아니라 "그 단계로 들어가는 시점"의
 * 실제 요소를 잡아야 하기 때문이다(패널·모달은 상태에 따라 다시 그려진다).
 * 반환값은 선택자 문자열 배열 또는 요소 배열 둘 다 받는다. */
function resolveTargets(step) {
  if (typeof step.target !== "function") return [];
  let picked;
  try { picked = step.target(); } catch (_) { return []; }
  if (!picked) return [];
  const list = Array.isArray(picked) ? picked : [picked];
  const out = [];
  for (const item of list) {
    const node = typeof item === "string" ? document.querySelector(item) : item;
    if (node && node.isConnected && node.getBoundingClientRect().width > 0) out.push(node);
  }
  return out;
}

/* 대상(들)을 모두 감싸는 사각형. 짚어야 할 곳이 떨어져 있을 수 있어 여러 개를 받는다. */
function unionRect(nodes) {
  if (!nodes.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of nodes) {
    const r = n.getBoundingClientRect();
    x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top);
    x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom);
  }
  return {
    x: Math.max(0, x1 - HOLE_PAD),
    y: Math.max(0, y1 - HOLE_PAD),
    w: Math.min(window.innerWidth, x2 + HOLE_PAD) - Math.max(0, x1 - HOLE_PAD),
    h: Math.min(window.innerHeight, y2 + HOLE_PAD) - Math.max(0, y1 - HOLE_PAD),
  };
}

/* 구멍 자리를 투명 방패로 덮는다 — step.lock 인 단계용.
 *
 * 왜 필요한가: 구멍은 진짜로 비어 있어서 그 안의 버튼이 눌린다. 그런데 '읽기만 하는'
 * 단계에서도 버튼 세 개가 밝게 뚫려 있으면 **누르고 싶게 생겼고**, 실제로 누르면
 * (예: '이미지 삽입'·'참고 창 열기') 다음 단계가 기대하는 상태와 어긋나 흐름이 꼬인다.
 * 짚어는 주되 못 누르게 한다 — 누르면 흔들어서 "지금은 읽기만"이라고 알린다. */
function paintShield(ui, hole) {
  const on = !!(_run && _run.locked && hole);
  ui.shield.hidden = !on;
  if (!on) return;
  Object.assign(ui.shield.style, {
    left: hole.x + "px", top: hole.y + "px",
    width: hole.w + "px", height: hole.h + "px",
  });
}

/* ===== 흐림 4장 + 테두리 배치 ===== */
function paintHole(ui, hole) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const { top, bottom, left, right } = ui.dims;

  // 짚을 대상을 끝내 못 찾은 단계는 화면을 아예 안 덮는다(먹통처럼 보이지 않게).
  if (_run && _run.noTarget) {
    for (const d of [top, bottom, left, right]) Object.assign(d.style, { width: "0px", height: "0px" });
    ui.halo.hidden = true;
    return;
  }

  if (!hole) {
    // 짚을 곳이 없는 단계(환영·마무리) — 화면 전체를 한 장으로 덮는다.
    Object.assign(top.style, { left: "0px", top: "0px", width: vw + "px", height: vh + "px" });
    for (const d of [bottom, left, right]) Object.assign(d.style, { width: "0px", height: "0px" });
    ui.halo.hidden = true;
    return;
  }
  Object.assign(top.style,    { left: "0px", top: "0px", width: vw + "px", height: hole.y + "px" });
  Object.assign(bottom.style, { left: "0px", top: (hole.y + hole.h) + "px", width: vw + "px", height: Math.max(0, vh - hole.y - hole.h) + "px" });
  Object.assign(left.style,   { left: "0px", top: hole.y + "px", width: hole.x + "px", height: hole.h + "px" });
  Object.assign(right.style,  { left: (hole.x + hole.w) + "px", top: hole.y + "px", width: Math.max(0, vw - hole.x - hole.w) + "px", height: hole.h + "px" });

  ui.halo.hidden = false;
  Object.assign(ui.halo.style, {
    left: hole.x + "px", top: hole.y + "px",
    width: hole.w + "px", height: hole.h + "px",
  });
}

/* ===== 설명 창 자리잡기 — 대상을 가리지 않는 쪽을 고른다 ===== */
function placeCoach(ui, hole) {
  const coach = ui.coach;
  const vw = window.innerWidth, vh = window.innerHeight;
  const cw = coach.offsetWidth, ch = coach.offsetHeight;

  if (!hole) {
    coach.dataset.side = "center";
    coach.style.left = Math.round((vw - cw) / 2) + "px";
    coach.style.top = Math.round((vh - ch) / 2) + "px";
    return;
  }

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const fits = {
    right:  vw - (hole.x + hole.w) - COACH_GAP - EDGE >= cw,
    left:   hole.x - COACH_GAP - EDGE >= cw,
    below:  vh - (hole.y + hole.h) - COACH_GAP - EDGE >= ch,
    above:  hole.y - COACH_GAP - EDGE >= ch,
  };
  // 단계가 자리를 지정했으면 그쪽을 먼저 쓴다 — 대상 옆에 팝오버가 열리는 자리처럼,
  // 기본 우선순위(오른쪽)로 두면 설명 창이 그 자리를 덮어 버리는 곳이 있다.
  const want = (_run && _run.course.steps[_run.index] || {}).coachSide;
  if (want && fits[want]) {
    for (const k of Object.keys(fits)) if (k !== want) fits[k] = false;
  }
  let x, y;
  // data-side: 대상이 있는 쪽에서 자라 나오게 transform-origin 을 정한다(CSS).
  if (fits.right) {
    coach.dataset.side = "right";
    x = hole.x + hole.w + COACH_GAP;
    y = clamp(hole.y, EDGE, vh - ch - EDGE);
  } else if (fits.left) {
    coach.dataset.side = "left";
    x = hole.x - COACH_GAP - cw;
    y = clamp(hole.y, EDGE, vh - ch - EDGE);
  } else if (fits.below) {
    coach.dataset.side = "below";
    x = clamp(hole.x, EDGE, vw - cw - EDGE);
    y = hole.y + hole.h + COACH_GAP;
  } else if (fits.above) {
    coach.dataset.side = "above";
    x = clamp(hole.x, EDGE, vw - cw - EDGE);
    y = hole.y - COACH_GAP - ch;
  } else {
    // 어디에도 안 들어가면 구멍에서 가장 먼 구석으로 — 최소한 대상은 안 가린다.
    coach.dataset.side = "center";
    x = hole.x > vw / 2 ? EDGE : vw - cw - EDGE;
    y = hole.y > vh / 2 ? EDGE : vh - ch - EDGE;
  }
  const nx = Math.round(clamp(x, EDGE, Math.max(EDGE, vw - cw - EDGE)));
  const ny = Math.round(clamp(y, EDGE, Math.max(EDGE, vh - ch - EDGE)));
  /* 몇 px 차이로는 옮기지 않는다 — 대상 요소가 1~2px 흔들릴 때마다 설명 창이
   * 따라 움직이면 읽는 사람에게는 글이 떨리는 것으로 보인다(사용자 지적). */
  const px = parseFloat(coach.style.left), py = parseFloat(coach.style.top);
  if (Number.isFinite(px) && Number.isFinite(py)
      && Math.abs(px - nx) < 4 && Math.abs(py - ny) < 4) return;
  coach.style.left = nx + "px";
  coach.style.top = ny + "px";
}

/* ===== 캔버스 위 안내 영역 =====
 *
 * "여기다 그리세요"를 말로만 하면 처음 온 사람은 어디에 얼마만큼 그릴지 모른다.
 * 그래서 그릴 자리를 캔버스 위에 점선으로 미리 그려 준다.
 *
 * 좌표는 아트보드와 같은 world mm 를 쓴다(기본 90×60 → x −45..45, y −30..30).
 * 화면 픽셀 변환은 캔버스 SVG 의 getScreenCTM 을 그대로 태우므로 확대·이동을 따라간다.
 *
 * ⚠ 안내선은 state.objects 에 넣지 않는다. 넣으면 사용자 작업물·실행취소·내보내기에
 *   섞여 들어간다. 튜토리얼 레이어 위에만 그리므로 저장·내보낸 그림에는 남지 않는다.
 */
const SVG_NS = "http://www.w3.org/2000/svg";

function canvasCTM() {
  const svg = document.getElementById("canvas");
  if (!svg || typeof svg.getScreenCTM !== "function") return null;
  const m = svg.getScreenCTM();
  return m ? { svg, m } : null;
}

// 현재 확대·이동 상태를 한 줄로 요약 — 바뀌었을 때만 안내선을 다시 그리기 위해.
function ctmKey() {
  const c = canvasCTM();
  return c ? `${c.m.a.toFixed(3)},${c.m.d.toFixed(3)},${c.m.e.toFixed(1)},${c.m.f.toFixed(1)}` : "none";
}

function paintGuide(step) {
  const g = _run.ui.guide;
  g.textContent = "";
  // 얼마나 가까워졌는가 — far(회색 점선) / close(굵은 파랑) / hit(초록).
  // 판정이 조용하면 "더 가야 하는지, 잘못 잡은 건지"를 알 방법이 없다(초심자 이탈 지점).
  g.dataset.near = (_run && _run.near) || "far";

  let spec = null;
  if (typeof step.guide === "function") {
    // ctx 를 넘긴다 — "몇 번째 자리를 겨냥 중인가"처럼 진행에 따라 달라지는 안내가 있다.
    try { spec = step.guide(_run ? _run.ctx : {}); } catch (_) { spec = null; }
  }
  const shapes = !spec ? [] : (Array.isArray(spec) ? spec : [spec]);
  const c = shapes.length ? canvasCTM() : null;
  if (!c) { g.style.display = "none"; return; }
  g.style.display = "block";

  const toScreen = (x, y) => {
    const p = c.svg.createSVGPoint();
    p.x = x; p.y = y;
    const r = p.matrixTransform(c.m);
    return [r.x, r.y];
  };

  for (const sh of shapes) {
    if (!sh || !Array.isArray(sh.pts) || sh.pts.length < 2) continue;
    const screen = sh.pts.map(([x, y]) => toScreen(x, y));
    const node = document.createElementNS(SVG_NS, sh.close ? "polygon" : "polyline");
    node.setAttribute("points", screen.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" "));
    node.setAttribute("class", "tut-guide-shape" + (sh.close ? " is-closed" : ""));
    g.appendChild(node);

    if (sh.note) {
      const cx = screen.reduce((a, p) => a + p[0], 0) / screen.length;
      const cy = screen.reduce((a, p) => a + p[1], 0) / screen.length;
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("class", "tut-guide-note");
      t.setAttribute("x", cx.toFixed(1));
      t.setAttribute("y", (cy + (sh.noteDy || 0)).toFixed(1));
      t.setAttribute("text-anchor", "middle");
      t.textContent = sh.note;
      g.appendChild(t);
    }
  }

  // 안내선(①② 번호·경로 점선)은 캔버스 좌표 시연에만 그린다. 화면 UI 시연(at/onEl)은
  // 이미 테두리가 그 버튼을 짚고 있어서 캔버스에 점을 찍으면 엉뚱한 자리에 나온다.
  const dmRaw = demoSpec(step);
  const dm = dmRaw && !dmRaw.at && !dmRaw.onEl ? dmRaw : null;

  // 클릭 시연은 '몇 번째로 누르는 곳인지'를 자리마다 번호로 박아 둔다.
  // 커서가 깜빡이는 사이에도 순서가 남아 있어야 두 점 찍기가 명확해진다.
  if (dm && dm.kind === "clicks" && Array.isArray(dm.pts)) {
    dm.pts.forEach((p, i) => {
      const [x, y] = toScreen(p[0], p[1]);
      const ring = document.createElementNS(SVG_NS, "circle");
      ring.setAttribute("class", "tut-click-dot");
      ring.setAttribute("cx", x.toFixed(1));
      ring.setAttribute("cy", y.toFixed(1));
      ring.setAttribute("r", "11");
      g.appendChild(ring);
      const num = document.createElementNS(SVG_NS, "text");
      num.setAttribute("class", "tut-click-num");
      num.setAttribute("x", x.toFixed(1));
      num.setAttribute("y", (y + 4).toFixed(1));
      num.setAttribute("text-anchor", "middle");
      num.textContent = String(i + 1);
      g.appendChild(num);
    });
  }

  // 드래그 시연은 지나갈 길을 그려 둔다 — 커서가 사라져도 경로는 남게.
  if (dm && dm.kind === "drag" && dm.from && dm.to) {
    const a = toScreen(dm.from[0], dm.from[1]);
    const b = toScreen(dm.to[0], dm.to[1]);
    const path = document.createElementNS(SVG_NS, "line");
    path.setAttribute("class", "tut-demo-path");
    path.setAttribute("x1", a[0].toFixed(1)); path.setAttribute("y1", a[1].toFixed(1));
    path.setAttribute("x2", b[0].toFixed(1)); path.setAttribute("y2", b[1].toFixed(1));
    g.appendChild(path);
  }
}

/* ===== 가상 커서 시연 =====
 *
 * "어디를 눌러 어디까지 끄는지"는 글로 쓰는 것보다 한 번 보여 주는 편이 훨씬 빠르다.
 * 안내 영역 위에서 유령 커서가 실제 동작을 반복 재생한다.
 *
 * 좌표를 대는 방법이 둘이다 — 캔버스 안이면 world mm, 화면 UI(버튼·슬라이더)면 선택자.
 *
 *   캔버스:  () => ({ kind:"drag",   from:[wx,wy], to:[wx,wy], mod:"Shift" })
 *            () => ({ kind:"clicks", pts:[[wx,wy], ...],       mod:"Ctrl"  })
 *   화면 UI: () => ({ kind:"clicks", at:["#설정버튼", "#메뉴항목"] })
 *            () => ({ kind:"drag",   onEl:"#슬라이더", from:[0.3,0.5], to:[0.75,0.5] })
 *              — onEl 의 from/to 는 그 요소 상자 안의 비율(0~1)이다.
 *
 * mod 는 커서 옆에 뜨는 보조키 표시(선택).
 *
 * 사용자가 실제로 마우스를 누르면 잠시 숨었다가, 손을 떼고 조용해지면 다시 나온다
 * — 시연이 실습을 방해하지 않게.
 */
const DRAG_CYCLE = 6900;   // 나타남 → 누름 → 이동 → 뗌 → 사라짐 한 바퀴(ms) — 눈이 따라올 만큼 느리게
// 클릭 시연은 점 사이를 '미끄러지지' 않는다 — 미끄러지면 끄는 것처럼 보여서,
// 두 점을 찍는 직선 도구를 드래그 도구로 오해하게 된다(사용자 지적).
// 한 점에서 떴다가 → 누르고 → 사라지고, 다음 점에서 다시 뜬다.
const CLICK_STEP = 1700;   // 점 하나를 찍는 데 걸리는 시간(ms)
const CLICK_GAP = 850;     // 한 바퀴 돈 뒤 쉬는 시간(ms)
const DEMO_RESUME_MS = 2200;

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function demoSpec(step) {
  if (typeof step.demo !== "function") return null;
  try { return step.demo(_run ? _run.ctx : {}) || null; } catch (_) { return null; }
}

function startDemo(step, { delay = 0 } = {}) {
  stopDemo();
  const spec = demoSpec(step);
  if (!spec) return;

  const ui = _run.ui;
  ui.ghostMod.hidden = !spec.mod;
  if (spec.mod) ui.ghostMod.textContent = spec.mod;

  // delay: 위젯 전환이 안정된 뒤에야 커서가 나온다 — 동시에 움직이면 시선이 갈라진다.
  _run.demo = { spec, t0: performance.now() + delay, pausedUntil: 0, raf: 0 };

  // 사용자가 직접 조작하는 동안에는 비켜 준다.
  const onDown = () => { if (_run && _run.demo) _run.demo.pausedUntil = Infinity; };
  const onUp = () => { if (_run && _run.demo) _run.demo.pausedUntil = performance.now() + DEMO_RESUME_MS; };
  window.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointerup", onUp, true);
  _run.demo.off = () => {
    window.removeEventListener("pointerdown", onDown, true);
    window.removeEventListener("pointerup", onUp, true);
  };

  const frame = () => {
    if (!_run || !_run.demo) return;
    drawDemoFrame();
    _run.demo.raf = requestAnimationFrame(frame);
  };
  _run.demo.raf = requestAnimationFrame(frame);
}

function stopDemo() {
  if (!_run || !_run.demo) return;
  cancelAnimationFrame(_run.demo.raf);
  if (_run.demo.off) _run.demo.off();
  _run.demo = null;
  if (_run.ui && _run.ui.ghost) _run.ui.ghost.hidden = true;
}

/* 시연 좌표를 화면 픽셀로 푼다. 캔버스 안이면 world mm 를 CTM 으로, 화면 UI 면
 * 그 요소의 상자에서 뽑는다 — 둘 다 같은 뷰포트 px 로 나오므로 이후 처리가 같다. */
function demoScreenPoints(spec) {
  // 화면 UI: at = 선택자 배열 (요소 중앙을 찍는다)
  if (Array.isArray(spec.at)) {
    return spec.at
      .map((sel) => (typeof sel === "string" ? document.querySelector(sel) : sel))
      .filter((el) => el && el.isConnected && el.getBoundingClientRect().width > 0)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      });
  }
  // 캔버스: world mm
  const c = canvasCTM();
  if (!c || !Array.isArray(spec.pts)) return [];
  return spec.pts.map(([x, y]) => {
    const p = c.svg.createSVGPoint();
    p.x = x; p.y = y;
    const r = p.matrixTransform(c.m);
    return [r.x, r.y];
  });
}

/* 드래그 시연의 두 끝점. onEl 이면 그 요소 상자 안의 비율(0~1)로 잡는다. */
function demoDragEnds(spec) {
  if (spec.onEl) {
    const el = typeof spec.onEl === "string" ? document.querySelector(spec.onEl) : spec.onEl;
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return null;
    const at = (f) => [r.left + r.width * f[0], r.top + r.height * f[1]];
    return [at(spec.from || [0.2, 0.5]), at(spec.to || [0.8, 0.5])];
  }
  if (!spec.from || !spec.to) return null;
  const c = canvasCTM();
  if (!c) return null;
  const toScreen = (x, y) => {
    const p = c.svg.createSVGPoint();
    p.x = x; p.y = y;
    const r = p.matrixTransform(c.m);
    return [r.x, r.y];
  };
  return [toScreen(spec.from[0], spec.from[1]), toScreen(spec.to[0], spec.to[1])];
}

function drawDemoFrame() {
  const { ui, demo } = _run;
  const now = performance.now();
  if (now < demo.pausedUntil || now < demo.t0) { ui.ghost.hidden = true; return; }

  const spec = demo.spec;
  let pos = null, pressed = false, fade = 1;

  const ends = spec.kind === "drag" ? demoDragEnds(spec) : null;
  if (ends) {
    const t = (now - demo.t0) % DRAG_CYCLE;
    const a = ends[0];
    const b = ends[1];
    if (t < 650)        { pos = a; fade = t / 650; }          // 그 자리에 나타나고
    else if (t < 1450)  { pos = a; pressed = true; }          // 누르는 걸 보여주고
    else if (t < 5350)  {                                     // 천천히 끌고
      const k = easeInOut((t - 1450) / 3900);
      pos = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      pressed = true;
    }
    else if (t < 5950)  { pos = b; pressed = true; }          // 도착해서 잠깐 머물고
    else                { pos = b; fade = 1 - (t - 5950) / 950; }  // 사라진다
  } else if (spec.kind === "clicks") {
    const pts = demoScreenPoints(spec);
    if (!pts.length) { ui.ghost.hidden = true; return; }
    const total = pts.length * CLICK_STEP + CLICK_GAP;
    const t = (now - demo.t0) % total;
    if (t >= pts.length * CLICK_STEP) { pos = null; }   // 한 바퀴 끝 — 잠깐 쉰다
    else {
      const i = Math.floor(t / CLICK_STEP);
      const local = t - i * CLICK_STEP;
      pos = pts[i];                       // 자리는 고정. 절대 미끄러지지 않는다.
      if (local < 380) fade = local / 380;              // 그 자리에 나타나고
      else if (local < 1150) pressed = true;            // 콕 누르고
      else fade = Math.max(0, 1 - (local - 1150) / 550); // 사라진다
    }
  }

  if (!pos) { ui.ghost.hidden = true; return; }
  ui.ghost.hidden = false;
  ui.ghost.style.opacity = String(Math.max(0, Math.min(1, fade)));
  ui.ghost.style.transform = `translate(${pos[0].toFixed(1)}px, ${pos[1].toFixed(1)}px)`;
  ui.ghost.classList.toggle("is-pressed", pressed);
}

/* Shift·Ctrl 처럼 '누르고 있어야 하는 키'를 화면에 계속 띄운다.
 * 커서 옆 칩은 커서가 깜빡일 때 같이 사라져서, 정작 키를 눌러야 할 순간에 안 보인다
 * (사용자 지적). 그래서 작업할 자리 위에 고정으로 하나 더 세운다. */
function paintModKey(step, hole) {
  const el = _run.ui.modKey;
  const spec = demoSpec(step);
  const mod = spec && spec.mod;
  if (!mod) { el.hidden = true; return; }

  el.hidden = false;
  el.innerHTML = "";
  const key = document.createElement("kbd");
  key.textContent = String(mod).split(" ")[0];      // "Ctrl 누른 채" → "Ctrl"
  el.appendChild(key);
  const tail = String(mod).split(" ").slice(1).join(" ") || "누른 채";
  el.appendChild(document.createTextNode(" " + tail));

  // 작업 자리(안내 그림 > 구멍) 바로 위 가운데.
  const box = guideBox(_run.ui) || hole;
  const w = el.offsetWidth, h = el.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  let x = box ? box.x + box.w / 2 - w / 2 : vw / 2 - w / 2;
  let y = box ? box.y - h - 14 : 20;
  if (y < 8) y = (box ? box.y + box.h + 14 : 20);   // 위가 좁으면 아래로
  el.style.left = Math.round(Math.max(8, Math.min(x, vw - w - 8))) + "px";
  el.style.top = Math.round(Math.max(8, Math.min(y, vh - h - 8))) + "px";
}

/* 지금 그려진 안내 그림 전체를 감싸는 화면 좌표 사각형. 없으면 null.
 * 안내선은 뷰포트 px 로 그려 두었으므로 getBBox 값이 그대로 화면 좌표다. */
function guideBox(ui) {
  const g = ui.guide;
  if (!g || g.style.display === "none" || !g.childNodes.length) return null;
  let b;
  try { b = g.getBBox(); } catch (_) { return null; }
  if (!b || b.width <= 0 || b.height <= 0) return null;
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

/* ===== 연습용 페이지 =====
 * 사용자의 기존 작업물을 절대 건드리지 않기 위해, 실습이 있는 코스는
 * 새 페이지를 하나 만들어 그 위에서만 논다. */
function createPracticePage() {
  const before = state.get().activePageId;
  addPage(state);
  const created = state.get().activePageId;
  if (created === before) return null;   // 페이지 추가가 막힌 경우 — 그냥 현재 페이지에서 진행
  state.update((s) => {
    const p = (s.pages || []).find((pg) => pg.id === created);
    if (p) p.name = "튜토리얼 연습";
  });
  return { practiceId: created, returnTo: before };
}

async function cleanupPracticePage(info) {
  if (!info || !info.practiceId) return;
  const s0 = state.get();
  const still = (s0.pages || []).some((p) => p.id === info.practiceId);
  if (!still) return;
  if ((s0.pages || []).length <= 1) return;   // 마지막 한 장은 못 지운다(pages.js 규칙)

  const ok = await showConfirm(
    "튜토리얼에 쓴 '튜토리얼 연습' 페이지를 지울까요?\n남겨 두고 계속 연습해도 됩니다.",
    { title: "연습 페이지 정리", okText: "지우기", cancelText: "남겨두기" }
  );
  if (!ok) return;

  const back = (state.get().pages || []).some((p) => p.id === info.returnTo)
    ? info.returnTo
    : (state.get().pages || []).find((p) => p.id !== info.practiceId)?.id;
  if (back) switchPage(state, back);
  state.update((s) => {
    s.pages = (s.pages || []).filter((p) => p.id !== info.practiceId);
    if (!s.pages.some((p) => p.id === s.activePageId)) {
      s.activePageId = s.pages[0] ? s.pages[0].id : null;
    }
  });
}

/* ===== 코스 진행 ===== */

export function startCourse(courseId, { from = 0 } = {}) {
  const course = getCourse(courseId);
  if (!course) return;
  stopTutorial({ silent: true });   // 겹쳐 남는 흐림 방지 — 항상 먼저 끈다
  closePicker();

  const ui = buildLayer();
  const prevMode = document.documentElement.getAttribute("data-mode") || "pro";

  _run = {
    course,
    index: Math.max(0, Math.min(from, course.steps.length - 1)),
    /* 단계 상태를 두 갈래로 나눠 둔다 — 예전에는 maxIndex 한 줄로 뭉뚱그렸고,
     * 그 탓에 "못 해서 건너뛴 단계"로 [이전]을 눌러 돌아와도 판정이 죽어 있었다
     * (성공해도 아무 반응이 없다 = 초심자의 가장 흔한 행동이 막힌다).
     *   seen[i]  — 한 번이라도 들어와 봤다 → 준비 동작(action)·자동 생성을 다시 하지 않는다
     *   done[i]  — 실제로 통과했다 → 다시 요구하지 않는다. 건너뛴 단계는 false 로 남아
     *              돌아오면 판정이 되살아난다. */
    seen: [],
    done: [],
    passing: false,        // 통과 연출 중(중복 전진 방지)
    near: "far",           // 안내선 근접 상태 — far | close | hit
    ui,
    ctx: {},               // 단계끼리 값을 주고받는 자리(그리기 전 개수 등)
    nodes: [],
    prevMode,
    practice: null,
    tick: null,
    waitOff: null,
    onResize: null,
  };

  // Pro 로 전환 — Lite 는 과목 오브젝트·전체 통일 등을 숨겨서 짚을 대상이 사라진다.
  // 끝나면 원래 모드로 되돌린다(사용자 확인 완료 사항).
  if (prevMode !== "pro") {
    document.documentElement.setAttribute("data-mode", "pro");
    const btn = document.getElementById("mode-toggle-btn");
    if (btn) { btn.textContent = "Pro"; btn.classList.remove("is-on"); btn.setAttribute("aria-pressed", "false"); }
  }

  // 연습 페이지는 코스 시작이 아니라 '캔버스를 처음 쓰는 단계'에서 만든다(ensurePractice).

  // 버튼 배선
  // 방패를 누르면 "여기가 아니라 지금은 읽기만" — 조용히 막기만 하면 고장으로 읽힌다.
  ui.shield.addEventListener("click", (e) => { e.stopPropagation(); nudge(); });
  ui.btnQuit.addEventListener("click", () => stopTutorial());
  ui.btnNext.addEventListener("click", () => goNext());
  ui.btnPrev.addEventListener("click", () => goPrev());

  _run.onResize = () => reposition();
  window.addEventListener("resize", _run.onResize);
  window.addEventListener("scroll", _run.onResize, true);

  // 패널 접힘·모달 등장처럼 리스너로는 못 잡는 변화까지 따라가도록 주기적으로 다시 잰다.
  //
  // ⚠ 주기가 길면 실제 버그가 된다: 도구 팝오버처럼 '눌러서 방금 생긴' 대상은
  //   구멍이 옮겨 오기 전까지 흐림 패널에 덮여 클릭이 막힌다. 그 사이에 누르면
  //   바깥 클릭으로 취급돼 팝오버가 닫혀 버려, 영영 고를 수 없는 것처럼 보인다
  //   (빗면 코스에서 '텍스트'를 못 고르던 원인). 80ms 로 촘촘히 따라간다.
  _run.tick = setInterval(() => {
    if (!_run.transitioning) reposition();   // 전환 연출 중엔 추적을 쉰다(자리 다툼 방지)
    checkUntil();
  }, 80);

  showStep();
}

/* (runAuto 는 없앴다 — 쉬움 모드가 auto 를 사람 대신 한 번에 돌리던 함수였다.
 *  지금은 [자동으로 하기] 단추의 핸들러가 직접 한 걸음씩 실행한다.) */

/* 연습 페이지를 아직 안 만들었으면 지금 만든다.
 * 코스 시작과 동시에 만들면, 화면 설정을 만지는 '준비' 단계 내내 빈 페이지가 하나
 * 이미 생겨 있어 어리둥절해진다 → 캔버스를 처음 쓰는 단계(step.practice)에서 만든다. */
function ensurePractice(step) {
  if (!_run || _run.practice || !_run.course.practice) return;
  const flagged = _run.course.steps.some((s) => s.practice);
  if (flagged && !step.practice) return;
  _run.practice = createPracticePage();
}

/* 이 단계의 '얼마나 가까운가'(0~1). wait.progress 를 준 단계만 값이 나온다.
 * 1 = 오차 범위 안(통과), 0 = 아직 멀다. 없는 단계는 null(근접 표시를 하지 않는다). */
function stepProgress(step) {
  if (!step || !step.wait || typeof step.wait.progress !== "function") return null;
  try {
    const v = step.wait.progress(_run.ctx);
    return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null;
  } catch (_) { return null; }
}

function showStep(attempt = 0) {
  if (!_run) return;
  const { course, ui } = _run;
  const step = course.steps[_run.index];
  if (!step) { finishCourse(); return; }

  // ── 단계 전환 연출 1/2: 떠 있던 설명 창을 제자리에서 조용히 내린다 ──
  // 화면을 가로질러 날아가는 이동은 쓰지 않는다. 사라졌다가 새 위치에서 떠오른다.
  if (attempt === 0 && _run.shown) {
    _run.transitioning = true;
    stopDemo();
    ui.coach.classList.remove("is-entering");
    ui.coach.classList.add("is-leaving");
    setTimeout(() => showStep(0.5), T_EXIT);   // attempt 0.5 = 퇴장 완료 후 재진입 표식
    return;
  }

  /* 한 번 들어와 봤는가 / 실제로 통과했는가 (둘은 다르다 — _run 주석 참고).
   * ⚠ '들어와 봤는가'는 **이 방문이 시작될 때의 값**을 붙들어 둔다. showStep 은 대상을
   *   못 찾으면 120ms 간격으로 다시 도는데, 그때마다 새로 읽으면 두 번째 바퀴부터
   *   '이미 본 단계'가 되어 [자동으로 하기] 단추가 사라진다. */
  if (attempt <= 0.5) _run.entrySeen = !!_run.seen[_run.index];
  const seen = !!_run.entrySeen;
  const cleared = !!_run.done[_run.index];

  ensurePractice(step);

  // step.compare = 기출 도판 id. 내용(코스)은 "무엇과 비교하는가"만 적고, 창을 띄우는
  // 일은 연출(엔진)이 한다 — 그래서 tutorial-courses.js 가 이 파일을 되짚지 않는다.
  // step.exam = 아직 그린 것이 없을 때(첫 단계) — 원본만 한 칸으로 보여 준다.
  // 빈 칸과 나란히 놓는 것은 비교가 아니므로 '비교' 단추를 만들지 않는다(사용자 지적).
  const stepAuto = step.auto || (step.compare
    ? {
      label: "원본과 나란히 놓고 보기",
      stay: true,   // 창을 열어 두는 단추라 단계를 넘기지 않는다
      run: () => openCompare(step.compare, { note: step.compareNote || "" }),
    }
    : step.exam
      ? {
        label: "기출 원본 보기",
        stay: true,
        run: () => openCompare(step.exam, { note: step.examNote || "", examOnly: true }),
      }
      : null);

  // 단계 진입 준비는 처음 들어올 때 딱 한 번만(되돌아왔을 때 다시 돌리면 안 된다).
  if (attempt <= 0.5 && !seen) {
    _run.seen[_run.index] = true;
    if (typeof step.action === "function") {
      try { step.action(_run.ctx); } catch (err) { console.warn("[튜토리얼] 준비 단계 실패", err); }
    }
  }

  const nodes = resolveTargets(step);
  if (step.target && nodes.length === 0) {
    // 모달처럼 조금 늦게 생기는 대상이 있다 — 잠깐 기다렸다 다시 찾는다.
    if (attempt < 12) { setTimeout(() => showStep(Math.max(1, Math.floor(attempt) + 1)), 120); return; }
    // 끝내 못 찾으면 흐림도 걷는다. 구멍 없는 전체 흐림 + 가운데 설명 창은
    // "먹통이 됐다"로 보이기 때문 — 차라리 화면을 열어 두고 글로만 안내한다.
    console.warn(`[튜토리얼] '${course.title}' ${_run.index + 1}단계의 대상을 찾지 못했습니다. 흐림 없이 설명만 표시합니다.`);
    _run.noTarget = true;
  } else {
    _run.noTarget = false;
  }
  _run.nodes = nodes;

  /* 진행 표시 — 챕터가 있으면 챕터 안의 번호로 센다.
   * 코스를 합치면 단계가 스무 개 가까이 되는데, 첫 화면에 '1 / 19'가 뜨면 그 숫자만으로
   * 이탈한다. 사람이 체감하는 덩어리(준비 / 기초 조작)로 끊어 세고, 전체 진행은
   * 숫자가 아니라 얇은 막대로만 보여 준다. */
  const chapter = step.chapter || "";
  const sameChapter = course.steps.filter((s) => (s.chapter || "") === chapter);
  const inChapter = sameChapter.indexOf(step) + 1;
  // 챕터 이름이 코스 제목과 같으면 겹쳐 적지 않는다("기초 조작 · 기초 조작" 방지).
  ui.course.textContent = chapter && chapter !== course.title
    ? `${course.title} · ${chapter}`
    : course.title;
  ui.count.textContent = chapter
    ? `${inChapter} / ${sameChapter.length}`
    : `${_run.index + 1} / ${course.steps.length}`;
  if (ui.bar) ui.bar.style.width = `${((_run.index + 1) / course.steps.length) * 100}%`;
  ui.title.textContent = step.title || "";

  ui.text.textContent = "";
  for (const line of String(step.text || "").split("\n")) {
    const p = document.createElement("p");
    p.className = line.trim().startsWith("·") ? "tut-line tut-line-bullet" : "tut-line";
    p.textContent = line;
    ui.text.appendChild(p);
  }

  // 자동 단계: 타이핑처럼 손이 많이 가는 일은 프로그램이 대신 한다(사용자 요구).
  // 되돌아온 단계에서는 다시 실행하지 않는다 — 같은 것이 두 번 만들어지면 안 되므로.
  // auto.repeat 가 있으면 "누를 때마다 한 걸음"이다 — 검색어를 한 조각씩 넣어
  // 결과가 좁혀지는 것을 눈으로 보여 주는 용도(사용자 요구). repeat 가 false 를
  // 돌려줄 때까지 버튼이 남아 있고, 그때 비로소 다음 단계로 넘어간다.
  // 되돌아온 단계에서는 자동 단추를 감춘다(같은 것이 두 번 만들어지면 안 되므로).
  // 단 auto.stay 는 '열어 보는' 단추라 몇 번 열어도 무해하다 — 비교 창을 닫고
  // [이전]으로 돌아왔을 때 다시 열 수 없으면 비교 자체를 못 하게 된다.
  const auto = stepAuto && (!seen || stepAuto.stay) ? stepAuto : null;
  ui.autoBtn.hidden = !auto;
  if (auto) {
    _run.autoStep = 0;
    const label = () => (auto.repeat ? auto.repeat.label(_run.autoStep, _run.ctx) : (auto.label || "자동으로 하기"));
    ui.autoBtn.textContent = label();
    ui.autoBtn.onclick = () => {
      if (!_run) return;
      try {
        if (auto.repeat) {
          const more = auto.repeat.run(_run.autoStep, _run.ctx);
          _run.autoStep += 1;
          if (more) { ui.autoBtn.textContent = label(); return; }   // 아직 남았다 — 그대로 대기
        } else {
          auto.run(_run.ctx);
        }
      } catch (err) { console.warn("[튜토리얼] 자동 단계 실패", err); }
      // wait 이 함께 있으면 자동 단추는 '거들어 주기'일 뿐 — 마무리는 사용자 몫이다
      // (예: 입력칸을 열고 글자만 채워 주고, 확정은 직접 Ctrl+Enter).
      // auto.stay 는 창을 열어 보여 주는 용도라 단계를 넘기지 않는다.
      if (!step.wait && !auto.stay) goNext();
    };
  } else {
    ui.autoBtn.onclick = null;
  }

  /* 실습을 기다리는 단계인가. 이미 통과한 단계(done)는 다시 요구하지 않는다 —
   * 건너뛴 단계는 done 이 아니므로 돌아오면 판정이 되살아난다. */
  const waiting = !!step.wait && !cleared;
  _run.waiting = waiting;
  _run.near = "far";
  // 읽기만 하는 단계는 짚은 자리를 못 누르게 덮는다(paintShield). 실습 단계는 당연히 연다.
  _run.locked = !!step.lock && !waiting;
  ui.doChip.hidden = !waiting && !_run.locked;
  ui.doChip.classList.remove("is-hit");
  ui.doChip.textContent = waiting
    ? ((step.wait && step.wait.hint) || "직접 해 보세요")
    : "지금은 읽기만 하세요 — 아직 누르지 않습니다";

  /* [다음]은 **언제나 보인다.**
   * 예전에는 실습 단계에서 아예 숨기고 12초를 버텨야 [건너뛰기]가 나타났다.
   * 그동안 처음 온 사람에게는 '멈춘 프로그램'이었다 — 나갈 문이 안 보이는 것이
   * 튜토리얼에서 가장 큰 이탈 요인이다. 대신 상태로 구분한다:
   *   · 아직 못 한 실습 단계  → 흐린 보조 단추(is-soft) + '건너뛰고 다음'
   *   · 통과했거나 읽기 단계  → 진한 기본 단추 '다음'
   * 판정이 헐렁한 단계에 붙이던 allowNext 는 이제 의미가 없다(항상 나갈 수 있으므로). */
  const last = _run.index === course.steps.length - 1;
  ui.btnNext.hidden = false;
  ui.btnNext.classList.toggle("is-soft", waiting);
  ui.btnNext.classList.toggle("tut-btn-primary", !waiting);
  ui.btnNext.textContent = last ? "마치기" : (waiting ? "건너뛰고 다음" : "다음");
  ui.btnPrev.disabled = _run.index === 0;

  if (waiting) bindWait(step);
  else unbindWait();

  // ── 단계 전환 연출 2/2: 새 자리 배치는 안 보이는 동안 한 번에 끝내고,
  //    테두리(대상) → 설명 창 순서로 띄운다. 눈이 대상을 먼저 찾게. ──
  ui.coach.classList.add("is-leaving");        // 배치 중엔 보이지 않게
  for (const d of Object.values(_run.ui.dims)) d.classList.add("no-anim");
  reposition(true);
  // 강제 리플로우로 no-anim 배치를 굳힌 뒤 추적 애니메이션을 되살린다.
  void ui.coach.offsetWidth;
  for (const d of Object.values(_run.ui.dims)) d.classList.remove("no-anim");

  const firstShow = !_run.shown;
  _run.shown = true;

  // 테두리가 새 자리에서 먼저 뜬다.
  if (!ui.halo.hidden) {
    ui.halo.classList.remove("is-entering");
    void ui.halo.offsetWidth;
    ui.halo.classList.add("is-entering");
    setTimeout(() => { if (_run) ui.halo.classList.remove("is-entering"); }, T_ENTER + 50);
  }

  // 80ms 뒤 설명 창이 떠오른다 (첫 등장은 스태거 없이 바로).
  const raise = () => {
    if (!_run) return;
    ui.coach.classList.remove("is-leaving");
    ui.coach.classList.add("is-entering");
    setTimeout(() => { if (_run) ui.coach.classList.remove("is-entering"); }, T_ENTER + 50);
    _run.transitioning = false;
  };
  if (firstShow) raise();
  else setTimeout(raise, STAGGER);

  // 커서 시연은 화면이 안정된 뒤에 시작한다.
  startDemo(step, { delay: DEMO_DELAY });

  // 이어하기를 쓰지 않으므로 중단 지점을 남기지 않는다.
}

/* 실습 단계: 진짜 사용자 조작으로만 넘어간다(시간으로 자동 통과시키지 않는다). */
function bindWait(step) {
  unbindWait();
  if (!step.wait) return;

  if (step.wait.click) {
    const sel = step.wait.click;
    const handler = (e) => {
      const t = e.target;
      if (t && t.closest && t.closest(sel)) { pass(); return; }
      /* 엉뚱한 곳을 눌렀다 — 아무 반응이 없으면 '고장'으로 읽힌다.
       * 짚어 준 자리를 한 번 흔들어 "여기가 아니라 저기"라고만 알려 준다.
       * (흐림 덮개 위를 눌렀을 때만. 구멍 안이나 설명 창은 정상 조작이다.) */
      if (t && t.closest && t.closest(".tut-dim")) nudge();
    };
    document.addEventListener("click", handler, true);
    _run.waitOff = () => document.removeEventListener("click", handler, true);
  }
  // until·progress 는 tick 에서 확인한다(checkUntil).
}

function unbindWait() {
  if (!_run) return;
  if (_run.waitOff) { _run.waitOff(); _run.waitOff = null; }
  if (_run.passTimer) { clearTimeout(_run.passTimer); _run.passTimer = null; }
  _run.passing = false;
}

/* 짚어 준 자리를 한 번 흔든다 — "누를 곳은 여기입니다". */
function nudge() {
  if (!_run || !_run.ui) return;
  const { halo, doChip } = _run.ui;
  for (const el of [halo, doChip]) {
    if (!el || el.hidden) continue;
    el.classList.remove("is-nudge");
    void el.offsetWidth;
    el.classList.add("is-nudge");
    setTimeout(() => el.classList.remove("is-nudge"), 520);
  }
}

/* 통과 — 바로 넘기지 않고 '됐습니다'를 보여 준 뒤 넘어간다.
 * 클릭 실습은 앱 자신의 핸들러(모달 열기 등)가 먼저 돌아야 하므로 이 대기가 그 몫도 겸한다. */
function pass() {
  if (!_run || _run.passing) return;
  _run.passing = true;
  _run.done[_run.index] = true;
  _run.near = "hit";
  const { doChip } = _run.ui;
  if (doChip && !doChip.hidden) {
    doChip.textContent = "✓ 됐습니다";
    doChip.classList.add("is-hit");
  }
  _run.passTimer = setTimeout(() => {
    if (!_run) return;
    _run.passTimer = null;
    goNext();
  }, PASS_HOLD);
}

function checkUntil() {
  if (!_run || _run.passing) return;
  const step = _run.course.steps[_run.index];
  if (!step || !step.wait || !_run.waiting) return;
  // 마우스를 누르고 있는 동안에는 판정하지 않는다. 끄는 도중에도 상태는 계속 바뀌므로,
  // 손을 떼기 전에 통과시키면 "놓기도 전에 넘어가 버린다"(사용자 지적).
  if (isDragging()) return;

  // 근접 표시 — 값이 있는 단계만. 허용치 안이면 hit, 허용치의 2배 안이면 close.
  const p = stepProgress(step);
  if (p != null) _run.near = p >= 1 ? "hit" : (p > 0 ? "close" : "far");

  if (typeof step.wait.until !== "function") return;
  let done = false;
  try { done = !!step.wait.until(_run.ctx); } catch (_) { done = false; }
  if (done) pass();
}

function reposition(force = false) {
  if (!_run) return;
  const { ui } = _run;

  // 대상은 매번 다시 찾는다 — 도구 선택 팝오버·모달처럼 단계 도중에 생겼다 사라지는
  // 것까지 따라가야 한다(querySelector 몇 번이라 비용은 무시할 수준).
  const fresh = resolveTargets(_run.course.steps[_run.index] || {});
  if (fresh.length) _run.nodes = fresh;
  const hole = unionRect(_run.nodes);
  const step = _run.course.steps[_run.index] || {};

  // 안내선은 한 단계 안에서도 내용이 바뀐다(예: 겨냥 실습의 '1→2→3번째 자리').
  // 구멍이 그대로면 다시 안 그리는 규칙에 묶어 두면 문구가 옛것으로 남는다 →
  // 안내선·키표시는 항상 다시 그린다(요소 몇 개라 비용은 무시할 수준).
  paintGuide(step);
  paintModKey(step, hole);

  // 구멍·설명 창 자리는 실제로 바뀌었을 때만 손댄다(전환 애니메이션이 튀지 않게).
  const key = (hole ? `${hole.x}|${hole.y}|${hole.w}|${hole.h}` : "none") + "#" + ctmKey();
  if (!force && key === _run.lastKey) return;
  _run.lastKey = key;

  paintHole(ui, hole);
  paintShield(ui, hole);
  // 짚을 대상이 없는 단계라도 안내 그림이 있으면 그것만은 가리지 않는다
  // (완성 미리보기를 설명 창이 덮어 버리면 보여 주는 의미가 없다).
  placeCoach(ui, hole || guideBox(ui));
}

function goNext() {
  if (!_run) return;
  unbindWait();
  if (_run.index >= _run.course.steps.length - 1) { finishCourse(); return; }
  _run.index += 1;
  showStep();
}

function goPrev() {
  if (!_run || _run.index === 0) return;
  unbindWait();
  _run.index -= 1;
  showStep();
}

async function finishCourse() {
  if (!_run) return;
  const course = _run.course;
  const practice = _run.practice;
  markDone(course.id);
  removeKey(K_RESUME_LEGACY);
  teardown();
  await cleanupPracticePage(practice);
  openPicker({ justFinished: course.id });
}

/* ===== 종료 · 정리 ===== */

export function stopTutorial({ silent = false } = {}) {
  if (!_run) return;
  const practice = _run.practice;
  teardown();
  if (!silent) cleanupPracticePage(practice);
}

function teardown() {
  if (!_run) return;
  unbindWait();
  stopDemo();
  closeCompare();
  if (_run.tick) clearInterval(_run.tick);
  if (_run.onResize) {
    window.removeEventListener("resize", _run.onResize);
    window.removeEventListener("scroll", _run.onResize, true);
  }
  // 시작할 때 Pro 로 바꿨다면 원래 모드로 되돌린다.
  if (_run.prevMode && _run.prevMode !== "pro") {
    const btn = document.getElementById("mode-toggle-btn");
    if (btn) btn.click();          // view-mode.js 의 정식 경로로 되돌린다(레이어 복원 포함)
    else document.documentElement.setAttribute("data-mode", _run.prevMode);
  }
  if (_run.ui && _run.ui.root) _run.ui.root.remove();
  _run = null;
}

/* ===== 코스 고르기 화면 ===== */

let _picker = null;

export function openPicker({ justFinished = null } = {}) {
  closePicker();
  const done = doneCourses();

  const overlay = document.createElement("div");
  overlay.className = "tut-picker-overlay";

  const finished = justFinished ? getCourse(justFinished) : null;
  const suggested = finished
    ? (finished.next || []).map(getCourse).filter(Boolean).filter((c) => !done.includes(c.id))
    : [];

  const head = finished
    ? `<div class="tut-picker-congrats">
         <strong>'${finished.title}' 코스를 마쳤습니다.</strong>
         ${suggested.length ? `<span>이어서 '${suggested[0].title}' 코스는 어떠세요?</span>` : "<span>수고하셨습니다.</span>"}
       </div>`
    : `<p class="tut-picker-lead">배우고 싶은 것을 고르세요. 실제 화면 위에서 하나씩 짚어 드립니다.</p>`;

  overlay.innerHTML = `
    <div class="tut-picker" role="dialog" aria-modal="true" aria-labelledby="tut-picker-title">
      <h2 class="tut-picker-title" id="tut-picker-title">튜토리얼</h2>
      ${head}
      <div class="tut-picker-cols">
        <div class="tut-track-nav" role="tablist" aria-label="튜토리얼 단계"></div>
        <div class="tut-picker-pane"></div>
      </div>
      <div class="tut-picker-foot">
        <button type="button" class="tut-btn tut-picker-close">닫기</button>
      </div>
    </div>`;

  // 코스가 17개다. 한 줄로 늘어놓으면 어디부터 할지 알 수 없어 위계가 사라진다 →
  // 왼쪽에 단계(기본·심화·실습)를 세우고, 고른 단계의 코스만 오른쪽에 펼친다.
  const TRACKS = [
    { name: "기본", lead: "먼저 이것부터", note: "차례대로 하시면 됩니다",
      pick: (c) => ["basics", "incline-figure", "exam-search"].includes(c.id) },
    { name: "심화", lead: "도구 넓히기", note: "기본을 마친 뒤에",
      pick: (c) => ["trim-exam", "align-space", "terrain"].includes(c.id) },
    { name: "실습 과제", lead: "그림 한 장을 끝까지", note: "골라서 하셔도 됩니다",
      pick: (c) => !!c.task },
  ];

  const tracks = TRACKS
    .map((t) => ({ ...t, items: COURSES.filter(t.pick) }))
    .filter((t) => t.items.length);

  const nav = overlay.querySelector(".tut-track-nav");
  const pane = overlay.querySelector(".tut-picker-pane");

  const courseRow = (c) => {
    const isDone = done.includes(c.id);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "tut-course" + (isDone ? " is-done" : "") + (suggested[0] && suggested[0].id === c.id ? " is-suggested" : "");
    row.innerHTML = `
      <span class="tut-course-mark" aria-hidden="true">${isDone ? "✓" : ""}</span>
      <span class="tut-course-body">
        <span class="tut-course-title">${c.title}</span>
        <span class="tut-course-desc">${c.desc}</span>
      </span>
      <span class="tut-course-meta">약 ${c.minutes}분</span>`;
    row.addEventListener("click", () => startCourse(c.id));   // 언제나 처음부터
    return row;
  };

  // 처음 열 때 어느 단계를 펼칠까 — 이어서 할 코스가 있으면 그쪽, 없으면 아직 덜 끝낸 첫 단계.
  const trackOf = (id) => tracks.findIndex((t) => t.items.some((c) => c.id === id));
  let cur = suggested[0] ? trackOf(suggested[0].id) : -1;
  if (cur < 0) cur = tracks.findIndex((t) => t.items.some((c) => !done.includes(c.id)));
  if (cur < 0) cur = 0;

  const showTrack = (i) => {
    cur = i;
    nav.querySelectorAll(".tut-track-btn").forEach((b, k) => {
      const on = k === i;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
    });
    const t = tracks[i];
    pane.innerHTML = `<div class="tut-pane-head">
        <span class="tut-pane-name">${t.name} — ${t.lead}</span>
        <span class="tut-pane-note">${t.note}</span>
      </div>
      <div class="tut-picker-list"></div>`;
    const list = pane.querySelector(".tut-picker-list");
    t.items.forEach((c) => list.appendChild(courseRow(c)));
  };

  tracks.forEach((t, i) => {
    const doneN = t.items.filter((c) => done.includes(c.id)).length;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tut-track-btn" + (doneN === t.items.length ? " is-cleared" : "");
    b.setAttribute("role", "tab");
    b.innerHTML = `<span class="tut-track-name">${t.name}</span>
      <span class="tut-track-lead">${t.lead}</span>
      <span class="tut-track-count">${doneN}/${t.items.length}</span>`;
    b.addEventListener("click", () => showTrack(i));
    nav.appendChild(b);
  });

  // 위·아래 화살표로 단계를 옮긴다(탭 목록의 관례).
  nav.addEventListener("keydown", (e) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (cur + step + tracks.length) % tracks.length;
    showTrack(next);
    nav.querySelectorAll(".tut-track-btn")[next].focus();
  });

  showTrack(cur);

  overlay.querySelector(".tut-picker-close").addEventListener("click", closePicker);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closePicker(); });

  document.documentElement.appendChild(overlay);
  _picker = overlay;
}

export function closePicker() {
  _picker = null;
  // 변수 하나만 지우면 '고아 창'이 남는다 — 어떤 경로로든 두 번 열렸다면 둘 다 걷어낸다.
  // (남은 창은 눈에 보이지 않아도 스페이스바 같은 전역 키를 계속 막는다.)
  document.querySelectorAll(".tut-picker-overlay").forEach((el) => el.remove());
}

/* ===== 원본과 비교하기 =====
 * 코스 마지막 단계용. 왼쪽에 기출 원본 도판(assets/exam-library), 오른쪽에
 * 지금 그린 것을 나란히 놓는다. 내 그림은 내보내기와 똑같은 경로(buildExportSvg)로
 * 뽑는다 — 편집 화면의 보조선·핸들이 섞이면 비교가 안 되기 때문이다. */
let _compare = null;

export function openCompare(examId, { note = "", examOnly = false } = {}) {
  closeCompare();

  const overlay = document.createElement("div");
  overlay.className = "tut-compare-overlay";
  overlay.innerHTML = `
    <div class="tut-compare${examOnly ? " is-single" : ""}" role="dialog" aria-modal="true" aria-labelledby="tut-compare-title">
      <div class="tut-compare-head">
        <h2 class="tut-compare-title" id="tut-compare-title">${examOnly ? "기출 원본" : "원본과 비교"}</h2>
        <button type="button" class="tut-btn tut-compare-close">닫기</button>
      </div>
      ${note ? `<p class="tut-compare-note">${note}</p>` : ""}
      <div class="tut-compare-body">
        <figure class="tut-compare-pane">
          <figcaption>${examOnly ? "오늘 만들 그림" : "기출 원본"}</figcaption>
          <div class="tut-compare-box">
            <img alt="기출 원본 도판" src="assets/exam-library/images/${examId}.png">
          </div>
        </figure>
        ${examOnly ? "" : `<figure class="tut-compare-pane">
          <figcaption>내가 만든 그림</figcaption>
          <div class="tut-compare-box tut-compare-mine"></div>
        </figure>`}
      </div>
    </div>`;

  const box = overlay.querySelector(".tut-compare-mine");
  if (box) try {
    const svg = buildExportSvg(state.get());
    // mm 실측 크기로 나오므로 칸에 맞게 다시 재운다(viewBox 는 그대로 둔다).
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    box.appendChild(svg);
  } catch (err) {
    console.warn("[튜토리얼] 비교용 그림을 만들지 못했습니다", err);
    box.textContent = "그림을 불러오지 못했습니다.";
  }

  overlay.querySelector(".tut-compare-close").addEventListener("click", closeCompare);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeCompare(); });

  document.documentElement.appendChild(overlay);
  _compare = overlay;
}

export function closeCompare() {
  if (_compare) { _compare.remove(); _compare = null; }
}

/* ===== 첫 방문 제안 배너 =====
 * 처음 온 사람만 한 번 본다. 거절하면 다시 뜨지 않는다(기존 사용자 방해 금지). */
function maybeShowBanner() {
  if (readJSON(K_BANNER, false)) return;
  if (doneCourses().length > 0) return;
  writeJSON(K_BANNER, true);

  // 화면 한가운데에 띄운다. 아래쪽 구석에 뜨면 '광고 배너'처럼 보여 그냥 닫아 버린다 —
  // 처음 온 사람에게 이 창은 "왜 튜토리얼을 해야 하는가"를 말하는 유일한 기회다.
  const bar = document.createElement("div");
  bar.className = "tut-welcome-overlay";
  bar.innerHTML = `
    <div class="tut-welcome" role="dialog" aria-modal="true" aria-labelledby="tut-welcome-title">
      <h2 class="tut-welcome-title" id="tut-welcome-title">찾아 주셔서 고맙습니다</h2>
      <p class="tut-welcome-lead">5E는 시험지·학습지에 넣을 그림을 만드는 도구입니다.
        파워포인트로 10분 걸리던 그림이 2분이면 나옵니다.</p>
      <p class="tut-welcome-lead">처음이시라면 <b>튜토리얼</b>을 권합니다. 화면 위에서 하나씩 짚어 드립니다.</p>
      <ul class="tut-welcome-list">
        <li>읽는 설명서가 아니라 <b>직접 해 보는</b> 안내입니다</li>
        <li><b>30분이면 끝</b>납니다. 코스마다 끊어서 하셔도 됩니다</li>
        <li>글자 입력은 <b>대신 해 드립니다</b> — 누르고 끄는 것만 하시면 됩니다</li>
        <li>막히면 <b>[이전]</b>으로 돌아가고, <b>[그만]</b>으로 언제든 나갑니다</li>
      </ul>
      <div class="tut-welcome-foot">
        <button type="button" class="tut-btn tut-banner-no">건너뛰기</button>
        <button type="button" class="tut-btn tut-btn-primary tut-banner-yes">튜토리얼 시작 (30분)</button>
      </div>
    </div>`;
  document.documentElement.appendChild(bar);

  const close = () => bar.remove();
  bar.querySelector(".tut-banner-yes").addEventListener("click", () => {
    close();
    startCourse("basics");   // '준비' 챕터에서 화면부터 눈에 맞추고 시작한다
  });
  // 건너뛰어도 "나중에 어디서 여는지"는 알려 주고 사라진다 —
  // 안 그러면 튜토리얼이 있다는 사실 자체를 모른 채 쓰게 된다(사용자 요구).
  bar.querySelector(".tut-banner-no").addEventListener("click", () => {
    close();
    pointAtTutorialButton();
  });
}

/* 건너뛰기를 눌렀을 때: 상단 [튜토리얼] 단추를 잠깐 짚어 주고 사라진다.
 * "언제든 여기 있습니다"만 알리면 되므로 튜토리얼 레이어를 띄우지 않는다. */
function pointAtTutorialButton() {
  const btn = document.getElementById("tutorial-btn");
  if (!btn) return;
  const r = btn.getBoundingClientRect();

  const tip = document.createElement("div");
  tip.className = "tut-pointout";
  tip.innerHTML = `<span class="tut-pointout-arrow" aria-hidden="true">▲</span>
    <span>튜토리얼은 언제든 <b>여기</b>서 다시 열 수 있습니다</span>`;
  document.documentElement.appendChild(tip);

  const ring = document.createElement("div");
  ring.className = "tut-pointout-ring";
  Object.assign(ring.style, {
    left: (r.left - 5) + "px", top: (r.top - 5) + "px",
    width: (r.width + 10) + "px", height: (r.height + 10) + "px",
  });
  document.documentElement.appendChild(ring);

  const tw = tip.offsetWidth;
  const x = Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, window.innerWidth - tw - 8));
  tip.style.left = Math.round(x) + "px";
  tip.style.top = Math.round(r.bottom + 10) + "px";

  setTimeout(() => { tip.remove(); ring.remove(); }, 4200);
}

/* ===== 배선 ===== */

export function initTutorial() {
  removeKey(K_RESUME_LEGACY);   // 예전 버전이 남긴 이어하기 기록을 치운다
  removeKey(K_LEVEL_LEGACY);    // 폐지한 난이도 선택의 잔재

  const btn = document.getElementById("tutorial-btn");
  if (btn) btn.addEventListener("click", () => {
    if (_run) stopTutorial();
    else if (_picker) closePicker();
    else openPicker();
  });

  // ESC: 튜토리얼을 끈다. 단 앱 모달이 열려 있으면 그쪽이 먼저 닫혀야 하므로 양보한다.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.querySelector(".modal-overlay:not([hidden])")) return;
    if (_compare) { closeCompare(); return; }
    if (_picker) { closePicker(); return; }
    if (_run) stopTutorial();
  });

  /* 스페이스바 = [다음] (사용자 요구: 단추를 매번 누르지 않게).
   *
   * ⚠ 5E 는 스페이스를 '누르고 있는 동안' 화면 끌기·자르기 보조로 쓴다(tools.js·cut-tool.js).
   *   그래서 아무 때나 가로채면 그리기 조작을 망친다. 다음 경우에만 넘긴다:
   *     · 튜토리얼이 돌고 있고, 비교 창·앱 모달이 열려 있지 않다
   *     · 글자를 입력하는 중이 아니다
   *     · 지금 실습을 기다리는 단계가 아니다
   *   실습 단계에서는 손으로 그려야 하므로 스페이스를 앱에 그대로 넘긴다.
   *   ⚠ 예전에는 '[다음]이 보이는가'로 판단했는데, 이제 [다음]은 언제나 보인다 —
   *     그 조건을 그대로 두면 실습 중에 스페이스가 가로채여 화면 끌기가 죽는다. */
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" && e.key !== " ") return;
    if (!_run) return;
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;   // Ctrl+Space 등은 앱 몫
    // 변수가 아니라 실제 화면을 본다 — 변수만 믿으면 어긋난 상태 하나로 키가 영영 막힌다.
    if (document.querySelector(".tut-compare-overlay, .tut-picker-overlay")) return;
    if (document.querySelector(".modal-overlay:not([hidden])")) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (_run.waiting) return;           // 실습 대기 단계 — 앱에 양보한다
    e.preventDefault();
    goNext();
  });

  // 탭을 닫아도 흐림이 남지 않게(뒤로가기·새로고침 포함) 정리한다.
  window.addEventListener("pagehide", () => { if (_run) teardown(); });

  maybeShowBanner();
}
