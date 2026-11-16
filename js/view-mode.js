import { animateModeChange } from './mode-transition.js?v=1.7.0-four-session-integration';
import { checkpointBeforeModeSwitch } from './autosave.js?v=1.7.0-four-session-integration';
import { serialize, applyLoaded } from './project-io.js?v=1.7.0-four-session-integration';
import { showModeSwitch, showAlert, showConfirm } from './ui-dialogs.js?v=1.7.0-four-session-integration';
import { previewStorage as localStorage } from './preview-storage.js?v=1.7.0-four-session-integration';
import { setActiveTool } from './tools.js?v=1.7.0-four-session-integration';
import { shortcutKey } from './platform.js?v=1.7.0-four-session-integration';
/* ===== VIEW MODE: Pro / Lite 모드 전환 =====
 *
 * 단축키를 모르면 쓰기 어려운 기능이 많아, 입문용 'Lite' 모드를 둔다.
 *   · 5E 브랜드 오른쪽에 모드 전환 버튼을 두고(누를 때마다 Pro↔Lite),
 *     글씨 색·크기는 과목별 5E(브랜드)와 같은 톤을 따른다.
 *   · Lite: 좌측 도구 버튼이 커지고 단축키를 함께 표시(CSS).
 *   · Lite에서 숨기는 기능(구조는 그대로, 보이지만 않음 — CSS display:none):
 *       과목별 오브젝트 · 퍼스널 오브젝트(+오브젝트 저장) · 전체 통일/수정 ·
 *       오브젝트 검색 · 레이어(1만 표시, 활성 레이어 1로 고정).
 *
 * 실제 숨김/확대 스타일은 css/style.css의 :root[data-mode="lite"] 규칙이 담당한다.
 * 이 모듈은 data-mode 토글·저장·버튼 라벨·도구 단축키 태깅·레이어 고정만 배선한다.
 */

const MODE_KEY = "5e.mode";
const MODES = ["pro", "lite"];
const DEFAULT_MODE = "pro";
const LITE_TOOLS = new Set(["V", "rotate", "CUT", "L", "P", "T", "LABELER"]);
const LITE_SHORTCUT_KEYS = new Set(["v", "r", "l", "p", "e", "t"]);

let _state = null;
let _btn = null;
let _savedLayerId = null; // Lite 진입 직전 activeLayerId(Pro 복귀 시 복원용)
let _switchMode = null;   // initViewMode가 채운다 — 모드 단추와 같은 전환(확인 창 포함)
let _proNotice = null;    // 「정식판에서 됩니다」 안내가 이미 떠 있으면 같은 약속을 돌려준다(겹쳐 뜨지 않게)

export const isLiteMode = () => document.documentElement.dataset.mode === "lite";

const shownSurface = id => { const el = document.getElementById(id); return !!el && !el.hidden; };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 1.7.1 B1ⓓ: Pro → Lite 전에 정식판 화면을 닫는다. 조판 창은 저장을 마친 뒤 닫히므로 잠시 기다린다.
// 닫히지 않으면(저장 확인 창에서 「계속 편집」 등) false — 전환하지 않는다.
async function closeProSurfaces() {
  window.dispatchEvent(new CustomEvent("5e:exampool-close"));
  // 조판 창은 문서를 읽거나 저장하는 중이면 닫기를 받지 않으므로 잠시 간격을 두고 다시 누른다(최대 10초).
  const until = Date.now() + 10000;
  while (shownSurface("rhwp-exam-workspace") && Date.now() < until) {
    document.querySelector('#rhwp-exam-workspace [data-exam-action="close"]')?.click();
    for (let i = 0; i < 10 && shownSurface("rhwp-exam-workspace"); i++) await sleep(100);
  }
  return !shownSurface("rhwp-exam-workspace");
}

