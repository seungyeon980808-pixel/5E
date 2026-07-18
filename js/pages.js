/* ===== PAGES (다중 아트보드 — 하단 탭 + 스왑 방식 전환) =====
 *
 * 설계 핵심(FEATURE_PROPOSALS "다중 아트보드"): 기존 수십 모듈이 참조하는
 * s.objects / s.guides / s.layers / s.artboard 구조는 절대 바꾸지 않는다.
 * 활성 페이지만 그 4필드를 top-level에 두고, 전체 페이지 기록은 s.pages[]에
 * 보관한다. 페이지 전환 = "현재 4필드를 활성 page에 써넣고(writeBack) 대상
 * page의 4필드를 top-level로 꺼내오는" 스왑. 그래서 render/pick/transform/snap
 * 등은 무수정으로 동작한다.
 *
 * page 기록: { id, name, objects, guides, layers, artboard }.
 * (meta 필드는 하위호환을 위해 로드/저장 시 보존만 하고 UI에는 노출하지 않는다.)
 */

import { showPrompt, showConfirm } from "./ui-dialogs.js?v=1.0.3";
import { rebuildGroups } from "./transform.js?v=1.0.3";

let _seq = 0;
function newPageId() {
  return `page_${Date.now().toString(36)}_${++_seq}`;
}

// 새 페이지의 기본 레이어(state.js 초기값과 동일 구조). 페이지마다 독립 레이어를 갖는다.
function defaultLayers() {
  return [
    { id: 1, name: "레이어 1", visible: true },
    { id: 2, name: "레이어 2", visible: true },
    { id: 3, name: "레이어 3", visible: true },
  ];
}

function findPage(s, id) {
  return (s.pages || []).find((p) => p.id === id) || null;
}

// 현재 top-level 4필드를 활성 page 기록에 반영한다(전환·저장·일괄내보내기 전에 호출).
// 다른 모듈이 s.objects 등을 재할당(filter/undo)하므로 참조가 갈라진다 → 명시적 write-back.
function writeBackActive(s) {
  const p = findPage(s, s.activePageId);
  if (!p) return;
  p.objects = s.objects;
  p.guides = s.guides;
  p.layers = s.layers;
  p.artboard = s.artboard;
}

// 외부(project-io serialize, export-dialog 일괄내보내기)에서 활성 페이지 동기화가
// 필요할 때 쓰는 공개 헬퍼. state.update로 감싸 구독자에게 알린다.
export function commitActivePage(state) {
  state.update((s) => writeBackActive(s));
}

/* ----- initPages: 최초 1개 페이지로 감싸고 탭 바를 마운트 ----- */
export function initPages(state) {
  state.update((s) => {
    if (!Array.isArray(s.pages) || s.pages.length === 0) {
      const id = newPageId();
      s.pages = [{
        id,
        name: "페이지 1",
        meta: { number: "", points: "" },
        objects: s.objects,
        guides: s.guides,
        layers: s.layers,
        artboard: s.artboard,
      }];
      s.activePageId = id;
    } else if (!findPage(s, s.activePageId)) {
      s.activePageId = s.pages[0].id;
    }
  });

  buildBar(state);

  // 페이지 목록/이름/메타/활성이 바뀌었을 때만 탭을 다시 그린다(캔버스 편집 때마다
  // DOM을 재생성하지 않도록 시그니처 비교).
  let lastSig = "";
  state.subscribe((s) => {
    const sig = pagesSignature(s);
    if (sig !== lastSig) { lastSig = sig; renderTabs(state); }
  });
  renderTabs(state);
}

function pagesSignature(s) {
  return JSON.stringify((s.pages || []).map((p) => [p.id, p.name]))
    + "|" + s.activePageId;
}

/* ----- 전환 ----- */
export function switchPage(state, targetId) {
  state.update((s) => {
    if (s.activePageId === targetId) return;
    const t = findPage(s, targetId);
    if (!t) return;
    writeBackActive(s);
    s.objects = t.objects;
    s.guides = t.guides;
    s.layers = t.layers;
    s.artboard = t.artboard;
    s.activePageId = targetId;
    // s.groups는 전역 필드라 페이지별로 스왑되지 않는데, rebuildGroups(undo/redo·불러오기가
    // 쓰는 것과 같은 헬퍼)를 안 부르면 이전 페이지 기준 그룹이 그대로 남아 새 페이지의
    // 그룹 객체를 클릭해도 낱개로만 선택된다 — 전환마다 새 페이지 objects 기준으로 재구축.
    rebuildGroups(s);
    // v1: 전환은 undo 대상이 아니다 → 히스토리/선택/드래프트를 새 페이지 기준으로 초기화.
    s.undoStack = [];
    s.redoStack = [];
    s.selectedIds = [];
    s.selectedGuideId = null;
    s.targetedId = null;
    s.draft = null;
    s.draftText = null;
    if (!s.layers.some((l) => l.id === s.activeLayerId)) {
      s.activeLayerId = s.layers[0] ? s.layers[0].id : 1;
    }
  });
}

