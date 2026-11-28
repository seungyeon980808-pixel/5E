"use strict";
// PATHFIX(11-20): Finder·Dock에서 띄운 설치판은 셸 PATH(/opt/homebrew/bin 등)를 받지 못해 `codex`를 못 찾았다
// (「spawn codex ENOENT」, 로그인되어 있는데 「로그인 필요」, 로그인 단추 헛돎). 그래서 codex 실행 파일의 절대 경로를
// 직접 찾아 기억한다. 찾는 순서:
//   1. 설정 — 환경 변수 FIVE_E_CODEX_PATH(검사·개발용: 주면 그것만 본다), 설정 파일의 override(사용자 지정)
//   2. 지금 PATH(터미널에서 띄운 경우)
//   3. 알려진 폴더(Homebrew·/usr/local·~/.local/bin·mise·asdf·volta·npm-global·bun·nvm, 윈도우 npm·scoop 등)
//   4. 지난번에 찾은 경로(설정 파일 lastFound)
//   5. 로그인 셸 `$SHELL -ilc 'command -v codex'`(3초 제한, 마지막 줄이 절대 경로이고 실행 가능할 때만) — 맥·리눅스
//      윈도우는 레지스트리의 지금 PATH(사용자·시스템) → `where codex`(.exe는 바로, .cmd·.bat은 cmd를 거쳐)
// 찾은 경로는 메모리에 기억하고 설정 파일에 lastFound로 남긴다. ENOENT가 나면 invalidate() 뒤 한 번 다시 찾는다.
// 자식에게는 codex 폴더·알려진 폴더를 앞에 붙인 넓힌 PATH를 넘긴다(mise 심이 mise를, npm 판 codex가 node를 찾도록).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");

// 화면(렌더러)까지 IPC를 건너도 사라지지 않게 오류 글 맨 앞에 고정 표식 [코드]를 붙인다(js/ai-error-copy.js가 읽는다).
const CODEX_ERROR_CODES = Object.freeze({
  NOT_FOUND: "CODEX_NOT_FOUND",
  SPAWN_FAILED: "CODEX_SPAWN_FAILED",
  EXITED: "CODEX_EXITED",
  NOT_LOGGED_IN: "CODEX_NOT_LOGGED_IN",
  LOGIN_FAILED: "CODEX_LOGIN_FAILED",
  LOGIN_TIMEOUT: "CODEX_LOGIN_TIMEOUT",
});
function codexError(code, message, extra = {}) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  return Object.assign(error, extra);
}
const NOT_FOUND_MESSAGE = "이 컴퓨터에서 Codex 프로그램을 찾지 못했습니다.";

function isExecutableFile(fsImpl, file, platform) {
  try {
    const stat = fsImpl.statSync(file);
    if (!stat.isFile()) return false;
    if (platform === "win32") return true;
    fsImpl.accessSync(file, fs.constants.X_OK);
    return true;
  } catch { return false; }
}

function versionKey(name) {
  return String(name).replace(/^v/, "").split(/[.-]/).map(part => Number.parseInt(part, 10) || 0);
}
function compareVersionsDesc(a, b) {
  const x = versionKey(a), y = versionKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (y[i] || 0) - (x[i] || 0);
    if (d) return d;
  }
  return 0;
}
function listVersionDirs(fsImpl, parent) {
  try { return fsImpl.readdirSync(parent).filter(name => !name.startsWith(".")).sort(compareVersionsDesc); }
  catch { return []; }
}

