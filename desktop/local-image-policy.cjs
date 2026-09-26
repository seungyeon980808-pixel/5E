const fs = require("node:fs");
const path = require("node:path");

const LOCAL_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"]);
const LOCAL_IMAGE_MAX_BYTES = 64 * 1024 * 1024;

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function isTrustedIpcSender(event, expectedWindow, expectedUrl) {
  return Boolean(expectedWindow && !expectedWindow.isDestroyed()
    && event.sender === expectedWindow.webContents
    && event.senderFrame === expectedWindow.webContents.mainFrame
    && String(event.senderFrame.url || "").split(/[?#]/, 1)[0] === expectedUrl);
}

function readDescriptor(fd, expectedSize) {
  const bytes = Buffer.alloc(expectedSize);
  let offset = 0;
  while (offset < expectedSize) {
    const count = fs.readSync(fd, bytes, offset, expectedSize - offset, offset);
    if (!count) break;
    offset += count;
  }
  const after = fs.fstatSync(fd);
  if (offset !== expectedSize || after.size !== expectedSize) {
    throw new Error("이미지 파일이 읽는 동안 변경되었습니다.");
  }
  return bytes;
}

function createLocalImageAccess({ maxBytes = LOCAL_IMAGE_MAX_BYTES } = {}) {
  const roots = new Set();

  function canonical(value) {
    return fs.realpathSync.native(path.resolve(String(value || "")));
  }

  function addRoot(value) {
    const root = canonical(value);
    if (!fs.statSync(root).isDirectory()) throw new Error("로컬 이미지 폴더를 찾을 수 없습니다.");
    roots.add(root);
    return root;
  }

  function requireRoot(value) {
    const root = canonical(value);
    if (!roots.has(root)) throw new Error("먼저 폴더 선택 창에서 로컬 폴더를 연결하세요.");
    return root;
  }

  function read(value) {
    const requested = path.resolve(String(value || ""));
    if (fs.lstatSync(requested).isSymbolicLink()) throw new Error("심볼릭 링크 이미지는 열 수 없습니다.");
    const target = canonical(requested);
    const extension = path.extname(target).toLowerCase();
    if (!LOCAL_IMAGE_EXTENSIONS.has(extension)) throw new Error("지원하지 않는 이미지 형식입니다.");
    if (![...roots].some((root) => isPathInside(root, target))) {
      throw new Error("허용되지 않은 이미지 경로입니다.");
    }

    const noFollow = fs.constants.O_NOFOLLOW || 0;
    const fd = fs.openSync(target, fs.constants.O_RDONLY | noFollow);
    try {
      const opened = fs.fstatSync(fd);
      if (!opened.isFile()) throw new Error("이미지 경로가 일반 파일이 아닙니다.");
      if (opened.size > maxBytes) throw new Error("이미지 파일이 너무 큽니다.");
      const verifiedTarget = canonical(requested);
      if (verifiedTarget !== target || ![...roots].some((root) => isPathInside(root, verifiedTarget))) {
        throw new Error("이미지 파일이 읽는 동안 변경되었습니다.");
      }
      if (fs.lstatSync(requested).isSymbolicLink()) throw new Error("이미지 파일이 읽는 동안 변경되었습니다.");
      const current = fs.statSync(verifiedTarget);
      if (!sameFile(opened, current)) throw new Error("이미지 파일이 읽는 동안 변경되었습니다.");
      return { path: target, extension, bytes: readDescriptor(fd, opened.size) };
    } finally {
      fs.closeSync(fd);
    }
  }

  return { addRoot, requireRoot, read };
}

module.exports = {
  LOCAL_IMAGE_EXTENSIONS,
  LOCAL_IMAGE_MAX_BYTES,
  createLocalImageAccess,
  isTrustedIpcSender,
};
