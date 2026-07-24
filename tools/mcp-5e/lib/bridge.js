/* ===== BRIDGE — 열려 있는 5E 앱과 MCP 서버를 잇는 로컬 통로 =====
 *
 * 왜 이런 모양인가:
 *   브라우저는 로컬 파일을 감시할 수 없다. 그래서 "파일을 쓰면 앱이 알아서 읽는다"는
 *   불가능하고, 앱이 먼저 서버에 붙어 있어야 한다. WebSocket을 쓰면 의존성(ws)이 붙거나
 *   프레이밍을 직접 구현해야 해서, 노드 내장 http만으로 되는 조합을 골랐다:
 *
 *     서버 → 앱 : SSE (GET /events)   — 명령을 흘려보낸다
 *     앱 → 서버 : POST /result        — 실행 결과를 돌려준다
 *
 * 127.0.0.1에만 바인딩한다(외부에서 접근 불가). 포트는 8579부터 비어 있는 것을 쓴다.
 *
 * 좀비 서버 정리: Claude Code 창을 X 버튼으로 닫으면(정상 종료가 아니라) 이 서버의
 * 부모 프로세스는 죽어도 이 서버 자신은 안 죽고 포트를 계속 쥐고 있는 경우가 있다.
 * 그러면 새로 켠 세션은 그다음 포트로 밀려나고, 브라우저는 여전히 그 죽은 좀비한테
 * 붙어서 "연결은 됐는데 반응이 없는" 상태가 된다. 그래서 시작할 때마다 먼저
 * PORT_RANGE 전체를 훑어 이미 떠 있는 mcp-5e 서버가 있으면 종료 요청을 보내고
 * (evictOthers), 그다음에 8579부터 다시 잡는다 — 항상 "제일 최근에 켠 것만" 산다.
 */

import http from "node:http";

const PORT_RANGE = [8579, 8580, 8581, 8582, 8583];
const RESULT_TIMEOUT_MS = 10000;

let server = null;
let port = null;
let client = null;              // 현재 붙어 있는 앱(SSE 응답 스트림). 하나만 받는다.
let clientInfo = null;
let seq = 0;
const pending = new Map();      // id → { resolve, reject, timer }

function cors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  // 사설망 접근(Private Network Access): https 페이지(배포본)에서 127.0.0.1로 붙을 때
  // 크롬이 프리플라이트에 이 헤더를 요구한다. 없으면 배포본에서만 조용히 차단된다.
  if (req.headers["access-control-request-private-network"]) {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
}

function handle(req, res) {
  cors(req, res);
  const url = new URL(req.url, "http://127.0.0.1");

  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, server: "mcp-5e", connected: !!client }));
  }

  if (url.pathname === "/events") {
    // 새 탭이 붙으면 이전 연결은 끊는다 — 명령이 두 곳으로 가면 어느 쪽이 반영됐는지 알 수 없다.
    if (client) { try { client.end(); } catch { /* 이미 끊김 */ } }
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(": connected\n\n");
    client = res;
    clientInfo = { origin: req.headers.origin || "?", since: new Date().toISOString() };
    const keepAlive = setInterval(() => {
      try { res.write(": ping\n\n"); } catch { clearInterval(keepAlive); }
    }, 25000);
    req.on("close", () => {
      clearInterval(keepAlive);
      if (client === res) { client = null; clientInfo = null; }
    });
    return;
  }

  if (url.pathname === "/shutdown" && req.method === "POST") {
    // 새로 뜬 세션이 좀비를 정리할 때 보내는 요청. 응답부터 보내고 나서 죽는다 —
    // 안 그러면 요청 보낸 쪽이 연결 끊김 에러를 본다.
    res.writeHead(204);
    res.end();
    setTimeout(() => process.exit(0), 50);
    return;
  }

  if (url.pathname === "/result" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      try {
        const msg = JSON.parse(body);
        const p = pending.get(msg.id);
        if (p) { pending.delete(msg.id); clearTimeout(p.timer); p.resolve(msg); }
      } catch { /* 형식이 깨진 응답은 무시 — 타임아웃이 처리한다 */ }
      res.writeHead(204);
      res.end();
    });
    return;
  }

  res.writeHead(404);
  res.end();
}

/* ----- 좀비 정리: 이미 떠 있는 mcp-5e 서버들에 종료 요청을 보낸다 -----
 * 요청 자체가 실패해도(이미 죽은 포트 등) 무시한다 — 정리가 목적이지 확인이 목적이 아니다. */
async function evictOthers() {
  let evicted = 0;
  for (const p of PORT_RANGE) {
    try {
      const h = await fetch(`http://127.0.0.1:${p}/health`, { signal: AbortSignal.timeout(400) });
      if (!h.ok) continue;
      const info = await h.json();
      if (info.server !== "mcp-5e") continue;   // 다른 프로그램이 그 포트를 쓰는 중 — 손대지 않는다
      await fetch(`http://127.0.0.1:${p}/shutdown`, { method: "POST", signal: AbortSignal.timeout(400) });
      evicted++;
    } catch { /* 그 포트엔 없거나 이미 죽음 — 정상 */ }
  }
  if (evicted) await new Promise((r) => setTimeout(r, 300));   // 포트가 실제로 풀릴 시간
  return evicted;
}

/* ----- 서버 기동: 좀비 정리 후, 비어 있는 포트를 찾아 순서대로 시도 ----- */
export async function startBridge() {
  if (server) return port;
  await evictOthers();
  return new Promise((resolve) => {
    const tryPort = (i) => {
      if (i >= PORT_RANGE.length) { resolve(null); return; }   // 전부 사용중 → 통로 없이 동작
      const s = http.createServer(handle);
      s.once("error", () => { s.close(); tryPort(i + 1); });
      s.listen(PORT_RANGE[i], "127.0.0.1", () => {
        server = s; port = PORT_RANGE[i]; resolve(port);
      });
    };
    tryPort(0);
  });
}

export function bridgeStatus() {
  return { port, connected: !!client, client: clientInfo, portRange: PORT_RANGE };
}

/* ----- 앱에 명령을 보내고 결과를 기다린다 ----- */
export function sendToApp(cmd, args = {}) {
  if (!port) throw new Error("로컬 통로를 열지 못했습니다 (포트 8579~8583이 모두 사용중)");
  if (!client) {
    throw new Error(
      `5E 앱이 붙어 있지 않습니다.\n` +
      `- 브라우저에서 앱을 http://localhost:… 로 열어 두세요(파일 열기(file://)로는 안 됩니다)\n` +
      `- 이미 열어 뒀다면 새로고침하세요(앱이 켜질 때 통로를 찾습니다)`
    );
  }
  const id = ++seq;
  const payload = JSON.stringify({ id, cmd, args });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`앱이 ${RESULT_TIMEOUT_MS / 1000}초 안에 응답하지 않았습니다`));
    }, RESULT_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    try {
      client.write(`data: ${payload}\n\n`);
    } catch (e) {
      pending.delete(id); clearTimeout(timer);
      reject(new Error("앱과의 연결이 끊어졌습니다 — 새로고침해 주세요"));
    }
  }).then((msg) => {
    if (!msg.ok) throw new Error(msg.error || "앱에서 처리하지 못했습니다");
    return msg.data;
  });
}
