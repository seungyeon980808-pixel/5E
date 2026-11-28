// 앱 안 새 판 받기(desktop/app-updater.cjs) — 네트워크 없이 주입한 가짜로 흐름을 본다.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { spawnSync } = require("node:child_process");
const {
  createAppUpdater, UPDATE_ERROR_CODES, STATE_CHANNEL, isNewer, macBundlePath, buildMacInstallScript, shQuote,
} = require("./app-updater.cjs");

function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-updater-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function fakeApp(version = "1.7.2", isPackaged = true, temp = os.tmpdir()) {
  const app = new EventEmitter();
  app.getVersion = () => version;
  app.isPackaged = isPackaged;
  app.getPath = () => temp;
  app.quitCalls = 0;
  app.quit = () => { app.quitCalls += 1; };
  return app;
}
function fakeShell() {
  return { opened: [], external: [], openPath(p) { this.opened.push(p); return Promise.resolve(""); }, openExternal(u) { this.external.push(u); return Promise.resolve(); } };
}
function recorder() {
  const states = [];
  return { states, send: (channel, payload) => { assert.equal(channel, STATE_CHANNEL); states.push(payload); }, names: () => states.map((s) => s.state) };
}
const json = (body) => Promise.resolve({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const text = (body) => Promise.resolve({ ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) });
function release(tag, names) {
  return { tag_name: tag, html_url: `https://github.com/x/5E/releases/tag/${tag}`, assets: names.map((name) => ({ name, size: 10, browser_download_url: `https://dl.example/${name}` })) };
}
function fakeAutoUpdater({ version = "1.8.0", available = true, failDownload = null } = {}) {
  const au = new EventEmitter();
  au.calls = [];
  au.setFeedURL = (opts) => au.calls.push(["setFeedURL", opts]);
  au.checkForUpdates = async () => { au.calls.push(["check"]); return { isUpdateAvailable: available, updateInfo: { version } }; };
  au.downloadUpdate = (token) => new Promise((resolve, reject) => {
    au.calls.push(["download"]);
    token.onCancel = () => reject(Object.assign(new Error("cancelled"), { name: "CancellationError" }));
    let percent = 0;
    const tick = () => {
      if (token.cancelled) return;
      if (failDownload) return reject(failDownload);
      percent += 50;
      au.emit("download-progress", { percent, transferred: percent, total: 100 });
      if (percent < 100) return setTimeout(tick, 5);
      au.emit("update-downloaded", { version });
      resolve(["/tmp/5E-setup.exe"]);
    };
    setTimeout(tick, 5);
  });
  au.quitAndInstall = (...args) => au.calls.push(["quitAndInstall", ...args]);
  return au;
}

test("판 비교", () => {
  assert.equal(isNewer("v1.8.0", "1.7.2"), true);
  assert.equal(isNewer("1.7.10", "1.7.9"), true);
  assert.equal(isNewer("1.7.2", "1.7.2"), false);
  assert.equal(isNewer("1.7.1", "1.7.2"), false);
});

test("check: 새 판 있음 / 없음 / 오프라인 / 설치판 아님", async () => {
  const shell = fakeShell();
  const up = createAppUpdater({ app: fakeApp(), shell, platform: "win32", env: {}, fetchImpl: () => json(release("v1.8.0", ["latest.yml", "5E-1.8.0-windows-x64.exe"])) });
  assert.deepEqual(await up.check(), { current: "1.7.2", latest: "1.8.0", available: true, mode: "auto" });

  const same = createAppUpdater({ app: fakeApp(), shell, platform: "win32", env: {}, fetchImpl: () => json(release("v1.7.2", ["latest.yml"])) });
  assert.equal((await same.check()).available, false);

  const old = createAppUpdater({ app: fakeApp(), shell, platform: "win32", env: {}, fetchImpl: () => json(release("v1.8.0", ["5E-1.8.0-windows-x64.exe"])) });
  assert.equal((await old.check()).mode, "download", "latest.yml이 없는 릴리스는 페이지 열기로");

  const offline = createAppUpdater({ app: fakeApp(), shell, platform: "darwin", env: {}, fetchImpl: () => Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } })) });
  const result = await offline.check();
  assert.equal(result.available, false);
  assert.equal(result.code, UPDATE_ERROR_CODES.OFFLINE);
  assert.match(result.message, /인터넷/);

  let fetched = false;
  const dev = createAppUpdater({ app: fakeApp("1.7.2", false), shell, platform: "darwin", env: {}, fetchImpl: () => { fetched = true; return json({}); } });
  assert.equal((await dev.check()).available, false);
  assert.equal(fetched, false, "설치판이 아니면 묻지도 않는다");
});

