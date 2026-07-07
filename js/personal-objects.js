/* ===== 퍼스널 오브젝트: 내가 만든 오브젝트를 도구로 저장/재사용 =====
 *
 * · 저장: 캔버스에서 오브젝트를 선택 → 고급 기능의 [퍼스널 오브젝트로 저장]
 *   → 이름·분류(1계층) 입력 → localStorage("5e.personalObjects")에 저장.
 * · 사용: 좌측 '퍼스널 오브젝트' 섹션의 분류 아코디언에서 클릭 → 뷰 중앙에 삽입
 *   (붙여넣기와 동일 계보: id·groupId 재부여, Undo 1스텝).
 * · 검색: 오브젝트 검색(Ctrl+F)에도 노출 — search.js가 listPersonalItems()를 병합.
 * · 백업: settings.js PERSONAL_KEYS에 포함되어 '설정 저장하기/불러오기'로 왕복.
 */

import { instantiateObjectsAt } from "./transform.js?v=0.54.7";

const KEY = "5e.personalObjects";
const DEFAULT_CATEGORY = "기본";

let _state = null;
let _partsHost = null;

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

/* ---------- 검색(search.js) 연동 ---------- */
export function listPersonalItems() {
  return load().map((it) => ({ id: it.id, name: it.name, category: it.category || DEFAULT_CATEGORY }));
}
export function insertPersonalItem(id) {
  if (!_state) return;
  const it = load().find((x) => x.id === id);
  if (!it) return;
  const vb = _state.get().viewBox;
  instantiateObjectsAt(_state, it.objects, { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 });
}

/* ---------- 이름/분류 입력 모달 ----------
 * 분류는 드롭다운(기존 분류)에서 고르거나 '＋ 새 분류 만들기'를 선택해
 * 새 이름을 입력한다(다른 드롭다운과 같은 양식의 select 사용). */
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
    alert("저장할 오브젝트를 먼저 캔버스에서 선택하세요.");
    return;
  }
  const cats = [...new Set(load().map((it) => it.category || DEFAULT_CATEGORY))];
  askNameCategory(cats, (name, category) => {
    const list = load();
    list.push({
      id: `po_${Date.now().toString(36)}`,
      name,
      category,
      savedAt: new Date().toISOString(),
      objects: JSON.parse(JSON.stringify(objs)),
    });
    save(list);
    renderLibrary();
  });
}

/* ---------- 좌측 라이브러리 렌더 ---------- */
export function renderLibrary() {
  if (!_partsHost) return;
  const list = load();
  _partsHost.innerHTML = "";
  if (!list.length) {
    _partsHost.innerHTML = `<p class="subject-part-empty">저장된 오브젝트가 없습니다.<br>캔버스에서 선택 후 [오브젝트 저장]</p>`;
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
      del.addEventListener("click", () => {
        if (!confirm(`'${it.name}'을(를) 삭제할까요?`)) return;
        save(load().filter((x) => x.id !== it.id));
        renderLibrary();
      });
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
  // 설정 불러오기(다른 탭 포함)로 localStorage가 바뀌면 목록 갱신
  window.addEventListener("storage", (e) => { if (e.key === KEY) renderLibrary(); });
}
