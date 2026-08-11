/* ===== MAIN (wire modules; data-as-truth + viewBox zoom/pan) ===== */
//
// Responsibilities:
//   1. write state.viewBox onto the SVG (the only coordinate authority);
//   2. subscribe render to the store so data changes auto-repaint;
//   3. init viewport (wheel zoom / drag pan) ??it mutates viewBox via update;
//   4. init tools (tool selection + the rectangle draw pipeline).

// ?v= matches index.html so a version bump reloads every module, not just main.
import { state } from "./state.js?v=1.4.0";
import { render } from "./render.js?v=1.4.3";
import { initViewport, getZoom, screenToWorld, centerView, setCenterLocked } from "./viewport.js?v=1.4.0";
import { initTools } from "./tools.js?v=1.4.0";
import { initCutTool } from "./cut-tool.js?v=1.4.2";
import { initEraseTool } from "./erase-tool.js?v=1.4.0";
import { initTransform, undo, redo } from "./transform.js?v=1.4.2";
import { initArtboardResize } from "./artboard-resize.js?v=1.4.3";
import { initInspector } from "./inspector.js?v=1.4.3";
import { initProjectIO } from "./project-io.js?v=1.4.0";
import { initExportDialog } from "./export-dialog.js?v=1.4.11";
import { initRuler, setRulerVisible } from "./ruler.js?v=1.4.0";
import { initSettings } from "./settings.js?v=1.4.0";
import { initImageObjectify } from "./image-objectify.js?v=1.4.0";
import { initImagePaste } from "./image-paste.js?v=1.4.0";
import { initImageCutout } from "./image-cutout.js?v=1.4.0";
import { initExamLibrary } from "./exam-library.js?v=1.4.12";
// 이미지 라이브러리 [베타] — 퍼블릭 도메인 도해를 선화·원본으로 넣는 창. 기출 라이브러리와 같은
// 성능 규약(앱 시작 로드 0, 첫 열 때 manifest 1회)으로 만들었다.
import { initPartsLibrary } from "./parts-library.js?v=1.4.12";
import { initTemplates } from "./templates.js?v=1.4.0";
import { initObjectSearch } from "./search.js?v=1.4.0";
import { initCommandPalette } from "./command-palette.js?v=1.4.0";
import { initSubjectObjects } from "./subject-objects.js?v=1.4.0";
import { initToolHint } from "./tool-hint.js?v=1.4.0";
import { initTooltips } from "./tooltip.js?v=1.4.0";
import { initViewMode } from "./view-mode.js?v=1.4.0";
import { initPersonalObjects } from "./personal-objects.js?v=1.4.0";
import { initBulkEdit } from "./bulk-edit.js?v=1.4.0";
import { initDataPlot } from "./data-plot.js?v=1.4.0";
import { initGaugeSection } from "./inspector/section-gauge.js?v=1.4.0";
import { initSolid3dSection } from "./inspector/section-solid3d.js?v=1.4.0";
import { initParabolaSection } from "./inspector/section-parabola.js?v=1.4.0";
import { initGroundArcSection } from "./inspector/section-groundarc.js?v=1.4.0";
// 생명과학 부품 6종 (2026-07-31) — 규격은 docs/BIO_PARTS_SPEC.md
import { initBraceSection } from "./inspector/section-brace.js?v=1.4.0";
import { initChromosomeSection } from "./inspector/section-chromosome.js?v=1.4.0";
import { initBilayerSection } from "./inspector/section-bilayer.js?v=1.4.0";
import { initNeuronSection } from "./inspector/section-neuron.js?v=1.4.0";
import { initLegendSection } from "./inspector/section-legend.js?v=1.4.0";
import { initPedigreeSection } from "./inspector/section-pedigree.js?v=1.4.0";
// 화학 부품 10종 (2026-07-31) — 규격은 docs/CHEM_PARTS_SPEC.md
import { initVesselSection } from "./inspector/section-vessel.js?v=1.4.0";
import { initChemModelSection } from "./inspector/section-chemmodel.js?v=1.4.0";
import { initParticleBoxSection } from "./inspector/section-particlebox.js?v=1.4.0";
import { initOrbitalSection } from "./inspector/section-orbital.js?v=1.4.0";
import { initBondGroupSection } from "./inspector/section-bondgroup.js?v=1.4.0";
import { initChemChartSection } from "./inspector/section-chemchart.js?v=1.4.0";
import { initAxisBreakSection } from "./inspector/section-axisbreak.js?v=1.4.0";
import { initChemGraphSection } from "./inspector/section-chemgraph.js?v=1.4.0";
import { initElectrodeSection } from "./inspector/section-electrode.js?v=1.4.0";
import { initPeriodicSection } from "./inspector/section-periodic.js?v=1.4.0";
import { initAutosave } from "./autosave.js?v=1.4.0";
import { initPages } from "./pages.js?v=1.4.0";
import { localizeShortcutLabels } from "./platform.js?v=1.4.0";
import { initModalDrag } from "./modal-drag.js?v=1.4.0";
import { initSteppers } from "./stepper.js?v=1.4.0";
import { initReferenceWindows } from "./reference-window.js?v=1.4.0";
import { initTutorial } from "./tutorial.js?v=1.5.2";
import { initAiInstallGuide } from "./ai-install-guide.js?v=1.4.11";
import { initAiPanel } from "./ai-panel.js?v=1.5.6";