test("윈도우 start → 받는 중 → 준비됨 → 지금 설치", async () => {
  const rec = recorder();
  const au = fakeAutoUpdater();
  const up = createAppUpdater({ app: fakeApp(), shell: fakeShell(), platform: "win32", env: {}, send: rec.send, autoUpdaterImpl: au, fetchImpl: () => json(release("v1.8.0", ["latest.yml"])) });
  const final = await up.start();
  assert.equal(final.state, "ready");
  assert.equal(au.autoDownload, false);
  assert.equal(au.autoInstallOnAppQuit, true);
  assert.equal(await au.verifyUpdateCodeSignature(["x"], "y"), null, "서명 없는 NSIS 검사 끔");
  const names = rec.names();
  assert.equal(names[0], "checking");
  assert.ok(names.includes("available"));
  assert.ok(names.includes("downloading"));
  assert.ok(rec.states.some((s) => s.state === "downloading" && s.percent === 50));
  assert.equal(names.at(-1), "ready");
  assert.equal(rec.states.at(-1).latest, "1.8.0");
  assert.deepEqual(await up.installNow(), { ok: true });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(au.calls.at(-1), ["quitAndInstall", true, true]);
});

test("윈도우: latest.yml 없는 릴리스는 릴리스 페이지를 연다", async () => {
  const shell = fakeShell();
  const rec = recorder();
  const up = createAppUpdater({ app: fakeApp(), shell, platform: "win32", env: {}, send: rec.send, autoUpdaterImpl: fakeAutoUpdater(), fetchImpl: () => json(release("v1.8.0", ["5E-1.8.0-windows-x64.exe"])) });
  const final = await up.start();
  assert.equal(final.state, "opened");
  assert.equal(shell.external.length, 1);
});

test("윈도우 cancel → UPDATE_CANCELLED", async () => {
  const rec = recorder();
  const au = fakeAutoUpdater();
  const up = createAppUpdater({ app: fakeApp(), shell: fakeShell(), platform: "win32", env: {}, send: rec.send, autoUpdaterImpl: au, fetchImpl: () => json(release("v1.8.0", ["latest.yml"])) });
  const running = up.start();
  assert.equal(up.start(), running, "두 번 눌러도 같은 진행");
  await new Promise((r) => setTimeout(r, 2));
  while (!au.calls.some((c) => c[0] === "download")) await new Promise((r) => setTimeout(r, 1));
  assert.deepEqual(up.cancel(), { ok: true });
  const final = await running;
  assert.equal(final.state, "error");
  assert.equal(final.code, UPDATE_ERROR_CODES.CANCELLED);
  assert.deepEqual(await up.installNow(), { ok: false, code: "UPDATE_NOT_READY", message: "아직 새 판을 다 받지 않았습니다." });
});

test("윈도우 받기 실패 → UPDATE_DOWNLOAD_FAILED(한국어)", async () => {
  const rec = recorder();
  const up = createAppUpdater({ app: fakeApp(), shell: fakeShell(), platform: "win32", env: {}, send: rec.send, autoUpdaterImpl: fakeAutoUpdater({ failDownload: new Error("sha512 checksum mismatch") }), fetchImpl: () => json(release("v1.8.0", ["latest.yml"])) });
  const final = await up.start();
  assert.equal(final.code, UPDATE_ERROR_CODES.DOWNLOAD_FAILED);
  assert.match(final.message, /새 판을 받는 중/);
});

test("FIVE_E_UPDATE_FEED: 개발 실행에서도 시험 서버를 쓴다", async () => {
  const urls = [];
  const au = fakeAutoUpdater({ version: "9.0.0" });
  const up = createAppUpdater({ app: fakeApp("1.7.2", false), shell: fakeShell(), platform: "win32", env: { FIVE_E_UPDATE_FEED: "http://127.0.0.1:8765/feed/" }, autoUpdaterImpl: au,
    fetchImpl: (url) => { urls.push(url); return text("version: 9.0.0\nfiles:\n  - url: 5E-9.0.0-windows-x64.exe\n"); } });
  assert.equal(up.feed, "http://127.0.0.1:8765/feed");
  assert.deepEqual(await up.check(), { current: "1.7.2", latest: "9.0.0", available: true, mode: "auto" });
  assert.deepEqual(urls, ["http://127.0.0.1:8765/feed/latest.yml"]);
  const final = await up.start();
  assert.equal(final.state, "ready");
  assert.deepEqual(au.calls[0], ["setFeedURL", { provider: "generic", url: "http://127.0.0.1:8765/feed" }]);
  assert.equal(au.forceDevUpdateConfig, true);

  const macUrls = [];
  const mac = createAppUpdater({ app: fakeApp("1.7.2", false), shell: fakeShell(), platform: "darwin", arch: "arm64", env: { FIVE_E_UPDATE_FEED: "http://127.0.0.1:8765/feed" },
    fetchImpl: (url) => { macUrls.push(url); return text("version: '9.0.0'\n"); } });
  assert.equal((await mac.check()).latest, "9.0.0");
  assert.deepEqual(macUrls, ["http://127.0.0.1:8765/feed/latest-mac.yml"]);
});

