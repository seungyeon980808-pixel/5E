/* ===== PROJECT I/O (save / open editable 5E project source) ===== */
//
// This is the *editable source* format — the data needed to reconstruct the
// drawing — and is separate from image export (built later). We serialize only
// the persistent drawing data; transient session state (undo/redo, selection,
// active tool/layer, viewBox) is deliberately NOT saved.
//
// Groups are NOT stored: each object already carries `groupId`, and groups are
// derived from it everywhere (see transform.js rebuildGroups + the undo engine,
// which snapshots only `objects` and rebuilds groups). groupId is the single
// source of truth, so we rebuild groups on load via that same helper.

import { screenToWorld } from "./viewport.js?v=1.4.0";
import { applyNewObjectStyleDefaults } from "./style-mode.js?v=1.4.0";
import { downscaleIfNeeded } from "./image-paste.js?v=1.4.0";
import { insertImageFromSrc } from "./image-paste.js?v=1.4.0";
import { addPage } from "./pages.js?v=1.4.0";
import { applyLoadedState, migrate, serialize } from "./project-format.js?v=1.4.0";
import { openProject, saveProject } from "./project-file-access.js?v=1.4.0";

export { migrate, serialize };

// The .5e container is UTF-8 JSON so project files stay inspectable and old
// .json saves remain readable. Only the user-facing extension changes.
const DEFAULT_FILENAME = "physics_drawing.5e";
const PROJECT_FILE_ACCEPT = ".5e,.json,application/json";
const PROJECT_FILE_TYPES = [{ description: "5E 프로젝트 파일", accept: { "application/json": [".5e"] } }];

/* ----- applyLoaded: replace drawing data through the store (re-renders) ----- */
// data.pages[] is guaranteed by migrate(). The active page's 4 fields are lifted
// to the top level (the live drawing), the rest stay in s.pages — the same swap
// structure pages.js maintains, so render/pick/etc. read the active page as before.
export function applyLoaded(state, data) {
  // 이미지 배치 대기 상태(_placement)가 남아있으면 정리한다 — 프로젝트를 새로
  // 불러와 objects가 통째로 교체되는데 대기 중이던 placeholder id를 계속 들고
  // 있으면 이후 클릭/Escape 처리가 존재하지 않는 오브젝트를 참조하게 된다.
  if (_placement) {
    _placement = null;
    if (_placementHint) _placementHint.hidden = true;
  }
  applyLoadedState(state, data);
}

/* ----- image import: file-picker + drag-and-drop helper ----- */
let _imgIdCounter = 0;
let _placement = null;
let _placementHint = null;

function finishImagePlacement(state) {
  if (!_placement) return;
  _placement = null;
  if (_placementHint) _placementHint.hidden = true;
  state.update((s) => { s.activeTool = "V"; });
}

function cancelImagePlacement(state) {
  if (!_placement) return;
  const { objectId } = _placement;
  _placement = null;
  if (_placementHint) _placementHint.hidden = true;
  state.update((s) => {
    s.objects = s.objects.filter((o) => o.id !== objectId);
    s.selectedIds = (s.selectedIds || []).filter((id) => id !== objectId);
    s.targetedId = null;
    s.activeTool = "V";
  });
}

function beginImagePlacement(state, objectId) {
  finishImagePlacement(state);
  _placement = { objectId };
  if (_placementHint) _placementHint.hidden = false;
}

