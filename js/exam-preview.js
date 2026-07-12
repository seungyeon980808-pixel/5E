/* ===== EXAM PREVIEW (내보낼 그림을 실제 시험지 위에 실제 크기로 미리보기) =====
 *
 * 목적: 이미지로 내보내기 전에, 그림을 실제 시험지(수능 8절 272×394mm) 위 "실제 인쇄 크기"로
 * 얹어 주변 텍스트·여백과 크기가 어우러지는지 확인한다. 시험지 글자 크기는
 * 고정이므로, 그림 크기를 함부로 키우면 본문과 안 어울리는데 이를 미리 잡는다.
 *
 * 원칙:
 *   - 순수 미리보기 — state.objects / undo / export / 프로젝트 저장 어디에도
 *     흔적을 남기지 않는다. 열고 닫으면 그대로 사라진다.
 *   - 그림은 export와 "같은 래스터화 경로"(svg-export.js rasterizeExportCanvas)를
 *     쓴다 → 화면에 보이는 미리보기 = 실제 내보낸 PNG. 폰트 대체/클리핑도 동일.
 *   - 배율은 물리 크기로 맞춘다: 그림 mm ↔ 페이지 mm를 같은 px/mm로 얹으므로,
 *     그림이 시험지에서 차지하는 실제 비율이 정확히 재현된다.
 *   - 그림은 드래그로 "위치만" 이동. 크기는 실제 인쇄 크기로 고정(변경 불가).
 *
 * 배경 자산은 로컬 번들(assets/exam-backgrounds/). 제3자(예: KICE) 저작물이
 * 포함될 수 있어 .gitignore 처리 — 공개 배포 전 자작 목업으로 교체할 것.
 */

import { rasterizeExportCanvas } from "./svg-export.js?v=1.0.0";
import { loadPreviewBackgrounds } from "./preview-backgrounds.js?v=1.0.0";

/* ----- 배경 양식 목록 -----
 * 각 항목은 실제 인쇄 물리 크기(mm)를 가진다. 이 값으로 그림을 정확한 배율로
 * 얹으므로 반드시 "실제 종이 규격"이어야 한다 — PDF MediaBox가 아니다. 수능
 * 시험지는 8절지 272×394mm인데, 제공된 PDF는 A3(297×420)로 내보내진 것이라
 * MediaBox를 그대로 믿으면 스케일이 ~9% 어긋난다. 그래서 진짜 8절 치수를 쓴다.
 * (배경 PNG 픽셀은 A3 비율 그대로 두고 폭만 272mm로 매핑 → 가로 스케일 정확,
 * 세로는 원본 비율 차이로 ~2% 오차이나 무시 가능.) 항목을 추가하면 상단 선택
 * 탭이 자동 생성된다. */
const BACKGROUNDS = [
  {
    id: "physics-8jeol",
    label: "물리학 I · 과학탐구 (수능 8절)",
    src: "assets/exam-backgrounds/sample-physics-8jeol.png",
    pageWidthMm: 272, // 수능 8절지 실제 폭
    pageHeightMm: 394, // 수능 8절지 실제 높이
  },
];

let _overlay = null; // 모달 오버레이(1회 생성 후 재사용)
let _els = null;     // 자주 쓰는 하위 요소 캐시
const _bgCache = {}; // id → 로드된 Image (배경은 1회만 로드)
let _activeBgId = BACKGROUNDS[0] ? BACKGROUNDS[0].id : null;
let _lastSettings = null; // 마지막 open 시의 export 설정(배경 전환 시 재래스터화용)

/* 내장 배경 + 사용자가 등록한 배경(localStorage)을 합친 목록.
 * 사용자 항목은 src에 dataURL을 그대로 쓴다(Image/<img>가 dataURL을 지원). */
function allBackgrounds() {
  const user = loadPreviewBackgrounds().map((b) => ({
    id: b.id,
    label: b.name,
    src: b.dataUrl,
    pageWidthMm: b.widthMm,
    pageHeightMm: b.heightMm,
  }));
  return [...BACKGROUNDS, ...user];
}

/* ----- 배경 이미지 로드(캐시) ----- */
function loadBackground(bg) {
  if (_bgCache[bg.id]) return Promise.resolve(_bgCache[bg.id]);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { _bgCache[bg.id] = img; resolve(img); };
    img.onerror = () => reject(new Error("background load failed"));
    img.src = bg.src;
  });
}

