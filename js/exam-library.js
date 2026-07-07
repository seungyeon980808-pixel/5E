/* ===== EXAM IMAGE LIBRARY (기출 문항 검색·삽입) =====
//
// 정적 파일 라이브러리: assets/exam-library/manifest.json (build_manifest.py 산출물)
// + images/*.png (로컬 전용). 서버·API 없음. 스펙: docs/EXAM_LIBRARY_SPEC_20260706.md
//
// 성능 규약:
//  - 앱 시작 시 로드 0 — manifest fetch는 모달 "첫" 오픈 시 1회 (no-store: 재생성 반영)
//  - 이미지는 결과 그리드에서 loading="lazy"로 화면에 보이는 것만 로드
//  - 검색은 클라이언트 선형 스캔, 렌더링은 MAX_RENDER개로 캡
//
// [이미지로 삽입]은 image-paste.js의 기존 삽입 경로(insertImageFromSrc)를 재사용
// — dataURL로 넣어 프로젝트 저장 파일이 라이브러리 폴더 없이도 자기완결되게 한다. */

import { insertImageFromSrc } from "./image-paste.js?v=0.54.6";
import { openObjectifyWithFile } from "./image-objectify.js?v=0.54.6";

const LIB_BASE = "assets/exam-library/";
const MAX_RENDER = 60; // 그리드에 한 번에 그리는 카드 수 (초과분은 안내문으로 표시)

let manifest = null;      // { items, tagVocab, ... } — 첫 오픈 시 1회 로드
let byId = new Map();
let selectedId = null;    // 그리드에서 선택된 카드(문항)의 id — 상단 액션 버튼이 이걸 대상으로 동작