const SYSTEM_DIRS = Object.freeze(["/opt/homebrew/bin", "/usr/local/bin"]);
const CASK_ROOTS = Object.freeze(["/opt/homebrew/Caskroom/codex"]);
function knownDirs({ platform, env, homedir, fsImpl, systemDirs = SYSTEM_DIRS, caskRoots = CASK_ROOTS }) {
  if (platform === "win32") {
    const appData = env.APPDATA || (homedir && path.win32.join(homedir, "AppData", "Roaming"));
    const localAppData = env.LOCALAPPDATA || (homedir && path.win32.join(homedir, "AppData", "Local"));
    return [
      appData && path.win32.join(appData, "npm"),
      localAppData && path.win32.join(localAppData, "Programs", "codex"),
      // 11-22: 공식 설치(install.ps1)는 …\OpenAI\Codex\bin에 codex.exe를 둔다. 본체는 ~/.codex\packages\standalone\current.
      localAppData && path.win32.join(localAppData, "Programs", "OpenAI", "Codex", "bin"),
      localAppData && path.win32.join(localAppData, "Programs", "OpenAI", "Codex"),
      homedir && path.win32.join(env.CODEX_HOME || path.win32.join(homedir, ".codex"), "packages", "standalone", "current", "bin"),
      homedir && path.win32.join(env.CODEX_HOME || path.win32.join(homedir, ".codex"), "packages", "standalone", "current"),
      localAppData && path.win32.join(localAppData, "Microsoft", "WinGet", "Links"),
      homedir && path.win32.join(homedir, "scoop", "shims"),
      localAppData && path.win32.join(localAppData, "Volta", "bin"),
      homedir && path.win32.join(homedir, ".bun", "bin"),
      env.NVM_SYMLINK,
    ].filter(Boolean);
  }
  const home = homedir || "";
  const dirs = [...systemDirs];
  if (home) {
    dirs.push(
      path.join(home, ".local", "bin"),
      path.join(env.CODEX_HOME || path.join(home, ".codex"), "packages", "standalone", "current", "bin"),
      path.join(home, ".local", "share", "mise", "shims"),
      path.join(home, ".asdf", "shims"),
      path.join(home, ".volta", "bin"),
      path.join(home, ".npm-global", "bin"),
      path.join(home, ".bun", "bin"),
    );
    const nvm = path.join(home, ".nvm", "versions", "node");
    for (const version of listVersionDirs(fsImpl, nvm)) dirs.push(path.join(nvm, version, "bin"));
  }
  for (const cask of caskRoots) for (const version of listVersionDirs(fsImpl, cask)) dirs.push(path.join(cask, version, "bin"));
  return dirs;
}

function candidateNames(platform, env) {
  if (platform !== "win32") return ["codex"];
  const exts = String(env.PATHEXT || ".EXE;.CMD;.BAT").split(";").map(ext => ext.trim().toLowerCase()).filter(Boolean);
  const order = [".exe", ".cmd", ".bat"].filter(ext => exts.includes(ext));
  return order.map(ext => `codex${ext}`);
}

function kindOf(file, platform) {
  if (platform !== "win32") return "exe";
  return /\.(cmd|bat)$/i.test(file) ? "cmd" : "exe";
}

