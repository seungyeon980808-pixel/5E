/* ===== BRIDGE — 열려 있는 5E 앱과 MCP 서버를 잇는 인증된 로컬 통로 =====
 *
 * 서버 → 앱은 SSE(/events), 앱 → 서버는 POST(/result)를 쓴다. 서버 프로세스가 시작될 때
 * 만든 capability와 선택된 포트를 MCP stdio의 신뢰된 pairing 출력으로만 전달한다.
 * 공개 /health는 비밀을 포함하지 않고, 다른 브리지 프로세스를 종료하거나 포트를 빼앗지 않는다.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import http from "node:http";

const PORT_RANGE = Object.freeze([8579, 8580, 8581, 8582, 8583]);
const RESULT_TIMEOUT_MS = 10000;
const MAX_RESULT_BODY_BYTES = 64 * 1024;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const DEFAULT_PRODUCTION_ORIGIN = "https://seungyeon980808-pixel.github.io";
const DEFAULT_DEVELOPMENT_ORIGINS = ["http://localhost:8000", "http://127.0.0.1:8000"];
const configuredOrigins = new Set([
  DEFAULT_PRODUCTION_ORIGIN,
  ...DEFAULT_DEVELOPMENT_ORIGINS,
  ...String(process.env.MCP_5E_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
]);
const capability = randomBytes(32).toString("base64url");

let server = null;
let port = null;
let startPromise = null;
let bridgeStartError = null;
let client = null;
let clientInfo = null;
let seq = 0;
const pending = new Map();

function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

function hasCapability(req, url) {
  const supplied = String(url.searchParams.get("cap") || req.headers["x-5e-capability"] || "");
  const expected = Buffer.from(capability);
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hasLoopbackHost(req) {
  const raw = req.headers.host;
  if (typeof raw !== "string" || !raw) return false;
  try {
    const parsed = new URL(`http://${raw}`);
    return LOOPBACK_HOSTS.has(parsed.hostname) && Number(parsed.port) === port;
  } catch {
    return false;
  }
}

function isTrustedOrigin(origin) {
  if (!origin || origin === "null") return false;
  try {
    const parsed = new URL(origin);
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return false;
    return configuredOrigins.has(parsed.origin);
  } catch {
    return false;
  }
}

function allowCors(req, res, authenticated) {
  const origin = req.headers.origin;
  if (origin === "null" && authenticated) res.setHeader("Access-Control-Allow-Origin", "null");
  else if (isTrustedOrigin(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-5e-capability, x-5e-client-id");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.headers["access-control-request-private-network"] && (origin === "null" ? authenticated : isTrustedOrigin(origin))) {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
}

function originAccepted(req, authenticated, required) {
  const origin = req.headers.origin;
  if (!origin) return !required;
  if (origin === "null") return authenticated;
  return isTrustedOrigin(origin);
}

function readJsonBody(req, res, callback) {
  const declaredLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESULT_BODY_BYTES) {
    req.resume();
    return json(res, 413, { error: "request body too large" });
  }
  const chunks = [];
  let size = 0;
  let oversized = false;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_RESULT_BODY_BYTES) oversized = true;
    else chunks.push(chunk);
  });
  req.on("end", () => {
    if (oversized) return json(res, 413, { error: "request body too large" });
    try {
      return callback(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch {
      return json(res, 400, { error: "invalid JSON" });
    }
  });
  req.on("error", () => {
    if (!res.headersSent) json(res, 400, { error: "request read failed" });
  });
}

function validClientId(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 128
    && /^[A-Za-z0-9._~-]+$/.test(value);
}

function handle(req, res) {
  let url;
  try { url = new URL(req.url, `http://127.0.0.1:${port}`); }
  catch { return json(res, 400, { error: "invalid URL" }); }

  if (!hasLoopbackHost(req)) return json(res, 403, { error: "loopback Host required" });
  const authenticated = hasCapability(req, url);
  const browserEndpoint = url.pathname === "/events" || url.pathname === "/result";
  if (!originAccepted(req, authenticated, browserEndpoint)) return json(res, 403, { error: "Origin not allowed" });
  allowCors(req, res, authenticated);

  if (req.method === "OPTIONS") {
    if ((url.pathname === "/events" || url.pathname === "/result" || url.pathname === "/shutdown") && !authenticated) {
      return json(res, 401, { error: "pairing required" });
    }
    res.writeHead(204);
    return res.end();
  }

  if (url.pathname === "/health" && req.method === "GET") {
    return json(res, 200, { ok: true, server: "mcp-5e", connected: !!client });
  }

  if (url.pathname === "/events" && req.method === "GET") {
    if (!authenticated) return json(res, 401, { error: "pairing required" });
    const clientId = url.searchParams.get("cid") || "";
    if (!validClientId(clientId)) return json(res, 400, { error: "valid client id required" });
    if (client && client.clientId !== clientId) {
      return json(res, 409, { error: "another paired 5E window owns this bridge" });
    }
    if (client) {
      try { client.response.end(); } catch {}
    }
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(": connected\n\n");
    const connection = { response: res, clientId };
    client = connection;
    clientInfo = {
      origin: req.headers.origin || "native",
      clientId,
      href: String(url.searchParams.get("href") || "").slice(0, 2048),
      since: new Date().toISOString(),
    };
    const keepAlive = setInterval(() => {
      try { res.write(": ping\n\n"); } catch { clearInterval(keepAlive); }
    }, 25000);
    req.on("close", () => {
      clearInterval(keepAlive);
      if (client === connection) {
        client = null;
        clientInfo = null;
      }
    });
    return;
  }

  if (url.pathname === "/shutdown" && req.method === "POST") {
    if (!authenticated) return json(res, 401, { error: "pairing required" });
    res.writeHead(204);
    res.end();
    setTimeout(() => {
      stopBridge().finally(() => process.exit(0));
    }, 25);
    return;
  }

  if (url.pathname === "/result" && req.method === "POST") {
    if (!authenticated) return json(res, 401, { error: "pairing required" });
    const clientId = String(url.searchParams.get("cid") || req.headers["x-5e-client-id"] || "");
    if (!client || client.clientId !== clientId) return json(res, 403, { error: "result owner mismatch" });
    const resultOwner = client;
    return readJsonBody(req, res, (message) => {
      if (client !== resultOwner || client.clientId !== clientId) {
        return json(res, 403, { error: "result owner changed" });
      }
      const waiting = pending.get(message?.id);
      if (!waiting || waiting.ownerClientId !== clientId) {
        return json(res, 404, { error: "no matching pending request" });
      }
      pending.delete(message.id);
      clearTimeout(waiting.timer);
      waiting.resolve(message);
      res.writeHead(204);
      res.end();
    });
  }

  json(res, 404, { error: "not found" });
}

export async function startBridge() {
  if (server) return port;
  if (startPromise) return startPromise;
  startPromise = new Promise((resolve) => {
    const errors = [];
    const tryPort = (index) => {
      if (index >= PORT_RANGE.length) {
        const permissionError = errors.length === PORT_RANGE.length
          && errors.every((code) => code === "EPERM" || code === "EACCES");
        bridgeStartError = permissionError ? errors[0] : "NO_AVAILABLE_PORT";
        startPromise = null;
        resolve(null);
        return;
      }
      const candidate = http.createServer(handle);
      candidate.once("error", (error) => {
        errors.push(error?.code || "UNKNOWN");
        candidate.close();
        tryPort(index + 1);
      });
      candidate.listen(PORT_RANGE[index], "127.0.0.1", () => {
        server = candidate;
        port = PORT_RANGE[index];
        bridgeStartError = null;
        startPromise = null;
        resolve(port);
      });
    };
    tryPort(0);
  });
  return startPromise;
}

export function bridgeStatus() {
  return {
    port,
    connected: !!client,
    client: clientInfo ? { ...clientInfo } : null,
    portRange: [...PORT_RANGE],
    startError: bridgeStartError,
  };
}

export function bridgePairingRecord() {
  if (!port) return null;
  return `mcp-5e://127.0.0.1:${port}/#${capability}`;
}

export function sendToApp(cmd, args = {}) {
  if (!port) throw new Error("로컬 통로를 열지 못했습니다 (포트 8579~8583이 모두 사용중)");
  if (!client) {
    throw new Error("5E 앱이 페어링되지 않았습니다. app_pairing 출력의 페어링 기록을 앱 MCP 배지에 입력하세요.");
  }
  const id = ++seq;
  const ownerClientId = client.clientId;
  const target = client.response;
  const payload = JSON.stringify({ id, cmd, args });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`앱이 ${RESULT_TIMEOUT_MS / 1000}초 안에 응답하지 않았습니다`));
    }, RESULT_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer, ownerClientId });
    try {
      target.write(`data: ${payload}\n\n`);
    } catch {
      pending.delete(id);
      clearTimeout(timer);
      reject(new Error("앱과의 연결이 끊어졌습니다 — 다시 페어링해 주세요"));
    }
  }).then((message) => {
    if (!message.ok) throw new Error(message.error || "앱에서 처리하지 못했습니다");
    return message.data;
  });
}

export async function stopBridge() {
  for (const waiting of pending.values()) {
    clearTimeout(waiting.timer);
    waiting.reject(new Error("로컬 통로가 종료됐습니다"));
  }
  pending.clear();
  if (client) {
    try { client.response.end(); } catch {}
    client = null;
    clientInfo = null;
  }
  const active = server;
  server = null;
  port = null;
  if (!active) return;
  await new Promise((resolve) => active.close(resolve));
}
