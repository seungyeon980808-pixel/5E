"use strict";
// 11-22 사용자: Codex가 없으면 묻지 않고 바로 설치 → 로그인으로 잇는다(시안 2026-11-22_설치-업데이트).
// OpenAI 공식 설치 명령을 창 없이 돌린다. 둘 다 내 사용자 폴더에만 설치하고 관리자 권한이 필요 없다.
//   윈도우: powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
//           → %LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe, 사용자 PATH 등록
//   맥:     curl -fsSL https://chatgpt.com/codex/install.sh | sh → ~/.local/bin/codex
// CODEX_NON_INTERACTIVE=1이면 설치 스크립트가 「지금 Codex를 켤까요?」 등을 묻지 않고 「아니요」로 넘어간다.
// 진행은 스크립트가 찍는 단계 줄로 읽는다(받기 → 설치하기). 끝나면 부른 쪽이 다시 찾고 로그인으로 잇는다.
const path = require("node:path");
const { spawn, execFile } = require("node:child_process");

const INSTALL_PS1 = "https://chatgpt.com/codex/install.ps1";
const INSTALL_SH = "https://chatgpt.com/codex/install.sh";
const INSTALL_CODES = Object.freeze({
  OFFLINE: "CODEX_INSTALL_OFFLINE",
  BLOCKED: "CODEX_INSTALL_BLOCKED",
  TIMEOUT: "CODEX_INSTALL_TIMEOUT",
  CANCELLED: "CODEX_INSTALL_CANCELLED",
  BUSY: "CODEX_INSTALL_BUSY",
  FAILED: "CODEX_INSTALL_FAILED",
  UNSUPPORTED: "CODEX_INSTALL_UNSUPPORTED",
});
const MESSAGES = Object.freeze({
  [INSTALL_CODES.OFFLINE]: "인터넷이 막혀 Codex를 받지 못했어요.",
  [INSTALL_CODES.BLOCKED]: "보안 프로그램이나 설정이 설치를 막았어요.",
  [INSTALL_CODES.TIMEOUT]: "설치가 10분 안에 끝나지 않았어요.",
  [INSTALL_CODES.CANCELLED]: "설치를 취소했어요.",
  [INSTALL_CODES.BUSY]: "이미 설치하고 있어요.",
  [INSTALL_CODES.FAILED]: "Codex를 설치하지 못했어요.",
  [INSTALL_CODES.UNSUPPORTED]: "이 컴퓨터에서는 자동 설치를 할 수 없어요.",
});

// 설치 스크립트 출력 한 줄 → 단계. 모르는 줄은 null.
function stepOf(line) {
  const text = String(line || "");
  if (/Downloading Codex/i.test(text)) return "download";
  if (/Installing standalone package|Moving older standalone|PATH (was )?(added|updated|is already)|already (first )?on PATH|Current (PowerShell session|terminal)/i.test(text)) return "install";
  return null;
}

// 실패 출력 → 코드. 앞에서부터 맞는 것.
function classifyInstallFailure(output) {
  const text = String(output || "");
  if (/Could not resolve host|Unable to connect|remote name could not be resolved|No such host|Failed to connect|timed out|curl: \((6|7|28|35)\)|연결할 수 없|이름을 확인할 수 없|SSL|TLS|proxy/i.test(text)) return INSTALL_CODES.OFFLINE;
  if (/malicious content|blocked by your antivirus|ExecutionPolicy|is not digitally signed|Access (to the path .* )?is denied|UnauthorizedAccess|Operation not permitted|액세스가 거부|권한/i.test(text)) return INSTALL_CODES.BLOCKED;
  return INSTALL_CODES.FAILED;
}

function installCommand({ platform, env }) {
  const childEnv = { ...env, CODEX_NON_INTERACTIVE: "1" };
  if (platform === "win32") {
    const root = env.SystemRoot || env.SYSTEMROOT || "C:\\Windows";
    const powershell = path.win32.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    return {
      file: powershell,
      args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command",
        `$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm ${INSTALL_PS1} | iex`],
      options: { env: childEnv, windowsHide: true },
    };
  }
  if (platform === "darwin" || platform === "linux") {
    // Finder에서 띄운 앱은 PATH가 짧다 — curl·tar·shasum이 있는 기본 폴더를 앞에 둔다.
    const base = "/usr/bin:/bin:/usr/sbin:/sbin";
    childEnv.PATH = env.PATH ? `${base}:${env.PATH}` : base;
    return { file: "/bin/sh", args: ["-c", `curl -fsSL ${INSTALL_SH} | sh`], options: { env: childEnv } };
  }
  return null;
}

