import assert from "node:assert/strict";
import test from "node:test";

import { createGoogleDriveGateway, parseGatewayRequest } from "../services/google-drive-gateway/worker.mjs";

const ROOT_ID = "RootFolder_12345";
const FILES = Object.freeze({
  pack: { id: "PackFile_12345", name: "pack.json", mimeType: "application/json", size: "18", md5Checksum: "pack-md5", capabilities: { canDownload: true } },
  pdf: { id: "PdfFile_123456", name: "fixture.pdf", mimeType: "application/pdf", size: "22", resourceKey: "PdfResource_123", capabilities: { canDownload: true } },
});

function driveFetcher(request, options = {}) {
  const url = request instanceof URL ? request : new URL(request);
  if (url.searchParams.get("q")) {
    assert.equal(url.searchParams.get("key"), "server-secret-key");
    return Promise.resolve(new Response(JSON.stringify({ files: [FILES.pack, FILES.pdf] }), { status: 200, headers: { "content-type": "application/json" } }));
  }
  const id = decodeURIComponent(url.pathname.split("/").at(-1));
  const file = Object.values(FILES).find((entry) => entry.id === id);
  assert.ok(file);
  if (file.resourceKey) assert.equal(options.headers["x-goog-drive-resource-keys"], `${file.id}/${file.resourceKey}`);
  const bytes = file.mimeType === "application/pdf" ? "%PDF-1.4\nfixture\n%%EOF" : "{\"schemaVersion\":1}";
  return Promise.resolve(new Response(bytes, { status: 200, headers: { "content-length": String(Buffer.byteLength(bytes)) } }));
}

test("Given a public folder asset route, when requested, then the gateway lists with its server key and streams only the requested PDF", async () => {
  let listRequests = 0;
  const gateway = createGoogleDriveGateway({ fetcher(request, options) {
    const url = request instanceof URL ? request : new URL(request);
    if (url.searchParams.get("q")) listRequests += 1;
    return driveFetcher(request, options);
  } });
  const request = new Request(`https://gateway.example/v1/google-drive/folders/${ROOT_ID}/public/fixture.pdf`);

  const response = await gateway.fetch(request, { GOOGLE_DRIVE_API_KEY: "server-secret-key" });
  const manifest = await gateway.fetch(new Request(`https://gateway.example/v1/google-drive/folders/${ROOT_ID}/public/pack.json`), { GOOGLE_DRIVE_API_KEY: "server-secret-key" });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.match(await response.text(), /^%PDF-/u);
  assert.equal(manifest.status, 200);
  assert.equal(listRequests, 1);
  assert.equal(JSON.stringify([...response.headers]).includes("server-secret-key"), false);
});

test("Given invalid or mutating requests, when they reach the gateway, then they are rejected without touching Drive", async () => {
  let fetchCount = 0;
  const gateway = createGoogleDriveGateway({ fetcher: async () => { fetchCount += 1; throw new Error("must not fetch"); } });

  const traversal = await gateway.fetch(new Request(`https://gateway.example/v1/google-drive/folders/${ROOT_ID}/public/%252e%252e/secret.pdf`), { GOOGLE_DRIVE_API_KEY: "server-secret-key" });
  const mutation = await gateway.fetch(new Request(`https://gateway.example/v1/google-drive/folders/${ROOT_ID}/public/pack.json`, { method: "POST" }), { GOOGLE_DRIVE_API_KEY: "server-secret-key" });
  const preflight = await gateway.fetch(new Request("https://gateway.example/", { method: "OPTIONS" }), {});

  assert.equal(traversal.status, 404);
  assert.equal(mutation.status, 405);
  assert.equal(preflight.status, 204);
  assert.equal(fetchCount, 0);
  assert.equal(parseGatewayRequest(`https://gateway.example/v1/google-drive/folders/${ROOT_ID}/resource/Resource_123456/pack.json`).resourceKey, "Resource_123456");
});
