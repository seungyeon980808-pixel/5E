/* ===== MAIN (wire modules; data-as-truth + viewBox zoom/pan) ===== */
//
// Responsibilities:
//   1. write state.viewBox onto the SVG (the only coordinate authority);
//   2. subscribe render to the store so data changes auto-repaint;
//   3. init viewport (wheel zoom / drag pan) ??it mutates viewBox via update;
//   4. init tools (tool selection + the rectangle draw pipeline).

// ?v= matches index.html so a version bump reloads every module, not just main.
import { state } from "./state.js?v=0.54.14";
import { render } from "./render.js?v=0.54.14";
import { initViewport, getZoom, screenToWorld, centerView, setCenterLocked } from "./viewport.js?v=0.54.14";
import { initTools } from "./tools.js?v=0.54.14";
import { initCutTool } from "./cut-tool.js?v=0.54.14";
import { initTransform, undo, redo } from "./transform.js?v=0.54.14";
import { initInspector } from "./inspector.js?v=0.54.14";
import { initProjectIO } from "./project-io.js?v=0.54.14";
import { initExportDialog } from "./export-dialog.js?v=0.54.14";
import { initRuler, setRulerVisible } from "./ruler.js?v=0.54.14";
import { initSettings } from "./settings.js?v=0.54.14";
import { initImageObjectify } from "./image-objectify.js?v=0.54.14";
import { initImagePaste } from "./image-paste.js?v=0.54.14";
import { initImageCutout } from "./image-cutout.js?v=0.54.14";
import { initExamLibrary } from "./exam-library.js?v=0.54.14";
import { initTemplates } from "./templates.js?v=0.54.14";
import { initObjectSearch } from "./search.js?v=0.54.14";
import { initCommandPalette } from "./command-palette.js?v=0.54.14";
import { initSubjectObjects } from "./subject-objects.js?v=0.54.14";
import { initToolHint } from "./tool-hint.js?v=0.54.14";
import { initPersonalObjects } from "./personal-objects.js?v=0.54.14";
import { initBulkEdit } from "./bulk-edit.js?v=0.54.14";
import { initDataPlot } from "./data-plot.js?v=0.54.14";
import { initGaugeSection } from "./inspector/section-gauge.js?v=0.54.14";
import { initAutosave } from "./autosave.js?v=0.54.14";
import { initPages } from "./pages.js?v=0.54.14";

const svg = document.getElementById("canvas");
const zoomReadout = document.getElementById("zoom-readout");

/* ===== APP FULLSCREEN (workspace only; artboard state remains unchanged) ===== */
(function initFullscreen() {
  const app = document.querySelector(".app");
  const btn = document.getElementById("fullscreen-toggle");
  if (!app || !btn) return;

  const syncButton = () => {
    const active = document.fullscreenElement === app;
    btn.setAttribute("aria-pressed", String(active));
    btn.setAttribute("aria-label", active ? "전체화면 해제" : "전체화면");
    btn.title = active ? "전체화면 해제 (Alt+Enter)" : "전체화면 (Alt+Enter)";
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await app.requestFullscreen();
    } catch (error) {
      console.error("Unable to toggle fullscreen", error);
    }
  };

  btn.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", syncButton);
  window.addEventListener("keydown", (e) => {
    if (!e.altKey || e.key !== "Enter" || e.repeat) return;
    e.preventDefault();
    toggleFullscreen();
  });
  syncButton();
})();

/* ===== THEME TOGGLE (dark/light; persisted in localStorage 'theme') ===== */
(function initTheme() {
  const root = document.documentElement;
  const saved = localStorage.getItem("theme");
  root.setAttribute("data-theme", saved === "light" || saved === "dark" ? saved : "dark");

  const btn = document.getElementById("theme-toggle");
  function syncIcon() {
    if (!btn) return;
    const dark = root.getAttribute("data-theme") === "dark";
    btn.setAttribute("aria-pressed", String(dark));
    btn.setAttribute("aria-label", dark ? "흑백 모드 끄기" : "흑백 모드 켜기");
    btn.title = dark ? "흑백 모드 끄기" : "흑백 모드 켜기";
  }
  syncIcon();

  if (btn) {
    btn.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
      syncIcon();
    });
  }
})();

