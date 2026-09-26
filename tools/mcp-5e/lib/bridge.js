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
 */

import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";

const PORT_RANGE = [8579, 8580, 8581, 8582, 8583];
const RESULT_TIMEOUT_MS = 10000;
const MAX_RESULT_BYTES = 2 * 1024 * 1024;
const PROCESS_CAPABILITY = randomBytes(32).toString("base64url");
const PRODUCTION_ORIGIN = "https://seungyeon980808-pixel.github.io";

let server = null;
let port = null;
let client = null;              // 현재 붙어 있는 앱(SSE 응답 스트림). 하나만 받는다.
let clientInfo = null;
let clientSessionId = null;
let seq = 0;
const pending = new Map();      // id → { resolve, reject, timer }

function allowedOrigin(origin) {
  return origin === "null" || origin === PRODUCTION_ORIGIN
    || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin);
}

function cors(req, res) {
  const origin = String(req.headers.origin || "");
  if (!allowedOrigin(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, x-mcp-session");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  // 사설망 접근(Private Network Access): https 페이지(배포본)에서 127.0.0.1로 붙을 때
  // 크롬이 프리플라이트에 이 헤더를 요구한다. 없으면 배포본에서만 조용히 차단된다.
  if (req.headers["access-control-request-private-network"]) {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  return true;
}

function sameSecret(provided) {
  const left = Buffer.from(String(provided || ""));
  const right = Buffer.from(`Bearer ${PROCESS_CAPABILITY}`);
  return left.length === right.length && timingSafeEqual(left, right);
}

function reject(res, status, code) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: code }));
}

function rejectPendingSession(sessionId, message) {
  for (const [id, entry] of pending) {
    if (entry.sessionId !== sessionId) continue;
    pending.delete(id);
    clearTimeout(entry.timer);
    entry.reject(new Error(message));
  }
}

