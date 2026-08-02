/* ===== PARTS LIBRARY (부품 라이브러리 — 퍼블릭 도메인 과학 도해 검색·선화 삽입) =====
//
// 정적 파일 라이브러리: assets/parts-library/manifest.json + svg/*.svg. 서버·API 없음.
// 기출 문항 검색(js/exam-library.js)과 나란히 서는 창이라, 그 파일의 규약을 그대로 따른다.
//
// 성능 규약(exam-library.js와 동일):
//  - 앱 시작 시 로드 0 — manifest fetch는 모달 "첫" 오픈 시 1회 (no-store: 재생성 반영)
//  - 원본 SVG 썸네일은 결과 그리드에서 loading="lazy"로 보이는 것만 로드
//  - 검색은 클라이언트 선형 스캔, 렌더링은 MAX_RENDER개로 캡
//
// 삽입은 svgAsset 타입 + 변환 결과 dataUri를 obj.src에 담는다 —
// 렌더러(js/render/shapes.js renderSvgAsset)가 `obj.src || asset.dataUri`를 읽으므로
// 코드 레지스트리에 등록하지 않아도 그려지고, 저장 파일이 라이브러리 폴더 없이도
// 자기완결된다(기출 라이브러리가 dataURL로 넣는 것과 같은 이유). */

import { toLineArt, LINEART_LEVELS } from "./lineart.js?v=1.4.0";
// [선 객체로 넣기] — svgAsset(<image> 한 장)은 자르기 도구가 못 자른다(cut-geometry.js
// isCuttable 이 벡터 원시형만 받는다). 그래서 진짜 편집 객체로 푸는 경로를 함께 둔다.
import { svgToObjects } from "./svg-to-objects.js?v=1.4.0";
import { setOpenOrigin } from "./modal-motion.js?v=1.4.0";

const LIB_BASE = "assets/parts-library/";
const MAX_RENDER = 60;      // 그리드에 한 번에 그리는 카드 수 (초과분은 안내문으로 표시)
const DEFAULT_W_MM = 45;    // 삽입 기본 폭(mm) — 미리보기 변환의 targetMm과 같은 값
const FALLBACK_LEVELS = [
  { id: "L0", label: "전부", desc: "색만 벗김" },
  { id: "L1", label: "세밀", desc: "" },
  { id: "L2", label: "표준", desc: "" },
  { id: "L3", label: "단순", desc: "" },
];

let manifest = null;        // { version, items, subjects, parts, … } — 첫 오픈 시 1회 로드
let byId = new Map();
let _idCounter = 0;

// 원본 SVG 텍스트 캐시 (같은 부품의 위계/채우기를 바꿔 가며 볼 때 재요청하지 않게)
const svgTextCache = new Map();

/* 변환 모듈이 아직 없거나 상수를 안 내보내도 창은 떠야 한다. */
const LEVELS = (Array.isArray(LINEART_LEVELS) && LINEART_LEVELS.length)
  ? LINEART_LEVELS : FALLBACK_LEVELS;

function svgUrl(item) {
  return LIB_BASE + "svg/" + encodeURIComponent(item.file);
}

async function loadSvgText(item) {
  const url = svgUrl(item);
  if (svgTextCache.has(url)) return svgTextCache.get(url);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  svgTextCache.set(url, text);
  return text;
}

/* viewBox("0 0 W H" 문자열 · 배열 · {w,h} 객체 모두 허용) → 가로세로 비 */
function aspectOf(viewBox) {
  if (!viewBox) return 1;
  let w = 0, h = 0;
  if (typeof viewBox === "string") {
    const n = viewBox.trim().split(/[\s,]+/).map(Number);
    w = n[2]; h = n[3];
  } else if (Array.isArray(viewBox)) {
    w = Number(viewBox[2]); h = Number(viewBox[3]);
  } else if (typeof viewBox === "object") {
    w = Number(viewBox.w ?? viewBox.width);
    h = Number(viewBox.h ?? viewBox.height);
  }
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 1;
  return w / h;
}

/* ----- 검색: 모든 토큰이 (id+이름+검색어+파트+과목명) 문자열에 포함되어야 매치 (AND) ----- */
function prepareItems(items) {
  for (const it of items) {
    const hay = `${it.id} ${it.name} ${(it.keywords || []).join(" ")} `
      + `${it.part || ""} ${it.subjectLabel || ""}`.toLowerCase();
    it._hay = hay.toLowerCase();
    it._hayNs = it._hay.replace(/\s+/g, ""); // "동물세포"처럼 붙여 써도 매치되게
  }
}