/* ----- 모달 DOM 1회 생성 ----- */
function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  // 시험지가 크므로 콘텐츠 폭에 맞춰 넓어지게(고정 320px 해제).
  modal.style.width = "auto";
  modal.style.maxWidth = "calc(100vw - 32px)";
  modal.style.gap = "12px";

  const title = document.createElement("h2");
  title.className = "modal-title";
  title.textContent = "시험지 미리보기";
  modal.appendChild(title);

  // 배경 선택 드롭다운(내장 + 사용자 등록). 항목은 open 때마다 다시 채운다.
  const bgRow = document.createElement("label");
  bgRow.className = "modal-field";
  bgRow.style.cssText = "flex-direction:row;align-items:center;gap:8px;align-self:flex-start;";
  const bgLabel = document.createElement("span");
  bgLabel.className = "modal-label";
  bgLabel.style.margin = "0";
  bgLabel.textContent = "배경 양식";
  const bgSelect = document.createElement("select");
  bgSelect.className = "modal-input";
  bgSelect.addEventListener("change", () => {
    _activeBgId = bgSelect.value;
    renderStage();
  });
  bgRow.appendChild(bgLabel);
  bgRow.appendChild(bgSelect);
  modal.appendChild(bgRow);

  // 스크롤 가능한 무대(배경 + 그림 오버레이가 들어갈 곳).
  const scroller = document.createElement("div");
  scroller.style.cssText =
    "overflow:auto;max-height:74vh;background:var(--bg-input,#f0f2f5);" +
    "border:1px solid var(--border,#d0d7de);border-radius:8px;padding:12px;" +
    "display:flex;justify-content:center;";
  const stage = document.createElement("div");
  stage.style.cssText = "position:relative;flex:0 0 auto;";
  scroller.appendChild(stage);
  modal.appendChild(scroller);

  // 안내 + 실제 크기 표시.
  const info = document.createElement("div");
  info.style.cssText =
    "font-size:12px;color:var(--text-secondary,#57606a);line-height:1.5;";
  modal.appendChild(info);

  // 액션 버튼.
  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "modal-btn";
  resetBtn.textContent = "위치 초기화";
  resetBtn.addEventListener("click", () => placeArtwork(true));
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "modal-btn modal-btn-primary";
  closeBtn.textContent = "닫기";
  closeBtn.addEventListener("click", hide);
  actions.appendChild(resetBtn);
  actions.appendChild(closeBtn);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // 오버레이 바깥 클릭 / Escape로 닫기. Escape는 capture 단계 + stopImmediatePropagation
  // 으로 처리해, 뒤에 열려 있는 내보내기 다이얼로그의 Escape 핸들러가 함께 발동해
  // 그 모달까지 닫아버리는 것을 막는다(미리보기만 닫히고 다이얼로그는 유지).
  overlay.addEventListener("click", (e) => { if (e.target === overlay) hide(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) {
      e.preventDefault();
      e.stopImmediatePropagation();
      hide();
    }
  }, true);

  _overlay = overlay;
  _els = { stage, info, title, bgSelect };
}

/* 드롭다운 옵션을 현재(내장+사용자) 목록으로 다시 채우고, 활성 배경을 보정한다. */
function populateBgSelect() {
  const sel = _els.bgSelect;
  const list = allBackgrounds();
  sel.innerHTML = "";
  for (const bg of list) {
    sel.add(new Option(bg.label, bg.id));
  }
  // 활성 배경이 목록에서 사라졌으면(삭제됨) 첫 항목으로.
  if (!list.some((b) => b.id === _activeBgId)) {
    _activeBgId = list[0] ? list[0].id : null;
  }
  if (_activeBgId) sel.value = _activeBgId;
}

function hide() {
  if (_overlay) _overlay.hidden = true;
  endDrag();
}

/* ----- 현재 무대(배경 + 그림)를 그린다 ----- */
// _artState: { canvas, widthMm, heightMm, pxPerMm, stageW, stageH } — placeArtwork에서 쓴다.
let _artState = null;

