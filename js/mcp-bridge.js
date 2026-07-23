/* ===== MCP BRIDGE — 열려 있는 앱에 외부(Claude/MCP)에서 객체를 넣는 통로 =====
 *
 * 무엇을 하나: `tools/mcp-5e` MCP 서버가 로컬(127.0.0.1)에 열어 둔 통로에 붙어서,
 * "이 객체들을 지금 화면에 추가해라" 같은 명령을 받아 state에 반영한다. 파일을 저장했다가
 * 다시 여는 왕복 없이, 앱을 켜 둔 채로 그림이 들어온다.
 *
 * 안전장치 — 이 모듈은 아래 조건이 전부 맞을 때만 깨어난다:
 *   1) localhost에서 열렸거나, 주소에 `?mcp=1`을 붙여 **직접 켠** 경우에만.
 *      배포본(GitHub Pages)을 그냥 연 사람에게는 아무 일도 일어나지 않는다 —
 *      켜지 않은 브라우저는 127.0.0.1을 두드려 보지도 않는다.
 *   2) 통로(포트 8579~8583)가 실제로 응답할 때만
 *   3) 서버가 없으면 조용히 포기한다 — 콘솔 에러도 남기지 않는다
 *
 * 켜기: 주소 끝에 `?mcp=1` → 이 브라우저에 기억된다(localStorage). 끄기: `?mcp=0`
 *
 * UI: 상단 툴바 zoom 표시 바로 왼쪽의 "MCP ●" 버튼(#mcp-bridge-btn, index.html에 정적으로
 * 있음) — 점(●)이 상태 표시다: 회색 테두리만=연결 안 됨, 파란 채움=연결됨.
 * 켜져 있을 때(bridgeEnabled())만 hidden을 벗긴다.
 *
 * 들어오는 모든 변경은 undoStack에 스냅샷을 남긴다. 마음에 안 들면 Ctrl+Z로 되돌린다.
 */

import { state } from "./state.js?v=1.2.0";
import { showAlert } from "./ui-dialogs.js?v=1.2.0";

const PORTS = [8579, 8580, 8581, 8582, 8583];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const STORAGE_KEY = "5e.mcpBridge";

/* ----- 켜져 있는가 -----
 * localhost는 개발용이므로 항상 켠다. 배포본은 `?mcp=1`로 한 번 켜면 그 브라우저에만
 * 기억된다 — 링크를 받은 다른 사람에게는 옮겨가지 않는다. */
function bridgeEnabled() {
  let stored = null;
  try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* 시크릿 모드 등 */ }
  const q = new URLSearchParams(location.search).get("mcp");
  if (q === "1") { try { localStorage.setItem(STORAGE_KEY, "1"); } catch {} return true; }
  if (q === "0") { try { localStorage.removeItem(STORAGE_KEY); } catch {} return false; }
  if (LOCAL_HOSTS.has(location.hostname)) return true;
  return stored === "1";
}

let source = null;
let idSeq = 0;
let lastPort = null;
let connecting = false;   // 버튼을 눌러 재시도하는 중 — 중복 클릭 방지

