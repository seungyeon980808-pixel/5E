/* ===== PAGES (다중 아트보드 — 하단 탭 + 스왑 방식 전환) =====
 *
 * 설계 핵심(FEATURE_PROPOSALS "다중 아트보드"): 기존 수십 모듈이 참조하는
 * s.objects / s.guides / s.layers / s.artboard 구조는 절대 바꾸지 않는다.
 * 활성 페이지만 그 4필드를 top-level에 두고, 전체 페이지 기록은 s.pages[]에
 * 보관한다. 페이지 전환 = "현재 4필드를 활성 page에 써넣고(writeBack) 대상
 * page의 4필드를 top-level로 꺼내오는" 스왑. 그래서 render/pick/transform/snap
 * 등은 무수정으로 동작한다.
 *
 * page 기록: { id, name, meta:{ number, points }, objects, guides, layers, artboard }.
 */

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
  return JSON.stringify((s.pages || []).map((p) => [p.id, p.name, p.meta?.number, p.meta?.points]))
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
function addPage(state) {
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
function deletePage(state, id) {
  const s0 = state.get();
  if ((s0.pages || []).length <= 1) return;
  const p = findPage(s0, id);
  if (!p) return;
  if (!confirm(`'${p.name}' 페이지를 삭제할까요? 되돌릴 수 없습니다.`)) return;

  const wasActive = s0.activePageId === id;
  const idx = s0.pages.indexOf(p);
  const neighbor = s0.pages[idx + 1] || s0.pages[idx - 1];

  if (wasActive && neighbor) {
    // 이웃 페이지를 top-level로 끌어온 뒤 대상 제거.
    switchPage(state, neighbor.id);
  }
  state.update((s) => {
    s.pages = s.pages.filter((pg) => pg.id !== id);
    if (!findPage(s, s.activePageId)) s.activePageId = s.pages[0] ? s.pages[0].id : null;
  });
}

/* ----- 이름변경 ----- */
function renamePage(state, id) {
  const p = findPage(state.get(), id);
  if (!p) return;
  const name = prompt("페이지 이름", p.name);
  if (name == null) return;
  const trimmed = name.trim();
  state.update((s) => {
    const pg = findPage(s, id);
    if (pg) pg.name = trimmed || pg.name;
  });
}

/* ----- 순서변경(활성 페이지를 좌/우로) ----- */
function movePage(state, id, dir) {
  state.update((s) => {
    const idx = s.pages.findIndex((p) => p.id === id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= s.pages.length) return;
    const [p] = s.pages.splice(idx, 1);
    s.pages.splice(to, 0, p);
  });
}

/* ----- 문항 메타(문항번호·배점) 갱신 ----- */
function setMeta(state, id, key, value) {
  state.update((s) => {
    const p = findPage(s, id);
    if (!p) return;
    if (!p.meta) p.meta = { number: "", points: "" };
    p.meta[key] = value;
  });
}

/* ===== 탭 바 DOM ===== */
let _bar = null;      // 컨테이너(#page-tab-bar)
let _tabsEl = null;   // 탭 목록
let _metaEl = null;   // 문항 메타 입력 영역

function buildBar(state) {
  _bar = document.getElementById("page-tab-bar");
  if (!_bar) return;
  _bar.innerHTML = `
    <div class="page-tabs" id="page-tabs"></div>
    <div class="page-tab-actions">
      <button type="button" id="page-add" title="새 페이지 추가">＋</button>
      <button type="button" id="page-dup" title="현재 페이지 복제">⧉</button>
      <button type="button" id="page-left" title="왼쪽으로 이동">◀</button>
      <button type="button" id="page-right" title="오른쪽으로 이동">▶</button>
    </div>
    <div class="page-meta" id="page-meta">
      <label>문항 <input type="text" id="page-meta-number" maxlength="8" placeholder="번호" /></label>
      <label>배점 <input type="text" id="page-meta-points" maxlength="6" placeholder="점" /></label>
    </div>`;

  _tabsEl = _bar.querySelector("#page-tabs");
  _metaEl = _bar.querySelector("#page-meta");

  _bar.querySelector("#page-add").addEventListener("click", () => addPage(state));
  _bar.querySelector("#page-dup").addEventListener("click", () => duplicatePage(state));
  _bar.querySelector("#page-left").addEventListener("click", () => movePage(state, state.get().activePageId, -1));
  _bar.querySelector("#page-right").addEventListener("click", () => movePage(state, state.get().activePageId, +1));

  const numInput = _bar.querySelector("#page-meta-number");
  const ptInput = _bar.querySelector("#page-meta-points");
  numInput.addEventListener("input", () => setMeta(state, state.get().activePageId, "number", numInput.value));
  ptInput.addEventListener("input", () => setMeta(state, state.get().activePageId, "points", ptInput.value));

  // 탭 클릭/더블클릭/삭제 — 이벤트 위임(탭은 renderTabs가 매번 다시 그림).
  _tabsEl.addEventListener("click", (e) => {
    const del = e.target.closest(".page-tab-del");
    if (del) { deletePage(state, del.closest(".page-tab").dataset.id); return; }
    const tab = e.target.closest(".page-tab");
    if (tab) switchPage(state, tab.dataset.id);
  });
  _tabsEl.addEventListener("dblclick", (e) => {
    const tab = e.target.closest(".page-tab");
    if (tab) renamePage(state, tab.dataset.id);
  });
}

function renderTabs(state) {
  if (!_tabsEl) return;
  const s = state.get();
  const active = s.activePageId;
  _tabsEl.innerHTML = (s.pages || []).map((p, i) => {
    const num = p.meta && p.meta.number ? p.meta.number : (i + 1);
    const isActive = p.id === active;
    const nameHtml = escapeHtml(p.name);
    return `<div class="page-tab${isActive ? " is-active" : ""}" data-id="${p.id}" title="더블클릭하여 이름 변경">
        <span class="page-tab-no">${escapeHtml(String(num))}</span>
        <span class="page-tab-name">${nameHtml}</span>
        <button type="button" class="page-tab-del" title="페이지 삭제" aria-label="페이지 삭제">×</button>
      </div>`;
  }).join("");

  // 메타 입력을 활성 페이지 값으로 동기화(입력 중이 아닐 때만 덮어씀).
  if (_metaEl) {
    const p = findPage(s, active);
    const numInput = _metaEl.querySelector("#page-meta-number");
    const ptInput = _metaEl.querySelector("#page-meta-points");
    if (p && numInput && document.activeElement !== numInput) numInput.value = (p.meta && p.meta.number) || "";
    if (p && ptInput && document.activeElement !== ptInput) ptInput.value = (p.meta && p.meta.points) || "";
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
