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

let _state = null;
let _btn = null;

function loadMode() {
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

function applyMode(mode, persist = true) {
  const m = MODES.includes(mode) ? mode : DEFAULT_MODE;
  document.documentElement.setAttribute("data-mode", m);
  if (persist) { try { localStorage.setItem(MODE_KEY, m); } catch (_) { /* ignore */ } }
  if (_btn) {
    _btn.textContent = m === "lite" ? "Lite" : "Pro";
    _btn.setAttribute("aria-pressed", String(m === "lite"));
  }
  // Lite에서는 레이어 1만 보이므로, 활성 레이어를 1로 고정한다.
  if (m === "lite" && _state) {
    const s = _state.get();
    if (s.activeLayerId !== 1) {
      _state.update((st) => { st.activeLayerId = 1; st.selectedIds = []; st.targetedId = null; });
    }
  }
  return m;
}

export function initViewMode(state) {
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

  _btn.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-mode") || DEFAULT_MODE;
    applyMode(cur === "lite" ? "pro" : "lite");
  });

  applyMode(loadMode(), false);
}