function createCodexResolver({
  platform = process.platform,
  env = process.env,
  homedir = os.homedir(),
  fsImpl = fs,
  execFileImpl = execFile,
  settingsFile = null,
  shellTimeoutMs = 3000,
  log = () => {},
  // 검사에서 이 맥의 실제 /opt/homebrew 등을 보지 않게 바꿀 수 있다.
  systemDirs = SYSTEM_DIRS,
  caskRoots = CASK_ROOTS,
} = {}) {
  const dirsOf = () => knownDirs({ platform, env, homedir, fsImpl, systemDirs, caskRoots });
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const delimiter = platform === "win32" ? ";" : ":";
  let cached = null;
  let resolving = null;
  const safeLog = entry => { try { log(entry); } catch {} };
  const settingsPath = () => { try { return typeof settingsFile === "function" ? settingsFile() : settingsFile; } catch { return null; } };
  const readSettings = () => {
    const file = settingsPath();
    if (!file) return {};
    try { const value = JSON.parse(fsImpl.readFileSync(file, "utf8")); return value && typeof value === "object" ? value : {}; }
    catch { return {}; }
  };
  const writeSettings = value => {
    const file = settingsPath();
    if (!file) return;
    try { fsImpl.mkdirSync(pathApi.dirname(file), { recursive: true }); fsImpl.writeFileSync(file, JSON.stringify(value, null, 2)); } catch {}
  };
  const usable = file => typeof file === "string" && pathApi.isAbsolute(file) && isExecutableFile(fsImpl, file, platform);
  const found = (file, via) => ({ path: file, via, kind: kindOf(file, platform) });

  function searchDirs(dirs, via) {
    for (const dir of dirs) {
      if (!dir || !pathApi.isAbsolute(dir)) continue;
      for (const name of candidateNames(platform, env)) {
        const file = pathApi.join(dir, name);
        if (usable(file)) return found(file, via);
      }
    }
    return null;
  }

  function runQuiet(file, args, options) {
    return new Promise(resolve => {
      try {
        execFileImpl(file, args, options, (error, stdout) => resolve({ error, stdout: String(stdout || "") }));
      } catch (error) { resolve({ error, stdout: "" }); }
    });
  }

  async function fromLoginShell() {
    const shell = env.SHELL && pathApi.isAbsolute(env.SHELL) ? env.SHELL : "/bin/zsh";
    const { error, stdout } = await runQuiet(shell, ["-ilc", "command -v codex"], {
      timeout: shellTimeoutMs,
      killSignal: "SIGKILL",
      windowsHide: true,
      env: { HOME: homedir, USER: env.USER || "", LOGNAME: env.LOGNAME || env.USER || "", SHELL: shell, TERM: "dumb", PATH: env.PATH || "/usr/bin:/bin:/usr/sbin:/sbin" },
    });
    // rc 파일이 무언가 찍어도 괜찮게 마지막 줄만 본다. 별칭(alias codex=…)·함수 이름은 절대 경로가 아니라 버린다.
    const last = stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean).at(-1) || "";
    if (usable(last)) return found(last, "login-shell");
    if (error) safeLog({ event: "codex-resolve-shell", ok: false, reason: error.killed ? "timeout" : String(error.code || error.message || error).slice(0, 120) });
    return null;
  }

  // 11-22: 켜 둔 5E는 켤 때의 PATH만 안다 — 그 뒤에 설치가 사용자 PATH에 더한 폴더를 레지스트리에서 다시 읽어 찾는다
  // (전에는 Codex를 설치해도 5E를 껐다 켜야 잡혔다).
  async function fromRegistryPath() {
    const reg = env.SystemRoot ? pathApi.join(env.SystemRoot, "System32", "reg.exe") : "reg";
    const keys = ["HKCU\\Environment", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment"];
    const dirs = [];
    for (const key of keys) {
      const { stdout } = await runQuiet(reg, ["query", key, "/v", "Path"], { timeout: shellTimeoutMs, windowsHide: true, env });
      const line = stdout.split(/\r?\n/).find(row => /^\s*Path\s+REG_(EXPAND_)?SZ\s+/i.test(row));
      if (!line) continue;
      const value = line.replace(/^\s*Path\s+REG_(EXPAND_)?SZ\s+/i, "");
      for (const part of value.split(";")) {
        const expanded = part.trim().replace(/%([^%]+)%/g, (all, name) => {
          const hit = Object.keys(env).find(k => k.toUpperCase() === String(name).toUpperCase());
          return hit ? env[hit] : all;
        });
        if (expanded && !expanded.includes("%")) dirs.push(expanded);
      }
    }
    return searchDirs(dirs, "registry-path");
  }

  async function fromWhere() {
    const where = env.SystemRoot ? pathApi.join(env.SystemRoot, "System32", "where.exe") : "where";
    const { stdout } = await runQuiet(where, ["codex"], { timeout: shellTimeoutMs, windowsHide: true, env });
    const lines = stdout.split(/\r?\n/).map(line => line.trim()).filter(line => line && pathApi.isAbsolute(line) && usable(line));
    const pick = lines.find(line => /\.exe$/i.test(line)) || lines.find(line => /\.(cmd|bat)$/i.test(line));
    return pick ? found(pick, "where") : null;
  }

  async function search() {
    // 1. 설정
    if (env.FIVE_E_CODEX_PATH) {
      // 검사·개발용 스위치는 그것만 본다(「없는 codex」 시험을 이 맥의 실제 codex가 가리지 않게).
      return usable(env.FIVE_E_CODEX_PATH) ? found(env.FIVE_E_CODEX_PATH, "env-override") : null;
    }
    const settings = readSettings();
    if (usable(settings.override)) return found(settings.override, "settings-override");
    // 2. 지금 PATH
    const onPath = searchDirs(String(env.PATH || "").split(delimiter).filter(Boolean), "path");
    if (onPath) return onPath;
    // 3. 알려진 폴더
    const known = searchDirs(dirsOf(), "known-dir");
    if (known) return known;
    // 4. 지난번에 찾은 경로
    if (usable(settings.lastFound)) return found(settings.lastFound, "last-found");
    // 5. 로그인 셸 / where
    if (platform === "win32") return (await fromRegistryPath()) || fromWhere();
    return fromLoginShell();
  }

  async function resolve({ force = false } = {}) {
    if (cached && !force) {
      if (usable(cached.path)) return cached;
      cached = null;
    }
    if (resolving) return resolving;
    resolving = (async () => {
      const started = Date.now();
      let result = null;
      try { result = await search(); } catch (error) { safeLog({ event: "codex-resolve-error", message: String(error?.message || error).slice(0, 200) }); }
      cached = result;
      safeLog(result
        ? { event: "codex-resolve", ok: true, via: result.via, path: result.path, ms: Date.now() - started }
        : { event: "codex-resolve", ok: false, code: CODEX_ERROR_CODES.NOT_FOUND, ms: Date.now() - started });
      if (result && result.via !== "env-override") {
        const settings = readSettings();
        if (settings.lastFound !== result.path) writeSettings({ ...settings, lastFound: result.path });
      }
      return result;
    })().finally(() => { resolving = null; });
    return resolving;
  }

  function invalidate() { cached = null; }

  // 자식 프로세스 env: codex 폴더·알려진 폴더를 앞에 붙인다(겹치는 것은 한 번만).
  function childEnv(resolved = cached) {
    const current = String(env.PATH || "").split(delimiter).filter(Boolean);
    const extra = [resolved?.path ? pathApi.dirname(resolved.path) : null, ...dirsOf()]
      .filter(dir => dir && (platform === "win32" || fsImpl.existsSync?.(dir) !== false));
    const seen = new Set();
    const merged = [...extra, ...current].filter(dir => { const key = platform === "win32" ? dir.toLowerCase() : dir; if (seen.has(key)) return false; seen.add(key); return true; });
    const base = { ...env };
    if (platform === "win32") { for (const key of Object.keys(base)) if (key.toUpperCase() === "PATH" && key !== "Path" && key !== "PATH") delete base[key]; }
    const pathKey = platform === "win32" ? (Object.keys(base).find(key => key.toUpperCase() === "PATH") || "Path") : "PATH";
    base[pathKey] = merged.join(delimiter);
    return base;
  }

  function invocationFor(resolved, args) {
    const childEnvironment = childEnv(resolved);
    if (resolved.kind === "cmd") {
      // cmd /d /s /c ""C:\경로 띄어쓰기\codex.cmd" app-server --stdio" — /s가 바깥 따옴표만 벗긴다.
      const comspec = env.ComSpec || env.COMSPEC || "C:\\Windows\\System32\\cmd.exe";
      const line = [`"${resolved.path}"`, ...args.map(arg => /[\s"]/.test(arg) ? `"${String(arg).replace(/"/g, '""')}"` : arg)].join(" ");
      return { file: comspec, args: ["/d", "/s", "/c", `"${line}"`], options: { windowsVerbatimArguments: true, env: childEnvironment }, resolved };
    }
    return { file: resolved.path, args: [...args], options: { env: childEnvironment }, resolved };
  }

  async function invocation(args = []) {
    const resolved = await resolve();
    if (!resolved) throw codexError(CODEX_ERROR_CODES.NOT_FOUND, NOT_FOUND_MESSAGE);
    return invocationFor(resolved, args);
  }

  return { resolve, invalidate, invocation, invocationFor, childEnv, knownDirs: dirsOf, get cached() { return cached; } };
}

// 실행 실패를 코드 붙은 오류로 바꾼다(ENOENT·윈도우 「인식되지 않는 명령」 → CODEX_NOT_FOUND).
function classifyCodexSpawnError(error, stderr = "") {
  const text = `${error?.message || ""}\n${stderr || ""}`;
  if (error?.code === "ENOENT" || /is not recognized as an internal or external command|내부 또는 외부 명령|command not found|No such file or directory/i.test(text)) {
    return codexError(CODEX_ERROR_CODES.NOT_FOUND, NOT_FOUND_MESSAGE, { cause: error });
  }
  if (error?.code && String(error.code).startsWith("CODEX_")) return error;
  return codexError(CODEX_ERROR_CODES.SPAWN_FAILED, `Codex 프로그램을 실행하지 못했습니다(${String(error?.code || error?.message || error).slice(0, 120)}).`, { cause: error });
}

module.exports = { createCodexResolver, codexError, classifyCodexSpawnError, CODEX_ERROR_CODES, NOT_FOUND_MESSAGE, knownDirs, compareVersionsDesc };
