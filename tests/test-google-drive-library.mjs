import assert from "node:assert/strict";
import test from "node:test";

import {
  configuredGoogleDriveGatewayUrl,
  createGoogleDriveConnection,
  googleDrivePackBaseUrl,
  normalizeGoogleDriveGatewayUrl,
  parseGoogleDriveFolderUrl,
} from "../js/pdf-library/google-drive.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

test("Given supported public Drive links, when parsed, then only the folder identity and optional resource key remain", () => {
  const direct = parseGoogleDriveFolderUrl("https://drive.google.com/drive/u/2/folders/Folder_123456789?usp=sharing&resourcekey=Resource_123456");
  const legacy = parseGoogleDriveFolderUrl("https://drive.google.com/open?id=Folder_123456789");

  assert.deepEqual(direct, {
    folderId: "Folder_123456789",
    resourceKey: "Resource_123456",
    folderUrl: "https://drive.google.com/drive/folders/Folder_123456789?resourcekey=Resource_123456",
  });
  assert.equal(legacy.folderId, "Folder_123456789");
  assert.throws(() => parseGoogleDriveFolderUrl("https://example.com/drive/folders/Folder_123456789"), /공개 Google Drive/);
});

test("Given a configured read-only gateway, when a Drive folder connects, then the pack route is derived and persisted only after validation", async () => {
  const storage = memoryStorage();
  const requested = [];
  const pack = { title: "공개 기출", documentCount: 3 };
  const connection = createGoogleDriveConnection({
    gatewayBaseUrl: "https://gateway.example/",
    storage,
    async loadPack(options) { requested.push(options.baseUrl); return pack; },
  });

  const connected = await connection.connect("https://drive.google.com/drive/folders/Folder_123456789?resourcekey=Resource_123456");

  assert.equal(requested[0], "https://gateway.example/v1/google-drive/folders/Folder_123456789/resource/Resource_123456/");
  assert.equal(connected.pack, pack);
  assert.match(connection.savedFolderUrl(), /Folder_123456789/);
  connection.disconnect();
  assert.equal(connection.savedFolderUrl(), "");
});

test("Given a failed pack validation, when connecting, then no unusable Drive link is persisted", async () => {
  const storage = memoryStorage();
  const connection = createGoogleDriveConnection({
    gatewayBaseUrl: "https://gateway.example/",
    storage,
    async loadPack() { throw new Error("invalid pack"); },
  });

  await assert.rejects(connection.connect("https://drive.google.com/drive/folders/Folder_123456789"), /invalid pack/);
  assert.equal(connection.savedFolderUrl(), "");
});

test("Given deployment configuration, when resolved, then HTTPS and exact loopback HTTP are accepted without exposing a key", async () => {
  assert.equal(normalizeGoogleDriveGatewayUrl("https://gateway.example/base"), "https://gateway.example/base/");
  assert.throws(() => normalizeGoogleDriveGatewayUrl("http://localhost:8787/"), /HTTPS|loopback/);
  assert.equal(googleDrivePackBaseUrl("http://127.0.0.1:8787/", "https://drive.google.com/drive/folders/Folder_123456789"), "http://127.0.0.1:8787/v1/google-drive/folders/Folder_123456789/public/");
  assert.equal(await configuredGoogleDriveGatewayUrl({
    configuredUrl: "",
    fetcher: async () => new Response(JSON.stringify({ schemaVersion: 1, gatewayBaseUrl: "https://gateway.example/" })),
  }), "https://gateway.example/");
});


test("Provided and personal Drive connections keep independent state and preserve physical folder paths", async () => {
  const { driveFolderPack, PROVIDED_DRIVE_FOLDER_URL } = await import("../js/pdf-library/google-drive.js");
  const { createHierarchicalSourceNodes } = await import("../js/library/source-tree.js");
  const pack = { id: "provided", title: "공유 자료", documents: [{ id: "pdf", source: { locator: "provided/기출문제/물리1/test.pdf" } }] };
  const shared = createGoogleDriveConnection({ gatewayBaseUrl: "https://gateway.example/", storage: null, loadPack: async () => pack });
  const personal = createGoogleDriveConnection({ gatewayBaseUrl: "https://gateway.example/", storage: memoryStorage(), loadPack: async () => pack });
  await shared.connect(PROVIDED_DRIVE_FOLDER_URL);
  await personal.connect("https://drive.google.com/drive/folders/Personal123456");
  personal.disconnect();
  assert.equal(shared.current().pack, pack);
  assert.equal(shared.savedFolderUrl(), "");
  const wrapped = driveFolderPack(pack, PROVIDED_DRIVE_FOLDER_URL);
  assert.equal(wrapped.documents[0].source.relativePath, "기출문제/물리1/test.pdf");
  assert.equal(pack.documents[0].source.relativePath, undefined);
  const nodes = createHierarchicalSourceNodes([{ id: "pdf", label: "test.pdf", driveFolder: wrapped.documents[0].driveFolder, pathSegments: ["기출문제", "물리1"], resultKinds: ["page"] }]);
  assert.deepEqual(nodes.map(node => node.label), ["공유 자료", "기출문제", "물리1", "test.pdf"]);
  assert.equal(nodes.filter(node => node.kind === "category").length, 0);
});
