// PATHFIX(11-20): codex 실행 파일 찾기(desktop/codex-binary.cjs) — Finder 실행처럼 PATH가 최소일 때도 찾는지.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createCodexResolver, classifyCodexSpawnError, CODEX_ERROR_CODES, compareVersionsDesc } = require("./codex-binary.cjs");

const MIN_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-codex-bin-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const exe = (rel) => { const file = path.join(root, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, "#!/bin/sh\n"); fs.chmodSync(file, 0o755); return file; };
  return { root, exe };
}
const noShell = (calls = []) => (file, args, options, callback) => { calls.push({ file, args, options }); callback(Object.assign(new Error("no shell"), { code: 1 }), "", ""); };

test("최소 PATH에서도 알려진 폴더(~/.local/bin 등)에서 찾는다", { skip: process.platform === "win32" }, async t => {
  const { root, exe } = sandbox(t);
  const file = exe(".local/bin/codex");
  const resolver = createCodexResolver({ systemDirs: [], caskRoots: [], platform: "darwin", env: { PATH: MIN_PATH }, homedir: root, execFileImpl: noShell() });
  const found = await resolver.resolve();
  assert.equal(found.path, file);
  assert.equal(found.via, "known-dir");
  const launch = await resolver.invocation(["app-server", "--stdio"]);
  assert.equal(launch.file, file);
  assert.deepEqual(launch.args, ["app-server", "--stdio"]);
  assert.ok(launch.options.env.PATH.split(":")[0] === path.dirname(file), "codex 폴더를 PATH 맨 앞에 붙인다");
  assert.ok(launch.options.env.PATH.endsWith(MIN_PATH));
});

test("지금 PATH에 있으면 그것을 먼저, 설정 override가 있으면 그것을 가장 먼저", { skip: process.platform === "win32" }, async t => {
  const { root, exe } = sandbox(t);
  const onPath = exe("bin-a/codex"); exe(".local/bin/codex");
  const resolver = createCodexResolver({ systemDirs: [], caskRoots: [], platform: "darwin", env: { PATH: `${path.dirname(onPath)}:${MIN_PATH}` }, homedir: root, execFileImpl: noShell() });
  assert.equal((await resolver.resolve()).via, "path");
  const override = exe("custom/codex");
  const settingsFile = path.join(root, "settings", "codex-path.json");
  fs.mkdirSync(path.dirname(settingsFile)); fs.writeFileSync(settingsFile, JSON.stringify({ override }));
  const withSettings = createCodexResolver({ systemDirs: [], caskRoots: [], platform: "darwin", env: { PATH: `${path.dirname(onPath)}:${MIN_PATH}` }, homedir: root, settingsFile, execFileImpl: noShell() });
  const found = await withSettings.resolve();
  assert.equal(found.path, override); assert.equal(found.via, "settings-override");
  assert.equal(JSON.parse(fs.readFileSync(settingsFile, "utf8")).lastFound, override, "찾은 경로를 남긴다");
});

test("로그인 셸: 마지막 줄의 절대 경로만 받고, 3초 제한·잡음·별칭은 버린다", { skip: process.platform === "win32" }, async t => {
  const { root, exe } = sandbox(t);
  const file = exe("odd/place/codex");
  const calls = [];
  const shell = (out) => (f, args, options, callback) => { calls.push({ f, args, options }); callback(null, out, ""); };
  const ok = createCodexResolver({ systemDirs: [], caskRoots: [], platform: "darwin", env: { PATH: MIN_PATH, SHELL: "/bin/zsh" }, homedir: root, execFileImpl: shell(`welcome!\n${file}\n`) });
  const found = await ok.resolve();
  assert.equal(found.path, file); assert.equal(found.via, "login-shell");
  assert.deepEqual(calls[0].args, ["-ilc", "command -v codex"]);
  assert.equal(calls[0].options.timeout, 3000);
  const alias = createCodexResolver({ systemDirs: [], caskRoots: [], platform: "darwin", env: { PATH: MIN_PATH, SHELL: "/bin/zsh" }, homedir: root, execFileImpl: shell("codex: aliased to npx codex\n") });
  assert.equal(await alias.resolve(), null);
});