// ---- 맥 ----
function macFakes(root, { version = "1.8.0", codesignFails = false } = {}) {
  const calls = [];
  const execFileImpl = async (file, args) => {
    calls.push([path.basename(file), ...args]);
    if (file.endsWith("ditto") && args[0] === "-x") {
      const out = path.join(args[3], "5E.app", "Contents");
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, "Info.plist"), "<plist/>");
    }
    if (file.endsWith("plutil")) return { stdout: `${version}\n`, stderr: "" };
    if (file.endsWith("codesign") && codesignFails) throw Object.assign(new Error("codesign failed"), { stderr: "invalid signature" });
    return { stdout: "", stderr: "" };
  };
  const downloads = [];
  const downloadImpl = async (url, dest, { onProgress }) => {
    downloads.push({ url, dest });
    onProgress({ percent: 30, transferred: 3, total: 10 });
    onProgress({ percent: 100, transferred: 10, total: 10 });
    fs.writeFileSync(dest, "zip");
    return dest;
  };
  const spawned = [];
  const spawnImpl = (file, args, options) => { spawned.push({ file, args, options }); return { unref() {} }; };
  return { calls, execFileImpl, downloads, downloadImpl, spawned, spawnImpl };
}

test("맥: 아키텍처에 맞는 zip을 먼저 고르고, 꺼내서 검사 → 준비됨", async (t) => {
  const root = sandbox(t);
  const fakes = macFakes(root);
  const rec = recorder();
  const assets = ["5E-1.8.0-macos-x64.dmg", "5E-1.8.0-macos-arm64.dmg", "5E-1.8.0-macos-x64.zip", "5E-1.8.0-macos-arm64.zip"];
  const up = createAppUpdater({ app: fakeApp(), shell: fakeShell(), platform: "darwin", arch: "arm64", env: {}, send: rec.send, tempDir: root,
    fetchImpl: () => json(release("v1.8.0", assets)), ...fakes });
  const final = await up.start();
  assert.equal(final.state, "ready", JSON.stringify(rec.states.at(-1)));
  assert.equal(fakes.downloads[0].url, "https://dl.example/5E-1.8.0-macos-arm64.zip");
  assert.equal(fakes.downloads[0].dest, path.join(root, "5e-update", "1.8.0", "5E-1.8.0-macos-arm64.zip"));
  assert.ok(final.file.endsWith(path.join("5E.app")));
  assert.deepEqual(fakes.calls.map((c) => c[0]), ["ditto", "plutil", "codesign", "xattr"]);
  assert.deepEqual(fakes.calls[0].slice(0, 3), ["ditto", "-x", "-k"]);
  assert.deepEqual(fakes.calls[2], ["codesign", "--verify", "--deep", final.file]);
  assert.deepEqual(fakes.calls[3], ["xattr", "-dr", "com.apple.quarantine", final.file]);
  assert.deepEqual(rec.names(), ["checking", "available", "downloading", "downloading", "downloading", "verifying", "ready"]);

  const x64 = macFakes(root);
  const intel = createAppUpdater({ app: fakeApp(), shell: fakeShell(), platform: "darwin", arch: "x64", env: {}, tempDir: root,
    fetchImpl: () => json(release("v1.8.0", ["5E-1.8.0-macos-x64.dmg", "5E-1.8.0-macos-arm64.dmg"])), ...x64 });
  await intel.start();
  assert.equal(x64.downloads[0].url, "https://dl.example/5E-1.8.0-macos-x64.dmg", "zip이 없으면 dmg");
  assert.deepEqual(x64.calls.slice(0, 1).map((c) => [c[0], c[1]]), [["hdiutil", "attach"]]);
});

