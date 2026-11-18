// 9월 판(5E-archive services/google-drive-gateway) 검사를 11-03 배포본(경로 조각별 조회)에 맞춤.
// 실행: node --test cloudflare/google-drive-gateway/worker.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import { createGoogleDriveGateway, parseGatewayRequest } from "./worker.mjs";

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

test("Given a public folder asset route, when requested, then the gateway looks up each path with its server key and streams only the requested PDF", async () => {
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
  // 11-03 판은 폴더 전체를 훑지 않고 요청한 경로만 찾으므로 파일마다 조회 1번.
  assert.equal(listRequests, 2);
  const again = await gateway.fetch(new Request(`https://gateway.example/v1/google-drive/folders/${ROOT_ID}/public/pack.json`), { GOOGLE_DRIVE_API_KEY: "server-secret-key" });
  assert.equal(again.status, 200);
  assert.equal(listRequests, 2, "같은 경로는 5분 동안 다시 찾지 않음");
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

function listOnly(entries) {
  return async (request) => {
    const url = request instanceof URL ? request : new URL(request);
    const q = url.searchParams.get("q") || "";
    if (!q) return new Response("%PDF-1.4\n%%EOF", { status: 200 });
    const parent = /'([^']+)' in parents/u.exec(q)[1];
    const files = (entries[parent] || []).filter((file) => q.includes(`'${file.name}'`) || q.includes(`'${file.name.normalize("NFC")}'`) || q.includes(`'${file.name.normalize("NFD")}'`));
    return new Response(JSON.stringify({ files }), { status: 200 });
  };
}

test("Given a nested path whose folder name was uploaded in NFD form, when requested, then each segment is resolved and the PDF is found", async () => {
  const folder = { id: "SubFolder_123456", name: "국어".normalize("NFD"), mimeType: "application/vnd.google-apps.folder" };
  const pdf = { id: "NestedPdf_12345", name: "문제지.pdf", mimeType: "application/pdf", size: "15", capabilities: { canDownload: true } };
  const gateway = createGoogleDriveGateway({ fetcher: listOnly({ [ROOT_ID]: [folder], [folder.id]: [pdf] }) });
  const response = await gateway.fetch(new Request(`https://gateway.example/v1/google-drive/folders/${ROOT_ID}/public/${encodeURIComponent("국어")}/${encodeURIComponent("문제지.pdf")}`), { GOOGLE_DRIVE_API_KEY: "k" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
});

test("Given two files with the same name, when requested, then the gateway answers 409 instead of guessing", async () => {
  const a = { id: "DupFileA_12345", name: "same.pdf", mimeType: "application/pdf" };
  const b = { id: "DupFileB_12345", name: "same.pdf", mimeType: "application/pdf" };
  const gateway = createGoogleDriveGateway({ fetcher: listOnly({ [ROOT_ID]: [a, b] }) });
  const response = await gateway.fetch(new Request(`https://gateway.example/v1/google-drive/folders/${ROOT_ID}/public/same.pdf`), { GOOGLE_DRIVE_API_KEY: "k" });
  assert.equal(response.status, 409);
});

test("Given no API key secret, when requested, then the gateway answers 503 without calling Drive", async () => {
  const gateway = createGoogleDriveGateway({ fetcher: async () => { throw new Error("must not fetch"); } });
  const response = await gateway.fetch(new Request(`https://gateway.example/v1/google-drive/folders/${ROOT_ID}/public/pack.json`), {});
  assert.equal(response.status, 503);
});
