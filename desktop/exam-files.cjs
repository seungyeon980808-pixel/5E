"use strict";
// 11-11 사용자: 설치판에서 쓴 문항·시험지는 날아가지 않게 로컬 파일에 쌓이고, 내보내는 파일은 정해진 폴더에 차곡차곡.
// 폴더: ~/Documents/5E/출제 (라이브러리 「~/Documents/5E/내 자료」와 같은 5E 폴더).
//   자동 저장/최근.json        — 바뀔 때마다 덮어씀(원자적 쓰기)
//   자동 저장/백업/YYYY-MM-DD/HHMM.json — 10분에 한 번, 지우지 않음
//   한글/YYYY-MM-DD_HHMM_<이름>.hwpx      — HWPX·HWP
//   엑셀/…xlsx, 기타/…
// 이름·종류만 받고 경로는 받지 않는다(폴더 밖으로 못 나감).
const fs = require("node:fs");
const path = require("node:path");

const KINDS = { hwpx: "한글", hwp: "한글", xlsx: "엑셀", json: "기타", pdf: "PDF", png: "그림" };
const MAX_JSON = 512 * 1024 * 1024, MAX_FILE = 256 * 1024 * 1024, BACKUP_EVERY_MS = 10 * 60 * 1000;

function stamp(date = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return { day: `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`, time: `${p(date.getHours())}${p(date.getMinutes())}` };
}
function safeName(name) {
  const clean = String(name || "").normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").trim().slice(0, 120);
  return clean || "5E";
}
function toBuffer(bytes) {
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  if (ArrayBuffer.isView(bytes)) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  throw new TypeError("파일 내용이 올바르지 않습니다.");
}
async function writeAtomic(file, data) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(temp, data);
  await fs.promises.rename(temp, file);
}
async function uniquePath(file) {
  const ext = path.extname(file), base = file.slice(0, file.length - ext.length);
  for (let i = 1; i < 1000; i++) {
    const candidate = i === 1 ? file : `${base} (${i})${ext}`;
    try { await fs.promises.access(candidate); } catch { return candidate; }
  }
  throw new Error("같은 이름의 파일이 너무 많습니다.");
}

function createExamFiles({ documentsPath, now = () => new Date() }) {
  const root = () => {
    const docs = typeof documentsPath === "function" ? documentsPath() : documentsPath;
    if (typeof docs !== "string" || !docs) throw new Error("문서 폴더를 찾지 못했습니다.");
    return path.join(docs, "5E", "출제");
  };
  let lastBackup = 0, chain = Promise.resolve();
  const serial = task => (chain = chain.catch(() => {}).then(task));

  async function autosave(text) {
    if (typeof text !== "string" || !text.length || text.length > MAX_JSON) throw new Error("자동 저장 내용이 올바르지 않습니다.");
    return serial(async () => {
      const dir = path.join(root(), "자동 저장"), latest = path.join(dir, "최근.json");
      await writeAtomic(latest, text);
      const date = now();
      if (date.getTime() - lastBackup >= BACKUP_EVERY_MS) {
        const { day, time } = stamp(date);
        await writeAtomic(path.join(dir, "백업", day, `${time}.json`), text);
        lastBackup = date.getTime();
      }
      return { path: latest, savedAt: date.toISOString() };
    });
  }
  async function readLatest() {
    try { return { text: await fs.promises.readFile(path.join(root(), "자동 저장", "최근.json"), "utf8") }; }
    catch (error) { if (error?.code === "ENOENT") return { text: null }; throw error; }
  }
  async function save({ name, ext, bytes } = {}) {
    const extension = String(ext || "").toLowerCase();
    if (!KINDS[extension]) throw new Error("저장할 수 없는 파일 종류입니다.");
    const buffer = toBuffer(bytes);
    if (!buffer.length || buffer.length > MAX_FILE) throw new Error("파일 크기가 올바르지 않습니다.");
    const { day, time } = stamp(now());
    const base = safeName(String(name || "").replace(new RegExp(`\\.${extension}$`, "i"), ""));
    const file = await uniquePath(path.join(root(), KINDS[extension], `${day}_${time}_${base}.${extension}`));
    await writeAtomic(file, buffer);
    return { path: file, name: path.basename(file) };
  }
  // 우리가 만든 출제 폴더 안의 파일만 열거나 보여 준다.
  function inside(file) {
    const resolved = path.resolve(String(file || ""));
    const base = path.resolve(root()) + path.sep;
    if (!resolved.startsWith(base)) throw new Error("출제 폴더 밖의 파일은 열 수 없습니다.");
    return resolved;
  }
  return { root, autosave, readLatest, save, inside };
}

function registerExamFilesIpc({ handle, shell, documentsPath }) {
  const files = createExamFiles({ documentsPath });
  handle("exam-files:autosave", (_event, text) => files.autosave(text));
  handle("exam-files:read-latest", () => files.readLatest());
  handle("exam-files:save", (_event, payload) => files.save(payload && typeof payload === "object" ? payload : {}));
  handle("exam-files:open", async (_event, file) => { const error = await shell.openPath(files.inside(file)); if (error) throw new Error(error); return true; });
  handle("exam-files:reveal", (_event, file) => { shell.showItemInFolder(files.inside(file)); return true; });
  handle("exam-files:folder", async () => { const dir = files.root(); await fs.promises.mkdir(dir, { recursive: true }); return { path: dir }; });
  handle("exam-files:open-folder", async () => { const dir = files.root(); await fs.promises.mkdir(dir, { recursive: true }); const error = await shell.openPath(dir); if (error) throw new Error(error); return true; });
  return files;
}

module.exports = { createExamFiles, registerExamFilesIpc, stamp, safeName };