// 1.7.1 B1(결정 1 ⓑ): Lite에서 정식판 기능으로 가는 길을 눌렀을 때 — 말없이 끝내거나 단추를 숨기지 않고
// 「정식판에서 됩니다」 안내와 Pro로 바꾸는 길을 준다(막다른 경고 금지). Pro로 바뀌면 true를 돌려주어, 부른 쪽이 하던 일을 이어 한다.
export function requirePro(what = "이 기능") {
  if (!isLiteMode()) return Promise.resolve(true);
  if (_proNotice) return _proNotice;
  _proNotice = (async () => {
    try {
      const go = await showConfirm(`${what}은(는) 정식판(Pro)에서 됩니다.\nLite는 그림 그리기와 라이브러리만 씁니다. Pro로 바꾸면 하던 일을 이어서 합니다.`,
        { title: "정식판에서 됩니다", okText: "Pro로 바꾸기", cancelText: "닫기" });
      if (!go || !_switchMode) return false;
      return (await _switchMode()) === "pro";
    } finally { _proNotice = null; }
  })();
  return _proNotice;
}
if (typeof window !== "undefined") window.fiveERequirePro = requirePro;

export function loadMode() {
  const params = new URLSearchParams(window.location.search);
  const requestedMode = params.get("mode");
  if (MODES.includes(requestedMode)) return requestedMode;
  if (/^lite(?:-|$)/i.test(params.get("local") || "")) return "lite";
  let v = DEFAULT_MODE;
  try { v = localStorage.getItem(MODE_KEY) || DEFAULT_MODE; } catch (_) { /* ignore */ }
  return MODES.includes(v) ? v : DEFAULT_MODE;
}

// 도구 버튼 title/aria-label에서 단축키(괄호 안)를 뽑아 data-sc로 태깅한다.
// '자 (드래그로 생성)'처럼 키가 아닌 괄호는 키 패턴에 안 맞아 걸러진다.
function tagShortcuts() {
  const KEY_RE = /^(?:Shift\+|Ctrl\+|Alt\+)*[A-Za-z0-9]$/;
  document.querySelectorAll("#tool-list .tool-btn").forEach((el) => {
    const label = el.getAttribute("title") || el.dataset.tip || el.getAttribute("aria-label") || "";
    const m = label.match(/\(([^)]+)\)/);
    if (m && KEY_RE.test(m[1].trim())) el.dataset.sc = m[1].trim();
  });
}

function applyMode(mode, persist = true, detail = {}) {
  const m = MODES.includes(mode) ? mode : DEFAULT_MODE;
  document.documentElement.setAttribute("data-mode", m);
  if (persist) { try { localStorage.setItem(MODE_KEY, m); } catch (_) { /* ignore */ } }
  if (_btn) {
    _btn.textContent = m === "lite" ? "Lite" : "Pro";
    _btn.setAttribute("aria-pressed", String(m === "lite"));
    _btn.classList.toggle("is-on", m === "lite"); // 채워진 알약(켜짐) 표시
  }
  const empty = document.getElementById("inspector-empty");
  if (empty) {
    empty.textContent = m === "lite"
      ? "선·꺾은선·텍스트·지시선 라벨·광학대·실험장치를 선택하면 필요한 속성만 표시됩니다."
      : "";
  }
  // Lite에서는 레이어 1만 보이므로, 활성 레이어를 1로 고정한다.
  if (m === "lite" && _state) {
    const s = _state.get();
    const resetTool = !LITE_TOOLS.has(s.activeTool);
    if (s.activeLayerId !== 1 || resetTool) {
      // Pro로 되돌아갈 때 복원할 수 있도록 강제 변경 직전 값을 저장해둔다.
      if (s.activeLayerId !== 1) _savedLayerId = s.activeLayerId;
      _state.update((st) => {
        st.activeLayerId = 1;
        if (resetTool) { st.activeTool = "V"; st.draft = null; }
        st.selectedIds = [];
        st.targetedId = null;
      });
    }
  } else if (m === "pro" && _state && _savedLayerId != null) {
    // Lite가 강제한 레이어1 고정을 되돌린다 — 저장된 레이어가 아직 존재할 때만 복원하고,
    // 사용 후엔 다음 전환에 잘못 재사용되지 않도록 반드시 비운다.
    const s = _state.get();
    const stillExists = Array.isArray(s.layers) && s.layers.some((l) => l.id === _savedLayerId);
    if (stillExists && s.activeLayerId !== _savedLayerId) {
      const restoreId = _savedLayerId;
      _state.update((st) => { st.activeLayerId = restoreId; st.selectedIds = []; st.targetedId = null; });
    }
    _savedLayerId = null;
  }
  window.dispatchEvent(new CustomEvent("5e:view-mode-change", { detail: { ...detail, mode: m } }));
  return m;
}