function imageUrl(item) {
  return LIB_BASE + "images/" + encodeURIComponent(item.file);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

/* ----- 검색: 모든 토큰이 (id+제목+태그) 문자열에 포함되어야 매치 (AND) ----- */
function prepareItems(items) {
  for (const it of items) {
    const hay = `${it.id} ${it.title} ${(it.tags || []).join(" ")}`.toLowerCase();
    it._hay = hay;
    it._hayNs = hay.replace(/\s+/g, ""); // "물리11번"처럼 붙여 써도 매치되게
  }
}

// 과목 드롭다운은 manifest에 실제로 존재하는 과목만 채운다(populateFilters) —
// 값은 과목코드(p1/c1/b1/e1...) 그대로라 item.subject와 직접 비교하면 된다.
function subjectMatches(it, subj) {
  return !subj || it.subject === subj; // "" = 전체
}

// 드롭다운 정렬 순서(물리→화학→생명→지구→통합). 목록에 없는 과목코드는 뒤로.
const SUBJECT_ORDER = ["p1", "p2", "c1", "c2", "b1", "b2", "e1", "e2", "i1"];

// 4자리 연도가 실제 라이브러리 연도 범위 안이면 "연도"로 인정(6자리 애매성 해소용).
function plausibleYear4(y) {
  const years = (manifest && manifest.years) || [];
  if (years.length) return y >= Math.min(...years) && y <= Math.max(...years);
  return y >= 2000 && y <= 2099;
}

// 압축 코드 파싱 — 숫자·구분자만 있을 때, 자릿수로 알아서 해석(문항번호는 선택):
//   4자리 YYMM        예: 2611     → 2026학년도 11월(수능), 전 문항
//   6자리 YYYYMM      예: 202611   → 2026학년도 11월, 전 문항
//   6자리 YYMMNN      예: 261101   → 2026학년도 11월 1번  (앞 4자리가 연도로 안 맞을 때)
//   8자리 YYYYMMNN    예: 20261101 → 2026학년도 11월 1번
// 연도 2자리는 20YY로 본다(26→2026). 안 맞으면 null → 일반 토큰검색으로 폴백.
function parseCompactCode(query) {
  const q = String(query).trim();
  if (!q || !/^[\d\s.\-]+$/.test(q)) return null; // 문자가 섞이면 압축코드 아님
  const d = q.replace(/\D/g, "");
  const okM = (m) => m >= 1 && m <= 12;
  const okN = (n) => n >= 1 && n <= 40;
  const y2 = (s) => 2000 + Number(s);
  if (d.length === 4) {
    const year = y2(d.slice(0, 2)), month = Number(d.slice(2, 4));
    return okM(month) ? { year, month, no: null } : null;
  }
  if (d.length === 6) {
    const yA = Number(d.slice(0, 4)), mA = Number(d.slice(4, 6));
    if (plausibleYear4(yA) && okM(mA)) return { year: yA, month: mA, no: null };
    const yB = y2(d.slice(0, 2)), mB = Number(d.slice(2, 4)), nB = Number(d.slice(4, 6));
    if (okM(mB) && okN(nB)) return { year: yB, month: mB, no: nB };
    return null;
  }
  if (d.length === 8) {
    const year = Number(d.slice(0, 4)), month = Number(d.slice(4, 6)), no = Number(d.slice(6, 8));
    return okM(month) && okN(no) ? { year, month, no } : null;
  }
  return null;
}

/* 검색 방식(압축코드 또는 토큰입력 · 드롭다운 4종)을 전부 AND로 결합.
 * filters = { subject, part, year, concept } (빈 문자열이면 해당 축 무시). */
function searchItems(query, filters) {
  const trimmed = query.trim();
  const compact = parseCompactCode(trimmed);
  // '#'는 태그 구분자로도 허용: "#역학#도르레" → ["역학","도르레"] (AND)
  const tokens = compact ? [] : trimmed.toLowerCase().split(/[#\s]+/).filter(Boolean);
  const { subject, part, year, concept } = filters;
  return manifest.items.filter((it) =>
    (compact
      ? (it.year === compact.year && it.month === compact.month
         && (compact.no == null || it.no === compact.no))
      : tokens.every((t) => it._hay.includes(t) || it._hayNs.includes(t))) &&
    (!concept || (it.tags || []).includes(concept)) &&
    (!subject || subjectMatches(it, subject)) &&
    (!part || (it.parts || []).includes(part)) &&
    (!year || String(it.year) === year));
}

/* ===== modal ===== */
function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal modal-examlib" role="dialog" aria-modal="true" aria-labelledby="examlib-title">
      <div class="examlib-title-row">
        <h2 class="modal-title" id="examlib-title">기출 문항 검색</h2>
        <p id="examlib-status" class="objectify-status examlib-status-inline" role="status"></p>
      </div>
      <div class="examlib-filter-row">
        <select id="examlib-subject" aria-label="과목 선택">
          <option value="">과목 선택</option>
        </select>
        <select id="examlib-year" aria-label="년도 선택">
          <option value="">년도 전체</option>
        </select>
        <select id="examlib-part" aria-label="단원 선택">
          <option value="">단원 전체</option>
        </select>
        <select id="examlib-concept" aria-label="개념 선택">
          <option value="">개념 전체</option>
        </select>
        <button id="examlib-reset" type="button" class="examlib-reset">필터 초기화</button>
      </div>
      <div class="examlib-search-row">
        <input id="examlib-query" type="search" autocomplete="off"
               placeholder="번호 검색 : 261101 = 2026학년도 수능 1번   /   해시태그 검색 : #역학#도르레#마찰력" />
      </div>
      <div class="examlib-toolbar">
        <div class="examlib-selected-actions">
          <button id="examlib-insert" type="button" class="modal-btn modal-btn-primary" disabled>이미지로 삽입</button>
          <button id="examlib-objectify" type="button" class="modal-btn" disabled>객체로 변환</button>
        </div>
      </div>
      <div id="examlib-grid" class="examlib-grid"></div>
      <div class="modal-actions">
        <button id="examlib-close" type="button" class="modal-btn">닫기</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

export function initExamLibrary(state) {
  const openButton = document.getElementById("exam-library-open");
  if (!openButton) return;

  const overlay = buildModal();
  const queryInput = overlay.querySelector("#examlib-query");
  const subjectSelect = overlay.querySelector("#examlib-subject");
  const partSelect = overlay.querySelector("#examlib-part");
  const yearSelect = overlay.querySelector("#examlib-year");
  const conceptSelect = overlay.querySelector("#examlib-concept");
  const resetButton = overlay.querySelector("#examlib-reset");
  const status = overlay.querySelector("#examlib-status");
  const grid = overlay.querySelector("#examlib-grid");
  const insertBtn = overlay.querySelector("#examlib-insert");
  const objectifyBtn = overlay.querySelector("#examlib-objectify");

  const filterValues = () => ({
    subject: subjectSelect.value,
    part: partSelect.value,
    year: yearSelect.value,
    concept: conceptSelect.value,
  });

  const setStatus = (msg, isError = false) => {
    status.textContent = msg;
    status.classList.toggle("is-error", isError);
  };
  const close = () => { overlay.hidden = true; };

  /* ----- 그리드 선택 상태(카드 클릭 → 상단 액션 버튼이 대상으로 삼음) ----- */
  function updateActionButtons() {
    const has = !!selectedId;
    insertBtn.disabled = !has;
    objectifyBtn.disabled = !has;
  }
  function selectCard(id, cardEl) {
    const prev = grid.querySelector(".examlib-card.is-selected");
    if (prev) prev.classList.remove("is-selected");
    selectedId = id;
    if (cardEl) cardEl.classList.add("is-selected");
    updateActionButtons();
  }
  function clearSelection() {
    selectedId = null;
    updateActionButtons();
  }

  /* ----- 드롭다운 옵션 채우기 (과목·파트·년도 전부 manifest 실제 데이터에서) ----- */
  function populateFilters() {
    subjectSelect.length = 1; // "과목 전체"만 남기고 재생성
    const subjectLabels = new Map(); // code → label (첫 등장값 사용)
    for (const it of manifest.items) {
      if (!subjectLabels.has(it.subject)) subjectLabels.set(it.subject, it.subjectLabel || it.subject);
    }
    const codes = [...subjectLabels.keys()].sort((a, b) => {
      const ia = SUBJECT_ORDER.indexOf(a), ib = SUBJECT_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    for (const code of codes) {
      subjectSelect.add(new Option(subjectLabels.get(code), code));
    }

    partSelect.length = 1;  // "단원 전체"만 남기고 재생성
    for (const p of manifest.parts || []) {
      partSelect.add(new Option(p, p));
    }
    yearSelect.length = 1;
    for (const y of manifest.years || []) {
      yearSelect.add(new Option(`${y}학년도`, String(y)));
    }
    populateConceptOptions();
  }

  /* ----- 개념 드롭다운: manifest.tagVocab(카테고리=단원) 기반, 단원 선택 시 그 단원 개념만 -----
   * (주의: 현재 태그 어휘집은 물리 전용 — 다른 과목 문항은 개념이 비어 있음, SPEC 참고) */
  function populateConceptOptions() {
    const vocab = manifest.tagVocab || [];
    const selectedPart = partSelect.value;
    const prevValue = conceptSelect.value;
    conceptSelect.length = 1; // "개념 전체"만 남기고 재생성
    for (const cat of vocab) {
      if (selectedPart && cat.name !== selectedPart) continue;
      for (const tag of cat.tags) {
        conceptSelect.add(new Option(tag, tag));
      }
    }
    conceptSelect.value = [...conceptSelect.options].some((o) => o.value === prevValue) ? prevValue : "";
  }

  /* ----- 결과 그리드 (카드 클릭=선택, 삽입/변환은 상단 버튼이 담당) ----- */
  function renderResults(list) {
    clearSelection();
    grid.innerHTML = "";
    const shown = list.slice(0, MAX_RENDER);
    for (const item of shown) {
      const card = document.createElement("div");
      card.className = "examlib-card";
      card.dataset.id = item.id;
      card.innerHTML = `
        <div class="examlib-thumb"><img loading="lazy" alt=""></div>
        <div class="examlib-meta">
          <div class="examlib-title"></div>
          <div class="examlib-tags"></div>
        </div>`;
      card.querySelector("img").src = imageUrl(item);
      card.querySelector(".examlib-title").textContent = item.title;
      card.querySelector(".examlib-tags").textContent = (item.tags || []).join(" · ");
      grid.appendChild(card);
    }
    if (!list.length) {
      setStatus("검색 결과가 없습니다.");
    } else if (list.length > MAX_RENDER) {
      setStatus(`검색 결과 ${list.length}개 — 앞 ${MAX_RENDER}개만 표시. 검색어나 필터로 좁혀보세요.`);
    } else {
      setStatus(`문항 ${list.length}개`);
    }
  }

  // 과목을 고르기 전에는 아무것도 그리지 않는다 — 552개 전체를 무작정 훑지 않도록.
  function runSearch() {
    if (!manifest) return;
    const filters = filterValues();
    if (!filters.subject) {
      clearSelection();
      grid.innerHTML = "";
      setStatus("과목을 먼저 선택하세요.");
      return;
    }
    renderResults(searchItems(queryInput.value, filters));
  }

  function resetFilters() {
    queryInput.value = "";
    subjectSelect.value = "";
    partSelect.value = "";
    yearSelect.value = "";
    conceptSelect.value = "";
    populateConceptOptions(); // 단원 초기화됐으니 개념 목록도 전체로
    runSearch();
  }

  /* ----- [이미지로 삽입]: fetch → dataURL → 기존 이미지 객체 삽입 경로 ----- */
  async function insertItem(item, button) {
    button.disabled = true;
    setStatus(`${item.title} 불러오는 중…`);
    try {
      const res = await fetch(imageUrl(item));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const dataUrl = await blobToDataUrl(await res.blob());
      await insertImageFromSrc(state, dataUrl);
      close();
    } catch (e) {
      setStatus(`삽입 실패: ${e && e.message ? e.message : e}`, true);
      button.disabled = false;
    }
  }

  /* ----- [객체로 변환]: fetch → File → 기존 이미지 객체화 모달로 전달 ----- */
  async function objectifyItem(item, button) {
    button.disabled = true;
    setStatus(`${item.title} 불러오는 중…`);
    try {
      const res = await fetch(imageUrl(item));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], item.file, { type: "image/png" });
      if (!openObjectifyWithFile(file)) throw new Error("이미지 객체화 모듈이 준비되지 않았습니다.");
      close();
    } catch (e) {
      setStatus(`객체 변환 실패: ${e && e.message ? e.message : e}`, true);
    } finally {
      button.disabled = false;
    }
  }

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".examlib-card");
    if (!card) return;
    selectCard(card.dataset.id, card);
  });

  insertBtn.addEventListener("click", () => {
    const item = byId.get(selectedId);
    if (item) insertItem(item, insertBtn);
  });
  objectifyBtn.addEventListener("click", () => {
    const item = byId.get(selectedId);
    if (item) objectifyItem(item, objectifyBtn);
  });

  /* ----- manifest 로드 (첫 오픈 시 1회) ----- */
  async function loadManifest() {
    setStatus("문항 목록 불러오는 중…");
    try {
      const res = await fetch(LIB_BASE + "manifest.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.version !== "exam-library-v1" || !Array.isArray(data.items)) {
        throw new Error("manifest 형식이 exam-library-v1이 아닙니다.");
      }
      manifest = data;
      prepareItems(manifest.items);
      byId = new Map(manifest.items.map((it) => [it.id, it]));
      populateFilters();
      runSearch();
    } catch (e) {
      manifest = null;
      setStatus("라이브러리를 찾을 수 없습니다. assets/exam-library/images/에 PNG를 넣고 "
        + "`python scripts/build_manifest.py`를 실행한 뒤 다시 여세요. "
        + `(${e && e.message ? e.message : e})`, true);
    }
  }

  /* ----- open/close ----- */
  const openLibrary = () => {
    overlay.hidden = false;
    if (!manifest) loadManifest();
    else runSearch(); // 재오픈: 마지막 검색 상태 유지한 채 갱신
    subjectSelect.focus(); // 과목 선택이 첫 단계이므로 여기에 포커스
  };
  openButton.addEventListener("click", openLibrary);
  // Ctrl+Shift+F = 기출문항 검색 (Ctrl+F 오브젝트 검색과 짝)
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.key.toLowerCase() !== "f") return;
    e.preventDefault();
    if (overlay.hidden) openLibrary();
  }, true);
  overlay.querySelector("#examlib-close").addEventListener("click", close);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) close(); });
  queryInput.addEventListener("input", runSearch);
  partSelect.addEventListener("change", () => { populateConceptOptions(); runSearch(); });
  for (const sel of [subjectSelect, yearSelect, conceptSelect]) {
    sel.addEventListener("change", runSearch);
  }
  resetButton.addEventListener("click", resetFilters);
}
