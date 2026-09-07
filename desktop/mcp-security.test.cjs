const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");
const SERVER_PATH = path.join(ROOT, "tools", "mcp-5e", "server.js");
const DEV_ORIGIN = "http://localhost:17730";
const PROD_ORIGIN = "https://seungyeon980808-pixel.github.io";

function request({ port, path: requestPath, method = "GET", headers = {}, body = "" }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: requestPath,
      method,
      headers: { ...headers, ...(body ? { "content-length": Buffer.byteLength(body) } : {}) },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function waitForBridgeDisconnected(port, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await request({ port, path: "/health" });
    if (health.status === 200 && JSON.parse(health.body).connected === false) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`bridge ${port} did not observe the SSE disconnect within ${timeoutMs}ms`);
}

function beginChunkedResult({ port, capability, clientId }) {
  let resolveResponse;
  let rejectResponse;
  const response = new Promise((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });
  const req = http.request({
    host: "127.0.0.1",
    port,
    path: `/result?cap=${encodeURIComponent(capability)}&cid=${encodeURIComponent(clientId)}`,
    method: "POST",
    headers: { origin: DEV_ORIGIN, "content-type": "application/json" },
  }, (res) => {
    const chunks = [];
    res.on("data", (chunk) => chunks.push(chunk));
    res.on("end", () => resolveResponse({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
  });
  req.on("error", rejectResponse);
  req.flushHeaders();
  return { req, response };
}

function openSse({ port, capability, clientId, origin = DEV_ORIGIN, host, manual = false }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: `/events?cid=${encodeURIComponent(clientId)}&cap=${encodeURIComponent(capability)}${manual ? "&manual=1" : ""}`,
      headers: { origin, ...(host ? { host } : {}) },
    });
    req.on("response", (res) => {
      res.setEncoding("utf8");
      let buffer = "";
      const waiters = [];
      res.on("data", (chunk) => {
        buffer += chunk;
        for (let i = waiters.length - 1; i >= 0; i -= 1) {
          const waiter = waiters[i];
          const match = buffer.match(waiter.pattern);
          if (match) {
            waiters.splice(i, 1);
            clearTimeout(waiter.timer);
            buffer = buffer.slice((match.index || 0) + match[0].length);
            waiter.resolve(match);
            break;
          }
        }
      });
      const waitFor = (pattern, timeoutMs = 3000) => new Promise((waitResolve, waitReject) => {
        const match = buffer.match(pattern);
        if (match) {
          buffer = buffer.slice((match.index || 0) + match[0].length);
          return waitResolve(match);
        }
        const waiter = { pattern, resolve: waitResolve, timer: null };
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          waitReject(new Error("timed out waiting for SSE frame"));
        }, timeoutMs);
        waiters.push(waiter);
      });
      const closed = new Promise((closedResolve) => res.once("close", closedResolve));
      resolve({ req, res, status: res.statusCode, waitFor, closed, close: () => req.destroy() });
    });
    req.on("error", reject);
    req.end();
  });
}

class McpProcess {
  constructor() {
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.stdoutBuffer = "";
  }

