/* ===== TOOL HINT: 캔버스 하단 바의 도구별 조작 안내 =====
 *
 * 캔버스를 가리는 플로팅 안내는 사용하지 않습니다. 현재 도구의 핵심 동작과
 * 완료/취소/모드 전환 키를 하단 바 오른쪽 한 줄에 표시합니다.
 */

const HINTS = {
  V: {
    title: "선택",
    action: "오브젝트를 클릭해 선택하고, 선택한 오브젝트를 드래그해 이동하세요.",
    keys: "Shift+드래그: 스냅 · 빈 곳 클릭: 선택 해제", activeKeys: ["Shift+드래그"],
  },
  rotate: {
    title: "회전",
    action: "선택한 오브젝트를 마우스로 드래그해 원하는 각도로 회전하세요.",
    keys: "마우스를 놓으면 회전 완료",
  },
  CUT: {
    title: "✂ 자르기",
    action: "캔버스에서 마우스를 누른 채 자를 경로를 드래그하고 놓으세요.",
    keys: "Shift: 직선 모드 · Ctrl: 꺾은선 모드 · E: 자르기 도구", activeKeys: ["Shift", "Ctrl"],
  },
  DELAYED_CUT: {
    title: "✂◷ 지연 자르기",
    action: "자를 경로를 만든 뒤 위치를 조정하고, 오른쪽의 ‘자르기 확정’을 누르세요.",
    keys: "Shift: 직선 모드 · Ctrl: 꺾은선 모드 · Ctrl+E: 지연 자르기", activeKeys: ["Shift", "Ctrl"],
  },
  ERASE: {
    title: "지우개",
    action: "지울 영역을 마우스로 둘러싼 뒤 놓으면 내부가 투명하게 지워집니다.",
    keys: "Shift+E: 지우개 도구 · Esc: 취소", activeKeys: ["Shift+E"],
  },
  O: {
    title: "타원",
    action: "타원이 들어갈 영역의 한쪽 끝에서 반대쪽 끝까지 드래그하세요.",
    keys: "마우스를 놓으면 생성 완료",
  },
  Y: {
    title: "직각삼각형",
    action: "삼각형이 들어갈 영역의 한쪽 끝에서 반대쪽 끝까지 드래그하세요.",
    keys: "마우스를 놓으면 생성 완료",
  },
  RECT: {
    title: "사각형",
    action: "사각형이 들어갈 영역의 한쪽 모서리에서 반대쪽 모서리까지 드래그하세요.",
    keys: "마우스를 놓으면 생성 완료",
  },
  L: {
    title: "직선",
    action: "시작점과 끝점을 차례로 클릭하면 직선이 완성됩니다.",
    keys: "Ctrl: 15° 각도 스냅 · Shift: 오브젝트 끝점 스냅 · Esc: 취소", activeKeys: ["Ctrl", "Shift"],
  },
  P: {
    title: "꺾은선",
    action: "꺾일 지점을 순서대로 클릭해 꼭짓점을 추가하세요.",
    keys: "Enter/더블클릭: 완성 · Ctrl: 15° 각도 스냅 · Esc: 취소", activeKeys: ["Enter/더블클릭", "Ctrl"],
  },
  C: {
    title: "곡선",
    action: "곡선이 지나갈 지점을 순서대로 클릭해 모양을 만드세요.",
    keys: "Enter/더블클릭: 완성 · Esc: 취소", activeKeys: ["Enter/더블클릭"],
  },
  F: {
    title: "자유 그리기",
    action: "마우스를 누른 채 원하는 경로를 따라 드래그하고 놓으세요.",
    keys: "마우스를 놓으면 생성 완료 · Esc: 취소",
  },
  T: {
    title: "텍스트",
    action: "글자를 넣을 위치를 클릭한 뒤 내용을 입력하세요.",
    keys: "Ctrl+Enter: 입력 완료 · Esc: 취소", activeKeys: ["Ctrl+Enter"],
  },
};

let _panel, _title, _action, _keys;
let _modeHint = null;

