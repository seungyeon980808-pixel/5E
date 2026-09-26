import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  bridgePairingRecord,
  sendToApp,
  startBridge,
  stopBridge,
} from "../lib/bridge.js";
import { parseMcpPairingRecord } from "../../../preview/js/mcp-pairing.js";

const ORIGIN = "https://seungyeon980808-pixel.github.io";
const SAMPLE_CAPABILITY = "A".repeat(43);

test("pairing records accept only the fixed IPv4 loopback shape and port range", () => {
  assert.deepEqual(parseMcpPairingRecord(`mcp-5e://127.0.0.1:8579/#${SAMPLE_CAPABILITY}`), {
    port: 8579,
    capability: SAMPLE_CAPABILITY,
  });
  for (const record of [
    `mcp-5e://localhost:8579/#${SAMPLE_CAPABILITY}`,
    `mcp-5e://127.0.0.1:9000/#${SAMPLE_CAPABILITY}`,
    `mcp-5e://127.0.0.1:8579/extra#${SAMPLE_CAPABILITY}`,
    `mcp-5e://127.0.0.1:8579/?origin=other#${SAMPLE_CAPABILITY}`,
  ]) assert.equal(parseMcpPairingRecord(record), null);
});

function request({ port, path = "/", method = "GET", headers = {}, body = "" }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function readSseEvent(reader, wantedEvent) {
  const decoder = new TextDecoder();
  let buffered = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) throw new Error(`SSE ended before ${wantedEvent}`);
    buffered += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
    let boundary;
    while ((boundary = buffered.indexOf("\n\n")) >= 0) {
      const block = buffered.slice(0, boundary);
      buffered = buffered.slice(boundary + 2);
      let event = "message";
      const data = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        if (line.startsWith("data: ")) data.push(line.slice(6));
      }
      if (event === wantedEvent) return JSON.parse(data.join("\n"));
    }
  }
}

test("bridge denies unbound callers and completes one capability/session-bound round trip", async () => {
  const port = await startBridge();
  assert.ok(port, "a loopback bridge port should be available");
  try {
    const pairing = new URL(bridgePairingRecord());
    const capability = decodeURIComponent(pairing.hash.slice(1));
    const base = `http://127.0.0.1:${port}`;

    const missingCapability = await request({ port, path: "/events?cid=missing", headers: { origin: ORIGIN } });
    assert.equal(missingCapability.status, 401);
    assert.equal(missingCapability.headers["access-control-allow-origin"], ORIGIN);
    assert.notEqual(missingCapability.headers["access-control-allow-origin"], "*");

    const wrongOrigin = await request({
      port,
      path: "/events?cid=wrong-origin",
      headers: { origin: "https://example.invalid", authorization: `Bearer ${capability}` },
    });
    assert.equal(wrongOrigin.status, 403);

    const wrongHost = await request({
      port,
      path: "/events?cid=wrong-host",
      headers: { host: "example.invalid", origin: ORIGIN, authorization: `Bearer ${capability}` },
    });
    assert.equal(wrongHost.status, 421);

    const stream = await fetch(`${base}/events?cid=authorized&manual=1`, {
      headers: { origin: ORIGIN, authorization: `Bearer ${capability}` },
    });
    assert.equal(stream.status, 200);
    const reader = stream.body.getReader();
    const { sessionId } = await readSseEvent(reader, "session");
    assert.match(sessionId, /^[A-Za-z0-9_-]{22}$/);

    const replacement = await request({
      port,
      path: "/events?cid=replacement",
      headers: { origin: ORIGIN, authorization: `Bearer ${capability}` },
    });
    assert.equal(replacement.status, 409);

    const responsePromise = sendToApp("ping", {});
    const command = await readSseEvent(reader, "message");
    const wrongSession = await request({
      port,
      path: "/result",
      method: "POST",
      headers: {
        origin: ORIGIN,
        authorization: `Bearer ${capability}`,
        "content-type": "application/json",
        "x-mcp-session": "wrong-session",
      },
      body: JSON.stringify({ id: command.id, ok: true, data: { app: "wrong" } }),
    });
    assert.equal(wrongSession.status, 409);

    const accepted = await request({
      port,
      path: "/result",
      method: "POST",
      headers: {
        origin: ORIGIN,
        authorization: `Bearer ${capability}`,
        "content-type": "application/json",
        "x-mcp-session": sessionId,
      },
      body: JSON.stringify({ id: command.id, ok: true, data: { app: "5E", objects: 0 } }),
    });
    assert.equal(accepted.status, 204);
    assert.deepEqual(await responsePromise, { app: "5E", objects: 0 });

    const replacedCommand = assert.rejects(sendToApp("ping", {}), /교체되었습니다/);
    await readSseEvent(reader, "message");
    const desktopStream = await fetch(`${base}/events?cid=desktop&manual=1`, {
      headers: { origin: "null", authorization: `Bearer ${capability}` },
    });
    assert.equal(desktopStream.status, 200);
    await replacedCommand;
    const desktopReader = desktopStream.body.getReader();
    const desktopSession = await readSseEvent(desktopReader, "session");
    const desktopResponse = sendToApp("ping", {});
    const desktopCommand = await readSseEvent(desktopReader, "message");
    const desktopAccepted = await request({
      port,
      path: "/result",
      method: "POST",
      headers: {
        origin: "null",
        authorization: `Bearer ${capability}`,
        "content-type": "application/json",
        "x-mcp-session": desktopSession.sessionId,
      },
      body: JSON.stringify({ id: desktopCommand.id, ok: true, data: { app: "5E-desktop" } }),
    });
    assert.equal(desktopAccepted.status, 204);
    assert.deepEqual(await desktopResponse, { app: "5E-desktop" });

    const disconnectedCommand = assert.rejects(sendToApp("ping", {}), /연결이 끊어졌습니다/);
    await readSseEvent(desktopReader, "message");
    await desktopReader.cancel();
    await disconnectedCommand;

    const reconnected = await fetch(`${base}/events?cid=desktop`, {
      headers: { origin: "null", authorization: `Bearer ${capability}` },
    });
    assert.equal(reconnected.status, 200);
    await reconnected.body.cancel();
  } finally {
    await stopBridge();
  }
});
