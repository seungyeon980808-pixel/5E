const fs = require("node:fs");
const path = require("node:path");

const ALLOWED_EXTENSIONS = new Set([".png", ".svg"]);
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function validateExportLeaf(name) {
  if (typeof name !== "string" || !name || name !== path.basename(name) || /[\\/:*?"<>|\u0000-\u001f]/.test(name)) {
    throw new Error("올바르지 않은 파일 이름입니다.");
  }
  if (RESERVED.test(name) || !ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase())) {
    throw new Error("지원하지 않는 파일 이름 또는 형식입니다.");
  }
  return name;
}

async function writeExportFile(directory, name, bytes) {
  const leaf = validateExportLeaf(name);
  const root = await fs.promises.realpath(path.resolve(directory));
  const target = path.resolve(root, leaf);
  if (path.dirname(target) !== root) throw new Error("저장 폴더 밖에는 쓸 수 없습니다.");
  if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) throw new Error("파일 데이터가 올바르지 않습니다.");
  if (bytes.byteLength > 256 * 1024 * 1024) throw new Error("파일이 저장 한도를 넘습니다.");
  const buffer = bytes instanceof ArrayBuffer
    ? Buffer.from(new Uint8Array(bytes))
    : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let exists = false;
  try {
    const stat = await fs.promises.lstat(target);
    exists = true;
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink > 1) {
      throw new Error("링크되었거나 안전하지 않은 기존 파일은 덮어쓸 수 없습니다.");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temp = path.join(root, `.5e-export-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
  const backup = path.join(root, `.5e-export-backup-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
  let originalMoved = false;
  try {
    await fs.promises.writeFile(temp, buffer, { flag: "wx" });
    // Windows cannot rename over an existing leaf. Move the verified original
    // aside first so a failed replacement can restore it without data loss.
    if (exists) {
      await fs.promises.rename(target, backup);
      originalMoved = true;
    }
    await fs.promises.rename(temp, target);
    if (originalMoved) await fs.promises.unlink(backup).catch(() => {});
  } catch (error) {
    await fs.promises.unlink(temp).catch(() => {});
    if (originalMoved) {
      await fs.promises.rename(backup, target).catch((restoreError) => {
        error.message = `${error.message} (원본 복구 실패: ${restoreError.message})`;
      });
    }
    throw error;
  }
  return { status: "saved", path: target, name: leaf, folderName: path.basename(root) };
}

module.exports = { validateExportLeaf, writeExportFile };
