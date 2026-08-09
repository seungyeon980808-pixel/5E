/* ===== IMAGE LIBRARY (이미지 라이브러리 — 퍼블릭 도메인 과학 도해 검색·삽입) [베타] =====
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
// 넣는 방식은 둘이다: 선화로 바꿔 넣기(프리셋 세밀/표준/단순)와 원본 그대로 넣기(원본).
// 세포 그림처럼 색·음영이 뜻을 갖는 그림은 선만 남기면 못 알아보므로 원본 경로가 필요하다.
import { setOpenOrigin } from "./modal-motion.js?v=1.4.0";

const LIB_BASE = "assets/parts-library/";
const MAX_RENDER = 60;      // 그리드에 한 번에 그리는 카드 수 (초과분은 안내문으로 표시)
const MAX_SELECT = 10;      // AI 참고 이미지로 한 번에 보낼 수 있는 최대 개수
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
      + `${(it.sourceTags || []).join(" ")} `
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
        <h2 class="modal-title" id="partslib-title">이미지 라이브러리<span class="partslib-beta">베타</span></h2>
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
          <!-- 그림이 맨 위. 무엇을 넣을지부터 보이고, 조절은 그 아래에서 한다. -->
          <div class="partslib-preview-head">미리보기</div>
          <div class="partslib-preview-box"><img id="partslib-preview-img" alt="" /></div>
          <div class="partslib-preview-name" id="partslib-preview-name"></div>
          <div class="partslib-preview-meta" id="partslib-preview-meta"></div>

          <!-- 처리 방식 프리셋. 웬만하면 여기서 끝난다. -->
          <div class="partslib-opt-row" id="partslib-levels" role="group" aria-label="처리 방식"></div>

          <!-- 고급 기능: 켜면 위 프리셋은 잠기고 세부값을 직접 만진다 -->
          <button type="button" id="partslib-adv-toggle" class="partslib-adv-toggle"
                  aria-expanded="false" aria-controls="partslib-adv">고급 기능</button>
          <div id="partslib-adv" class="partslib-adv" hidden>
            <label class="partslib-adv-row">
              <span>작은 조각 정리</span>
              <input type="range" id="pl-adv-tiny" min="0" max="120" step="5" value="35" />
              <output id="pl-adv-tiny-out">보통</output>
            </label>
            <label class="partslib-adv-row">
              <span>선 굵기</span>
              <input type="range" id="pl-adv-line" min="20" max="60" step="5" value="35" />
              <output id="pl-adv-line-out">0.35mm</output>
            </label>
            <label class="partslib-adv-row">
              <span>넣는 폭</span>
              <input type="range" id="pl-adv-width" min="20" max="90" step="5" value="45" />
              <output id="pl-adv-width-out">45mm</output>
            </label>
            <label class="partslib-adv-check">
              <input type="checkbox" id="pl-adv-dropline" checked />
              <span>지시선·글자 제거</span>
            </label>
            <div class="partslib-opt-row" id="partslib-fills" role="group" aria-label="채우기">
              <button type="button" class="partslib-opt" data-fill="none" title="선만 남기고 속은 비웁니다">채우기 없음</button>
              <button type="button" class="partslib-opt" data-fill="white" title="속을 흰색으로 채워 뒤 그림을 가립니다">흰 채우기</button>
            </div>
          </div>

          <div class="partslib-primary-actions">
            <button id="partslib-ai" type="button" class="modal-btn" disabled
                    title="선택한 이미지를 AI 생성·변환의 참고 이미지로 보냅니다">AI로 변환</button>
            <button id="partslib-insert" type="button" class="modal-btn modal-btn-primary" disabled>넣기</button>
          </div>
          <p class="partslib-insert-hint" id="partslib-insert-hint">그림 하나를 골라 주세요.</p>
        </aside>
      </div>
      <div class="modal-actions">
        <button id="partslib-close" type="button" class="modal-btn">닫기</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

export function initPartsLibrary(state, { openAi } = {}) {
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
  const aiBtn = overlay.querySelector("#partslib-ai");
  const insertHint = overlay.querySelector("#partslib-insert-hint");
  const advToggle = overlay.querySelector("#partslib-adv-toggle");
  const advPanel = overlay.querySelector("#partslib-adv");
  const advTiny = overlay.querySelector("#pl-adv-tiny");
  const advLine = overlay.querySelector("#pl-adv-line");
  const advWidth = overlay.querySelector("#pl-adv-width");
  const advDropLine = overlay.querySelector("#pl-adv-dropline");

  // 현재 선택/변환 상태
  let selectedIds = [];
  let activeId = null;
  let level = "L2";
  let fill = "none";
  let advanced = false;   // 고급 기능을 켰는가 — 켜면 프리셋은 잠긴다
  let converted = null;   // toLineArt 결과 { svg, dataUri, kept, viewBox, strokeWidth }
  let previewToken = 0;   // 비동기 변환 경합 방지 — 마지막 요청 결과만 화면에 반영
  let _busy = false;      // 삽입 진행 중

  /* 원본 그대로 넣기. 선화로 바꾸지 않고 받은 SVG 를 그대로 쓴다 —
     세포 그림처럼 색과 음영이 뜻을 갖는 그림은 선만 남기면 못 알아본다. */
  const RAW = "RAW";
  const widthMm = () => Number(advWidth.value) || DEFAULT_W_MM;
  const advLevel = () => ({
    id: "custom",
    drop: Number(advTiny.value) > 0,
    dropLine: advDropLine.checked,
    tiny: Number(advTiny.value) / 1000,
  });
  const tinyLabel = (v) =>
    v === 0 ? "안 함" : v <= 20 ? "약하게" : v <= 50 ? "보통" : v <= 85 ? "세게" : "아주 세게";

  const filterValues = () => ({ subject: subjectSelect.value, part: partSelect.value });
  const setStatus = (msg, isError = false) => {
    status.textContent = msg;
    status.classList.toggle("is-error", isError);
  };
  const close = () => {
    if (overlay.hidden) return;
    overlay.hidden = true;
    window.dispatchEvent(new CustomEvent("5e:library-closed", { detail: { library: "parts" } }));
  };

  /* ----- 처리 방식 프리셋 — 맨 앞에 [원본], 그 뒤로 변환 모듈이 알려 준 위계 ----- */
  {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "partslib-opt";
    b.dataset.level = RAW;
    b.textContent = "원본";
    b.title = "선화로 바꾸지 않고 원본 그대로 넣습니다 (색·음영 유지)";
    levelRow.appendChild(b);
  }
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
    // 고급을 켜면 프리셋은 잠근다 — 두 곳에서 같은 값을 다투지 않게
    levelRow.classList.toggle("is-locked", advanced);
    levelRow.querySelectorAll("[data-level]").forEach((b) => {
      b.disabled = advanced;
      b.classList.toggle("is-on", !advanced && b.dataset.level === level);
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
    previewName.textContent = msg || "그림을 고르면 여기에 보여 줍니다.";
    previewMeta.textContent = "";
    insertBtn.disabled = true;
    aiBtn.disabled = true;
  }

  async function refreshPreview() {
    const item = byId.get(activeId);
    if (!item) { clearPreview(); return; }
    const token = ++previewToken;
    converted = null;
    insertBtn.disabled = true;
    aiBtn.disabled = true;
    previewName.textContent = `${item.name} — 변환 중…`;
    // 출처·라이선스는 변환 성공 여부와 무관하게 항상 보인다.
    renderPreviewMeta(item);
    try {
      const svgText = await loadSvgText(item);
      if (token !== previewToken) return;   // 그 사이 다른 부품/설정을 골랐다

      let out;
      if (!advanced && level === RAW) {
        out = rawAsset(svgText);            // 원본 그대로 — 변환하지 않는다
        if (!out) throw new Error("원본을 읽지 못했습니다.");
      } else {
        out = toLineArt(svgText, {
          level: advanced ? advLevel() : level,
          fill,
          targetMm: widthMm(),
          lineMm: advanced ? Number(advLine.value) / 100 : 0.35,
        });
        if (!out || !out.dataUri) throw new Error("변환 결과가 없습니다.");
      }
      if (token !== previewToken) return;
      converted = out;
      previewImg.src = out.dataUri;
      previewImg.classList.remove("is-empty");
      const kept = Number.isFinite(out.kept) ? ` · 선 ${out.kept}개` : "";
      previewName.textContent = `${item.name}${kept}`;
      insertHint.textContent = out.raw
        ? "원본 그대로 넣습니다 — 색과 음영이 남습니다."
        : `선화로 바꿔 ${widthMm()}mm 폭으로 넣습니다.`;
      insertBtn.disabled = _busy;
      aiBtn.disabled = _busy || typeof openAi !== "function";
    } catch (e) {
      if (token !== previewToken) return;
      converted = null;
      previewImg.removeAttribute("src");
      previewImg.classList.add("is-empty");
      previewName.textContent = `${item.name} — 변환 실패: ${e && e.message ? e.message : e}`;
      insertHint.textContent = "다른 처리 방식을 골라 보세요.";
      insertBtn.disabled = true;
      aiBtn.disabled = true;
    }
  }

  /* 원본 SVG 를 손대지 않고 그대로 쓸 수 있게 감싼다.
     toLineArt 와 같은 모양({dataUri, viewBox})으로 돌려줘야 삽입부가 갈라지지 않는다. */
  function rawAsset(svgText) {
    try {
      const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
      const svg = doc.documentElement;
      if (!svg || svg.tagName.toLowerCase() !== "svg") return null;
      let vb = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
      if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) {
        const w = parseFloat(svg.getAttribute("width")) || 100;
        const h = parseFloat(svg.getAttribute("height")) || 100;
        vb = [0, 0, w, h];
      }
      const b64 = btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(svg))));
      return { dataUri: `data:image/svg+xml;base64,${b64}`, viewBox: vb, raw: true };
    } catch {
      return null;
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
      c.classList.toggle("is-selected", selectedIds.includes(c.dataset.id));
    });
  }

  function selectCard(id) {
    const item = byId.get(id);
    if (!item) return;
    const selectedAt = selectedIds.indexOf(id);
    if (selectedAt >= 0) {
      selectedIds.splice(selectedAt, 1);
      if (activeId === id) activeId = selectedIds.at(-1) || null;
    } else {
      if (selectedIds.length >= MAX_SELECT) {
        setStatus(`한 번에 ${MAX_SELECT}개까지만 선택할 수 있습니다.`);
        return;
      }
      selectedIds.push(id);
      activeId = id;
    }
    if (!activeId) {
      syncCardMarks();
      clearPreview();
      return;
    }
    const activeItem = byId.get(activeId);
    level = activeItem?.defaultLevel || "L2";   // 기본 위계는 항목이 정한 값
    fill = "none";                       // 채우기 기본은 없음
    syncCardMarks();
    syncOptionMarks();
    refreshPreview();
    aiBtn.textContent = selectedIds.length > 1 ? `AI로 변환 (${selectedIds.length})` : "AI로 변환";
  }

  function renderResults(list) {
    selectedIds = [];
    activeId = null;
    aiBtn.textContent = "AI로 변환";
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
  function insertSelected() {
    const item = byId.get(activeId);
    if (!item || !converted || !converted.dataUri) return;
    const s0 = state.get();
    const ab = s0.artboard || { w: 90, h: 60 };
    const w = widthMm();                          // 고급에서 정한 폭 (기본 45mm)
    const h = w / aspectOf(converted.viewBox);   // 비율은 변환 결과 viewBox를 따른다
    const x = ab.w / 2 - w / 2;                  // 아트보드 중앙
    const y = ab.h / 2 - h / 2;
    const id = `obj_${Date.now().toString(36)}_part${++_idCounter}`;

    _busy = true;
    insertBtn.disabled = true;
    aiBtn.disabled = true;
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
          lineLevel: converted.raw ? "RAW" : (advanced ? "custom" : level),
          lineFill: converted.raw ? null : fill,
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
      aiBtn.disabled = !converted || typeof openAi !== "function";
    }
  }

  /* ----- manifest 로드 (첫 오픈 시 1회) ----- */
  async function loadManifest() {
    setStatus("이미지 목록 불러오는 중…");
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

  /* ----- 고급 기능 — 켜면 프리셋을 잠그고 세부값을 직접 만진다 ----- */
  function syncAdvLabels() {
    overlay.querySelector("#pl-adv-tiny-out").textContent = tinyLabel(Number(advTiny.value));
    overlay.querySelector("#pl-adv-line-out").textContent =
      (Number(advLine.value) / 100).toFixed(2) + "mm";
    overlay.querySelector("#pl-adv-width-out").textContent = advWidth.value + "mm";
  }
  advToggle.addEventListener("click", () => {
    advanced = !advanced;
    advPanel.hidden = !advanced;
    advToggle.setAttribute("aria-expanded", String(advanced));
    advToggle.classList.toggle("is-on", advanced);
    // 고급을 켜는 순간, 지금 보고 있던 프리셋 값을 슬라이더 초기값으로 옮겨 준다.
    // 그래야 켜자마자 그림이 딴판으로 바뀌지 않는다.
    if (advanced) {
      const lv = LEVELS.find((l) => l.id === level);
      if (lv) {
        advTiny.value = String(Math.round((lv.tiny || 0) * 1000));
        advDropLine.checked = !!lv.dropLine;
      }
      syncAdvLabels();
    }
    syncOptionMarks();
    refreshPreview();
  });
  for (const el of [advTiny, advLine, advWidth]) {
    el.addEventListener("input", syncAdvLabels);
    el.addEventListener("change", refreshPreview);
  }
  advDropLine.addEventListener("change", refreshPreview);
  syncAdvLabels();

  insertBtn.addEventListener("click", insertSelected);
  aiBtn.addEventListener("click", () => {
    const items = selectedIds.map((id) => byId.get(id)).filter(Boolean);
    if (!items.length || typeof openAi !== "function") return;
    close();
    void openAi({
      references: items.map((item) => ({
        src: item.id === activeId && converted?.dataUri ? converted.dataUri : svgUrl(item),
        name: item.name || `${item.id}.svg`,
      })),
    });
  });
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