/* ----- projection of viewBox onto the SVG element ----- */
function applyViewBox(s) {
  const { x, y, w, h } = s.viewBox;
  svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
  if (zoomReadout) zoomReadout.textContent = `zoom ${getZoom().toFixed(2)}×`;
}

/* ----- subscribe: every state.update() repaints + re-projects viewBox ----- */
// render runs automatically on data change (data-as-truth, DESIGN 1-1).
state.subscribe(render);
state.subscribe(applyViewBox);

/* ----- viewport: zoom/pan mutate viewBox through the store ----- */
// onChange is intentionally a no-op: initViewport mutates viewBox via
// state.update(), which already fires the applyViewBox + render subscribers.
initViewport(svg, state, () => {});

/* zoom readout is derived from the SVG's on-screen width, which is 0 until the
   3-panel grid finishes its first layout pass. The last applyViewBox at init
   therefore burns in a stale "0.00×"; refresh once the box has real width so the
   readout shows the true fit-zoom. */
requestAnimationFrame(function refreshZoomReadout() {
  if (svg.getBoundingClientRect().width === 0) {
    requestAnimationFrame(refreshZoomReadout);
    return;
  }
  applyViewBox(state.get());
});

/* ----- tools: V/R selection + rectangle drawing (mouse ??store.update) ----- */
initTools(svg, state);

/* ----- cut tool: 생성 후 캔버스에서 객체 자르기(가위/칼/올가미) ----- */
initCutTool(svg, state);

/* ----- transform: body-drag move + Undo/Redo (must come after initTools) ----- */
initTransform(svg, state);

/* ----- inspector: right-panel controls wired to selected object ----- */
initInspector(state);

/* ----- 자·각도기(gauge) 전용 인스펙터 섹션(자체 구독형; initInspector 뒤에 마운트) ----- */
initGaugeSection(state);

/* ===== UNDO / REDO TOP-BAR BUTTONS (icon-only; left of 파일) ===== */
(function initUndoRedoButtons() {
  const undoBtn = document.getElementById("undo-btn");
  const redoBtn = document.getElementById("redo-btn");
  if (!undoBtn || !redoBtn) return;
  undoBtn.addEventListener("click", () => undo(state));
  redoBtn.addEventListener("click", () => redo(state));
  // Reflect availability on every state change (history changes via update()).
  function syncUndoRedo(s) {
    undoBtn.disabled = (s.undoStack || []).length === 0;
    redoBtn.disabled = (s.redoStack || []).length === 0;
  }
  state.subscribe(syncUndoRedo);
  syncUndoRedo(state.get());
})();

/* ----- project I/O: top-bar 저장/불러오기 buttons (editable JSON source) ----- */
initProjectIO(state, svg);

/* ----- 다중 페이지: 하단 탭 바(추가/복제/이름변경/순서/삭제) + 스왑 전환 ----- */
initPages(state);

/* ----- autosave: 2.5초 디바운스로 IndexedDB에 자동 저장 + 부팅 시 크래시 복구 -----
 * pages[] 채운 뒤에 초기화해야 첫 저장부터 유효한 다중 페이지 스냅샷이 된다. */
initAutosave(state);

/* ----- export dialog: 파일 dropdown → 내보내기/미리보기 (PNG/SVG) ----- */
initExportDialog(state, svg);

/* ----- rulers: top + left ruler canvases synced to viewport ----- */
initRuler(svg, state);

/* ----- settings: 설정 dropdown + 기본값 설정 modal (persists to localStorage) ----- */
initSettings(state);

/* ----- advanced: local image-to-line rough draft extraction ----- */
initImageObjectify(state);

/* ----- clipboard image paste: Ctrl+V → normal image object ----- */
initImagePaste(state, svg);

/* ----- exam library: 기출 문항 검색 → 이미지 삽입/객체 변환 (지연 로딩) ----- */
initExamLibrary(state);

