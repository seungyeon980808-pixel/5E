// 앱 안에서 새 판 받기(설치판 전용).
// - 윈도우: electron-updater(NSIS)로 받아 두고, 「지금 설치」나 앱을 끌 때 설치한다.
// - 맥: 서명·공증이 없어 Squirrel(MacUpdater)을 못 쓴다. 릴리스의 zip(없으면 dmg)을 임시 폴더에 받아
//   5E.app을 꺼내 검사해 두고, 「지금 설치」나 앱을 끌 때 작은 sh 도우미가 옛 앱을 휴지통으로 옮기고 새 앱을 그 자리에 놓는다.
//   사용자 자료(~/Library/Application Support/5e-desktop, ~/Documents/5E)는 건드리지 않는다.
// 화면 쪽에는 send('app-update:state', {...})로 상태만 알린다. 이 모듈은 ipcMain을 직접 만지지 않는다.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const childProcess = require("node:child_process");

const OWNER = "seungyeon980808-pixel";
const REPO = "5E";
const LATEST_API = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${OWNER}/${REPO}/releases/latest`;
const STATE_CHANNEL = "app-update:state";

const UPDATE_ERROR_CODES = Object.freeze({
  OFFLINE: "UPDATE_OFFLINE",
  NO_ASSET: "UPDATE_NO_ASSET",
  DOWNLOAD_FAILED: "UPDATE_DOWNLOAD_FAILED",
  CANCELLED: "UPDATE_CANCELLED",
  VERIFY_FAILED: "UPDATE_VERIFY_FAILED",
  NEEDS_MANUAL: "UPDATE_NEEDS_MANUAL",
});

const MESSAGES = Object.freeze({
  UPDATE_OFFLINE: "인터넷에 연결되어 있지 않아 새 판을 확인하지 못했습니다. 연결을 확인한 뒤 다시 눌러 주세요.",
  UPDATE_NO_ASSET: "이 컴퓨터에 맞는 설치 파일을 릴리스에서 찾지 못했습니다. 릴리스 페이지에서 직접 받아 주세요.",
  UPDATE_DOWNLOAD_FAILED: "새 판을 받는 중에 문제가 생겼습니다. 잠시 뒤 다시 눌러 주세요.",
  UPDATE_CANCELLED: "새 판 받기를 멈췄습니다.",
  UPDATE_VERIFY_FAILED: "받은 새 판을 검사하다 문제가 생겨 설치하지 않았습니다. 잠시 뒤 다시 눌러 주세요.",
  UPDATE_NEEDS_MANUAL: "이 위치의 5E는 자동으로 바꿀 수 없습니다. 열린 폴더의 5E를 응용 프로그램 폴더로 끌어다 바꿔 주세요.",
});

class UpdateError extends Error {
  constructor(code, detail) {
    super(MESSAGES[code] || MESSAGES.UPDATE_DOWNLOAD_FAILED);
    this.name = "UpdateError";
    this.code = code;
    if (detail) this.detail = String(detail);
  }
}

// "v1.7.2" → [1,7,2]. 숫자가 아닌 꼬리(-beta 등)는 비교에서 뺀다.
function parseVersion(text) {
  const match = String(text || "").trim().replace(/^v/i, "").match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)];
}
function normalizeVersion(text) {
  const parts = parseVersion(text);
  return parts ? parts.join(".") : null;
}
function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

// latest.yml·latest-mac.yml에서 version 한 줄만 읽는다(전체 YAML 파서까지는 필요 없음).
function readYamlVersion(text) {
  const match = String(text || "").match(/^version:\s*['"]?([^'"\s]+)['"]?\s*$/m);
  return match ? match[1] : null;
}

function macArch(arch) {
  return arch === "arm64" ? "arm64" : "x64";
}
function macDmgName(version, arch) {
  return `5E-${version}-macos-${macArch(arch)}.dmg`;
}
function macZipName(version, arch) {
  return `5E-${version}-macos-${macArch(arch)}.zip`;
}

// sh 작은따옴표 감싸기: ' → '\''
function shQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
function stamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
// process.execPath(…/5E.app/Contents/MacOS/5E)에서 …/5E.app을 찾는다.
function macBundlePath(execPath) {
  const parts = String(execPath || "").split("/");
  const index = parts.findIndex((part) => part.endsWith(".app"));
  return index > 0 ? parts.slice(0, index + 1).join("/") : null;
}

// 맥 교체 도우미 sh 글(순수 함수). 옛 앱은 지우지 않고 휴지통으로 옮긴다(rm 금지).
// 종료 코드: 0 성공, 1 앱이 60초 안에 안 꺼짐(아무것도 안 바꿈), 2 새 앱 없음, 3 옛 앱 옮기기 실패, 4 새 앱 놓기 실패(옛 앱 되돌림)
function buildMacInstallScript({ pid, oldApp, newApp, trashDir, backupName, relaunch = true, logFile = null, waitSeconds = 60 }) {
  const tries = Math.max(1, Math.round(waitSeconds * 2));
  const lines = [
    "#!/bin/sh",
    "# 5E 새 판 설치 도우미(자동 생성). 5E가 꺼지길 기다렸다가 옛 앱을 휴지통으로 옮기고 새 앱을 그 자리에 놓는다.",
    `PID=${Number(pid) | 0}`,
    `OLD=${shQuote(oldApp)}`,
    `NEW=${shQuote(newApp)}`,
    `TRASH=${shQuote(trashDir)}`,
    `BACKUP="$TRASH"/${shQuote(backupName)}`,
    logFile ? `exec >>${shQuote(logFile)} 2>&1` : "exec >/dev/null 2>&1",
    "i=0",
    'while kill -0 "$PID" 2>/dev/null; do',
    '  i=$((i+1))',
    `  if [ "$i" -ge ${tries} ]; then echo "5E가 꺼지지 않아 설치를 미룸"; exit 1; fi`,
    '  sleep 0.5',
    'done',
    'if [ ! -d "$NEW" ]; then echo "새 앱이 없음: $NEW"; exit 2; fi',
    'mkdir -p "$TRASH"',
    'if [ -e "$OLD" ]; then',
    '  mv "$OLD" "$BACKUP" || { echo "옛 앱을 휴지통으로 옮기지 못함"; exit 3; }',
    'fi',
    'if ! mv "$NEW" "$OLD"; then',
    '  echo "새 앱을 놓지 못해 옛 앱을 되돌림"',
    '  [ -e "$BACKUP" ] && mv "$BACKUP" "$OLD"',
    '  exit 4',
    'fi',
    '/usr/bin/xattr -dr com.apple.quarantine "$OLD" 2>/dev/null',
    'echo "설치 끝: $OLD (옛 앱: $BACKUP)"',
  ];
  if (relaunch) lines.push('/usr/bin/open "$OLD"');
  lines.push("exit 0", "");
  return lines.join("\n");
}
function trimSlash(url) {
  return String(url || "").replace(/\/+$/, "");
}

function isOfflineError(error) {
  const code = error && (error.code || (error.cause && error.cause.code));
  if (["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT"].includes(code)) return true;
  const text = String((error && error.message) || error || "");
  return /fetch failed|net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|NETWORK_CHANGED|CONNECTION|TIMED_OUT|ADDRESS_UNREACHABLE)|getaddrinfo|ENOTFOUND|timed? ?out|aborted due to timeout/i.test(text);
}
function isCancelError(error) {
  return Boolean(error) && (error.name === "CancellationError" || error.name === "AbortError" || error.code === UPDATE_ERROR_CODES.CANCELLED || /cancell?ed/i.test(String(error.message || "")));
}

// 기본 내려받기: 리디렉션(GitHub → objects.githubusercontent) 따라가며 dest.part에 쓰고 끝나면 이름을 바꾼다.
function defaultDownload(url, dest, { onProgress, signal, redirects = 0 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new UpdateError(UPDATE_ERROR_CODES.CANCELLED));
    const client = url.startsWith("http:") ? http : https;
    const request = client.get(url, { headers: { "User-Agent": "5E-desktop-updater", Accept: "application/octet-stream" } }, (response) => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirects >= 8) return reject(new UpdateError(UPDATE_ERROR_CODES.DOWNLOAD_FAILED, "too many redirects"));
        const next = new URL(response.headers.location, url).toString();
        defaultDownload(next, dest, { onProgress, signal, redirects: redirects + 1 }).then(resolve, reject);
        return;
      }
      if (status === 404) { response.resume(); return reject(new UpdateError(UPDATE_ERROR_CODES.NO_ASSET, `HTTP 404 ${url}`)); }
      if (status !== 200) { response.resume(); return reject(new UpdateError(UPDATE_ERROR_CODES.DOWNLOAD_FAILED, `HTTP ${status}`)); }
      const total = Number(response.headers["content-length"]) || 0;
      const part = `${dest}.part`;
      const out = fs.createWriteStream(part);
      let received = 0;
      let failed = false;
      const fail = (error) => {
        if (failed) return;
        failed = true;
        response.destroy();
        out.destroy();
        fs.promises.unlink(part).catch(() => {});
        reject(error);
      };
      const onAbort = () => fail(new UpdateError(UPDATE_ERROR_CODES.CANCELLED));
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      response.on("data", (chunk) => {
        received += chunk.length;
        if (onProgress) onProgress({ transferred: received, total, percent: total ? (received / total) * 100 : 0 });
      });
      response.on("error", (error) => fail(isOfflineError(error) ? new UpdateError(UPDATE_ERROR_CODES.OFFLINE, error.message) : new UpdateError(UPDATE_ERROR_CODES.DOWNLOAD_FAILED, error.message)));
      out.on("error", (error) => fail(new UpdateError(UPDATE_ERROR_CODES.DOWNLOAD_FAILED, error.message)));
      out.on("finish", () => {
        if (signal) signal.removeEventListener("abort", onAbort);
        if (failed) return;
        if (total && received !== total) return fail(new UpdateError(UPDATE_ERROR_CODES.DOWNLOAD_FAILED, `size ${received}/${total}`));
        fs.promises.rename(part, dest).then(() => resolve(dest), (error) => fail(new UpdateError(UPDATE_ERROR_CODES.DOWNLOAD_FAILED, error.message)));
      });
      response.pipe(out);
    });
    request.setTimeout(30000, () => request.destroy(Object.assign(new Error("timed out"), { code: "ETIMEDOUT" })));
    request.on("error", (error) => reject(isOfflineError(error) ? new UpdateError(UPDATE_ERROR_CODES.OFFLINE, error.message) : new UpdateError(UPDATE_ERROR_CODES.DOWNLOAD_FAILED, error.message)));
  });
}

function createAppUpdater({
  app,
  shell,
  platform = process.platform,
  arch = process.arch,
  log = () => {},
  send = () => {},
  env = process.env,
  autoUpdaterImpl = null,
  CancellationTokenImpl = null,
  fetchImpl = (...args) => globalThis.fetch(...args),
  downloadImpl = defaultDownload,
  tempDir = null,
  // 맥 교체용 주입점(시험에서 바꿈)
  execFileImpl = null,
  spawnImpl = childProcess.spawn,
  homedir = os.homedir(),
  execPath = process.execPath,
  pid = process.pid,
  now = () => new Date(),
} = {}) {
  const run = execFileImpl || ((file, args) => new Promise((resolve, reject) => {
    childProcess.execFile(file, args, { maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => (error ? reject(Object.assign(error, { stderr })) : resolve({ stdout: String(stdout), stderr: String(stderr) })));
  }));
  const feed = trimSlash(env && env.FIVE_E_UPDATE_FEED);
  const isWindows = platform === "win32";
  const isMac = platform === "darwin";
  const current = normalizeVersion(app && app.getVersion ? app.getVersion() : "0.0.0") || "0.0.0";
  const enabled = Boolean(feed) || Boolean(app && app.isPackaged);
  // auto = 앱 안에서 받아 바꿈(윈도우 electron-updater, 맥 스스로 교체), download = 릴리스 페이지 열기
  const mode = isWindows || isMac ? "auto" : "download";

  let lastCheck = null; // { latest, available, mode, macAsset }
  let running = null;   // start() 진행 중 약속
  let cancelToken = null;
  let abortController = null;
  let cancelled = false;
  let readyFile = null; // 맥: 받아 둔 zip/dmg 경로
  let readyApp = null;  // 맥: 꺼내서 검사까지 끝낸 새 5E.app 경로
  let helperSpawned = false;
  let quitHookAttached = false;
  let windowsReady = false;
  let updater = null;
  let lastState = { state: "none", current };

  const say = (...args) => { try { log("[app-updater]", ...args); } catch {} };
  function emit(state, extra = {}) {
    lastState = { state, current, ...extra };
    try { send(STATE_CHANNEL, lastState); } catch (error) { say("send 실패", error && error.message); }
    return lastState;
  }
  function emitError(error, latest) {
    const code = error && Object.values(UPDATE_ERROR_CODES).includes(error.code) ? error.code
      : isCancelError(error) ? UPDATE_ERROR_CODES.CANCELLED
      : isOfflineError(error) ? UPDATE_ERROR_CODES.OFFLINE
      : UPDATE_ERROR_CODES.DOWNLOAD_FAILED;
    say("오류", code, error && (error.detail || error.message));
    return emit("error", { code, message: MESSAGES[code], latest: latest || (lastCheck && lastCheck.latest) || null });
  }

  async function getJson(url) {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "5E-desktop-updater" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response || !response.ok) throw Object.assign(new Error(`HTTP ${response && response.status}`), { status: response && response.status });
    return response.json();
  }
  async function getText(url) {
    const response = await fetchImpl(url, { headers: { "User-Agent": "5E-desktop-updater" }, signal: AbortSignal.timeout(10000) });
    if (!response || !response.ok) throw Object.assign(new Error(`HTTP ${response && response.status}`), { status: response && response.status });
    return response.text();
  }

  // 최신 판 정보를 읽는다. 시험 서버(FIVE_E_UPDATE_FEED)가 있으면 그쪽의 latest*.yml을 쓴다.
  async function readLatest() {
    if (feed) {
      const yml = await getText(`${feed}/${isMac ? "latest-mac.yml" : "latest.yml"}`);
      const latest = normalizeVersion(readYamlVersion(yml));
      const macAsset = isMac && latest ? { name: macZipName(latest, arch), url: `${feed}/${macZipName(latest, arch)}`, size: 0, kind: "zip" } : null;
      return { latest, mode, macAsset };
    }
    const release = await getJson(LATEST_API);
    const latest = normalizeVersion(release && release.tag_name);
    const assets = Array.isArray(release && release.assets) ? release.assets : [];
    let resolvedMode = mode;
    // 윈도우인데 릴리스에 latest.yml이 없으면(1.7.2 이전 릴리스) 자동 설치를 못 하므로 페이지 열기로 낮춘다.
    if (isWindows && !assets.some((asset) => asset && asset.name === "latest.yml")) resolvedMode = "download";
    let macAsset = null;
    if (isMac && latest) {
      // zip을 먼저(꺼내기 쉬움), 없으면 dmg
      const pick = [macZipName(latest, arch), macDmgName(latest, arch)]
        .map((name) => assets.find((asset) => asset && asset.name === name))
        .find(Boolean);
      macAsset = pick
        ? { name: pick.name, url: pick.browser_download_url, size: Number(pick.size) || 0, kind: pick.name.endsWith(".zip") ? "zip" : "dmg" }
        : { name: macZipName(latest, arch), url: null, size: 0, kind: "zip" };
    }
    return { latest, mode: resolvedMode, macAsset, page: (release && release.html_url) || RELEASES_PAGE };
  }

  async function check() {
    if (!enabled) return { current, latest: null, available: false, mode, skipped: "not-packaged" };
    try {
      const info = await readLatest();
      const available = Boolean(info.latest) && isNewer(info.latest, current);
      lastCheck = { ...info, available };
      return { current, latest: info.latest, available, mode: info.mode };
    } catch (error) {
      const code = isOfflineError(error) || (error && error.name === "TimeoutError") ? UPDATE_ERROR_CODES.OFFLINE : UPDATE_ERROR_CODES.DOWNLOAD_FAILED;
      say("확인 실패", code, error && error.message);
      return { current, latest: null, available: false, mode, code, message: code === UPDATE_ERROR_CODES.OFFLINE ? MESSAGES[code] : "새 판을 확인하지 못했습니다." };
    }
  }

  // ---- 윈도우: electron-updater ----
  function getUpdater() {
    if (updater) return updater;
    const module = autoUpdaterImpl ? null : require("electron-updater");
    const au = autoUpdaterImpl || module.autoUpdater;
    au.autoDownload = false;
    au.autoInstallOnAppQuit = true;
    au.allowPrerelease = false;
    au.allowDowngrade = false;
    try { au.logger = { info: (m) => say(m), warn: (m) => say("경고", m), error: (m) => say("오류", m), debug: () => {} }; } catch {}
    // 서명 없는 NSIS: app-update.yml에 publisherName이 없으면 원래 검사를 건너뛰지만,
    // 나중에 publisherName이 들어가도 서명 없는 설치 파일이 막히지 않게 검사를 끈다(서명 붙이면 이 줄을 뺄 것).
    try { au.verifyUpdateCodeSignature = () => Promise.resolve(null); } catch {}
    if (feed) {
      if (!(app && app.isPackaged)) au.forceDevUpdateConfig = true;
      au.setFeedURL({ provider: "generic", url: feed });
    }
    au.on("download-progress", (progress) => {
      if (windowsReady) return;
      emit("downloading", { percent: Math.max(0, Math.min(100, Math.round((progress && progress.percent) || 0))), latest: lastCheck && lastCheck.latest, transferred: progress && progress.transferred, total: progress && progress.total });
    });
    au.on("update-downloaded", (info) => {
      windowsReady = true;
      emit("ready", { percent: 100, latest: normalizeVersion(info && info.version) || (lastCheck && lastCheck.latest) });
    });
    au.on("error", (error) => {
      // downloadUpdate()의 거절에서도 같은 오류를 처리하므로 여기서는 기록만 한다.
      say("electron-updater error", error && error.message);
    });
    updater = au;
    return au;
  }
  function makeToken() {
    const Ctor = CancellationTokenImpl || (autoUpdaterImpl ? null : require("electron-updater").CancellationToken);
    if (Ctor) return new Ctor();
    // 시험용 대체 토큰
    return { cancelled: false, cancel() { this.cancelled = true; if (this.onCancel) this.onCancel(); } };
  }
  async function startWindows() {
    if (windowsReady) return emit("ready", { percent: 100, latest: lastCheck && lastCheck.latest });
    const au = getUpdater();
    const result = await au.checkForUpdates();
    const latest = normalizeVersion(result && result.updateInfo && result.updateInfo.version);
    const available = result && typeof result.isUpdateAvailable === "boolean" ? result.isUpdateAvailable : Boolean(latest) && isNewer(latest, current);
    if (!available) return emit("none", { latest });
    lastCheck = { ...(lastCheck || {}), latest, available: true, mode: "auto" };
    emit("available", { latest });
    if (cancelled) throw new UpdateError(UPDATE_ERROR_CODES.CANCELLED);
    emit("downloading", { percent: 0, latest });
    cancelToken = makeToken();
    await au.downloadUpdate(cancelToken);
    cancelToken = null;
    if (cancelled) throw new UpdateError(UPDATE_ERROR_CODES.CANCELLED);
    windowsReady = true;
    // update-downloaded 이벤트가 먼저 왔으면 같은 내용을 한 번 더 보내도 화면은 그대로다.
    return emit("ready", { percent: 100, latest });
  }

  // ---- 맥: dmg 내려받아 열기 ----
  // 받은 zip/dmg에서 5E.app을 꺼내 검사한다. 돌려주는 값은 새 5E.app 경로.
  async function prepareMacApp(file, kind, latest, versionFolder) {
    const extractDir = path.join(versionFolder, `app-${stamp(now())}`);
    await fs.promises.mkdir(extractDir, { recursive: true });
    if (kind === "zip") {
      await run("/usr/bin/ditto", ["-x", "-k", file, extractDir]);
    } else {
      const mount = path.join(versionFolder, `mnt-${stamp(now())}`);
      await fs.promises.mkdir(mount, { recursive: true });
      await run("/usr/bin/hdiutil", ["attach", "-nobrowse", "-readonly", "-noautoopen", "-mountpoint", mount, file]);
      try {
        const inside = (await fs.promises.readdir(mount)).find((name) => name.endsWith(".app"));
        if (!inside) throw new UpdateError(UPDATE_ERROR_CODES.VERIFY_FAILED, "dmg 안에 .app 없음");
        await run("/usr/bin/ditto", [path.join(mount, inside), path.join(extractDir, inside)]);
      } finally {
        await run("/usr/bin/hdiutil", ["detach", mount, "-force"]).catch((error) => say("dmg 떼기 실패", error && error.message));
      }
    }
    const appName = (await fs.promises.readdir(extractDir)).find((name) => name.endsWith(".app"));
    if (!appName) throw new UpdateError(UPDATE_ERROR_CODES.VERIFY_FAILED, "꺼낸 폴더에 .app 없음");
    const newApp = path.join(extractDir, appName);
    const plist = path.join(newApp, "Contents", "Info.plist");
    try { await fs.promises.access(plist); } catch { throw new UpdateError(UPDATE_ERROR_CODES.VERIFY_FAILED, "Info.plist 없음"); }
    let version = "";
    try {
      version = String((await run("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", plist])).stdout || "").trim();
    } catch (error) { throw new UpdateError(UPDATE_ERROR_CODES.VERIFY_FAILED, `판 번호 읽기 실패: ${error && error.message}`); }
    if (normalizeVersion(version) !== latest) throw new UpdateError(UPDATE_ERROR_CODES.VERIFY_FAILED, `판 번호 다름: ${version} ≠ ${latest}`);
    try {
      await run("/usr/bin/codesign", ["--verify", "--deep", newApp]);
    } catch (error) { throw new UpdateError(UPDATE_ERROR_CODES.VERIFY_FAILED, `codesign: ${(error && (error.stderr || error.message)) || ""}`); }
    await run("/usr/bin/xattr", ["-dr", "com.apple.quarantine", newApp]).catch(() => {});
    return newApp;
  }

  async function startMac() {
    if (readyApp) return emit("ready", { percent: 100, latest: lastCheck && lastCheck.latest, file: readyApp });
    const info = lastCheck && lastCheck.available ? lastCheck : await check().then(() => lastCheck);
    if (!info) throw new UpdateError(UPDATE_ERROR_CODES.OFFLINE);
    if (!info.available) return emit("none", { latest: info.latest });
    const latest = info.latest;
    emit("available", { latest });
    if (!info.macAsset || !info.macAsset.url) throw new UpdateError(UPDATE_ERROR_CODES.NO_ASSET, info.macAsset && info.macAsset.name);
    const versionFolder = path.join(tempDir || app.getPath("temp"), "5e-update", latest);
    await fs.promises.mkdir(versionFolder, { recursive: true });
    const dest = path.join(versionFolder, info.macAsset.name);
    let reuse = false;
    try {
      const stat = await fs.promises.stat(dest);
      reuse = stat.isFile() && info.macAsset.size > 0 && stat.size === info.macAsset.size;
    } catch {}
    if (!reuse) {
      if (cancelled) throw new UpdateError(UPDATE_ERROR_CODES.CANCELLED);
      emit("downloading", { percent: 0, latest });
      abortController = new AbortController();
      let lastPercent = -1;
      await downloadImpl(info.macAsset.url, dest, {
        signal: abortController.signal,
        onProgress: (progress) => {
          const percent = Math.max(0, Math.min(100, Math.floor((progress && progress.percent) || 0)));
          if (percent === lastPercent) return;
          lastPercent = percent;
          emit("downloading", { percent, latest, transferred: progress && progress.transferred, total: progress && progress.total });
        },
      });
      abortController = null;
    }
    if (cancelled) throw new UpdateError(UPDATE_ERROR_CODES.CANCELLED);
    readyFile = dest;
    emit("verifying", { percent: 100, latest });
    const newApp = await prepareMacApp(dest, info.macAsset.kind || (dest.endsWith(".dmg") ? "dmg" : "zip"), latest, versionFolder);
    if (cancelled) throw new UpdateError(UPDATE_ERROR_CODES.CANCELLED);
    readyApp = newApp;
    attachMacQuitHook();
    return emit("ready", { percent: 100, latest, file: newApp });
  }

  // 지금 앱을 바꿀 수 있는지: 설치판이고 …/5E.app의 부모 폴더에 쓸 수 있어야 한다.
  function macReplaceTarget() {
    if (!(app && app.isPackaged)) return { ok: false, reason: "not-packaged" };
    const bundle = macBundlePath(execPath);
    if (!bundle) return { ok: false, reason: "no-bundle" };
    if (/\/AppTranslocation\//.test(bundle)) return { ok: false, reason: "translocated", bundle };
    try {
      fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
      fs.accessSync(bundle, fs.constants.W_OK);
    } catch { return { ok: false, reason: "not-writable", bundle }; }
    return { ok: true, bundle };
  }

  // 도우미 sh를 쓰고 떼어서 실행한다. 이 앱이 꺼진 뒤에 바꾸기가 일어난다.
  function spawnMacHelper({ relaunch }) {
    if (helperSpawned) return { ok: true, already: true };
    const target = macReplaceTarget();
    if (!target.ok) return { ok: false, reason: target.reason };
    const folder = path.dirname(path.dirname(readyApp));
    const script = path.join(folder, "install-5e.sh");
    const text = buildMacInstallScript({
      pid,
      oldApp: target.bundle,
      newApp: readyApp,
      trashDir: path.join(homedir, ".Trash"),
      backupName: `5E-${current}-${stamp(now())}.app`,
      relaunch,
      logFile: path.join(folder, "install-5e.log"),
    });
    fs.writeFileSync(script, text, { mode: 0o755 });
    const child = spawnImpl("/bin/sh", [script], { detached: true, stdio: "ignore" });
    if (child && typeof child.unref === "function") child.unref();
    helperSpawned = true;
    say("교체 도우미 실행", script, relaunch ? "(다시 열기)" : "(다시 열지 않음)");
    return { ok: true, script };
  }

  // 받아 둔 채로 앱을 그냥 끄면(윈도우 autoInstallOnAppQuit과 같게) 다시 열지 않고 바꿔 둔다.
  function attachMacQuitHook() {
    if (quitHookAttached || !app || typeof app.on !== "function") return;
    quitHookAttached = true;
    app.on("will-quit", () => {
      if (!readyApp || helperSpawned) return;
      try { spawnMacHelper({ relaunch: false }); } catch (error) { say("끌 때 교체 실패", error && error.message); }
    });
  }

  // 새 판 받기를 시작한다. 이미 진행 중이면 같은 약속을 돌려준다. 거절하지 않고 마지막 상태를 돌려준다.
  function start() {
    if (running) return running;
    cancelled = false;
    running = (async () => {
      if (!enabled) return emit("none", { latest: null, skipped: "not-packaged" });
      emit("checking", { latest: lastCheck && lastCheck.latest });
      try {
        if (isWindows) {
          if (!feed) {
            const info = await check();
            if (info.code) throw new UpdateError(info.code);
            if (!info.available) return emit("none", { latest: info.latest });
            if (info.mode === "download") {
              // 릴리스에 latest.yml이 없을 때: 릴리스 페이지를 열어 직접 받게 한다(막다른 경고 대신).
              await shell.openExternal((lastCheck && lastCheck.page) || RELEASES_PAGE);
              return emit("opened", { latest: info.latest, url: (lastCheck && lastCheck.page) || RELEASES_PAGE });
            }
          }
          return await startWindows();
        }
        if (isMac) return await startMac();
        // 리눅스 등: 릴리스 페이지만 연다.
        const info = await check();
        if (!info.available) return emit("none", { latest: info.latest });
        await shell.openExternal(RELEASES_PAGE);
        return emit("opened", { latest: info.latest, url: RELEASES_PAGE });
      } catch (error) {
        return emitError(cancelled ? new UpdateError(UPDATE_ERROR_CODES.CANCELLED) : error);
      } finally {
        cancelToken = null;
        abortController = null;
      }
    })().finally(() => { running = null; });
    return running;
  }

  // 받아 둔 판을 바로 설치(윈도우)하거나 dmg를 다시 연다(맥).
  async function installNow() {
    if (isWindows) {
      if (!windowsReady) return { ok: false, code: "UPDATE_NOT_READY", message: "아직 새 판을 다 받지 않았습니다." };
      const au = getUpdater();
      // 창 닫기 처리가 끝난 뒤 설치기를 띄운다. isSilent=true, isForceRunAfter=true
      setImmediate(() => au.quitAndInstall(true, true));
      return { ok: true };
    }
    if (isMac) {
      if (!readyApp) return { ok: false, code: "UPDATE_NOT_READY", message: "아직 새 판을 다 받지 않았습니다." };
      let spawned;
      try { spawned = spawnMacHelper({ relaunch: true }); } catch (error) { say("도우미 실패", error && error.message); spawned = { ok: false, reason: "spawn-failed" }; }
      if (spawned.ok) {
        emit("installing", { percent: 100, latest: lastCheck && lastCheck.latest });
        setImmediate(() => app.quit());
        return { ok: true };
      }
      // 자동으로 못 바꾸는 자리(쓰기 권한 없음·앱 격리 실행 등): 새 앱이 든 폴더를 열어 끌어다 놓게 한다.
      const folder = path.dirname(readyApp);
      const failure = await shell.openPath(folder);
      const code = UPDATE_ERROR_CODES.NEEDS_MANUAL;
      emit("opened", { latest: lastCheck && lastCheck.latest, file: folder, code, message: MESSAGES[code], reason: spawned.reason });
      return { ok: false, code, message: MESSAGES[code], reason: spawned.reason, opened: !failure, file: folder };
    }
    return { ok: false, code: "UPDATE_NOT_READY", message: "이 운영체제에서는 직접 설치해 주세요." };
  }

  function cancel() {
    if (!running) return { ok: false };
    cancelled = true;
    try { if (cancelToken) cancelToken.cancel(); } catch {}
    try { if (abortController) abortController.abort(); } catch {}
    return { ok: true };
  }

  return {
    check,
    start,
    installNow,
    cancel,
    state: () => ({ ...lastState }),
    get enabled() { return enabled; },
    get feed() { return feed || null; },
  };
}

module.exports = {
  createAppUpdater,
  UPDATE_ERROR_CODES,
  STATE_CHANNEL,
  RELEASES_PAGE,
  isNewer,
  normalizeVersion,
  macDmgName,
  macZipName,
  macBundlePath,
  buildMacInstallScript,
  shQuote,
  readYamlVersion,
  defaultDownload,
};
