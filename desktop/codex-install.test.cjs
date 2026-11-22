// 11-22: Codex 자동 설치(desktop/codex-install.cjs) — 실제로 받지 않고 가짜 프로세스로 단계·실패 분류·취소를 본다.
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createCodexInstaller, installCommand, stepOf, classifyInstallFailure, INSTALL_CODES } = require("./codex-install.cjs");

function fakeSpawn(script) {
  const calls = [];
  const impl = (file, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.pid = 4321; child.exitCode = null;
    child.kill = () => { child.killed = true; };
    calls.push({ file, args, options, child });
    setImmediate(() => script(child));
    return child;
  };
  return { impl, calls };
}

test("윈도우 명령: 공식 install.ps1을 창 없이, 묻지 않게(CODEX_NON_INTERACTIVE=1) 돌린다", () => {
  const cmd = installCommand({ platform: "win32", env: { SystemRoot: "C:\\Windows", PATH: "C:\\x" } });
  assert.equal(cmd.file, "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  assert.ok(cmd.args.includes("Bypass"));
  assert.match(cmd.args.at(-1), /irm https:\/\/chatgpt\.com\/codex\/install\.ps1 \| iex/);
  assert.equal(cmd.options.env.CODEX_NON_INTERACTIVE, "1");
  assert.equal(cmd.options.windowsHide, true);
});

test("맥 명령: 공식 install.sh, 짧은 PATH에도 /usr/bin을 앞에", () => {
  const cmd = installCommand({ platform: "darwin", env: { PATH: "/opt/x" } });
  assert.equal(cmd.file, "/bin/sh");
  assert.match(cmd.args[1], /curl -fsSL https:\/\/chatgpt\.com\/codex\/install\.sh \| sh/);
  assert.ok(cmd.options.env.PATH.startsWith("/usr/bin"));
  assert.equal(cmd.options.env.CODEX_NON_INTERACTIVE, "1");
});

test("단계 읽기: 받기 → 설치하기 → 끝", async () => {
  const { impl } = fakeSpawn(child => {
    child.stdout.emit("data", "==> Installing Codex CLI\n==> Downloading Codex CLI\n");
    child.stdout.emit("data", "==> Installing standalone package to C:\\x\n==> PATH updated for future PowerShell sessions.\n");
    child.emit("close", 0);
  });
  const steps = [];
  const installer = createCodexInstaller({ platform: "win32", env: {}, spawnImpl: impl });
  const result = await installer.install({ onStep: s => steps.push(s.step) });
  assert.equal(result.ok, true);
  assert.deepEqual(steps, ["download", "install", "done"]);
  assert.equal(installer.running, false);
});

test("실패 분류: 인터넷 막힘 · 보안 차단 · 그 밖", async () => {
  assert.equal(classifyInstallFailure("curl: (6) Could not resolve host: chatgpt.com"), INSTALL_CODES.OFFLINE);
  assert.equal(classifyInstallFailure("Invoke-RestMethod : The remote name could not be resolved: 'chatgpt.com'"), INSTALL_CODES.OFFLINE);
  assert.equal(classifyInstallFailure("This script contains malicious content and has been blocked by your antivirus software."), INSTALL_CODES.BLOCKED);
  assert.equal(classifyInstallFailure("something odd"), INSTALL_CODES.FAILED);
  const { impl } = fakeSpawn(child => { child.stderr.emit("data", "curl: (7) Failed to connect\n"); child.emit("close", 1); });
  const result = await createCodexInstaller({ platform: "darwin", env: {}, spawnImpl: impl }).install();
  assert.equal(result.ok, false);
  assert.equal(result.code, INSTALL_CODES.OFFLINE);
  assert.match(result.message, /인터넷/);
});

test("취소: 우리가 띄운 설치 프로세스(트리)만 끄고 CANCELLED, 두 번 동시에는 BUSY", async () => {
  const killed = [];
  const { impl } = fakeSpawn(() => {}); // 끝나지 않는 설치
  const installer = createCodexInstaller({ platform: "win32", env: {}, spawnImpl: impl, execFileImpl: (file, args, opts, cb) => { killed.push([file, ...args]); cb?.(null); } });
  const first = installer.install();
  await new Promise(r => setImmediate(r));
  const second = await installer.install();
  assert.equal(second.code, INSTALL_CODES.BUSY);
  assert.deepEqual(installer.cancel(), { ok: true, running: true });
  const result = await first;
  assert.equal(result.code, INSTALL_CODES.CANCELLED);
  assert.deepEqual(killed[0], ["taskkill", "/pid", "4321", "/t", "/f"]);
  assert.deepEqual(installer.cancel(), { ok: true, running: false });
});

test("시간 제한: 넘기면 TIMEOUT", async () => {
  const { impl, calls } = fakeSpawn(() => {});
  const result = await createCodexInstaller({ platform: "darwin", env: {}, spawnImpl: impl, timeoutMs: 20 }).install();
  assert.equal(result.code, INSTALL_CODES.TIMEOUT);
  assert.equal(calls[0].child.killed, true);
});

test("powershell이 없으면(띄우기 실패 ENOENT) UNSUPPORTED로 끝나고 매달리지 않는다", async () => {
  const { impl } = fakeSpawn(child => child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" })));
  const result = await createCodexInstaller({ platform: "win32", env: {}, spawnImpl: impl }).install();
  assert.equal(result.code, INSTALL_CODES.UNSUPPORTED);
});

test("줄 → 단계", () => {
  assert.equal(stepOf("==> Downloading Codex CLI"), "download");
  assert.equal(stepOf("PATH was added to /Users/t/.zprofile"), "install");
  assert.equal(stepOf("Resolved version: 0.171.0"), null);
});