export function initViewMode(state, { prepareNewAiWork } = {}) {
  _state = state;
  tagShortcuts();

  const brand = document.querySelector(".app-brand");
  _btn = document.createElement("button");
  _btn.type = "button";
  _btn.id = "mode-toggle-btn";
  _btn.className = "mode-toggle-btn";
  _btn.setAttribute("aria-pressed", "false");
  _btn.title = "Pro / Lite 모드 전환 · Lite는 자주 쓰는 도구만 크게 보여줍니다";
  if (brand && brand.parentElement) brand.insertAdjacentElement("afterend", _btn);
  else document.body.appendChild(_btn);

  // 모드 바꾸기(단추·「정식판에서 됩니다」 안내의 「Pro로 바꾸기」가 같이 쓴다). 끝난 뒤의 모드를 돌려준다.
  _switchMode = async () => {
    const cur = document.documentElement.getAttribute("data-mode") || DEFAULT_MODE;
    if (_btn.disabled) return cur;
    _btn.disabled = true;
    const target = cur === 'lite' ? 'pro' : 'lite';
    try {

      const choice = await showModeSwitch(target === 'pro' ? 'Pro' : 'Lite');
      if (choice === 'cancel') return;
      // 1.7.1 B1ⓓ: Lite로 갈 때 열려 있던 정식판 화면(5E_hwp 조판·5E_exam 출제 칸)을 먼저 닫는다.
      if (target === 'lite' && !await closeProSurfaces()) {
        await showAlert('한글 시험지(5E_hwp) 창이 아직 닫히지 않았습니다. 시험지 창을 닫은 뒤 다시 Lite로 바꾸세요.', { title: 'Lite로 바꾸지 못함' });
        return;
      }
      let resetWork = () => {};
      if (choice === 'new') {
        await checkpointBeforeModeSwitch(state);
        const activateNewAiWork = await prepareNewAiWork();
        const blank = serialize(state.get());
        const id = crypto.randomUUID();
        blank.pages = [{ id, name: '페이지 1', meta: { number: '', points: '' },
          objects: [], guides: [], artboard: { w: 90, h: 60 },
          layers: [1, 2, 3].map(id => ({ id, name: `레이어 ${id}`, visible: true })) }];
        blank.activePageId = id;
        resetWork = () => {
          applyLoaded(state, blank);
          state.update(s => { s.activeTool = 'V'; s.imageEditSession = null; s.editingFormulaId = null; s.artboardResizeMode = false; });
          _savedLayerId = null;
          activateNewAiWork();
          const newAiPanel = document.getElementById('ai-image-panel');
          if (newAiPanel) newAiPanel.hidden = true;
        };
      }
      const aiWasOpen = document.getElementById('ai-image-panel')?.hidden === false;
      const preserveWork = choice === 'keep';
      const editorVisible = document.getElementById('canvas')?.getBoundingClientRect().width > 0;
      window.dispatchEvent(new CustomEvent('5e:mode-switch-start', { detail: { preserveWork } }));
      await animateModeChange(() => {
        resetWork();
        applyMode(target, true, { preserveWork, editorVisible, aiWasOpen });
      });
      const url = new URL(window.location.href);
      url.searchParams.set('mode', target);
      window.history.replaceState(window.history.state, '', url);
    } catch (error) {
      await showAlert(error.message || '작업을 보관하지 못해 전환하지 않았습니다.', { title: '모드 전환 실패' });
    } finally { _btn.disabled = false; _btn.focus(); }
    return document.documentElement.getAttribute("data-mode") || DEFAULT_MODE;
  };
  _btn.addEventListener("click", () => { void _switchMode(); });

  document.getElementById("tool-cut-merged")?.addEventListener("click", (event) => {
    if (document.documentElement.dataset.mode !== "lite") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setActiveTool("CUT");
  }, { capture: true });

  window.addEventListener("keydown", (event) => {
    if (document.documentElement.dataset.mode !== "lite") return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
    // 키 자리(KeyV…)로 읽는다 — 한글 입력 상태의 「ㅍ」도 V로(10-24, 그림 도구 단축키와 같은 규칙).
    const key = shortcutKey(event);
    if (LITE_SHORTCUT_KEYS.has(key) && !(key === "e" && (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey))) return;
    if (!/^[a-z]$/.test(key) || ((event.metaKey || event.ctrlKey || event.altKey) && key !== "e")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });

  applyMode(loadMode(), false);
}
