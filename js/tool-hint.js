/* ===== TOOL HINT: 캔버스 하단 바에 뜨는 도구별 한 줄 안내 =====
 *
 * 자르기 도구의 하단 안내 패턴을 전 도구로 일반화한 공용 슬롯.
 * activeTool이 바뀔 때마다 '도구이름 · 조작법' 한 줄을 하단 바 오른쪽에 표시한다.
 * (자르기의 자체 패널은 이 모듈로 흡수 — cut-tool.js는 더 이상 패널을 만들지 않음)
 */

const HINTS = {
  V:      ["선택",       "클릭=선택 · 드래그=이동 · Shift 드래그=스냅"],
  rotate: ["회전",       "선택한 오브젝트를 드래그해 회전합니다"],
  CUT:    ["✂ 자르기",   "자유롭게 그어 자릅니다 · Shift=직선 · Shift+Ctrl=각도 스냅"],
  O:      ["타원",       "드래그해 타원을 그립니다"],
  Y:      ["직각삼각형", "드래그해 직각삼각형을 그립니다"],
  RECT:   ["사각형",     "드래그해 사각형을 그립니다"],
  L:      ["직선",       "두 점을 클릭해 직선을 그립니다 · 끝점은 가까운 도형에 스냅"],
  P:      ["꺾은선",     "클릭으로 점 추가 · 더블클릭/Enter=완성 · Esc=취소"],
  C:      ["곡선",       "클릭으로 점 추가 · 더블클릭/Enter=완성 · Esc=취소"],
  F:      ["자유 그리기", "드래그해 자유롭게 그립니다"],
  T:      ["텍스트",     "캔버스를 클릭해 글자를 입력합니다"],
};

let _panel, _title, _text;

function injectStyles() {
  if (document.getElementById("tool-hint-styles")) return;
  const st = document.createElement("style");
  st.id = "tool-hint-styles";
  st.textContent = `
    #tool-hint { display:flex; align-items:center; gap:6px; margin-left:auto;
      min-width:0; overflow:hidden; white-space:nowrap; }
    #tool-hint[hidden] { display:none; }
    #tool-hint .tool-hint-title { font-weight:700; }
    #tool-hint .tool-hint-text { opacity:.75; font-size: 12px; overflow:hidden; text-overflow:ellipsis; }
  `;
  document.head.appendChild(st);
}

export function initToolHint(state) {
  injectStyles();
  _panel = document.createElement("div");
  _panel.id = "tool-hint";
  _panel.hidden = true;
  _title = document.createElement("span");
  _title.className = "tool-hint-title";
  _text = document.createElement("span");
  _text.className = "tool-hint-text";
  _panel.appendChild(_title);
  _panel.appendChild(_text);
  const bar = document.querySelector(".canvas-bottom-bar");
  (bar || document.body).appendChild(_panel);

  const sync = (s) => {
    const h = HINTS[s.activeTool];
    if (!h) { _panel.hidden = true; return; }
    _title.textContent = h[0];
    _text.textContent = h[1];
    _panel.hidden = false;
  };
  state.subscribe(sync);
  sync(state.get());
}
