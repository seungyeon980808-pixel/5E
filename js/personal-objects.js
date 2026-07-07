/* ===== 퍼스널 오브젝트: 내가 만든 오브젝트를 도구로 저장/재사용 =====
 *
 * · 저장: 캔버스에서 선택 → 고급 기능 [오브젝트 저장] → 이름·분류 입력.
 *   저장 시 현재 과목 모드(p/c/b/e)가 함께 기록되어 그 과목에서만 보인다.
 *   (과목 정보가 없는 예전 항목은 모든 과목에서 보인다)
 * · 사용: 좌측 '퍼스널 오브젝트' 분류 아코디언 또는 [오브젝트 저장소](썸네일
 *   미리보기 모달)에서 클릭 → 뷰 중앙에 삽입(id·groupId 재부여, Undo 1스텝).
 * · 검색: 오브젝트 검색(Ctrl+F)에도 노출(현재 과목 것만).
 * · 백업: settings.js PERSONAL_KEYS에 포함 — '설정 저장하기/불러오기'로 왕복.
 */

import { instantiateObjectsAt } from "./transform.js?v=0.54.9";
import { showAlert, showConfirm } from "./ui-dialogs.js?v=0.54.9";
import { renderObject } from "./render.js?v=0.54.9";
import { getObjectBBox } from "./pick.js?v=0.54.9";

const KEY = "5e.personalObjects";
const DEFAULT_CATEGORY = "기본";
const SVG_NS = "http://www.w3.org/2000/svg";

let _state = null;
let _partsHost = null;

const currentSubject = () => document.documentElement.getAttribute("data-subject") || "p";

/* ---------- 저장소 ---------- */
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (_) { return []; }
}
function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) { /* ignore */ }
}
/* 현재 과목에서 보여줄 항목 (과목 미기록 = 옛 데이터 → 모든 과목에서 표시) */
function visibleItems() {
  const subj = currentSubject();
  return load().filter((it) => !it.subject || it.subject === subj);
}

/* ---------- 검색(search.js) 연동 ---------- */
export function listPersonalItems() {
  return visibleItems().map((it) => ({ id: it.id, name: it.name, category: it.category || DEFAULT_CATEGORY }));
}
export function insertPersonalItem(id) {
  if (!_state) return;
  const it = load().find((x) => x.id === id);
  if (!it) return;
  const vb = _state.get().viewBox;
  instantiateObjectsAt(_state, it.objects, { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 });
}

async function deleteItem(it) {
  const yes = await showConfirm(`'${it.name}'\n정말로 삭제하시겠습니까?`, { title: "오브젝트 삭제", okText: "예", cancelText: "아니오" });
  if (!yes) return false;
  save(load().filter((x) => x.id !== it.id));
  renderLibrary();
  return true;
}

/* ---------- 이름/분류 입력 모달 ---------- */
const NEW_CAT_VALUE = "__new__";
function askNameCategory(existingCategories, done) {
  const cats = existingCategories.length ? existingCategories : [DEFAULT_CATEGORY];
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" style="width:min(340px, calc(100vw - 32px))">
      <h2 class="modal-title">오브젝트 저장</h2>
      <p class="objectify-description" style="margin:0 0 10px;">
        생성한 오브젝트를 다음 작업에서도 사용할 수 있게 저장합니다.
        저장된 오브젝트는 왼쪽 <b>퍼스널 오브젝트</b>와
        <b>오브젝트 검색(Ctrl+F)</b>에서도 조회할 수 있습니다.</p>
      <label class="modal-field"><span class="modal-label">이름</span>
        <input type="text" id="po-name" class="modal-input" maxlength="40" autocomplete="off" /></label>
      <label class="modal-field"><span class="modal-label">분류</span>
        <select id="po-cat-select" class="modal-input">
          ${cats.map((c) => `<option value="${c}">${c}</option>`).join("")}
          <option value="${NEW_CAT_VALUE}">＋ 새 분류 만들기…</option>
        </select></label>
      <label class="modal-field" id="po-newcat-field" hidden><span class="modal-label">새 분류 이름</span>
        <input type="text" id="po-cat-new" class="modal-input" maxlength="20" autocomplete="off"
               placeholder="예: 역학 세트" /></label>
      <div class="modal-actions">
        <button type="button" class="modal-btn" id="po-cancel">취소</button>
        <button type="button" class="modal-btn modal-btn-primary" id="po-ok">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const name = overlay.querySelector("#po-name");
  const catSel = overlay.querySelector("#po-cat-select");
  const newField = overlay.querySelector("#po-newcat-field");
  const newInput = overlay.querySelector("#po-cat-new");
  catSel.addEventListener("change", () => {
    const isNew = catSel.value === NEW_CAT_VALUE;
    newField.hidden = !isNew;
    if (isNew) newInput.focus();
  });
  const close = () => overlay.remove();
  overlay.querySelector("#po-cancel").addEventListener("click", close);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    if (e.key === "Enter") { e.preventDefault(); overlay.querySelector("#po-ok").click(); }
  });
  overlay.querySelector("#po-ok").addEventListener("click", () => {
    const n = name.value.trim();
    if (!n) { name.focus(); return; }
    let category = catSel.value;
    if (category === NEW_CAT_VALUE) {
      category = newInput.value.trim();
      if (!category) { newInput.focus(); return; }
    }
    done(n, category || DEFAULT_CATEGORY);
    close();
  });
  name.focus();
}