function readImageFile(file, dropPos, state) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const rawSrc = e.target.result;
    const img = new Image();
    img.onload = async () => {
      const { w: artboardW, h: artboardH } = state.get().artboard;
      const scale = Math.min(
        (artboardW * 0.9) / img.naturalWidth,
        (artboardH * 0.9) / img.naturalHeight
      );
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      const center = dropPos || { x: 0, y: 0 };
      const minX = -artboardW / 2;
      const minY = -artboardH / 2;
      const x = Math.min(Math.max(center.x - w / 2, minX), artboardW / 2 - w);
      const y = Math.min(Math.max(center.y - h / 2, minY), artboardH / 2 - h);
      // 붙여넣기(Ctrl+V) 경로는 고해상도 원본을 downscaleIfNeeded로 축소해 저장하는데,
      // 드래그앤드롭만 이 처리가 없어 스마트폰 사진 같은 고해상도 원본이 그대로 저장돼
      // 프로젝트 파일·자동저장 스냅샷을 수십 MB로 부풀렸다 — 같은 축소를 적용한다.
      // 캔버스 위 표시 크기(w/h, 위 스케일)는 원본 픽셀 수와 무관해 변하지 않는다.
      const { src } = await downscaleIfNeeded(rawSrc, { w: img.naturalWidth, h: img.naturalHeight });
      let objectId;
      state.update((s) => {
        // 이미지 삽입을 undo 스택에 기록(예전엔 누락돼 Ctrl+Z가 삽입 이전의 다른 작업까지
        // 한꺼번에 되돌렸음 — 클립보드 붙여넣기 경로와 동일하게 스냅샷 push + redo clear).
        const snap = JSON.parse(JSON.stringify(s.objects));
        const newObj = applyNewObjectStyleDefaults({
          id: `obj_${Date.now().toString(36)}_img${++_imgIdCounter}`,
          type: "image",
          src,
          x,
          y,
          w,
          h,
          rotation: 0,
          mode: "edit",
          opacity: 1,
          aspectLocked: true,
          exportable: true,
          cutouts: [],
          locked: false,
          positionLocked: false,
          imageSelectionLocked: false,
          layerId: s.activeLayerId,
          order: s.objects.length,
        });
        objectId = newObj.id;
        s.objects.push(newObj);
        s.undoStack.push(snap);
        s.redoStack = [];
        s.selectedIds = [newObj.id];
        s.targetedId = null;
        s.activeTool = "V";
      });
      beginImagePlacement(state, objectId);
    };
    img.src = rawSrc;
  };
  reader.readAsDataURL(file);
}