/* ----- image cutout editing: edit-mode image 오려내기 (사각형/자유 영역 지우기) ----- */
initImageCutout(state, svg);

/* ----- template library: 기호 패널 클릭 → 캔버스에 심볼 instantiate ----- */
initTemplates(svg);

/* ----- object search: Ctrl+F registry search + existing creation paths ----- */
initObjectSearch();

/* ----- command palette: Ctrl+K 통합 실행기(명령 + 오브젝트 검색) ----- */
initCommandPalette();

/* ----- 과목별 오브젝트: 과목 선택 + 파트 아코디언 + 과목별 강조색 테마 ----- */
initSubjectObjects();

/* ----- 도구별 하단 안내(자르기 패턴 일반화 공용 슬롯) ----- */
initToolHint(state);

/* ----- 퍼스널 오브젝트: 선택 저장 → 좌측 라이브러리/검색에서 재사용 ----- */
initPersonalObjects(state);

/* ----- 전체 수정: 선택(없으면 전체) 오브젝트 속성 일괄 통일/증감 ----- */
initBulkEdit(state);

/* ----- 데이터 표 → 산점도: x·y 표 붙여넣기 → 좌표평면 위 점 + 연결선 ----- */
initDataPlot();

/* ===== TOOL PANEL: collapsible section toggle (event delegation) ===== */
(function initToolSections() {
  const panel = document.getElementById("tool-list");
  if (!panel) return;
  panel.addEventListener("click", (e) => {
    const header = e.target.closest(".tool-section-header");
    if (!header) return;
    header.closest(".tool-section").classList.toggle("is-collapsed");
  });
})();

/* ===== GRID CONTROLS (canvas bottom bar) ===== */
(function initGridControls() {
  const gridBtn  = document.getElementById("grid-btn");
  const detail   = document.getElementById("grid-detail");
  const slider   = document.getElementById("grid-opacity");
  const interval = document.getElementById("grid-interval");
  const centerBtn = document.getElementById("center-view-btn");
  if (!gridBtn || !slider) return;
  // 격자 = 토글 버튼: 켰을 때만 진하기/간격 세부 컨트롤 표시
  const syncGridBtn = (on) => {
    gridBtn.classList.toggle("is-active", on);
    gridBtn.setAttribute("aria-pressed", String(on));
    if (detail) detail.hidden = !on;
  };
  gridBtn.addEventListener("click", () => {
    const on = !state.get().grid.visible;
    state.update((s) => { s.grid.visible = on; });
    syncGridBtn(on);
  });
  syncGridBtn(!!state.get().grid.visible);
  slider.addEventListener("input", () => {
    state.update((s) => { s.grid.opacity = Number(slider.value); });
  });
  if (interval) {
    interval.addEventListener("input", () => {
      state.update((s) => { s.grid.interval = Number(interval.value); });
    });
  }
  if (centerBtn) {
    centerBtn.addEventListener("click", () => {
      const locked = centerBtn.classList.toggle("is-active");
      setCenterLocked(locked);
      centerBtn.style.background = locked ? "var(--c-main)" : "";
      centerBtn.style.color = locked ? "#fff" : "";
      if (locked) centerView(state);
    });
  }
  // 눈금자는 항상 켜짐(토글 UI 제거) — 명시적으로 한 번 켜 둔다.
  setRulerVisible(true);
})();

/* ----- initial paint ----- */
applyViewBox(state.get());
render(state.get());

// 수식 글꼴(Latin Modern)은 웹폰트라, 로딩 전에는 폴백 메트릭으로 글자 폭이 측정된다.
// formula.js는 canvas measureText로 레이아웃을 잡으므로(export 픽셀 일치 보증), 정자·
// 이탤릭 두 페이스를 시작 시 "명시적으로" 미리 로드한 뒤 1회 다시 그려 측정값과 실제
// 렌더를 일치시킨다. lazy 로딩(빈 캔버스엔 수식이 없어 다운로드가 안 됨)에 기대면 첫
// 수식이 폴백 폭으로 측정되므로, ready가 아니라 load로 강제해야 한다.
if (document.fonts && document.fonts.load) {
  Promise.all([
    document.fonts.load('16px "Latin Modern Roman"'),
    document.fonts.load('italic 16px "Latin Modern Roman"'),
  ]).then(() => render(state.get())).catch(() => {});
}