  async start() {
    this.child = spawn(process.execPath, [SERVER_PATH], {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, MCP_5E_ALLOWED_ORIGINS: `${PROD_ORIGIN},${DEV_ORIGIN}` },
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => {
      this.stdoutBuffer += chunk;
      let newline;
      while ((newline = this.stdoutBuffer.indexOf("\n")) >= 0) {
        const line = this.stdoutBuffer.slice(0, newline).trim();
        this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        const pending = this.pending.get(message.id);
        if (pending) {
          this.pending.delete(message.id);
          clearTimeout(pending.timer);
          pending.resolve(message);
        }
      }
    });
    await this.rpc("initialize", { protocolVersion: "2024-11-05" });
    const output = await this.callTool("app_pairing");
    const match = output.match(/mcp-5e:\/\/127\.0\.0\.1:(8579|8580|8581|8582|8583)\/#([A-Za-z0-9_-]{43})/);
    const unavailable = output.match(/브리지 시작 실패: (EPERM|EACCES)/);
    if (unavailable) {
      this.unavailable = unavailable[1];
      return this;
    }
    assert.ok(match, "trusted MCP output must return one strict port-bound pairing record");
    this.port = Number(match[1]);
    this.capability = match[2];
    return this;
  }

  rpc(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP RPC timed out: ${method}`));
      }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  async callTool(name, args = {}) {
    const response = await this.rpc("tools/call", { name, arguments: args });
    assert.equal(response.error, undefined);
    assert.equal(response.result?.isError, undefined);
    return response.result.content[0].text;
  }

  async stop() {
    if (!this.child || this.child.exitCode !== null) return;
    try {
      await request({
        port: this.port,
        path: `/shutdown?cap=${encodeURIComponent(this.capability)}`,
        method: "POST",
      });
    } catch { /* task-owned child may already be gone */ }
    await Promise.race([
      new Promise((resolve) => this.child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    if (this.child.exitCode === null) this.child.kill("SIGTERM");
  }
}

test("browser MCP import graph links with the PNG pHYs export", () => {
  const linker = String.raw`
    const fs = require("node:fs");
    const path = require("node:path");
    const vm = require("node:vm");
    const { pathToFileURL, fileURLToPath } = require("node:url");
    const cache = new Map();
    function load(filename) {
      const absolute = path.resolve(filename);
      if (cache.has(absolute)) return cache.get(absolute);
      const mod = new vm.SourceTextModule(fs.readFileSync(absolute, "utf8"), { identifier: pathToFileURL(absolute).href });
      cache.set(absolute, mod);
      return mod;
    }
    (async () => {
      const entry = load(process.argv[1]);
      await entry.link((specifier, referencing) => {
        if (!specifier.startsWith(".")) throw new Error("unexpected bare browser import");
        const clean = specifier.split("?")[0].split("#")[0];
        return load(path.resolve(path.dirname(fileURLToPath(referencing.identifier)), clean));
      });
    })().catch((error) => { process.stderr.write(error.message); process.exitCode = 1; });
  `;
  const result = spawnSync(process.execPath, ["--experimental-vm-modules", "-e", linker, path.join(ROOT, "js", "mcp-bridge.js")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("pairing records bind one supported port to one strict capability", async () => {
  const pairingUrl = pathToFileURL(path.join(ROOT, "js", "mcp-pairing.js")).href;
  const { parseMcpPairingRecord } = await import(`${pairingUrl}?test=${Date.now()}`);
  const placeholder = "A".repeat(43);
  assert.deepEqual(parseMcpPairingRecord(`mcp-5e://127.0.0.1:8581/#${placeholder}`), {
    port: 8581,
    capability: placeholder,
  });
  for (const invalid of [
    `mcp-5e://127.0.0.1:8584/#${placeholder}`,
    `mcp-5e://localhost:8581/#${placeholder}`,
    `mcp-5e://user@127.0.0.1:8581/#${placeholder}`,
    `mcp-5e://127.0.0.1:8581/?next=http://hostile.example/#${placeholder}`,
    `mcp-5e://127.0.0.1:8581/#${placeholder}<script>`,
    `prefix mcp-5e://127.0.0.1:8581/#${placeholder}`,
  ]) assert.equal(parseMcpPairingRecord(invalid), null);
});