/* ----- 추가(빈 페이지) ----- */
export function addPage(state) {
  const id = newPageId();
  state.update((s) => {
    writeBackActive(s);
    const n = (s.pages || []).length + 1;
    s.pages.push({
      id,
      name: `페이지 ${n}`,
      meta: { number: "", points: "" },
      objects: [],
      guides: [],
      layers: defaultLayers(),
      artboard: { ...s.artboard },
    });
  });
  switchPage(state, id);
}

/* ----- 복제(활성 페이지 깊은 복사) ----- */
function duplicatePage(state) {
  const id = newPageId();
  state.update((s) => {
    writeBackActive(s);
    const cur = findPage(s, s.activePageId);
    if (!cur) return;
    const clone = JSON.parse(JSON.stringify({
      objects: cur.objects, guides: cur.guides, layers: cur.layers,
      artboard: cur.artboard, meta: cur.meta,
    }));
    const idx = s.pages.indexOf(cur);
    s.pages.splice(idx + 1, 0, {
      id,
      name: `${cur.name} 복사`,
      meta: clone.meta || { number: "", points: "" },
      objects: clone.objects || [],
      guides: clone.guides || [],
      layers: clone.layers || defaultLayers(),
      artboard: clone.artboard || { ...s.artboard },
    });
  });
  switchPage(state, id);
}

/* ----- 삭제(최소 1개 유지) ----- */
async function deletePage(state, id) {
  const s0 = state.get();
  if ((s0.pages || []).length <= 1) return;
  const p0 = findPage(s0, id);
  if (!p0) return;
  const ok = await showConfirm(`'${p0.name}' 페이지를 삭제할까요?\n되돌릴 수 없습니다.`, {
    title: "페이지 삭제", okText: "삭제", cancelText: "취소",
  });
  if (!ok) return;

  // await 동안 상태가 바뀌었을 수 있으므로 다시 읽는다.
  const s = state.get();
  if ((s.pages || []).length <= 1) return;
  const p = findPage(s, id);
  if (!p) return;
  const wasActive = s.activePageId === id;
  const idx = s.pages.indexOf(p);
  const neighbor = s.pages[idx + 1] || s.pages[idx - 1];

  if (wasActive && neighbor) {
    // 이웃 페이지를 top-level로 끌어온 뒤 대상 제거.
    switchPage(state, neighbor.id);
  }
  state.update((st) => {
    st.pages = st.pages.filter((pg) => pg.id !== id);
    if (!findPage(st, st.activePageId)) st.activePageId = st.pages[0] ? st.pages[0].id : null;
  });
}

/* ----- 이름변경 (앱 양식 입력 다이얼로그) ----- */
async function renamePage(state, id) {
  const p = findPage(state.get(), id);
  if (!p) return;
  const name = await showPrompt("", {
    title: "페이지 이름 변경", value: p.name, placeholder: "페이지 이름", maxLength: 40,
  });
  if (name == null) return;
  const trimmed = name.trim();
  state.update((s) => {
    const pg = findPage(s, id);
    if (pg) pg.name = trimmed || pg.name;
  });
}

/* ----- 순서변경(페이지를 좌/우로) ----- */
function movePage(state, id, dir) {
  state.update((s) => {
    const idx = s.pages.findIndex((p) => p.id === id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= s.pages.length) return;
    const [p] = s.pages.splice(idx, 1);
    s.pages.splice(to, 0, p);
  });
}

/* ===== 탭 바 DOM (엑셀 시트 탭 방식) ===== */
let _bar = null;      // 컨테이너(#page-tab-bar)
let _tabsEl = null;   // 탭 목록(가로 스크롤)