// 하나만 돌게 하는 설치기. onStep({ step: 'download'|'install'|'done', elapsedMs })
function createCodexInstaller({ platform = process.platform, env = process.env, spawnImpl = spawn, execFileImpl = execFile, timeoutMs = 10 * 60_000, log = () => {} } = {}) {
  let running = null;
  const safeLog = entry => { try { log(entry); } catch {} };

  function killTree(child) {
    if (!child || child.exitCode != null) return;
    if (platform === "win32" && child.pid) {
      // 우리가 띄운 PowerShell과 그 아래(받기 등)만 끈다.
      try { execFileImpl("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true }, () => {}); return; } catch {}
    }
    try { child.kill("SIGTERM"); } catch {}
  }

  function install({ onStep = () => {} } = {}) {
    if (running) return Promise.resolve({ ok: false, code: INSTALL_CODES.BUSY, message: MESSAGES[INSTALL_CODES.BUSY] });
    const command = installCommand({ platform, env });
    if (!command) return Promise.resolve({ ok: false, code: INSTALL_CODES.UNSUPPORTED, message: MESSAGES[INSTALL_CODES.UNSUPPORTED] });
    const started = Date.now();
    const tail = [];
    let step = null, settled = false, cancelled = false, timedOut = false;
    const emit = next => { if (next && next !== step) { step = next; try { onStep({ step, elapsedMs: Date.now() - started }); } catch {} } };
    const remember = chunk => {
      for (const line of String(chunk).split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        tail.push(trimmed.slice(0, 400)); if (tail.length > 40) tail.shift();
        emit(stepOf(trimmed));
      }
    };
    const promise = new Promise(resolve => {
      let child;
      const finish = result => {
        if (settled) return; settled = true;
        clearTimeout(timer); running = null;
        safeLog({ event: "codex-install", ok: result.ok, code: result.code || null, ms: Date.now() - started, tail: tail.slice(-8) });
        resolve({ ...result, elapsedMs: Date.now() - started });
      };
      const timer = setTimeout(() => { timedOut = true; killTree(child); finish({ ok: false, code: INSTALL_CODES.TIMEOUT, message: MESSAGES[INSTALL_CODES.TIMEOUT] }); }, timeoutMs);
      timer.unref?.();
      try { child = spawnImpl(command.file, command.args, { ...command.options, stdio: ["ignore", "pipe", "pipe"] }); }
      catch (error) { finish({ ok: false, code: INSTALL_CODES.BLOCKED, message: MESSAGES[INSTALL_CODES.BLOCKED], detail: String(error?.message || error).slice(0, 300) }); return; }
      running = { child, cancel: () => { cancelled = true; killTree(child); finish({ ok: false, code: INSTALL_CODES.CANCELLED, message: MESSAGES[INSTALL_CODES.CANCELLED] }); } };
      emit("download"); // 스크립트가 첫 줄을 찍기 전에도 「받기」로 보인다
      child.stdout?.on("data", remember);
      child.stderr?.on("data", remember);
      child.on("error", error => {
        const code = error?.code === "ENOENT" ? INSTALL_CODES.UNSUPPORTED : INSTALL_CODES.BLOCKED;
        finish({ ok: false, code, message: MESSAGES[code], detail: String(error?.message || error).slice(0, 300) });
      });
      child.on("close", exitCode => {
        if (cancelled || timedOut) return;
        if (exitCode === 0) { emit("done"); finish({ ok: true }); return; }
        const code = classifyInstallFailure(tail.join("\n"));
        finish({ ok: false, code, message: MESSAGES[code], detail: tail.slice(-4).join(" / ").slice(0, 400), exitCode });
      });
    });
    return promise;
  }

  function cancel() {
    if (!running) return { ok: true, running: false };
    running.cancel();
    return { ok: true, running: true };
  }

  return { install, cancel, get running() { return Boolean(running); } };
}

module.exports = { createCodexInstaller, installCommand, stepOf, classifyInstallFailure, INSTALL_CODES, INSTALL_PS1, INSTALL_SH };