/* ----- 명령 처리기 ----- */
const COMMANDS = {
  // 통로가 살아 있는지 + 지금 화면에 뭐가 있는지
  ping() {
    const s = state.get();
    return { app: "5E", objects: s.objects.length, artboard: s.artboard, page: activePageName(s) };
  },

  // 지금 그려져 있는 것을 읽어 간다 — Claude가 "현재 그림을 보고" 고칠 수 있게 하는 통로.
  getState() {
    const s = state.get();
    return {
      artboard: s.artboard,
      page: activePageName(s),
      bounds: {
        xMin: -s.artboard.w / 2, xMax: s.artboard.w / 2,
        yMin: -s.artboard.h / 2, yMax: s.artboard.h / 2,
      },
      objects: s.objects.map((o) => ({
        id: o.id, type: o.type, kind: o.kind, element: o.element,
        label: o.label || o.text || o.expr || undefined,
        x: o.x, y: o.y, w: o.w, h: o.h, p1: o.p1, p2: o.p2,
        pointCount: Array.isArray(o.points) ? o.points.length : undefined,
      })),
    };
  },

  // 객체 추가 — MCP 쪽에서 이미 검증·기본값 채움이 끝난 것이 온다.
  addObjects({ objects }) {
    if (!Array.isArray(objects) || !objects.length) throw new Error("objects가 비었습니다");
    const ids = [];
    state.update((s) => {
      s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));
      s.redoStack = [];
      for (const raw of objects) {
        const id = raw.id && !s.objects.some((o) => o.id === raw.id) ? raw.id : nextId();
        const obj = { ...raw, id, order: s.objects.length, layerId: raw.layerId ?? s.activeLayerId };
        s.objects.push(obj);
        ids.push(id);
      }
      s.selectedIds = ids;
      s.targetedId = null;
    });
    flash(`${ids.length}개 추가됨`);
    return { added: ids.length, ids };
  },

  // id로 지우기
  removeObjects({ ids }) {
    const set = new Set(ids || []);
    let removed = 0;
    state.update((s) => {
      s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));
      s.redoStack = [];
      const before = s.objects.length;
      s.objects = s.objects.filter((o) => !set.has(o.id));
      s.objects.forEach((o, i) => { o.order = i; });
      s.selectedIds = [];
      removed = before - s.objects.length;
    });
    flash(`${removed}개 삭제됨`);
    return { removed };
  },

  // 현재 페이지 비우기 (Ctrl+Z로 되돌아온다)
  clear() {
    let removed = 0;
    state.update((s) => {
      s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));
      s.redoStack = [];
      removed = s.objects.length;
      s.objects = [];
      s.selectedIds = [];
    });
    flash("전부 지움 (Ctrl+Z로 되돌리기)");
    return { removed };
  },
};

function activePageName(s) {
  const p = (s.pages || []).find((q) => q.id === s.activePageId);
  return p ? p.name : "페이지 1";
}
function nextId() {
  return `obj_${Date.now().toString(36)}_x${++idSeq}`;
}

/* ----- 연결 ----- */
async function findPort() {
  for (const p of PORTS) {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/health`, { signal: AbortSignal.timeout(600) });
      if (r.ok && (await r.json()).server === "mcp-5e") return p;
    } catch { /* 그 포트엔 없음 — 다음 후보 */ }
  }
  return null;
}

async function respond(port, id, ok, payload) {
  try {
    await fetch(`http://127.0.0.1:${port}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ok ? { id, ok: true, data: payload } : { id, ok: false, error: String(payload) }),
    });
  } catch { /* 서버가 사라졌다 — 다음 명령에서 재연결된다 */ }
}

function connect(port) {
  lastPort = port;
  source = new EventSource(`http://127.0.0.1:${port}/events`);
  source.onopen = () => setBadge("connected", port);
  source.onerror = () => setBadge("disconnected", port);   // EventSource가 알아서 재연결도 시도한다
  source.onmessage = async (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    const fn = COMMANDS[msg.cmd];
    if (!fn) return respond(port, msg.id, false, `알 수 없는 명령: ${msg.cmd}`);
    try { respond(port, msg.id, true, fn(msg.args || {})); }
    catch (e) { respond(port, msg.id, false, e.message); }
  };
}

/* ----- 연결 상태 버튼 -----
 * index.html에 이미 있는 정적 버튼(#mcp-bridge-btn, zoom 표시 옆 · fullscreen/theme
 * 토글과 같은 클래스)을 그대로 쓴다. 켜져 있을 때(localhost 또는 ?mcp=1)만 hidden을
 * 벗기고, 연결 안 됐을 때도 보여서 눌러서 다시 시도하거나 안내를 볼 수 있게 한다. */