test("못 찾으면 [CODEX_NOT_FOUND]로 spawn 전에 멈추고, 다시 찾기(force)로 새로 설치한 것을 찾는다", { skip: process.platform === "win32" }, async t => {
  const { root, exe } = sandbox(t);
  const logs = [];
  const resolver = createCodexResolver({ systemDirs: [], caskRoots: [], platform: "darwin", env: { PATH: MIN_PATH }, homedir: root, execFileImpl: noShell(), log: entry => logs.push(entry) });
  await assert.rejects(resolver.invocation(["login"]), error => error.code === CODEX_ERROR_CODES.NOT_FOUND && /^\[CODEX_NOT_FOUND\] /.test(error.message));
  assert.ok(logs.some(entry => entry.event === "codex-resolve" && entry.ok === false), "못 찾은 것도 기록한다");
  const file = exe(".local/bin/codex");
  resolver.invalidate();
  assert.equal((await resolver.resolve({ force: true })).path, file);
});

test("검사 스위치 FIVE_E_CODEX_PATH는 그것만 본다(없는 경로면 이 맥의 codex가 있어도 못 찾음)", { skip: process.platform === "win32" }, async t => {
  const { root, exe } = sandbox(t);
  exe(".local/bin/codex");
  const resolver = createCodexResolver({ systemDirs: [], caskRoots: [], platform: "darwin", env: { PATH: MIN_PATH, FIVE_E_CODEX_PATH: path.join(root, "missing", "codex") }, homedir: root, execFileImpl: noShell() });
  assert.equal(await resolver.resolve(), null);
});

test("nvm 판은 최신 버전부터 본다", () => {
  assert.deepEqual(["v18.2.0", "v22.1.0", "v20.11.1"].sort(compareVersionsDesc), ["v22.1.0", "v20.11.1", "v18.2.0"]);
});

test("윈도우: .cmd는 cmd /d /s /c 로 감싸고, .exe는 바로 띄운다", () => {
  const resolver = createCodexResolver({ platform: "win32", env: { PATH: "", ComSpec: "C:\\Windows\\System32\\cmd.exe" }, homedir: "C:\\Users\\박 선생", execFileImpl: noShell() });
  const cmd = resolver.invocationFor({ path: "C:\\Users\\박 선생\\AppData\\Roaming\\npm\\codex.cmd", kind: "cmd" }, ["app-server", "--stdio"]);
  assert.equal(cmd.file, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(cmd.args, ["/d", "/s", "/c", "\"\"C:\\Users\\박 선생\\AppData\\Roaming\\npm\\codex.cmd\" app-server --stdio\""]);
  assert.equal(cmd.options.windowsVerbatimArguments, true);
  const exe = resolver.invocationFor({ path: "C:\\Tools\\codex.exe", kind: "exe" }, ["login"]);
  assert.equal(exe.file, "C:\\Tools\\codex.exe");
  assert.deepEqual(exe.args, ["login"]);
  assert.ok(String(exe.options.env.Path || exe.options.env.PATH).toLowerCase().startsWith("c:\\tools"));
});

test("실행 실패 분류: ENOENT·윈도우 「인식되지 않음」은 CODEX_NOT_FOUND, 그 밖은 CODEX_SPAWN_FAILED", () => {
  assert.equal(classifyCodexSpawnError(Object.assign(new Error("spawn codex ENOENT"), { code: "ENOENT" })).code, CODEX_ERROR_CODES.NOT_FOUND);
  assert.equal(classifyCodexSpawnError(new Error("x"), "'codex' is not recognized as an internal or external command").code, CODEX_ERROR_CODES.NOT_FOUND);
  assert.equal(classifyCodexSpawnError(Object.assign(new Error("EACCES"), { code: "EACCES" })).code, CODEX_ERROR_CODES.SPAWN_FAILED);
});
