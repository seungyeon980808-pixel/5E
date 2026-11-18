"use strict";
// 11-11 사용자: 설치판에서 쓴 문항·시험지는 날아가지 않게 로컬 파일에 쌓이고, 내보내는 파일은 정해진 폴더에 차곡차곡.
// 폴더: ~/Documents/5E/출제 (라이브러리 「~/Documents/5E/내 자료」와 같은 5E 폴더).
//   자동 저장/최근.json        — 바뀔 때마다 덮어씀(원자적 쓰기)
//   자동 저장/백업/YYYY-MM-DD/HHMM.json — 10분에 한 번. 1.7.1: 최근 24개 + 최근 30일은 하루 마지막 하나만 남기고
//                                        나머지는 휴지통으로 옮긴다(영구 삭제 안 함). 하루 300MB씩 쌓이던 것(1단계 09 보고서 B7).
//   한글/YYYY-MM-DD_HHMM_<이름>.hwpx      — HWPX·HWP
//   엑셀/…xlsx, 기타/…
// 이름·종류만 받고 경로는 받지 않는다(폴더 밖으로 못 나감).
const fs = require("node:fs");
const path = require("node:path");

// 1.7.1: 5e(문항·시험지 프로젝트) 더함 — 1.7.0은 여기 없는 .exampool을 저장하려다 「저장할 수 없는 파일 종류」로 실패했다.
const KINDS = Object.freeze({ "5e": "프로젝트", hwpx: "한글", hwp: "한글", xlsx: "엑셀", json: "기타", pdf: "PDF", png: "그림" });
const MAX_JSON = 512 * 1024 * 1024, MAX_FILE = 256 * 1024 * 1024, BACKUP_EVERY_MS = 10 * 60 * 1000;
const BACKUP_KEEP_RECENT = 24, BACKUP_KEEP_DAYS = 30;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/, BACKUP_RE = /^\d{4}\.json$/;

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
// 윈도우에서는 OneDrive·백신·탐색기 미리보기가 「최근.json」을 잠깐 잡고 있으면 덮어쓰기(rename)가 EPERM·EBUSY·EACCES로 실패한다.
// 잠깐 기다렸다 다시 하고, 끝내 안 되면 임시 파일을 치우고 오류를 그대로 던진다(1.8.0 X1 윈도우 점검).
const RENAME_RETRY_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);
const RENAME_RETRY_DELAYS_MS = Object.freeze([40, 80, 160, 320, 640]);
async function renameWithRetry(from, to, { rename = (a, b) => fs.promises.rename(a, b), delays = RENAME_RETRY_DELAYS_MS, wait = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await rename(from, to); }
    catch (error) {
      if (!RENAME_RETRY_CODES.has(error?.code) || attempt >= delays.length) throw error;
      await wait(delays[attempt]);
    }
  }
}
async function writeAtomic(file, data) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(temp, data);
  try { await renameWithRetry(temp, file); }
  catch (error) { await fs.promises.unlink(temp).catch(() => {}); throw error; }
}
async function uniquePath(file) {
  const ext = path.extname(file), base = file.slice(0, file.length - ext.length);
  for (let i = 1; i < 1000; i++) {
    const candidate = i === 1 ? file : `${base} (${i})${ext}`;
    try { await fs.promises.access(candidate); } catch { return candidate; }
  }
  throw new Error("같은 이름의 파일이 너무 많습니다.");
}

// 남길 백업: 최근 24개, 그리고 최근 30일(오늘 포함)은 날마다 마지막 하나. 나머지는 휴지통 후보.
// backups: [{ day: "YYYY-MM-DD", time: "HHMM", ... }] — 이름이 규칙에 맞는 것만 넘긴다.
function backupsToTrash(backups, today, { keepRecent = BACKUP_KEEP_RECENT, keepDays = BACKUP_KEEP_DAYS } = {}) {
  const sorted = [...backups].sort((a, b) => (b.day + b.time).localeCompare(a.day + a.time));
  const keep = new Set(sorted.slice(0, keepRecent));
  const [y, m, d] = String(today).split("-").map(Number);
  const oldest = stamp(new Date(y, m - 1, d - (keepDays - 1))).day;
  const seenDay = new Set();
  for (const item of sorted) {
    if (item.day < oldest || seenDay.has(item.day)) continue;
    seenDay.add(item.day); keep.add(item);
  }
  return sorted.filter(item => !keep.has(item));
}

function createExamFiles({ documentsPath, now = () => new Date(), trash = null }) {
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
        await pruneBackups(day).catch(() => {}); // 정리가 실패해도 자동 저장은 성공으로 둔다
      }
      return { path: latest, savedAt: date.toISOString() };
    });
  }
  // 넘치는 백업을 휴지통으로. 하루 폴더가 통째로 넘치면 폴더째 옮긴다. 이름 규칙 밖의 파일·폴더는 건드리지 않는다.
  async function pruneBackups(today = stamp(now()).day) {
    if (typeof trash !== "function") return { trashed: [] };
    const base = path.join(root(), "자동 저장", "백업");
    let days;
    try { days = (await fs.promises.readdir(base, { withFileTypes: true })).filter(e => e.isDirectory() && DAY_RE.test(e.name)).map(e => e.name); }
    catch (error) { if (error?.code === "ENOENT") return { trashed: [] }; throw error; }
    const backups = [], dayEntries = new Map();
    for (const day of days) {
      const names = await fs.promises.readdir(path.join(base, day));
      dayEntries.set(day, names);
      for (const name of names) if (BACKUP_RE.test(name)) backups.push({ day, time: name.slice(0, 4), file: path.join(base, day, name) });
    }
    const out = backupsToTrash(backups, today), byDay = new Map(), trashed = [];
    for (const item of out) byDay.set(item.day, [...(byDay.get(item.day) || []), item]);
    for (const [day, items] of byDay) {
      const whole = items.length === dayEntries.get(day).length;
      const targets = whole ? [path.join(base, day)] : items.map(item => item.file);
      for (const target of targets) { await trash(target); trashed.push(target); }
    }
    return { trashed };
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
  return { root, autosave, readLatest, save, inside, pruneBackups };
}

function registerExamFilesIpc({ handle, shell, documentsPath }) {
  const files = createExamFiles({ documentsPath, trash: typeof shell?.trashItem === "function" ? file => shell.trashItem(file) : null });
  handle("exam-files:autosave", (_event, text) => files.autosave(text));
  handle("exam-files:read-latest", () => files.readLatest());
  handle("exam-files:save", (_event, payload) => files.save(payload && typeof payload === "object" ? payload : {}));
  handle("exam-files:open", async (_event, file) => { const error = await shell.openPath(files.inside(file)); if (error) throw new Error(error); return true; });
  handle("exam-files:reveal", (_event, file) => { shell.showItemInFolder(files.inside(file)); return true; });
  handle("exam-files:folder", async () => { const dir = files.root(); await fs.promises.mkdir(dir, { recursive: true }); return { path: dir }; });
  handle("exam-files:open-folder", async () => { const dir = files.root(); await fs.promises.mkdir(dir, { recursive: true }); const error = await shell.openPath(dir); if (error) throw new Error(error); return true; });
  return files;
}

module.exports = { createExamFiles, registerExamFilesIpc, stamp, safeName, backupsToTrash, renameWithRetry, KINDS };