function injectStyles() {
  if (document.getElementById("tool-hint-styles")) return;
  const st = document.createElement("style");
  st.id = "tool-hint-styles";
  st.textContent = `
    #tool-hint {
      display:flex; align-items:center; gap:9px; margin-left:auto; min-width:0;
      max-width:min(820px, 68vw); height:28px; padding:2px 9px 2px 11px;
      border-left:2px solid var(--accent); border-radius:5px;
      background:color-mix(in srgb, var(--accent) 7%, transparent);
      font-family:"IBM Plex Sans KR",system-ui,sans-serif; line-height:1.35;
    }
    #tool-hint[hidden] { display:none; }
    #tool-hint .tool-hint-title {
      flex:0 0 auto; color:var(--accent); font-size:12.5px; font-weight:750; white-space:nowrap;
    }
    #tool-hint .tool-hint-action {
      flex:1 1 auto; min-width:0; color:var(--text-primary); font-size:12px; font-weight:600;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    #tool-hint .tool-hint-keys {
      flex:0 1 auto; display:flex; align-items:center; gap:4px; min-width:0; max-width:46%;
      color:var(--text-secondary); font-size:11px; font-weight:600; white-space:nowrap;
      overflow:hidden; text-overflow:ellipsis;
    }
    #tool-hint .tool-hint-key { color:var(--text-secondary); font-weight:600; }
    #tool-hint .tool-hint-key.is-active {
      display:inline-flex; align-items:center; min-height:19px; padding:0 5px;
      border:1px solid color-mix(in srgb, var(--accent) 72%, var(--c-border));
      border-radius:4px; background:color-mix(in srgb, var(--accent) 16%, var(--bg-panel));
      color:var(--accent); font-weight:750;
    }
    @media (max-width: 1120px) {
      #tool-hint { max-width:58vw; }
      #tool-hint { max-width:58vw; gap:6px; }
      #tool-hint .tool-hint-title { font-size:11.5px; }
      #tool-hint .tool-hint-action { font-size:11px; }
      #tool-hint .tool-hint-keys { font-size:10px; }
    }
  `;
  document.head.appendChild(st);
}

function renderHint(hint) {
  if (!hint) { _panel.hidden = true; return; }
  _title.textContent = hint.title || "도구 안내";
  _action.textContent = hint.action || "";
  _keys.replaceChildren();
  const activeKeys = new Set(hint.activeKeys || []);
  const parts = String(hint.keys || "").split(/(Shift\+드래그|Shift\+E|Ctrl\+Enter|Ctrl\+E|Enter\/더블클릭|Shift|Ctrl|Esc|E)/g);
  for (const part of parts) {
    if (!part) continue;
    const span = document.createElement("span");
    span.textContent = part;
    if (activeKeys.has(part)) span.className = "tool-hint-key is-active";
    else if (/^(Shift|Ctrl|Esc|Enter|E)/.test(part)) span.className = "tool-hint-key";
    _keys.appendChild(span);
  }
  _panel.hidden = false;
}

export function initToolHint(state) {
  injectStyles();
  _panel = document.createElement("div");
  _panel.id = "tool-hint";
  _panel.hidden = true;
  _title = document.createElement("span");
  _title.className = "tool-hint-title";
  _action = document.createElement("span");
  _action.className = "tool-hint-action";
  _keys = document.createElement("span");
  _keys.className = "tool-hint-keys";
  _panel.append(_title, _action, _keys);
  const bar = document.querySelector(".canvas-bottom-bar");
  (bar || document.body).appendChild(_panel);

  const sync = (s) => {
    const isCut = s.activeTool === "CUT" || s.activeTool === "DELAYED_CUT";
    renderHint(isCut && _modeHint ? _modeHint : HINTS[s.activeTool]);
  };

  window.addEventListener("5e:tool-mode-hint", (e) => {
    if (!e.detail) return;
    _modeHint = {
      title: e.detail.title || "도구 안내",
      action: e.detail.action || e.detail.text || "",
      keys: e.detail.keys || "",
      activeKeys: e.detail.activeKeys || [],
    };
    sync(state.get());
  });
  state.subscribe((s) => {
    if (s.activeTool !== "CUT" && s.activeTool !== "DELAYED_CUT") _modeHint = null;
    sync(s);
  });
  sync(state.get());
}
