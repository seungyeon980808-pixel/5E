const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLocalImageAccess, isTrustedIpcSender } = require("./local-image-policy.cjs");

test("local image IPC accepts only the canonical preview main frame", () => {
  const mainFrame = { url: "file:///app/preview/index.html?desktop=1" };
  const webContents = { mainFrame };
  const expectedWindow = { isDestroyed: () => false, webContents };
  const event = { sender: webContents, senderFrame: mainFrame };
  assert.equal(isTrustedIpcSender(event, expectedWindow, "file:///app/preview/index.html"), true);
  assert.equal(isTrustedIpcSender({ ...event, senderFrame: { url: mainFrame.url } }, expectedWindow, "file:///app/preview/index.html"), false);
  assert.equal(isTrustedIpcSender({ ...event, sender: {} }, expectedWindow, "file:///app/preview/index.html"), false);
  assert.equal(isTrustedIpcSender(event, expectedWindow, "file:///app/index.html"), false);
});

test("selected image roots resolve aliases and reads stay on the authorized inode", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "5e-local-image-"));
  try {
    const root = path.join(fixture, "selected");
    const outside = path.join(fixture, "outside");
    fs.mkdirSync(root);
    fs.mkdirSync(outside);
    const insideFile = path.join(root, "inside.png");
    const outsideFile = path.join(outside, "outside.png");
    fs.writeFileSync(insideFile, Buffer.from("inside"));
    fs.writeFileSync(outsideFile, Buffer.from("outside"));
    fs.symlinkSync(insideFile, path.join(root, "inside-link.png"));
    fs.symlinkSync(outsideFile, path.join(root, "escape.png"));

    const access = createLocalImageAccess({ maxBytes: 64 });
    const canonicalRoot = access.addRoot(root);
    assert.equal(canonicalRoot, fs.realpathSync.native(root));
    assert.equal(access.read(insideFile).bytes.toString(), "inside");
    assert.throws(() => access.read(path.join(root, "inside-link.png")), /심볼릭 링크 이미지는 열 수 없습니다/);
    assert.throws(() => access.read(path.join(root, "escape.png")), /심볼릭 링크 이미지는 열 수 없습니다/);
    assert.throws(() => access.read(outsideFile), /허용되지 않은 이미지 경로/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("local image reads reject unsupported, non-regular, and oversized targets", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "5e-local-image-policy-"));
  try {
    const root = path.join(fixture, "selected");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, "too-large.png"), Buffer.alloc(9));
    fs.writeFileSync(path.join(root, "notes.txt"), Buffer.from("text"));
    fs.mkdirSync(path.join(root, "folder.png"));
    const access = createLocalImageAccess({ maxBytes: 8 });
    access.addRoot(root);
    assert.throws(() => access.read(path.join(root, "too-large.png")), /이미지 파일이 너무 큽니다/);
    assert.throws(() => access.read(path.join(root, "notes.txt")), /지원하지 않는 이미지 형식/);
    assert.throws(() => access.read(path.join(root, "folder.png")), /일반 파일이 아닙니다/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