/* ----- initProjectIO: wire the top-bar buttons + hidden file input ----- */
export function initProjectIO(state, svg) {
  const saveBtn = document.getElementById("project-save");
  const openBtn = document.getElementById("project-open");
  const imageImportBtn = document.getElementById("image-import");

  _placementHint = document.createElement("div");
  _placementHint.className = "image-placement-hint";
  _placementHint.textContent = "원하는 크기로 조정이 완료되면 Enter를 눌러주세요.";
  _placementHint.hidden = true;
  const canvasWrap = svg && svg.closest(".canvas-wrap");
  if (canvasWrap) canvasWrap.appendChild(_placementHint);

  window.addEventListener("keydown", (e) => {
    if (!_placement || (e.key !== "Enter" && e.key !== "Escape")) return;
    // 캡처 단계+stopImmediatePropagation이라 조건이 _placement뿐이면 포커스가 어디 있든
    // 가로챈다 — 이미지 배치 확정 대기 중에 페이지 이름 변경/수식 편집기 같은 다른 입력이
    // 열려 있으면 그 다이얼로그의 Enter/Escape가 아예 도달하지 못하고 대신 이미지가
    // 확정/삭제된다. 다른 곳(tools.js 등)과 같은 INPUT/TEXTAREA/contentEditable 가드로,
    // 실제로 다른 입력에 포커스가 가 있을 때는 그쪽 처리를 우선시킨다.
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === "Escape") cancelImagePlacement(state);
    else finishImagePlacement(state);
  }, true);

  // Hidden file input for 5E projects. Legacy .json files remain supported.
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = PROJECT_FILE_ACCEPT;
  fileInput.style.display = "none";
  document.body.appendChild(fileInput);

  if (saveBtn) saveBtn.addEventListener("click", () => saveProject(state, DEFAULT_FILENAME, PROJECT_FILE_TYPES));

  if (openBtn) openBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) openProject(state, file, applyLoaded);
    // Reset so selecting the same file again still fires "change".
    fileInput.value = "";
  });

  // ===== 이미지 불러오기: 다중 파일 + '한 페이지에 넣기' / '페이지별로 넣기' =====
  // 클릭 시 우측 서브메뉴에서 배치 방식을 고른다. 배치는 비대화형 자동 배치
  // (아트보드 원점 기준 fit). '한 페이지'는 겹침 방지용 카스케이드 오프셋.
  const imageInput = document.createElement("input");
  imageInput.type = "file";
  imageInput.accept = "image/png,image/jpeg";
  imageInput.multiple = true;
  imageInput.style.display = "none";
  document.body.appendChild(imageInput);

  let importMode = "single-page"; // 'single-page' | 'per-page'

  const fileToDataURL = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("read fail"));
      r.readAsDataURL(file);
    });

  // 모든 이미지를 현재 페이지에 (겹치지 않게 살짝 카스케이드)
  async function importOnePage(files) {
    const OFF = 4; // mm
    let i = 0;
    for (const file of files) {
      try {
        const src = await fileToDataURL(file);
        await insertImageFromSrc(state, src, { at: { x: 0, y: 0 }, offset: { dx: i * OFF, dy: i * OFF } });
      } catch (_) { /* 디코드 실패 파일은 건너뜀 */ }
      i++;
    }
  }

  // 이미지마다 새 페이지 (현재 페이지가 비어 있으면 첫 장은 현재 페이지 재사용)
  async function importPerPage(files) {
    const startEmpty = (state.get().objects || []).length === 0;
    let i = 0;
    for (const file of files) {
      try {
        const src = await fileToDataURL(file);
        if (!(i === 0 && startEmpty)) addPage(state);
        await insertImageFromSrc(state, src, { at: { x: 0, y: 0 } });
      } catch (_) { /* 디코드 실패 파일은 건너뜀 */ }
      i++;
    }
  }

  imageInput.addEventListener("change", async () => {
    const files = Array.from(imageInput.files || []);
    imageInput.value = "";
    if (!files.length) return;
    if (importMode === "per-page") await importPerPage(files);
    else await importOnePage(files);
  });

  // 파일 메뉴 리스트 안, 우측 플라이아웃 서브메뉴
  if (imageImportBtn) {
    const fileMenuList = imageImportBtn.closest(".file-menu-list");
    const submenu = document.createElement("div");
    submenu.className = "file-submenu";
    submenu.hidden = true;
    submenu.innerHTML =
      '<button type="button" class="file-menu-item file-submenu-item" data-mode="single-page">' +
        '<span class="fsi-title">한 페이지에 넣기</span>' +
        '<span class="fsi-desc">고른 이미지를 모두 지금 페이지에 배치합니다. 겹치지 않게 조금씩 어긋나게 놓입니다.</span>' +
      '</button>' +
      '<button type="button" class="file-menu-item file-submenu-item" data-mode="per-page">' +
        '<span class="fsi-title">페이지별로 넣기</span>' +
        '<span class="fsi-desc">이미지 한 장마다 새 페이지를 만들어 하나씩 배치합니다.</span>' +
      '</button>';
    (fileMenuList || imageImportBtn.parentElement).appendChild(submenu);

    const closeSub = () => {
      submenu.hidden = true;
      imageImportBtn.setAttribute("aria-expanded", "false");
    };

    imageImportBtn.addEventListener("click", (e) => {
      // top-menu의 '리스트 클릭=닫기'/outside-click 로 상단 메뉴가 닫히지 않도록 차단
      e.stopPropagation();
      const willOpen = submenu.hidden;
      submenu.hidden = !willOpen;
      imageImportBtn.setAttribute("aria-expanded", String(willOpen));
    });

    submenu.addEventListener("click", (e) => {
      const b = e.target.closest("[data-mode]");
      if (!b) return;
      importMode = b.dataset.mode;
      closeSub();
      imageInput.click(); // 이 클릭은 버블 → 파일 메뉴가 닫힌다
    });

    // 파일 메뉴 버튼을 다시 누르면 서브메뉴 상태 초기화
    const fileBtn = document.getElementById("file-menu-btn");
    if (fileBtn) fileBtn.addEventListener("click", closeSub);
  }

  // Drag-and-drop image import on the canvas.
  if (svg) {
    svg.addEventListener("dragover", (e) => e.preventDefault());
    svg.addEventListener("drop", (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      // 5E 프로젝트 파일과 기존 JSON 프로젝트 파일도 드래그앤드랍 지원.
      // 일부 OS에서 사용자 정의 확장자의 MIME이 비어 있으므로 확장자도 함께 본다.
      if (file.type === "application/json" || /\.(?:5e|json)$/i.test(file.name)) {
        openProject(state, file, applyLoaded);
        return;
      }
      if (!file.type.startsWith("image/")) return;
      const vb = state.get().viewBox;
      const pos = screenToWorld(svg, vb, e.clientX, e.clientY);
      readImageFile(file, pos, state);
    });
  }
}