/* ---------- 저장 동작 ---------- */
function saveCurrentSelection() {
  const s = _state.get();
  const ids = s.selectedIds || [];
  const objs = ids.map((id) => s.objects.find((o) => o.id === id)).filter(Boolean);
  if (!objs.length) {
    showAlert("저장할 오브젝트를 먼저 캔버스에서 선택하세요.", { title: "오브젝트 저장" });
    return;
  }
  const cats = [...new Set(visibleItems().map((it) => it.category || DEFAULT_CATEGORY))];
  askNameCategory(cats, (name, category) => {
    const list = load();
    list.push({
      id: `po_${Date.now().toString(36)}`,
      name,
      category,
      subject: currentSubject(),
      savedAt: new Date().toISOString(),
      objects: JSON.parse(JSON.stringify(objs)),
    });
    save(list);
    renderLibrary();
  });
}

/* ---------- 썸네일: 저장된 오브젝트들을 작은 SVG로 렌더 ---------- */
function makeThumbnail(objects) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of objects) {
    let bb; try { bb = getObjectBBox(o); } catch (_) { bb = null; }
    if (!bb) continue;
    minX = Math.min(minX, bb.x); minY = Math.min(minY, bb.y);
    maxX = Math.max(maxX, bb.x + bb.w); maxY = Math.max(maxY, bb.y + bb.h);
  }
  const svg = document.createElementNS(SVG_NS, "svg");
  if (!isFinite(minX)) return svg;
  const pad = Math.max((maxX - minX), (maxY - minY)) * 0.06 + 1;
  svg.setAttribute("viewBox", `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  for (const o of objects) {
    try {
      const node = renderObject(o);
      if (node) svg.appendChild(node);
    } catch (_) { /* 렌더 불가 타입은 건너뜀 */ }
  }
  return svg;
}

/* ---------- 오브젝트 저장소 모달 (기출문항 검색과 같은 카드 그리드) ---------- */
let _storeOverlay = null;
function buildStoreModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal modal-examlib" role="dialog" aria-modal="true" aria-labelledby="postore-title">
      <div class="examlib-title-row">
        <h2 class="modal-title" id="postore-title">오브젝트 저장소</h2>
        <p id="postore-status" class="objectify-status examlib-status-inline" role="status"></p>
      </div>
      <div class="examlib-filter-row">
        <select id="postore-cat" aria-label="분류 선택">
          <option value="">분류 전체</option>
        </select>
        <input id="postore-query" type="search" autocomplete="off" placeholder="이름으로 검색"
               style="flex:1 1 auto;min-width:0;" />
      </div>
      <div id="postore-grid" class="examlib-grid"></div>
      <div class="modal-actions">
        <button id="postore-close" type="button" class="modal-btn">닫기</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function renderStore() {
  const grid = _storeOverlay.querySelector("#postore-grid");
  const status = _storeOverlay.querySelector("#postore-status");
  const catSel = _storeOverlay.querySelector("#postore-cat");
  const q = _storeOverlay.querySelector("#postore-query").value.trim().toLowerCase();
  const items = visibleItems()
    .filter((it) => !catSel.value || (it.category || DEFAULT_CATEGORY) === catSel.value)
    .filter((it) => !q || it.name.toLowerCase().includes(q));
  grid.innerHTML = "";
  for (const it of items) {
    const card = document.createElement("div");
    card.className = "examlib-card";
    const thumb = document.createElement("div");
    thumb.className = "examlib-thumb postore-thumb";
    thumb.appendChild(makeThumbnail(it.objects));
    const meta = document.createElement("div");
    meta.className = "examlib-meta";
    meta.innerHTML = `<div class="examlib-title"></div><div class="examlib-tags"></div>`;
    meta.querySelector(".examlib-title").textContent = it.name;
    meta.querySelector(".examlib-tags").textContent =
      `${it.category || DEFAULT_CATEGORY} · 오브젝트 ${it.objects.length}개`;
    const actions = document.createElement("div");
    actions.className = "postore-actions";
    const insertBtn = document.createElement("button");
    insertBtn.type = "button";
    insertBtn.className = "modal-btn modal-btn-primary";
    insertBtn.textContent = "삽입";
    insertBtn.addEventListener("click", () => {
      insertPersonalItem(it.id);
      _storeOverlay.hidden = true;
    });
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "modal-btn";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", async () => {
      if (await deleteItem(it)) { populateStoreCats(); renderStore(); }
    });
    actions.appendChild(insertBtn);
    actions.appendChild(delBtn);
    card.appendChild(thumb);
    card.appendChild(meta);
    card.appendChild(actions);
    grid.appendChild(card);
  }
  status.textContent = items.length ? `오브젝트 ${items.length}개` : "저장된 오브젝트가 없습니다.";
}

function populateStoreCats() {
  const catSel = _storeOverlay.querySelector("#postore-cat");
  const prev = catSel.value;
  catSel.length = 1;
  for (const c of [...new Set(visibleItems().map((it) => it.category || DEFAULT_CATEGORY))]) {
    catSel.add(new Option(c, c));
  }
  catSel.value = [...catSel.options].some((o) => o.value === prev) ? prev : "";
}

function openStore() {
  if (!_storeOverlay) {
    _storeOverlay = buildStoreModal();
    _storeOverlay.querySelector("#postore-close").addEventListener("click", () => { _storeOverlay.hidden = true; });
    _storeOverlay.addEventListener("mousedown", (e) => { if (e.target === _storeOverlay) _storeOverlay.hidden = true; });
    _storeOverlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.stopPropagation(); _storeOverlay.hidden = true; }
    });
    _storeOverlay.querySelector("#postore-query").addEventListener("input", renderStore);
    _storeOverlay.querySelector("#postore-cat").addEventListener("change", renderStore);
  }
  populateStoreCats();
  renderStore();
  _storeOverlay.hidden = false;
}

/* ---------- 좌측 라이브러리 렌더 ---------- */
export function renderLibrary() {
  if (!_partsHost) return;
  const list = visibleItems();
  _partsHost.innerHTML = "";

  // 상단: 오브젝트 저장소(썸네일 미리보기 관리) 진입 버튼
  const storeBtn = document.createElement("button");
  storeBtn.type = "button";
  storeBtn.className = "personal-store-btn";
  storeBtn.textContent = "오브젝트 저장소";
  storeBtn.title = "저장된 오브젝트를 이미지로 미리 보고 관리합니다";
  storeBtn.addEventListener("click", openStore);
  _partsHost.appendChild(storeBtn);

  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "subject-part-empty";
    empty.innerHTML = "저장된 오브젝트가 없습니다.<br>캔버스에서 선택 후 [오브젝트 저장]";
    _partsHost.appendChild(empty);
    return;
  }
  const byCat = new Map();
  for (const it of list) {
    const c = it.category || DEFAULT_CATEGORY;
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c).push(it);
  }
  for (const [cat, items] of byCat) {
    const sec = document.createElement("div");
    sec.className = "subject-part is-collapsed";
    const header = document.createElement("button");
    header.type = "button";
    header.className = "subject-part-header";
    header.innerHTML = `<span>${cat}</span><span class="toggle-icon">▾</span>`;
    header.addEventListener("click", () => sec.classList.toggle("is-collapsed"));
    const body = document.createElement("div");
    body.className = "subject-part-body";
    for (const it of items) {
      const row = document.createElement("div");
      row.className = "personal-item";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "personal-item-btn";
      btn.textContent = it.name;
      btn.title = `${it.name} — 클릭해 캔버스에 삽입 (${it.objects.length}개 오브젝트)`;
      btn.addEventListener("click", () => insertPersonalItem(it.id));
      const del = document.createElement("button");
      del.type = "button";
      del.className = "personal-item-del";
      del.textContent = "✕";
      del.title = "삭제";
      del.addEventListener("click", () => deleteItem(it));
      row.appendChild(btn);
      row.appendChild(del);
      body.appendChild(row);
    }
    sec.appendChild(header);
    sec.appendChild(body);
    _partsHost.appendChild(sec);
  }
}

export function initPersonalObjects(state) {
  _state = state;
  _partsHost = document.getElementById("personal-parts");
  document.getElementById("personal-object-save")
    ?.addEventListener("click", saveCurrentSelection);
  renderLibrary();
  // 과목 모드 전환 → 그 과목의 오브젝트만 다시 표시
  window.addEventListener("5e:subject-changed", renderLibrary);
  // 설정 불러오기(다른 탭 포함)로 localStorage가 바뀌면 목록 갱신
  window.addEventListener("storage", (e) => { if (e.key === KEY) renderLibrary(); });
}
