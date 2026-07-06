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

import { insertImageFromSrc } from "./image-paste.js?v=0.50.6";

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

function searchItems(query) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const tags = [...selectedTags];
  return manifest.items.filter((it) =>
    tokens.every((t) => it._hay.includes(t) || it._hayNs.includes(t)) &&
    tags.every((t) => (it.tags || []).includes(t)));
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
               placeholder="검색 — 예: 2026 수능 1  /  용수철 충돌" />
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
  const tagbar = overlay.querySelector("#examlib-tagbar");
  const status = overlay.querySelector("#examlib-status");
  const grid = overlay.querySelector("#examlib-grid");

  const setStatus = (msg, isError = false) => {
    status.textContent = msg;
    status.classList.toggle("is-error", isError);
  };
  const close = () => { overlay.hidden = true; };

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
    renderResults(searchItems(queryInput.value));
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

  grid.addEventListener("click", (e) => {
    const button = e.target.closest("button[data-act]");
    if (!button) return;
    const item = byId.get(button.dataset.id);
    if (!item) return;
    if (button.dataset.act === "insert") insertItem(item, button);
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
}