const svg = document.getElementById("canvas");
const zoomReadout = document.getElementById("zoom-readout");

/* ===== APP FULLSCREEN (workspace only; artboard state remains unchanged) ===== */
(function initFullscreen() {
  const btn = document.getElementById("fullscreen-toggle");
  if (!btn) return;

  // 전체화면 대상은 .app이 아니라 "문서 전체"(documentElement)여야 한다.
  // 모든 모달·오버레이·컨텍스트 메뉴는 document.body에 append되는데, .app만
  // 전체화면으로 만들면 이 위젯들이 전체화면 요소(top layer) 뒤에 깔려 안 보인다
  // (z-index로도 못 이긴다). 문서 전체를 전체화면으로 하면 body의 위젯이 전부
  // 전체화면 안에 포함돼 정상적으로 뜬다.
  const target = document.documentElement;

  const syncButton = () => {
    const active = document.fullscreenElement === target;
    btn.setAttribute("aria-pressed", String(active));
    btn.setAttribute("aria-label", active ? "전체화면 해제" : "전체화면");
    btn.title = active ? "전체화면 해제 (Alt+Enter)" : "전체화면 (Alt+Enter)";
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await target.requestFullscreen();
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

/* ----- erase tool: 올가미로 이미지·SVG자산에 진짜 투명 구멍 뚫기(지우개) ----- */
initEraseTool(state, svg);

/* ----- transform: body-drag move + Undo/Redo (must come after initTools) ----- */
initTransform(svg, state);

/* ----- artboard 영역 지정: 드래그한 사각형을 새 페이지 영역으로 적용 ----- */
initArtboardResize(svg, state);

/* ----- inspector: right-panel controls wired to selected object ----- */
initInspector(state);

/* ----- 자·각도기(gauge) 전용 인스펙터 섹션(자체 구독형; initInspector 뒤에 마운트) ----- */
initGaugeSection(state);

/* ----- 입체(solid3d) 전용 인스펙터 섹션(자체 구독형; initInspector 뒤에 마운트) ----- */
initSolid3dSection(state);

/* ----- 포물선 궤적 전용 인스펙터 섹션(자체 구독형) ----- */
initParabolaSection(state);

/* ----- 수평면 위 원호 전용 인스펙터 섹션(자체 구독형) ----- */
initGroundArcSection(state);

/* ----- 생명과학 부품 전용 인스펙터 섹션(전부 자체 구독형) ----- */
initBraceSection(state);
initChromosomeSection(state);
initBilayerSection(state);
initNeuronSection(state);
initLegendSection(state);
initPedigreeSection(state);
initVesselSection(state);
initChemModelSection(state);
initParticleBoxSection(state);
initOrbitalSection(state);
initBondGroupSection(state);
initChemChartSection(state);
initAxisBreakSection(state);
initChemGraphSection(state);
initElectrodeSection(state);
initPeriodicSection(state);

/* ===== UNDO / REDO TOP-BAR BUTTONS (icon-only; left of 파일) ===== */
(function initUndoRedoButtons() {
  const undoBtn = document.getElementById("undo-btn");
  const redoBtn = document.getElementById("redo-btn");
  if (!undoBtn || !redoBtn) return;
  // mousedown 시 기본 포커스 이동(blur)을 막는다 → 텍스트/수식 편집 중 버튼을 눌러도
  // 편집 중이던 입력이 blur로 커밋된 직후 그 스냅샷을 undo가 되돌려 입력이 증발하는
  // 문제를 방지(편집기가 포커스를 유지한 채 실행취소가 동작).
  undoBtn.addEventListener("mousedown", (e) => e.preventDefault());
  redoBtn.addEventListener("mousedown", (e) => e.preventDefault());
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
const aiPanel = initAiPanel(state);
initAiInstallGuide({ openDesktopPanel: () => aiPanel?.open() });

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
const openAiWithReference = (options) => aiPanel?.open(options);
initExamLibrary(state, { openAi: openAiWithReference });
initPartsLibrary(state, { openAi: openAiWithReference });

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

/* ----- 커스텀 툴팁: 네이티브 title 을 앱 톤 툴팁으로 대체 ----- */
initTooltips();

/* ----- Pro/Lite 모드: 5E 옆 전환 버튼 + Lite 간소화(도구 확대·기능 숨김) ----- */
initViewMode(state);

/* ----- Mac 표기 정리: 화면에 박힌 "Ctrl"을 ⌘로 바꾼다(Windows에선 무동작) -----
   UI가 다 만들어진 뒤 한 번만 훑는다. 이후 동적으로 생기는 문구는 각자 keyLabel()을 쓴다. */
localizeShortcutLabels();

/* ----- 모든 모달에 좌상단 드래그 손잡이 부착(이후 생기는 모달도 자동) ----- */
initModalDrag();

/* ----- .gm-step ▲▼ 스테퍼 (어느 화면에 놓이든 동작) ----- */
initSteppers();

/* ----- 참고 문항 창(별도 브라우저 창) — 최소화 칩 막대 준비 ----- */
initReferenceWindows(state);

/* ----- 따라하기: 상단바 단추 + 첫 방문 제안 배너 -----
   페이지(연습용 페이지 생성)와 view-mode(Pro 전환) 배선이 끝난 뒤에 켠다. */
initTutorial();

/* ----- 브라우저 기본 확대/축소 차단(Ctrl+휠, Ctrl +/−/0) -----
   앱은 자체 캔버스 줌 + 환경 설정(화면 크기)을 쓰므로, 브라우저 전체 확대로
   레이아웃이 깨지지 않게 막는다. 캔버스 위 Ctrl+휠(도형 줌)은 그대로 동작. */
// Mac은 ⌘+휠로도 브라우저 확대가 되고, 트랙패드 핀치는 ctrlKey=true인 휠로 온다 — 둘 다 막는다.
window.addEventListener("wheel", (e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false });
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0"].includes(e.key)) e.preventDefault();
});

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
      // 음수/0/빈값이 렌더러로 들어가면 격자 루프가 무한 반복해 탭이 멈춘다 → 하한 1로 클램프.
      state.update((s) => { s.grid.interval = Math.max(1, Number(interval.value) || 10); });
    });
  }
  if (centerBtn) {
    // 스타일은 CSS(.is-active = 과목 강조색)에 위임 — 인라인 하드코딩 제거
    const applyCenterLock = (locked) => {
      centerBtn.classList.toggle("is-active", locked);
      centerBtn.setAttribute("aria-pressed", String(locked));
      setCenterLocked(locked);
      if (locked) centerView(state); // state.update → applyViewBox+render 구독자 자동 호출
    };
    centerBtn.addEventListener("click", () => {
      applyCenterLock(!centerBtn.classList.contains("is-active"));
    });
    // 단축키: Ctrl+Space = 중앙 고정 토글 (텍스트 입력 중에는 무시).
    // 캡처 단계로 등록해 다른 핸들러의 stopPropagation 영향을 받지 않게 한다.
    // 참고: Windows에서 Ctrl+Space가 '입력 방법 전환' OS 단축키로 예약돼 있으면
    //       브라우저에 이벤트가 도달하지 않을 수 있다(그 경우 Windows 키보드 설정에서 해제).
    document.addEventListener("keydown", (e) => {
      if (e.code !== "Space" || !(e.ctrlKey || e.metaKey)) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      applyCenterLock(!centerBtn.classList.contains("is-active"));
    }, true);
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
      "font: 11px/1.45 'IBM Plex Mono',monospace;white-space:pre;" +
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
    "[시범공개] [5E v1.5.0] Press S (or click the toolbar button) to arm the\n" +
      "rectangle tool, then drag on the canvas to draw. Press 'd' to toggle the\n" +
      "live coord-debug overlay (pointer?봶orld mapping). Verify with:\n" +
      "  phyDraw.objects()        // array of committed shape objects\n" +
      "  phyDraw.state.get().activeTool   // 'V' after each draw (auto-return)\n" +
      "Wheel = zoom, Space/middle-drag = pan ??shapes stay anchored in world space."
  );
}