function handle(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const expectedHost = port ? `127.0.0.1:${port}` : "";

  if (req.headers.host !== expectedHost) return reject(res, 421, "invalid_host");

  if (req.method === "OPTIONS") {
    if (!cors(req, res)) return reject(res, 403, "origin_denied");
    res.writeHead(204);
    return res.end();
  }

  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, server: "mcp-5e", connected: !!client }));
  }

  if (!cors(req, res)) return reject(res, 403, "origin_denied");
  if (!sameSecret(req.headers.authorization)) return reject(res, 401, "capability_required");

  if (url.pathname === "/events" && req.method === "GET") {
    /* 자동 재연결은 남의 연결을 뺏지 못한다 (2026-07-27).
     *
     * 예전에는 "가장 마지막에 붙은 앱이 이긴다"만 있었다. 그런데 뺏긴 앱은 연결이 끊긴 걸
     * 알고 **자동으로 다시 붙는다**. 그래서 5E 창이 둘이면 서로 무한히 뺏고 뺏겨, 명령이
     * 어느 창으로 갈지 매번 달라졌다(실제로 다른 세션이 열어둔 창과 교대로 붙었다).
     *
     * 규칙: 이미 붙어 있는 앱이 있으면 **처음 보는 창**이나 **사람이 직접 누른 재연결**만
     * 넘겨받는다. 한 번 뺏긴 창이 저 혼자 다시 붙는 것은 막는다.
     * 자기를 밝히지 않는 옛 버전 앱(cid 없음)도 넘겨받지 못한다 — 누군지 모르는 창에
     * 그림을 보내는 것이 가장 위험하다. */
    const cid = url.searchParams.get("cid") || "";
    const manual = url.searchParams.get("manual") === "1";
    if (!cid) return reject(res, 400, "client_id_required");
    if (client && !manual) {
      return reject(res, 409, "manual_replacement_required");
    }
    /* 새 탭이 붙으면 이전 연결은 끊는다 — 명령이 두 곳으로 가면 어느 쪽이 반영됐는지 알 수 없다.
     *
     * 2026-07-27: 끊기 전에 **이전 앱에게 왜 끊기는지 알려준다**. 예전에는 조용히 뺏어서,
     * 교사가 5E를 다시 열었을 때 연결이 그쪽으로 넘어간 걸 아무도 몰랐고 Claude가 교사
     * 문서에 그림을 그려 넣는 사고가 났다. 이제 이전 앱은 "연결을 뺏겼다"를 화면에 띄운다. */
    if (client) {
      // 뺏긴 창은 "parked" 로 기억해 둔다 — 저 혼자 다시 붙지 못하게(위 409 규칙).
      try { client.write(`event: evicted\ndata: {"by":${JSON.stringify(req.headers.origin || "?")}}\n\n`); } catch { /* 이미 끊김 */ }
      try { client.end(); } catch { /* 이미 끊김 */ }
      rejectPendingSession(clientSessionId, "앱 연결이 사용자의 요청으로 교체되었습니다");
    }
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(": connected\n\n");
    client = res;
    clientSessionId = randomBytes(16).toString("base64url");
    res.write(`event: session\ndata: ${JSON.stringify({ sessionId: clientSessionId })}\n\n`);
    /* 어느 앱이 붙었는지 식별할 수 있게 붙은 쪽이 스스로 밝힌 정보를 함께 담는다.
     * origin(포트)만으로는 같은 포트의 다른 탭을 구분하지 못한다 → 앱이 만든 clientId 를 쓴다. */
    clientInfo = {
      origin: req.headers.origin || "?",
      clientId: url.searchParams.get("cid") || "?",
      href: url.searchParams.get("href") || "",
      since: new Date().toISOString(),
    };
    const keepAlive = setInterval(() => {
      try { res.write(": ping\n\n"); } catch { clearInterval(keepAlive); }
    }, 25000);
    req.on("close", () => {
      clearInterval(keepAlive);
      if (client === res) {
        const closedSessionId = clientSessionId;
        client = null;
        clientInfo = null;
        clientSessionId = null;
        rejectPendingSession(closedSessionId, "앱과의 연결이 끊어졌습니다 — 다시 연결해 주세요");
      }
    });
    return;
  }

  if (url.pathname === "/result" && req.method === "POST") {
    const sessionId = String(req.headers["x-mcp-session"] || "");
    if (!clientSessionId || sessionId !== clientSessionId) return reject(res, 409, "session_mismatch");
    if (Number(req.headers["content-length"] || 0) > MAX_RESULT_BYTES) return reject(res, 413, "result_too_large");
    let body = "";
    let tooLarge = false;
    req.on("data", (c) => {
      if (tooLarge) return;
      body += c;
      if (Buffer.byteLength(body) > MAX_RESULT_BYTES) tooLarge = true;
    });
    req.on("end", () => {
      if (tooLarge) return reject(res, 413, "result_too_large");
      try {
        const msg = JSON.parse(body);
        const p = pending.get(msg.id);
        if (!p || p.sessionId !== sessionId) return reject(res, 409, "command_mismatch");
        pending.delete(msg.id);
        clearTimeout(p.timer);
        p.resolve(msg);
      } catch {
        return reject(res, 400, "invalid_result");
      }
      res.writeHead(204);
      res.end();
    });
    return;
  }

  res.writeHead(404);
  res.end();
}

/* ----- 서버 기동: 비어 있는 포트를 찾아 순서대로 시도 ----- */
export async function startBridge() {
  if (server) return port;
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

export function bridgePairingRecord() {
  if (!port) throw new Error("로컬 통로가 아직 열리지 않았습니다");
  return `mcp-5e://127.0.0.1:${port}/#${PROCESS_CAPABILITY}`;
}

export async function stopBridge() {
  if (!server) return;
  const activeServer = server;
  server = null;
  port = null;
  if (client) {
    try { client.end(); } catch {}
    client = null;
  }
  clientInfo = null;
  const sessionId = clientSessionId;
  clientSessionId = null;
  rejectPendingSession(sessionId, "로컬 통로가 종료되었습니다");
  await new Promise((resolve) => activeServer.close(resolve));
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
    pending.set(id, { resolve, reject, timer, sessionId: clientSessionId });
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