function searchItems(query, filters) {
  const tokens = query.trim().toLowerCase().split(/[#\s]+/).filter(Boolean);
  const { subject, part } = filters;
  return manifest.items.filter((it) =>
    tokens.every((t) => it._hay.includes(t) || it._hayNs.includes(t)) &&
    (!subject || it.subject === subject) &&
    (!part || it.part === part));
}

/* ===== modal ===== */
function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal modal-partslib" role="dialog" aria-modal="true" aria-labelledby="partslib-title">
      <div class="partslib-title-row">
        <h2 class="modal-title" id="partslib-title">이미지 라이브러리</h2>
        <p id="partslib-status" class="objectify-status partslib-status-inline" role="status"></p>
      </div>
      <div class="partslib-filter-row">
        <select id="partslib-subject" aria-label="과목 선택">
          <option value="">과목 전체</option>
        </select>
        <select id="partslib-part" aria-label="분야 선택">
          <option value="">분야 전체</option>
        </select>
        <button id="partslib-reset" type="button" class="partslib-reset">필터 초기화</button>
      </div>
      <div class="partslib-search-row">
        <input id="partslib-query" type="search" autocomplete="off"
               placeholder="이름·검색어로 찾기 : 세포 / 도르래 / beaker" />
      </div>
      <div class="partslib-body">
        <div id="partslib-grid" class="partslib-grid"></div>
        <aside class="partslib-preview">
          <div class="partslib-preview-head">선화 미리보기</div>
          <div class="partslib-opt-row" id="partslib-levels" role="group" aria-label="선화 위계"></div>
          <div class="partslib-opt-row" id="partslib-fills" role="group" aria-label="채우기">
            <button type="button" class="partslib-opt" data-fill="none" title="선만 남기고 속은 비웁니다">채우기 없음</button>
            <button type="button" class="partslib-opt" data-fill="white" title="속을 흰색으로 채워 뒤 그림을 가립니다">흰 채우기</button>
          </div>
          <div class="partslib-preview-box"><img id="partslib-preview-img" alt="" /></div>
          <div class="partslib-preview-name" id="partslib-preview-name"></div>
          <div class="partslib-preview-meta" id="partslib-preview-meta"></div>
          <button id="partslib-insert" type="button" class="modal-btn modal-btn-primary" disabled>이미지로 넣기</button>
          <button id="partslib-insert-obj" type="button" class="modal-btn" disabled
                  title="선 하나하나를 편집 가능한 객체로 넣습니다. 자르기(가위)·부분 삭제·색 변경이 됩니다.">선 객체로 넣기</button>
          <p class="partslib-insert-hint">이미지는 가볍고, 선 객체는 <b>가위로 자르고 지울 수 있습니다</b>.</p>
        </aside>
      </div>
      <div class="modal-actions">
        <button id="partslib-close" type="button" class="modal-btn">닫기</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

export function initPartsLibrary(state) {
  const openButton = document.getElementById("parts-library-open");
  if (!openButton) return;   // 마크업은 다른 곳에서 넣는다 — 없으면 조용히 넘어간다

  const overlay = buildModal();
  const queryInput = overlay.querySelector("#partslib-query");
  const subjectSelect = overlay.querySelector("#partslib-subject");
  const partSelect = overlay.querySelector("#partslib-part");
  const resetButton = overlay.querySelector("#partslib-reset");
  const status = overlay.querySelector("#partslib-status");
  const grid = overlay.querySelector("#partslib-grid");
  const levelRow = overlay.querySelector("#partslib-levels");
  const fillRow = overlay.querySelector("#partslib-fills");
  const previewImg = overlay.querySelector("#partslib-preview-img");
  const previewName = overlay.querySelector("#partslib-preview-name");
  const previewMeta = overlay.querySelector("#partslib-preview-meta");
  const insertBtn = overlay.querySelector("#partslib-insert");
  const insertObjBtn = overlay.querySelector("#partslib-insert-obj");

  // 현재 선택/변환 상태
  let selectedId = null;
  let level = "L2";
  let fill = "none";
  let converted = null;   // toLineArt 결과 { svg, dataUri, kept, viewBox, strokeWidth }
  let previewToken = 0;   // 비동기 변환 경합 방지 — 마지막 요청 결과만 화면에 반영
  let _busy = false;      // 삽입 진행 중

  const filterValues = () => ({ subject: subjectSelect.value, part: partSelect.value });
  const setStatus = (msg, isError = false) => {
    status.textContent = msg;
    status.classList.toggle("is-error", isError);
  };
  const close = () => { overlay.hidden = true; };

  /* ----- 위계 버튼(전부/세밀/표준/단순)은 변환 모듈이 알려 준 목록대로 만든다 ----- */
  for (const lv of LEVELS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "partslib-opt";
    b.dataset.level = lv.id;
    b.textContent = lv.label || lv.id;
    if (lv.desc) b.title = lv.desc;
    levelRow.appendChild(b);
  }
  function syncOptionMarks() {
    levelRow.querySelectorAll("[data-level]").forEach((b) => {
      b.classList.toggle("is-on", b.dataset.level === level);
    });
    fillRow.querySelectorAll("[data-fill]").forEach((b) => {
      b.classList.toggle("is-on", b.dataset.fill === fill);
    });
  }

  /* ----- 드롭다운 옵션 (manifest 실제 데이터에서) ----- */
  function populateSubjectOptions() {
    if (!manifest) return;
    const prev = subjectSelect.value;
    subjectSelect.length = 1;      // "과목 전체"만 남기고 재생성
    const labels = new Map();      // code → label (첫 등장값 사용)
    for (const it of manifest.items) {
      if (!labels.has(it.subject)) labels.set(it.subject, it.subjectLabel || it.subject);
    }
    for (const code of [...labels.keys()].sort()) {
      subjectSelect.add(new Option(labels.get(code), code));
    }
    subjectSelect.value = labels.has(prev) ? prev : "";
  }

  // 분야(파트)는 선택된 과목에 실제로 존재하는 것만 — 과목을 바꿨을 때 결과가
  // 항상 0건이 되는 조합(예: 생명 + '전기자기학')이 남지 않게 한다.
  function populatePartOptions() {
    if (!manifest) return;
    const prev = partSelect.value;
    const subject = subjectSelect.value;
    partSelect.length = 1;         // "분야 전체"만 남기고 재생성
    const parts = new Set();
    for (const it of manifest.items) {
      if (subject && it.subject !== subject) continue;
      if (it.part) parts.add(it.part);
    }
    for (const p of [...parts].sort()) partSelect.add(new Option(p, p));
    partSelect.value = parts.has(prev) ? prev : "";
  }

  /* ----- 미리보기 ----- */
  function clearPreview(msg) {
    converted = null;
    previewImg.removeAttribute("src");
    previewImg.classList.add("is-empty");
    previewName.textContent = msg || "부품을 고르면 선화로 바꿔 보여 줍니다.";
    previewMeta.textContent = "";
    insertBtn.disabled = true;
    insertObjBtn.disabled = true;
  }

  async function refreshPreview() {
    const item = byId.get(selectedId);
    if (!item) { clearPreview(); return; }
    const token = ++previewToken;
    converted = null;
    insertBtn.disabled = true;
    insertObjBtn.disabled = true;
    previewName.textContent = `${item.name} — 변환 중…`;
    // 출처·라이선스는 변환 성공 여부와 무관하게 항상 보인다.
    renderPreviewMeta(item);
    try {
      const svgText = await loadSvgText(item);
      if (token !== previewToken) return;   // 그 사이 다른 부품/설정을 골랐다
      const out = toLineArt(svgText, { level, fill, targetMm: DEFAULT_W_MM });
      if (token !== previewToken) return;
      if (!out || !out.dataUri) throw new Error("변환 결과가 없습니다.");
      converted = out;
      previewImg.src = out.dataUri;
      previewImg.classList.remove("is-empty");
      const kept = Number.isFinite(out.kept) ? ` · 선 ${out.kept}개` : "";
      previewName.textContent = `${item.name}${kept}`;
      insertBtn.disabled = _busy;
      insertObjBtn.disabled = _busy;
    } catch (e) {
      if (token !== previewToken) return;
      converted = null;
      previewImg.removeAttribute("src");
      previewImg.classList.add("is-empty");
      previewName.textContent = `${item.name} — 선화 변환 실패: ${e && e.message ? e.message : e}`;
      insertBtn.disabled = true;
      insertObjBtn.disabled = true;
    }
  }

  function renderPreviewMeta(item) {
    previewMeta.textContent = "";
    const lic = document.createElement("span");
    lic.className = "partslib-badge";
    lic.textContent = item.license || "라이선스 미상";
    previewMeta.appendChild(lic);
    if (item.source) {
      const a = document.createElement("a");
      a.className = "partslib-source";
      a.href = item.source;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "출처";
      a.title = item.source;
      previewMeta.appendChild(a);
    }
  }

  /* ----- 결과 그리드 (카드 클릭 = 선택 → 오른쪽 미리보기) ----- */
  function syncCardMarks() {
    grid.querySelectorAll(".partslib-card").forEach((c) => {
      c.classList.toggle("is-selected", c.dataset.id === selectedId);
    });
  }

  function selectCard(id) {
    const item = byId.get(id);
    if (!item) return;
    selectedId = id;
    level = item.defaultLevel || "L2";   // 기본 위계는 항목이 정한 값
    fill = "none";                       // 채우기 기본은 없음
    syncCardMarks();
    syncOptionMarks();
    refreshPreview();
  }

  function renderResults(list) {
    selectedId = null;
    clearPreview();
    grid.innerHTML = "";
    const shown = list.slice(0, MAX_RENDER);
    for (const item of shown) {
      const card = document.createElement("div");
      card.className = "partslib-card";
      card.dataset.id = item.id;
      card.innerHTML = `
        <div class="partslib-thumb"><img loading="lazy" alt=""></div>
        <div class="partslib-meta">
          <div class="partslib-name"></div>
          <div class="partslib-sub"></div>
          <div class="partslib-lic"><span class="partslib-badge"></span></div>
        </div>`;
      card.querySelector("img").src = svgUrl(item);
      card.querySelector(".partslib-name").textContent = item.name;
      card.querySelector(".partslib-sub").textContent =
        [item.subjectLabel, item.part].filter(Boolean).join(" · ");
      card.querySelector(".partslib-badge").textContent = item.license || "라이선스 미상";
      if (item.source) card.title = `출처: ${item.source}`;
      grid.appendChild(card);
    }
    if (!list.length) {
      setStatus("검색 결과가 없습니다.");
    } else if (list.length > MAX_RENDER) {
      setStatus(`검색 결과 ${list.length}개 — 앞 ${MAX_RENDER}개만 표시. 검색어나 필터로 좁혀보세요.`);
    } else {
      setStatus(`부품 ${list.length}개`);
    }
  }

  function runSearch() {
    if (!manifest) return;
    renderResults(searchItems(queryInput.value, filterValues()));
  }

  function resetFilters() {
    queryInput.value = "";
    subjectSelect.value = "";
    populatePartOptions();
    partSelect.value = "";
    runSearch();
  }

  /* ----- [캔버스에 넣기]: 변환 결과 dataUri를 svgAsset 객체의 src로 -----
     스냅샷 1개 = Undo 1스텝 (js/templates.js instantiate()와 같은 형태). */
  /* ----- [선 객체로 넣기] : 선화를 polyline/ellipse/rect 객체 여럿으로 풀어 넣는다 -----
   * 이미지 한 장으로 넣으면 자르기(가위)·부분 삭제가 안 된다. 여기서는 SVG 경로를
   * 그대로 5E 객체로 옮기므로(래스터 재추적이 아님) 정밀도 손실 없이 전부 편집된다.
   * 한 groupId 로 묶어 통째로 옮기고, Shift+G 로 풀어 낱개로 자를 수 있다. */
  function insertAsObjects() {
    const item = byId.get(selectedId);
    if (!item || !converted || !converted.svg) return;
    const s0 = state.get();
    const ab = s0.artboard || { w: 90, h: 60 };
    const w = DEFAULT_W_MM;
    const h = w / aspectOf(converted.viewBox);
    const x = ab.w / 2 - w / 2;
    const y = ab.h / 2 - h / 2;

    _busy = true;
    insertBtn.disabled = true;
    insertObjBtn.disabled = true;
    try {
      const built = svgToObjects(converted.svg, {
        x, y, widthMm: w,
        strokeWidth: converted.strokeWidth != null ? 0.35 : 0.35,
        layerId: s0.activeLayerId,
        startOrder: s0.objects.length,
      });
      if (!built || !built.objects || !built.objects.length) {
        setStatus("선 객체로 풀지 못했습니다. 이미지로 넣어 보세요.", true);
        return;
      }
      state.update((s) => {
        s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));
        s.redoStack = [];
        for (const o of built.objects) s.objects.push(o);
        s.selectedIds = built.objects.map((o) => o.id);
        s.targetedId = null;
        s.activeTool = "V";
      });
      setStatus(`선 객체 ${built.count}개로 넣었습니다.` + (built.reduced ? " (점이 많아 표본을 줄였습니다)" : ""));
      close();
    } catch (e) {
      setStatus(`삽입 실패: ${e && e.message ? e.message : e}`, true);
    } finally {
      _busy = false;
      insertBtn.disabled = !converted;
      insertObjBtn.disabled = !converted;
    }
  }

  function insertSelected() {
    const item = byId.get(selectedId);
    if (!item || !converted || !converted.dataUri) return;
    const s0 = state.get();
    const ab = s0.artboard || { w: 90, h: 60 };
    const w = DEFAULT_W_MM;
    const h = w / aspectOf(converted.viewBox);   // 비율은 변환 결과 viewBox를 따른다
    const x = ab.w / 2 - w / 2;                  // 아트보드 중앙
    const y = ab.h / 2 - h / 2;
    const id = `obj_${Date.now().toString(36)}_part${++_idCounter}`;

    _busy = true;
    insertBtn.disabled = true;
    insertObjBtn.disabled = true;
    try {
      state.update((s) => {
        // 삽입 직전 상태를 스냅샷 — Ctrl+Z 한 번으로 이 부품만 사라진다.
        s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));
        s.redoStack = [];
        s.objects.push({
          id,
          type: "svgAsset",
          src: converted.dataUri,
          partId: item.id,
          lineLevel: level,
          lineFill: fill,
          x, y, w, h,
          rotation: 0,
          locked: false,
          positionLocked: false,
          layerId: s.activeLayerId,
          order: s.objects.length,
        });
        s.selectedIds = [id];
        s.targetedId = null;
        s.activeTool = "V";
      });
      close();
    } catch (e) {
      setStatus(`삽입 실패: ${e && e.message ? e.message : e}`, true);
    } finally {
      _busy = false;
      insertBtn.disabled = !converted;
      insertObjBtn.disabled = !converted;
    }
  }

  /* ----- manifest 로드 (첫 오픈 시 1회) ----- */
  async function loadManifest() {
    setStatus("부품 목록 불러오는 중…");
    try {
      const res = await fetch(LIB_BASE + "manifest.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || !Array.isArray(data.items)) {
        throw new Error("manifest에 items 배열이 없습니다.");
      }
      manifest = data;
      prepareItems(manifest.items);
      byId = new Map(manifest.items.map((it) => [it.id, it]));
      populateSubjectOptions();
      populatePartOptions();
      runSearch();
    } catch (e) {
      manifest = null;
      grid.innerHTML = "";
      clearPreview("부품 목록을 불러오지 못했습니다.");
      setStatus("이미지 라이브러리를 찾을 수 없습니다. assets/parts-library/manifest.json이 "
        + "있는지 확인한 뒤 다시 여세요. "
        + `(${e && e.message ? e.message : e})`, true);
    }
  }

  /* ----- 배선 ----- */
  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".partslib-card");
    if (!card) return;
    selectCard(card.dataset.id);
  });
  levelRow.addEventListener("click", (e) => {
    const b = e.target.closest("[data-level]");
    if (!b || b.dataset.level === level) return;
    level = b.dataset.level;
    syncOptionMarks();
    refreshPreview();
  });
  fillRow.addEventListener("click", (e) => {
    const b = e.target.closest("[data-fill]");
    if (!b || b.dataset.fill === fill) return;
    fill = b.dataset.fill;
    syncOptionMarks();
    refreshPreview();
  });
  insertBtn.addEventListener("click", insertSelected);
  insertObjBtn.addEventListener("click", insertAsObjects);
  queryInput.addEventListener("input", runSearch);
  subjectSelect.addEventListener("change", () => { populatePartOptions(); runSearch(); });
  partSelect.addEventListener("change", runSearch);
  resetButton.addEventListener("click", resetFilters);

  /* ----- open/close ----- */
  const openLibrary = (trigger) => {
    overlay.hidden = false;
    // 누른 버튼 자리에서 창이 자라나게 (기출 문항 검색과 같은 처리)
    setOpenOrigin(overlay.querySelector(".modal"), trigger || openButton);
    syncOptionMarks();
    if (!manifest) loadManifest();
    else runSearch();
    queryInput.focus();
  };
  openButton.addEventListener("click", () => openLibrary(openButton));
  overlay.querySelector("#partslib-close").addEventListener("click", close);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) close(); });

  clearPreview();
  syncOptionMarks();
}