test("two bridges stay alive while only the explicitly paired server receives commands", async (t) => {
  const first = new McpProcess();
  const second = new McpProcess();
  let firstSse = null;
  let secondSse = null;
  try {
    await first.start();
    if (first.unavailable) {
      t.diagnostic(`real loopback bridge unavailable in this sandbox (${first.unavailable}); run with loopback permission for HTTP/SSE coverage`);
      t.skip("sandbox denied task-owned loopback listener");
      return;
    }
    await second.start();
    assert.notEqual(first.port, second.port);

    const firstHealth = await request({ port: first.port, path: "/health", headers: { origin: DEV_ORIGIN } });
    const secondHealth = await request({ port: second.port, path: "/health", headers: { origin: DEV_ORIGIN } });
    assert.equal(firstHealth.status, 200);
    assert.equal(secondHealth.status, 200);
    assert.deepEqual(Object.keys(JSON.parse(firstHealth.body)).sort(), ["connected", "ok", "server"]);
    assert.equal(firstHealth.body.includes(first.capability), false);
    assert.equal(secondHealth.body.includes(second.capability), false);
    for (const endpoint of ["/pairing", "/token", "/capability"]) {
      const minted = await request({ port: first.port, path: endpoint, method: "POST" });
      assert.equal(minted.status, 404);
      assert.equal(minted.body.includes(first.capability), false);
    }
    assert.equal((await request({ port: first.port, path: "/health", headers: { host: `hostile.example:${first.port}` } })).status, 403);

    const unauthenticatedShutdown = await request({ port: first.port, path: "/shutdown", method: "POST" });
    assert.equal(unauthenticatedShutdown.status, 401);
    assert.equal((await request({ port: first.port, path: "/shutdown?cap=wrong", method: "POST" })).status, 401);
    assert.equal((await request({ port: first.port, path: "/health" })).status, 200);

    assert.equal((await openSse({ port: second.port, capability: "", clientId: "owner-a" })).status, 401);
    assert.equal((await openSse({ port: second.port, capability: "wrong", clientId: "owner-a" })).status, 401);
    assert.equal((await request({
      port: second.port,
      path: `/events?cid=owner-a&cap=${encodeURIComponent(second.capability)}`,
    })).status, 403);
    assert.equal((await openSse({ port: second.port, capability: second.capability, clientId: "owner-a", origin: "https://hostile.example" })).status, 403);
    assert.equal((await openSse({ port: second.port, capability: second.capability, clientId: "owner-a", host: `hostile.example:${second.port}` })).status, 403);

    firstSse = await openSse({ port: first.port, capability: first.capability, clientId: "file-owner", origin: "null" });
    assert.equal(firstSse.status, 200);
    assert.equal(firstSse.res.headers["access-control-allow-origin"], "null");
    firstSse.close();
    await firstSse.closed;
    await waitForBridgeDisconnected(first.port);

    firstSse = await openSse({ port: first.port, capability: first.capability, clientId: "prod-owner", origin: PROD_ORIGIN });
    assert.equal(firstSse.status, 200);
    assert.equal(firstSse.res.headers["access-control-allow-origin"], PROD_ORIGIN);
    firstSse.close();

    secondSse = await openSse({ port: second.port, capability: second.capability, clientId: "owner-a" });
    assert.equal(secondSse.status, 200);
    await secondSse.waitFor(/: connected/);

    const takeover = await openSse({ port: second.port, capability: second.capability, clientId: "owner-b", manual: true });
    assert.equal(takeover.status, 409);
    takeover.close();

    const forged = await request({
      port: second.port,
      path: `/result?cap=${encodeURIComponent(second.capability)}&cid=owner-b`,
      method: "POST",
      headers: { origin: DEV_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ id: 1, ok: true, data: {} }),
    });
    assert.equal(forged.status, 403);

    const wrongCapability = await request({
      port: second.port,
      path: "/result?cap=wrong&cid=owner-a",
      method: "POST",
      headers: { origin: DEV_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ id: 1, ok: true, data: {} }),
    });
    assert.equal(wrongCapability.status, 401);

    const hostileResultOrigin = await request({
      port: second.port,
      path: `/result?cap=${encodeURIComponent(second.capability)}&cid=owner-a`,
      method: "POST",
      headers: { origin: "https://hostile.example", "content-type": "application/json" },
      body: JSON.stringify({ id: 1, ok: true, data: {} }),
    });
    assert.equal(hostileResultOrigin.status, 403);

    const noPendingRequest = await request({
      port: second.port,
      path: `/result?cap=${encodeURIComponent(second.capability)}&cid=owner-a`,
      method: "POST",
      headers: { origin: DEV_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ id: 999999, ok: true, data: {} }),
    });
    assert.equal(noPendingRequest.status, 404);

    const malformedResult = await request({
      port: second.port,
      path: `/result?cap=${encodeURIComponent(second.capability)}&cid=owner-a`,
      method: "POST",
      headers: { origin: DEV_ORIGIN, "content-type": "application/json" },
      body: "{not-json",
    });
    assert.equal(malformedResult.status, 400);

    const oversized = await request({
      port: second.port,
      path: `/result?cap=${encodeURIComponent(second.capability)}&cid=owner-a`,
      method: "POST",
      headers: { origin: DEV_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ id: 1, ok: true, data: "x".repeat(70 * 1024) }),
    });
    assert.equal(oversized.status, 413);

    const commandResult = second.callTool("read_app");
    const frame = await secondSse.waitFor(/data: (\{"id":\d+,"cmd":"getState"[^\n]*\})/);
    const command = JSON.parse(frame[1]);
    const posted = await request({
      port: second.port,
      path: `/result?cap=${encodeURIComponent(second.capability)}&cid=owner-a`,
      method: "POST",
      headers: { origin: DEV_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ id: command.id, ok: true, data: { artboard: { w: 90, h: 60 }, objects: [] } }),
    });
    assert.equal(posted.status, 204);
    assert.deepEqual(JSON.parse(await commandResult), { artboard: { w: 90, h: 60 }, objects: [] });
    assert.equal((await request({ port: first.port, path: "/health" })).status, 200);

    const staleCommandResult = second.callTool("read_app");
    const staleFrame = await secondSse.waitFor(/data: (\{"id":\d+,"cmd":"getState"[^\n]*\})/);
    const staleCommand = JSON.parse(staleFrame[1]);
    const chunked = beginChunkedResult({ port: second.port, capability: second.capability, clientId: "owner-a" });
    chunked.req.write(`{"id":${staleCommand.id},"ok":true,"data":`);
    await new Promise((resolve) => setTimeout(resolve, 30));
    secondSse.close();
    await secondSse.closed;
    await waitForBridgeDisconnected(second.port);
    const replacement = await openSse({ port: second.port, capability: second.capability, clientId: "owner-b" });
    assert.equal(replacement.status, 200);
    chunked.req.end("{\"stale\":true}}");
    assert.equal((await chunked.response).status, 403);
    replacement.close();
    await replacement.closed;
    await waitForBridgeDisconnected(second.port);
    secondSse = await openSse({ port: second.port, capability: second.capability, clientId: "owner-a" });
    assert.equal(secondSse.status, 200);
    assert.equal((await request({
      port: second.port,
      path: `/result?cap=${encodeURIComponent(second.capability)}&cid=owner-a`,
      method: "POST",
      headers: { origin: DEV_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ id: staleCommand.id, ok: true, data: { stale: false } }),
    })).status, 204);
    assert.deepEqual(JSON.parse(await staleCommandResult), { stale: false });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const reconnect = await openSse({ port: second.port, capability: second.capability, clientId: "owner-a" });
      assert.equal(reconnect.status, 200);
      secondSse = reconnect;
    }
    const resumedCommandResult = second.callTool("read_app");
    const resumedFrame = await secondSse.waitFor(/data: (\{"id":\d+,"cmd":"getState"[^\n]*\})/);
    const resumedCommand = JSON.parse(resumedFrame[1]);
    assert.equal((await request({
      port: second.port,
      path: `/result?cap=${encodeURIComponent(second.capability)}&cid=owner-a`,
      method: "POST",
      headers: { origin: DEV_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ id: resumedCommand.id, ok: true, data: { resumed: true } }),
    })).status, 204);
    assert.deepEqual(JSON.parse(await resumedCommandResult), { resumed: true });
  } finally {
    firstSse?.close();
    secondSse?.close();
    await second.stop();
    await first.stop();
  }
});