function buildBar(state) {
  _bar = document.getElementById("page-tab-bar");
  if (!_bar) return;
  _bar.innerHTML = `
    <div class="page-tabs" id="page-tabs" role="tablist"></div>
    <button type="button" class="page-add-btn" id="page-add" title="새 페이지 추가" aria-label="새 페이지 추가">＋</button>`;

  _tabsEl = _bar.querySelector("#page-tabs");
  _bar.querySelector("#page-add").addEventListener("click", () => addPage(state));

  // 탭 클릭=전환, 더블클릭=이름 변경, 우클릭=컨텍스트 메뉴(엑셀식).
  _tabsEl.addEventListener("click", (e) => {
    const tab = e.target.closest(".page-tab");
    if (tab) switchPage(state, tab.dataset.id);
  });
  _tabsEl.addEventListener("dblclick", (e) => {
    const tab = e.target.closest(".page-tab");
    if (tab) renamePage(state, tab.dataset.id);
  });
  _tabsEl.addEventListener("contextmenu", (e) => {
    const tab = e.target.closest(".page-tab");
    if (!tab) return;
    e.preventDefault();
    switchPage(state, tab.dataset.id);       // 우클릭한 탭을 활성화한 뒤 메뉴를 연다.
    openContextMenu(state, tab.dataset.id, e.clientX, e.clientY);
  });
}

function renderTabs(state) {
  if (!_tabsEl) return;
  const s = state.get();
  const active = s.activePageId;
  _tabsEl.innerHTML = (s.pages || []).map((p) => {
    const isActive = p.id === active;
    return `<div class="page-tab${isActive ? " is-active" : ""}" data-id="${p.id}"
        role="tab" aria-selected="${isActive}" title="${escapeHtml(p.name)} · 더블클릭 이름 변경 · 우클릭 메뉴">
        <span class="page-tab-name">${escapeHtml(p.name)}</span>
      </div>`;
  }).join("");
}

/* ===== 우클릭 컨텍스트 메뉴 (복제·순서·삭제) ===== */
let _menuEl = null;
function closeContextMenu() {
  if (_menuEl) { _menuEl.remove(); _menuEl = null; }
  document.removeEventListener("mousedown", _onDocDown, true);
  document.removeEventListener("keydown", _onDocKey, true);
  window.removeEventListener("blur", closeContextMenu);
}
function _onDocDown(e) { if (_menuEl && !_menuEl.contains(e.target)) closeContextMenu(); }
function _onDocKey(e) { if (e.key === "Escape") closeContextMenu(); }

function openContextMenu(state, id, x, y) {
  closeContextMenu();
  const s = state.get();
  const idx = (s.pages || []).findIndex((p) => p.id === id);
  const count = (s.pages || []).length;
  const items = [
    { label: "이름 변경", act: () => renamePage(state, id) },
    { label: "복제", act: () => duplicatePage(state) },
    { sep: true },
    { label: "왼쪽으로 이동", disabled: idx <= 0, act: () => movePage(state, id, -1) },
    { label: "오른쪽으로 이동", disabled: idx >= count - 1, act: () => movePage(state, id, +1) },
    { sep: true },
    { label: "삭제", disabled: count <= 1, danger: true, act: () => deletePage(state, id) },
  ];

  const menu = document.createElement("div");
  menu.className = "text-ctx-menu page-ctx-menu";
  menu.innerHTML = items.map((it, i) =>
    it.sep ? `<div class="page-ctx-sep"></div>`
      : `<button type="button" class="text-ctx-item${it.danger ? " is-danger" : ""}" data-i="${i}"${it.disabled ? " disabled" : ""}>${it.label}</button>`
  ).join("");
  document.body.appendChild(menu);

  // 화면 밖으로 나가지 않게 위치 보정.
  const r = menu.getBoundingClientRect();
  const px = Math.min(x, window.innerWidth - r.width - 8);
  const py = Math.min(y, window.innerHeight - r.height - 8);
  menu.style.left = `${Math.max(8, px)}px`;
  menu.style.top = `${Math.max(8, py)}px`;

  menu.addEventListener("click", (e) => {
    const btn = e.target.closest(".text-ctx-item");
    if (!btn || btn.disabled) return;
    const it = items[Number(btn.dataset.i)];
    closeContextMenu();
    it.act();
  });
  _menuEl = menu;
  document.addEventListener("mousedown", _onDocDown, true);
  document.addEventListener("keydown", _onDocKey, true);
  window.addEventListener("blur", closeContextMenu);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
