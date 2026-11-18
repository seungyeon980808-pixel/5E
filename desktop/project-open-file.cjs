"use strict";
// 1.7.1: 설치판에서 .5e 두 번 눌러 열기(빠진 기본 동작 보완).
// - 맥: Finder·Dock에서 열면 app 「open-file」(앱이 뜨기 전에도 옴)
// - 윈도우: 처음 실행은 process.argv, 이미 떠 있으면 두 번째 실행이 「second-instance」로 argv를 넘김
// 화면이 「받을 준비됨」을 알릴 때까지 줄에 두었다가 이름·바이트만 보낸다(경로는 화면에 넘기지 않음).
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_EXT = /\.5e$/i;
const MAX_PROJECT_FILE_BYTES = 128 * 1024 * 1024;

// pathImpl은 검사에서 path.win32로 바꿔 윈도우 경로(드라이브 글자·역슬래시·긴 한글 이름)를 맥에서도 확인하려고 받는다(1.8.0 X1).
function projectPathsFromArgv(argv, { cwd = process.cwd(), exists = file => { try { return fs.statSync(file).isFile(); } catch { return false; } }, pathImpl = path } = {}) {
  const out = [];
  for (const arg of Array.isArray(argv) ? argv : []) {
    if (typeof arg !== "string" || !arg || arg.startsWith("-") || !PROJECT_EXT.test(arg)) continue;
    const file = pathImpl.resolve(cwd || process.cwd(), arg);
    // 윈도우는 대소문자를 가리지 않으므로 같은 파일이 C:\A.5e·c:\a.5E로 두 번 와도 한 번만 연다.
    const foldCase = pathImpl.sep === "\\";
    const same = seen => (foldCase ? seen.toLowerCase() === file.toLowerCase() : seen === file);
    if (exists(file) && !out.some(same)) out.push(file);
  }
  return out;
}

function createProjectOpenQueue({ send, readFile = file => fs.promises.readFile(file), statFile = file => fs.promises.stat(file), maxBytes = MAX_PROJECT_FILE_BYTES, pathImpl = path } = {}) {
  if (typeof send !== "function") throw new TypeError("send가 필요합니다.");
  const pending = [];
  let ready = false;
  async function deliver(file) {
    const name = pathImpl.basename(file);
    try {
      if (!PROJECT_EXT.test(file)) throw new Error("5E 프로젝트 파일(.5e)만 열 수 있습니다.");
      const stat = await statFile(file);
      if (!stat.isFile()) throw new Error("파일을 찾지 못했습니다.");
      if (stat.size > maxBytes) throw new Error("프로젝트 파일이 128 MiB를 초과합니다.");
      const data = await readFile(file);
      const bytes = new Uint8Array(data).buffer; // 새 ArrayBuffer(Buffer 공용 영역을 넘기지 않게)
      return send({ name, bytes });
    } catch (error) {
      return send({ name, error: `${name}: ${error?.message || error}` });
    }
  }
  // 부를 때마다 사슬 끝에 「줄 비우기」를 붙인다 — 비우는 도중에 새로 들어온 것도 놓치지 않는다.
  let chain = Promise.resolve();
  function flush() {
    chain = chain.then(async () => {
      // 여러 개를 한꺼번에 열면 하나씩 차례로(화면 쪽도 줄을 세움).
      while (ready && pending.length) await deliver(pending.shift());
    });
    return chain;
  }
  return {
    enqueue(file) { if (typeof file === "string" && file) pending.push(file); return flush(); },
    markReady() { ready = true; return flush(); },
    reset() { ready = false; },
    get size() { return pending.length; },
    get ready() { return ready; },
  };
}

// main.cjs에 거는 부분. app·창 얻기·창 만들기는 밖에서 받는다(검사에서 가짜로 바꿀 수 있게).
function installProjectOpenFile({ app, getWindow, createWindow, handle, argv = process.argv }) {
  const queue = createProjectOpenQueue({
    send: payload => { const target = getWindow(); if (target && !target.isDestroyed()) target.webContents.send("project:open", payload); },
  });
  const bringForward = () => {
    if (!app.isReady()) return;
    const target = getWindow();
    if (!target || target.isDestroyed()) { createWindow(); return; }
    try { if (target.isMinimized()) target.restore(); target.show(); target.focus(); } catch {}
  };
  const open = file => { queue.enqueue(file); bringForward(); };
  // 맥: 앱이 뜨기 전에 오기도 하므로 ready 전에 건다.
  app.on("open-file", (event, file) => { event.preventDefault(); open(file); });
  // 두 번째 실행의 상대 경로(명령 줄에서 `5E.exe 시험.5e`)는 그 실행의 작업 폴더 기준이다 — Electron이 셋째 인자로 준다.
  app.on("second-instance", (_event, secondArgv, workingDirectory) => {
    const files = projectPathsFromArgv(secondArgv, { cwd: typeof workingDirectory === "string" && workingDirectory ? workingDirectory : process.cwd() });
    if (files.length) files.forEach(open); else bringForward();
  });
  for (const file of projectPathsFromArgv(argv.slice(1))) queue.enqueue(file);
  handle("project:renderer-ready", () => { queue.markReady(); return true; });
  return {
    queue,
    // 창이 새로 뜨거나 다시 읽히면 화면이 다시 준비를 알릴 때까지 기다린다.
    attachWindow(target) { queue.reset(); target.webContents.on("did-navigate", () => queue.reset()); },
  };
}

module.exports = { PROJECT_EXT, MAX_PROJECT_FILE_BYTES, projectPathsFromArgv, createProjectOpenQueue, installProjectOpenFile };