async function renderStage() {
  const list = allBackgrounds();
  const bg = list.find((b) => b.id === _activeBgId) || list[0];
  const { stage, info } = _els;
  stage.innerHTML = "";
  _artState = null;

  if (!bg) {
    info.textContent = "표시할 시험지 양식이 없습니다.";
    return;
  }

  // 1) 그림을 export와 동일 경로로 래스터화(흰 배경, 실제 크기 mm 포함).
  let art;
  try {
    art = await rasterizeExportCanvas(_lastSettings.state.get(), {
      dpi: _lastSettings.dpi,
      bounds: _lastSettings.bounds || null, // 미리보기는 지정한 영역만 얹는다
      options: _lastSettings.options,
    });
  } catch (_) {
    info.textContent = "그림을 준비하는 중 오류가 발생했습니다.";
    return;
  }

  // 2) 배경 로드.
  let bgImg;
  try {
    bgImg = await loadBackground(bg);
  } catch (_) {
    info.innerHTML =
      `배경 이미지를 불러오지 못했습니다: <code>${bg.src}</code><br>` +
      "로컬 자산(.gitignore)이라 저장소를 새로 받은 경우 없을 수 있습니다.";
    return;
  }

  // 3) 표시 배율: 시험지 글자가 읽히도록 "폭 기준"으로 확대하고 세로는 스크롤한다
  // (전체 페이지를 다 우겨넣으면 글자가 너무 작아 비교가 안 됨). 목표 밀도는 화면에서
  // 약 3.7px/mm(≈본문 글자 읽힘). 단, 창 폭을 넘지 않게 제한하고 원본 이상 확대는
  // 안 한다. innerWidth가 0인 환경(임베드·헤드리스)은 기본값으로 폴백.
  const naturalPxPerMm = bgImg.naturalWidth / bg.pageWidthMm;
  const desiredScale = 3.7 / naturalPxPerMm;
  const maxScaleByWidth = ((window.innerWidth || 1200) * 0.7) / bgImg.naturalWidth;
  const displayScale = Math.max(0.1, Math.min(desiredScale, maxScaleByWidth, 1));
  const stageW = Math.round(bgImg.naturalWidth * displayScale);
  const stageH = Math.round(bgImg.naturalHeight * displayScale);
  const pxPerMm = stageW / bg.pageWidthMm; // 표시 좌표계의 mm→px (배경·그림 공통)

  stage.style.width = stageW + "px";
  stage.style.height = stageH + "px";

  // 배경 이미지.
  const bgEl = document.createElement("img");
  bgEl.src = bg.src;
  bgEl.draggable = false;
  bgEl.style.cssText =
    "display:block;width:100%;height:100%;user-select:none;pointer-events:none;";
  stage.appendChild(bgEl);

  // 그림 오버레이(실제 크기). 내부 해상도는 고DPI 그대로, CSS 크기만 실제 mm로.
  const artW = art.widthMm * pxPerMm;
  const artH = art.heightMm * pxPerMm;
  const artBox = document.createElement("div");
  artBox.style.cssText =
    "position:absolute;cursor:grab;touch-action:none;" +
    "outline:1px solid rgba(9,105,218,0.55);box-shadow:0 1px 6px rgba(0,0,0,0.28);";
  artBox.style.width = artW + "px";
  artBox.style.height = artH + "px";
  const artCanvas = art.canvas;
  artCanvas.style.cssText = "display:block;width:100%;height:100%;";
  artBox.appendChild(artCanvas);
  stage.appendChild(artBox);

  _artState = { artBox, artW, artH, stageW, stageH, widthMm: art.widthMm, heightMm: art.heightMm, bg };
  wireDrag(artBox, stageW, stageH, artW, artH);
  placeArtwork(true); // 기본 위치로 배치

  info.innerHTML =
    `그림 실제 크기 <strong>${art.widthMm.toFixed(0)} × ${art.heightMm.toFixed(0)} mm</strong>` +
    ` · 페이지 ${bg.label} <strong>${bg.pageWidthMm.toFixed(0)} × ${bg.pageHeightMm.toFixed(0)} mm</strong>` +
    `<br>그림을 드래그해 위치를 옮겨 보세요. 크기는 실제 인쇄 크기로 고정됩니다.`;
}

/* ----- 그림을 기본 위치(왼쪽 단 상단쯤) 또는 현재 위치로 배치 ----- */
function placeArtwork(reset) {
  if (!_artState) return;
  const { artBox, artW, artH, stageW, stageH } = _artState;
  if (reset) {
    // 왼쪽 단 중앙 부근에서 시작(양식 슬롯 메타데이터 없이도 합리적 기본값).
    let left = stageW * 0.27 - artW / 2;
    let top = stageH * 0.15;
    left = Math.max(0, Math.min(left, stageW - artW));
    top = Math.max(0, Math.min(top, stageH - artH));
    artBox.style.left = left + "px";
    artBox.style.top = top + "px";
    // 확대·스크롤 상태에서 그림이 바로 보이도록 무대를 그림 위치로 스크롤 중앙 정렬.
    try { artBox.scrollIntoView({ block: "center", inline: "center" }); } catch (_) {}
  }
}

/* ----- 드래그(위치만 이동, 무대 안으로 클램프) -----
 * move/up은 window에 붙인다(포인터가 작은 그림 박스를 벗어나도 드래그가 끊기지
 * 않도록 — 앱의 runAreaCapture와 동일한 패턴). */
let _drag = null;
function wireDrag(artBox, stageW, stageH, artW, artH) {
  artBox.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    artBox.style.cursor = "grabbing";
    _drag = {
      startX: e.clientX, startY: e.clientY,
      baseLeft: parseFloat(artBox.style.left) || 0,
      baseTop: parseFloat(artBox.style.top) || 0,
      artBox, stageW, stageH, artW, artH,
    };
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragUp);
  });
}
function onDragMove(e) {
  if (!_drag) return;
  let left = _drag.baseLeft + (e.clientX - _drag.startX);
  let top = _drag.baseTop + (e.clientY - _drag.startY);
  left = Math.max(0, Math.min(left, _drag.stageW - _drag.artW));
  top = Math.max(0, Math.min(top, _drag.stageH - _drag.artH));
  _drag.artBox.style.left = left + "px";
  _drag.artBox.style.top = top + "px";
}
function onDragUp() {
  if (_drag) { _drag.artBox.style.cursor = "grab"; _drag = null; }
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragUp);
}
function endDrag() {
  _drag = null;
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragUp);
}

/* ----- 공개 진입점: 내보내기 다이얼로그의 "미리보기" 버튼이 호출 -----
 * settings = { state, dpi, options } — 현재 다이얼로그 설정을 그대로 반영한다. */
export function openExamPreview(settings) {
  if (!_overlay) buildModal();
  _lastSettings = settings;
  populateBgSelect();   // 사용자 등록 배경이 바뀌었을 수 있으니 열 때마다 갱신
  _overlay.hidden = false;
  renderStage();
}
