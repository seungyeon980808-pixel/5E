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

import { insertImageFromSrc } from "./image-paste.js?v=0.53.0";
import { openObjectifyWithFile } from "./image-objectify.js?v=0.53.0";

const LIB_BASE = "assets/exam-library/";
const MAX_RENDER = 60; // 그리드에 한 번에 그리는 카드 수 (초과분은 안내문으로 표시)

let manifest = null;      // { items, tagVocab, ... } — 첫 오픈 시 1회 로드
let byId = new Map();
const selectedTags = new Set();

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

/* 세 검색 방식(코드입력·드롭다운·태깅)을 전부 AND로 결합.
 * filters = { subject, part, year } (빈 문자열이면 해당 축 무시). */
function searchItems(query, filters) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const tags = [...selectedTags];
  const { subject, part, year } = filters;
  return manifest.items.filter((it) =>
    tokens.every((t) => it._hay.includes(t) || it._hayNs.includes(t)) &&
    tags.every((t) => (it.tags || []).includes(t)) &&
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
      <h2 class="modal-title" id="examlib-title">기출 문항 검색</h2>
      <div class="examlib-search-row">
        <input id="examlib-query" type="search" autocomplete="off"
               placeholder="코드·문항번호 검색 — 예: 2026 수능 1  /  p1 2025 11" />
      </div>
      <div class="examlib-filter-row">
        <select id="examlib-subject" aria-label="과목 선택">
          <option value="">과목 전체</option>
        </select>
        <select id="examlib-part" aria-label="파트 선택">
          <option value="">파트 전체</option>
        </select>
        <select id="examlib-year" aria-label="년도 선택">
          <option value="">년도 전체</option>
        </select>
        <button id="examlib-reset" type="button" class="examlib-reset">필터 초기화</button>
      </div>
      <div id="examlib-tagbar" class="examlib-tagbar" hidden></div>
      <p id="examlib-status" class="objectify-status" role="status"></p>
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
  const resetButton = overlay.querySelector("#examlib-reset");
  const tagbar = overlay.querySelector("#examlib-tagbar");
  const status = overlay.querySelector("#examlib-status");
  const grid = overlay.querySelector("#examlib-grid");

  const filterValues = () => ({
    subject: subjectSelect.value,
    part: partSelect.value,
    year: yearSelect.value,
  });

  const setStatus = (msg, isError = false) => {
    status.textContent = msg;
    status.classList.toggle("is-error", isError);
  };
  const close = () => { overlay.hidden = true; };

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

    partSelect.length = 1;  // "파트 전체"만 남기고 재생성
    for (const p of manifest.parts || []) {
      partSelect.add(new Option(p, p));
    }
    yearSelect.length = 1;
    for (const y of manifest.years || []) {
      yearSelect.add(new Option(`${y}학년도`, String(y)));
    }
  }

  /* ----- 태그 칩 (manifest.tagVocab 기반, 카테고리별) ----- */
  function renderTagbar() {
    const vocab = manifest.tagVocab || [];
    if (!vocab.length) { tagbar.hidden = true; return; }
    tagbar.innerHTML = "";
    for (const cat of vocab) {
      const label = document.createElement("span");
      label.className = "examlib-tagcat";
      label.textContent = cat.name;
      tagbar.appendChild(label);
      for (const tag of cat.tags) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "examlib-chip";
        chip.textContent = tag;
        chip.dataset.tag = tag;
        tagbar.appendChild(chip);
      }
    }
    tagbar.hidden = false;
  }

  tagbar.addEventListener("click", (e) => {
    const chip = e.target.closest(".examlib-chip");
    if (!chip) return;
    const tag = chip.dataset.tag;
    if (selectedTags.has(tag)) selectedTags.delete(tag);
    else selectedTags.add(tag);
    chip.classList.toggle("is-on", selectedTags.has(tag));
    runSearch();
  });

  /* ----- 결과 그리드 ----- */
  function renderResults(list) {
    grid.innerHTML = "";
    const shown = list.slice(0, MAX_RENDER);
    for (const item of shown) {
      const card = document.createElement("div");
      card.className = "examlib-card";
      card.innerHTML = `
        <div class="examlib-thumb"><img loading="lazy" alt=""></div>
        <div class="examlib-meta">
          <div class="examlib-title"></div>
          <div class="examlib-tags"></div>
        </div>
        <div class="examlib-actions">
          <button type="button" class="modal-btn modal-btn-primary" data-act="insert" data-id="${item.id}">이미지로 삽입</button>
          <button type="button" class="modal-btn" data-act="objectify" data-id="${item.id}">객체로 변환</button>
        </div>`;
      card.querySelector("img").src = imageUrl(item);
      card.querySelector(".examlib-title").textContent = item.title;
      card.querySelector(".examlib-tags").textContent = (item.tags || []).join(" · ");
      grid.appendChild(card);
    }
    if (!list.length) {
      setStatus("검색 결과가 없습니다.");
    } else if (list.length > MAX_RENDER) {
      setStatus(`검색 결과 ${list.length}개 — 앞 ${MAX_RENDER}개만 표시. 검색어나 태그로 좁혀보세요.`);
    } else {
      setStatus(`문항 ${list.length}개`);
    }
  }

  function runSearch() {
    if (!manifest) return;
    renderResults(searchItems(queryInput.value, filterValues()));
  }

  function resetFilters() {
    queryInput.value = "";
    subjectSelect.value = "";
    partSelect.value = "";
    yearSelect.value = "";
    selectedTags.clear();
    tagbar.querySelectorAll(".examlib-chip.is-on").forEach((c) => c.classList.remove("is-on"));
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
      setStatus(`문항 ${manifest.items.length}개`); // 재오픈 대비 상태 원복
    } catch (e) {
      setStatus(`객체 변환 실패: ${e && e.message ? e.message : e}`, true);
    } finally {
      button.disabled = false;
    }
  }

  grid.addEventListener("click", (e) => {
    const button = e.target.closest("button[data-act]");
    if (!button) return;
    const item = byId.get(button.dataset.id);
    if (!item) return;
    if (button.dataset.act === "insert") insertItem(item, button);
    else if (button.dataset.act === "objectify") objectifyItem(item, button);
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
      renderTagbar();
      runSearch();
    } catch (e) {
      manifest = null;
      setStatus("라이브러리를 찾을 수 없습니다. assets/exam-library/images/에 PNG를 넣고 "
        + "`python scripts/build_manifest.py`를 실행한 뒤 다시 여세요. "
        + `(${e && e.message ? e.message : e})`, true);
    }
  }

  /* ----- open/close ----- */
  openButton.addEventListener("click", () => {
    overlay.hidden = false;
    if (!manifest) loadManifest();
    else runSearch(); // 재오픈: 마지막 검색 상태 유지한 채 갱신
    queryInput.focus();
    queryInput.select();
  });
  overlay.querySelector("#examlib-close").addEventListener("click", close);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) close(); });
  queryInput.addEventListener("input", runSearch);
  for (const sel of [subjectSelect, partSelect, yearSelect]) {
    sel.addEventListener("change", runSearch);
  }
  resetButton.addEventListener("click", resetFilters);
}