test("맥: 판 번호가 다르거나 서명 검사가 실패하면 설치하지 않는다", async (t) => {
  const root = sandbox(t);
  for (const options of [{ version: "1.7.9" }, { codesignFails: true }]) {
    const fakes = macFakes(root, options);
    const up = createAppUpdater({ app: fakeApp(), shell: fakeShell(), platform: "darwin", arch: "arm64", env: {}, tempDir: root,
      fetchImpl: () => json(release("v1.8.0", ["5E-1.8.0-macos-arm64.zip"])), ...fakes });
    const final = await up.start();
    assert.equal(final.code, UPDATE_ERROR_CODES.VERIFY_FAILED);
    assert.equal((await up.installNow()).code, "UPDATE_NOT_READY");
  }
});

test("맥: 자산이 없으면 UPDATE_NO_ASSET", async (t) => {
  const root = sandbox(t);
  const up = createAppUpdater({ app: fakeApp(), shell: fakeShell(), platform: "darwin", arch: "arm64", env: {}, tempDir: root,
    fetchImpl: () => json(release("v1.8.0", ["5E-1.8.0-windows-x64.exe"])), ...macFakes(root) });
  assert.equal((await up.start()).code, UPDATE_ERROR_CODES.NO_ASSET);
});

test("맥: 받는 중 cancel → UPDATE_CANCELLED", async (t) => {
  const root = sandbox(t);
  const fakes = macFakes(root);
  fakes.downloadImpl = (url, dest, { signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  let up;
  const rec = recorder();
  up = createAppUpdater({ app: fakeApp(), shell: fakeShell(), platform: "darwin", arch: "arm64", env: {}, tempDir: root, send: (c, p) => { rec.send(c, p); if (p.state === "downloading") setImmediate(() => up.cancel()); },
    fetchImpl: () => json(release("v1.8.0", ["5E-1.8.0-macos-arm64.zip"])), ...fakes });
  const final = await up.start();
  assert.equal(final.code, UPDATE_ERROR_CODES.CANCELLED);
});

test("맥 installNow: 쓸 수 있는 자리면 도우미를 떼어 실행하고 앱을 끈다", async (t) => {
  const root = sandbox(t);
  const apps = path.join(root, "Applications");
  fs.mkdirSync(path.join(apps, "5E.app", "Contents", "MacOS"), { recursive: true });
  const fakes = macFakes(root);
  const app = fakeApp();
  const rec = recorder();
  const up = createAppUpdater({ app, shell: fakeShell(), platform: "darwin", arch: "arm64", env: {}, tempDir: root, send: rec.send, homedir: root, pid: 4242,
    execPath: path.join(apps, "5E.app", "Contents", "MacOS", "5E"), now: () => new Date(2026, 10, 22, 9, 5, 7),
    fetchImpl: () => json(release("v1.8.0", ["5E-1.8.0-macos-arm64.zip"])), ...fakes });
  await up.start();
  assert.deepEqual(await up.installNow(), { ok: true });
  await new Promise((r) => setImmediate(r));
  assert.equal(app.quitCalls, 1);
  assert.equal(rec.names().at(-1), "installing");
  assert.equal(fakes.spawned.length, 1);
  assert.equal(fakes.spawned[0].file, "/bin/sh");
  assert.equal(fakes.spawned[0].options.detached, true);
  const script = fs.readFileSync(fakes.spawned[0].args[0], "utf8");
  assert.match(script, /^PID=4242$/m);
  assert.match(script, new RegExp(`^OLD=${shQuote(path.join(apps, "5E.app")).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`, "m"));
  assert.match(script, /BACKUP="\$TRASH"\/'5E-1\.7\.2-20261122-090507\.app'/);
  assert.match(script, new RegExp(`TRASH='${path.join(root, ".Trash").replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}'`));
  assert.match(script, /\/usr\/bin\/open "\$OLD"/);
  assert.doesNotMatch(script, /\brm\b/);
  app.emit("will-quit");
  assert.equal(fakes.spawned.length, 1, "끌 때 두 번 실행하지 않음");
});

test("맥 installNow: 쓸 수 없는 자리면 새 앱 폴더를 열고 UPDATE_NEEDS_MANUAL", async (t) => {
  const root = sandbox(t);
  const fakes = macFakes(root);
  const shell = fakeShell();
  const rec = recorder();
  const up = createAppUpdater({ app: fakeApp(), shell, platform: "darwin", arch: "arm64", env: {}, tempDir: root, send: rec.send, homedir: root,
    execPath: "/private/var/folders/xx/AppTranslocation/ABC/d/5E.app/Contents/MacOS/5E",
    fetchImpl: () => json(release("v1.8.0", ["5E-1.8.0-macos-arm64.zip"])), ...fakes });
  await up.start();
  const result = await up.installNow();
  assert.equal(result.ok, false);
  assert.equal(result.code, UPDATE_ERROR_CODES.NEEDS_MANUAL);
  assert.equal(shell.opened.length, 1);
  assert.equal(rec.states.at(-1).state, "opened");
  assert.equal(rec.states.at(-1).code, UPDATE_ERROR_CODES.NEEDS_MANUAL);
  assert.equal(fakes.spawned.length, 0);

  const devFakes = macFakes(root);
  const dev = createAppUpdater({ app: fakeApp("1.7.2", false), shell: fakeShell(), platform: "darwin", arch: "arm64", env: { FIVE_E_UPDATE_FEED: "http://127.0.0.1:1/f" }, tempDir: root, homedir: root,
    execPath: path.join(root, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"), fetchImpl: () => text("version: 1.8.0\n"), ...devFakes });
  await dev.start();
  assert.equal((await dev.installNow()).reason, "not-packaged", "개발 실행에서는 Electron.app을 바꾸지 않는다");
});

test("맥: 준비된 채로 그냥 끄면 다시 열지 않는 도우미를 돌린다", async (t) => {
  const root = sandbox(t);
  const apps = path.join(root, "Applications");
  fs.mkdirSync(path.join(apps, "5E.app"), { recursive: true });
  const fakes = macFakes(root);
  const app = fakeApp();
  const up = createAppUpdater({ app, shell: fakeShell(), platform: "darwin", arch: "arm64", env: {}, tempDir: root, homedir: root,
    execPath: path.join(apps, "5E.app", "Contents", "MacOS", "5E"), fetchImpl: () => json(release("v1.8.0", ["5E-1.8.0-macos-arm64.zip"])), ...fakes });
  await up.start();
  app.emit("will-quit");
  assert.equal(fakes.spawned.length, 1);
  assert.doesNotMatch(fs.readFileSync(fakes.spawned[0].args[0], "utf8"), /\/usr\/bin\/open/);
});

test("macBundlePath", () => {
  assert.equal(macBundlePath("/Applications/5E.app/Contents/MacOS/5E"), "/Applications/5E.app");
  assert.equal(macBundlePath("/usr/local/bin/node"), null);
});

test("교체 도우미 sh를 실제로 돌려 본다: 옛 앱은 휴지통, 새 앱은 그 자리, 사용자 자료는 그대로", { skip: process.platform === "win32" }, (t) => {
  const root = sandbox(t);
  const oldApp = path.join(root, "Apps dir", "5E.app");
  const newApp = path.join(root, "update", "app-1", "5E.app");
  const support = path.join(root, "Library", "Application Support", "5e-desktop");
  for (const dir of [oldApp, newApp, support]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(oldApp, "v"), "old");
  fs.writeFileSync(path.join(newApp, "v"), "new");
  fs.writeFileSync(path.join(support, "data.json"), "{}");
  const trash = path.join(root, ".Trash");
  // 이미 끝난 프로세스의 PID
  const dead = spawnSync("/bin/sh", ["-c", "echo $$"], { encoding: "utf8" });
  const script = path.join(root, "install.sh");
  fs.writeFileSync(script, buildMacInstallScript({ pid: Number(dead.stdout.trim()), oldApp, newApp, trashDir: trash, backupName: "5E-1.7.2-old.app", relaunch: false, logFile: path.join(root, "log.txt") }));
  const result = spawnSync("/bin/sh", [script], { encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 0, fs.readFileSync(path.join(root, "log.txt"), "utf8"));
  assert.equal(fs.readFileSync(path.join(oldApp, "v"), "utf8"), "new");
  assert.equal(fs.readFileSync(path.join(trash, "5E-1.7.2-old.app", "v"), "utf8"), "old");
  assert.equal(fs.existsSync(newApp), false);
  assert.equal(fs.readFileSync(path.join(support, "data.json"), "utf8"), "{}");

  // 새 앱이 없으면 아무것도 바꾸지 않는다
  fs.writeFileSync(script, buildMacInstallScript({ pid: Number(dead.stdout.trim()), oldApp, newApp, trashDir: trash, backupName: "5E-x.app", relaunch: false }));
  assert.equal(spawnSync("/bin/sh", [script]).status, 2);
  assert.equal(fs.readFileSync(path.join(oldApp, "v"), "utf8"), "new");
});