function bridgeBtn() {
  return document.getElementById("mcp-bridge-btn");
}
let flashTimer = null;
let badgeState = "connecting"; // "connecting" | "connected" | "disconnected"
function setBadge(kind, port) {
  badgeState = kind;
  const b = bridgeBtn();
  if (!b) return;
  b.hidden = false;
  b.classList.toggle("mcp-connecting", kind === "connecting");
  if (kind === "connected") {
    b.setAttribute("aria-pressed", "true");
    b.title = `MCP 연결됨 (:${port}) — 클릭하면 상태 확인`;
  } else if (kind === "disconnected") {
    b.setAttribute("aria-pressed", "false");
    b.title = "MCP 연결 안 됨 — 클릭해서 다시 시도";
  } else {
    b.setAttribute("aria-pressed", "false");
    b.title = "MCP 서버를 찾는 중…";
  }
}
// 명령 처리 직후 잠깐 배경을 밝혀 "방금 반영됐다"는 걸 조용히 알린다(텍스트 배지가
// 아니라 아이콘 버튼이라 title만으론 눈에 안 띄어서 — 툴바 다른 토글과 같은 톤 유지).
function flash(text) {
  const b = bridgeBtn();
  if (!b) return;
  const baseTitle = b.title;
  b.classList.add("mcp-flash");
  if (text) b.title = `MCP · ${text}`;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { b.classList.remove("mcp-flash"); b.title = baseTitle; }, 1500);
}

/* ----- 버튼 클릭: 연결돼 있으면 상태만 보여주고, 안 돼 있으면 다시 붙어 본다 -----
 * 웹페이지는 보안상 컴퓨터의 프로그램(Claude Code·MCP 서버)을 직접 실행할 수 없다.
 * 그래서 이 버튼이 할 수 있는 최선은 "이미 떠 있는 서버에 다시 붙어보기"까지다.
 * Claude Code를 아예 안 켰다면 이 버튼으로는 켤 수 없고, 사용자가 직접 켜야 한다. */
async function handleBadgeClick() {
  if (badgeState === "connected") {
    let info = null;
    try { info = COMMANDS.ping(); } catch { /* 무시 */ }
    return showAlert(
      `연결된 포트: ${lastPort}\n` +
        (info ? `현재 페이지: ${info.page}, 객체 ${info.objects}개` : "") +
        `\n\n대화창에서 그냥 말씀하시면 이 화면에 바로 그려집니다.`,
      { title: "MCP 연결됨" }
    );
  }
  if (connecting) return;
  connecting = true;
  setBadge("connecting");
  const port = await findPort();
  connecting = false;
  if (port) { connect(port); return; }

  setBadge("disconnected");
  return showAlert(
    "MCP 서버를 찾지 못했습니다.\n\n" +
      "확인할 것:\n" +
      "1. 컴퓨터에서 Claude Code가 실행 중이고, 'mcp-5e' 도구가 등록돼 있는지\n" +
      "   (터미널에서: claude mcp list 로 확인)\n" +
      "2. 등록 직후라면 Claude Code를 새 세션으로 다시 시작했는지\n" +
      "3. 이 화면이 http://localhost 로 열려 있는지 (지금 주소: " + location.origin + ")\n\n" +
      "웹페이지는 보안상 프로그램을 스스로 실행할 수 없어서, 이 버튼은\n" +
      "'이미 켜진 서버에 다시 붙어보기'만 할 수 있습니다.",
    { title: "MCP 연결 안 됨" }
  );
}

/* ----- 시작 -----
 * index.html이 이 파일을 <script type="module">로 직접 싣는다. 그래서 스스로 켜지되,
 * 다른 모듈이 import 했을 때 두 번 켜지지 않도록 한 번만 돌게 막아 둔다. */
let started = false;
export async function initMcpBridge() {
  if (started) return;
  started = true;
  if (!bridgeEnabled()) return;      // 켜지 않은 브라우저는 로컬 포트를 두드리지도 않는다(버튼은 hidden 그대로)
  bridgeBtn()?.addEventListener("click", handleBadgeClick);
  setBadge("connecting");            // 버튼을 먼저 보여준다 — 못 찾아도 눌러서 재시도할 수 있게
  const port = await findPort();
  if (port) connect(port);
  else setBadge("disconnected");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMcpBridge, { once: true });
} else {
  initMcpBridge();
}