/* ===== DEV DEBUG GATE =====
 * Dev-only: flip to true LOCALLY to expose window.phyDraw, the coord-debug
 * overlay (key "d"), and the console usage banner below. Must be false for
 * shipped builds — same gating convention as _TEXT_STYLE_DEBUG in
 * text-editor.js. Previously these ran unconditionally (reachable by any end
 * user pressing "d"); Day 5 QA gated them behind this flag. */
const _APP_DEBUG_ENABLED = false;

if (_APP_DEBUG_ENABLED) {
  /* ----- DEBUG HANDLE (console verification) ----- */
  // Inspect the live data: `phyDraw.objects()` lists committed shapes.
  window.phyDraw = {
    state,
    objects: () => state.get().objects,
    selected: () => state.get().objects.find((o) => o.id === state.get().selectedId) || null,
    zoom: getZoom,
  };

  /* ----- COORD DEBUG OVERLAY (press Shift+D to toggle) -----
   * Proves pointer?뭮orld mapping live. Compares the app's screenToWorld with a
   * fresh getScreenCTM round-trip; "?screen" is how far the mapped point lands
   * from the real pointer pixel ??must read ~0 at any zoom/pan.
   * NOTE: moved from bare "d" to Shift+D so the new 자유 그리기(D) tool shortcut
   * (tools.js setupKeyboard) owns the bare "d" key without toggling this dev overlay. */
  (function initCoordDebug() {
    const box = document.createElement("div");
    box.id = "coord-debug";
    box.style.cssText =
      "position:fixed;left:8px;bottom:8px;z-index:9999;display:none;" +
      "font:11px/1.45 'IBM Plex Mono',monospace;white-space:pre;" +
      "background:rgba(13,17,23,.88);color:#7ee787;padding:8px 10px;" +
      "border-radius:6px;pointer-events:none;max-width:46ch;";
    document.body.appendChild(box);

    window.addEventListener("keydown", (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key.toLowerCase() === "d" && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        box.style.display = box.style.display === "none" ? "block" : "none";
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (box.style.display === "none") return;
      const vb = state.get().viewBox;
      const r = svg.getBoundingClientRect();
      const w = screenToWorld(svg, vb, e.clientX, e.clientY); // app's single helper
      // independent round-trip: world ??back to screen via the SAME CTM
      const m = svg.getScreenCTM();
      const back = { x: m.a * w.x + m.c * w.y + m.e, y: m.b * w.x + m.d * w.y + m.f };
      const f = (n) => n.toFixed(2);
      box.textContent =
        `client   ${f(e.clientX)}, ${f(e.clientY)}\n` +
        `svg rect ${f(r.left)},${f(r.top)}  ${f(r.width)}횞${f(r.height)}  ar=${f(r.width / r.height)}\n` +
        `viewBox  ${f(vb.x)},${f(vb.y)}  ${f(vb.w)}횞${f(vb.h)}  ar=${f(vb.w / vb.h)}\n` +
        `world    ${f(w.x)}, ${f(w.y)}\n` +
        `?screen  ${f(back.x - e.clientX)}, ${f(back.y - e.clientY)}  (should be ~0)`;
    });
  })();

  console.info(
    "[시범공개] [5E v0.53.0] Press S (or click the toolbar button) to arm the\n" +
      "rectangle tool, then drag on the canvas to draw. Press 'd' to toggle the\n" +
      "live coord-debug overlay (pointer?봶orld mapping). Verify with:\n" +
      "  phyDraw.objects()        // array of committed shape objects\n" +
      "  phyDraw.state.get().activeTool   // 'V' after each draw (auto-return)\n" +
      "Wheel = zoom, Space/middle-drag = pan ??shapes stay anchored in world space."
  );
}
