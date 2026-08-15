const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { run } = require("../scripts/stabilization/stable-release-cli.cjs");

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function refreshFromRemote(item) {
  git(item.root, "fetch", "--force", "--no-tags", "origin",
    "refs/heads/main:refs/remotes/origin/main", "refs/tags/v1.6.0:refs/tags/v1.6.0");
}

function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "5e-stable-publish-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const remote = path.join(temp, "remote.git");
  const seed = path.join(temp, "seed");
  const root = path.join(temp, "checkout");
  fs.mkdirSync(seed);
  git(temp, "init", "--bare", remote);
  git(seed, "init", "-b", "main");
  git(seed, "config", "user.email", "release-test@example.invalid");
  git(seed, "config", "user.name", "Release Test");
  fs.mkdirSync(path.join(seed, "docs"));
  writeJson(path.join(seed, "package.json"), { version: "1.6.0" });
  fs.writeFileSync(path.join(seed, "docs", "RELEASE_NOTES_v1.6.0.md"), "# v1.6.0\n");
  git(seed, "add", ".");
  git(seed, "commit", "-m", "stable");
  const sha = git(seed, "rev-parse", "HEAD");
  git(seed, "remote", "add", "origin", remote);
  git(seed, "push", "-u", "origin", "main");
  git(seed, "tag", "v1.6.0");
  git(seed, "push", "origin", "refs/tags/v1.6.0");
  git(temp, "clone", "--branch", "main", remote, root);
  const release = path.join(root, "release");
  fs.mkdirSync(release);
  fs.writeFileSync(path.join(release, "5E-Setup-1.6.0-windows-x64.exe"), "installer bytes");
  writeJson(path.join(release, "package-artifact-audit.json"), {
    violations: [],
    identity: { matches: true, desktop: { version: "1.6.0", commit: sha } },
  });
  const outputFile = path.join(temp, "github-output.txt");
  const ghMarker = path.join(temp, "gh-invoked.txt");
  fs.writeFileSync(path.join(temp, "gh.cmd"), `@echo invoked>"${ghMarker}"\r\n`);
  const context = {
    root,
    release,
    outputFile,
    env: { ...process.env, PATH: `${temp}${path.delimiter}${process.env.PATH}`, RELEASE_TAG: "v1.6.0", EXPECTED_SHA: sha },
  };
  run("bundle", context);
  return { temp, remote, seed, root, release, sha, context, ghMarker };
}

test("publish revalidates freshly fetched refs and accepts an unchanged verified bundle", (t) => {
  const item = fixture(t);
  assert.equal(run("publish", item.context).commit, item.sha);
  assert.match(fs.readFileSync(item.context.outputFile, "utf8"), /installer=release\/5E-Setup-1\.6\.0-windows-x64\.exe/);
  assert.equal(fs.existsSync(item.ghMarker), false, "validation must not invoke gh or publish");
});

for (const [name, change, code] of [
  ["tag moved during approval", (item) => {
    fs.writeFileSync(path.join(item.seed, "later.txt"), "later");
    git(item.seed, "add", ".");
    git(item.seed, "commit", "-m", "later");
    git(item.seed, "push", "origin", "main");
    git(item.seed, "tag", "-f", "v1.6.0");
    git(item.seed, "push", "--force", "origin", "refs/tags/v1.6.0");
    refreshFromRemote(item);
  }, "TAG_COMMIT_MISMATCH"],
  ["main ancestry changed during approval", (item) => {
    git(item.seed, "checkout", "--orphan", "rewritten");
    fs.writeFileSync(path.join(item.seed, "rewrite.txt"), "rewrite");
    git(item.seed, "add", ".");
    git(item.seed, "commit", "-m", "rewrite main");
    git(item.seed, "push", "--force", "origin", "HEAD:main");
    refreshFromRemote(item);
  }, "MAIN_ANCESTRY_REQUIRED"],
  ["checked-out HEAD changed", (item) => {
    git(item.root, "config", "user.email", "release-test@example.invalid");
    git(item.root, "config", "user.name", "Release Test");
    fs.writeFileSync(path.join(item.root, "local.txt"), "local");
    git(item.root, "add", "local.txt");
    git(item.root, "commit", "-m", "local");
  }, "HEAD_COMMIT_MISMATCH"],
  ["event SHA changed", (item) => { item.context.env.EXPECTED_SHA = "a".repeat(40); }, "HEAD_COMMIT_MISMATCH"],
  ["plan commit changed", (item) => {
    const file = path.join(item.release, "stable-release-plan.json");
    const plan = JSON.parse(fs.readFileSync(file));
    plan.commit = "b".repeat(40);
    writeJson(file, plan);
  }, "PUBLISH_PLAN_MISMATCH"],
]) {
  test(`publish rejects when ${name}`, (t) => {
    const item = fixture(t);
    change(item);
    assert.throws(() => run("publish", item.context), { code });
  });
}

for (const [name, change, code] of [
  ["installer checksum changes", (item) => fs.appendFileSync(path.join(item.release, "5E-Setup-1.6.0-windows-x64.exe"), "tampered"), "CHECKSUM_REQUIRED"],
  ["audit report changes", (item) => {
    const file = path.join(item.release, "package-artifact-audit.json");
    const report = JSON.parse(fs.readFileSync(file));
    report.violations.push({ code: "TEST_VIOLATION" });
    writeJson(file, report);
  }, "ARTIFACT_AUDIT_REQUIRED"],
  ["publish plan path changes", (item) => {
    const file = path.join(item.release, "stable-release-plan.json");
    const plan = JSON.parse(fs.readFileSync(file));
    plan.installer = "other.exe";
    writeJson(file, plan);
  }, "PUBLISH_PLAN_MISMATCH"],
  ["installer is missing", (item) => fs.rmSync(path.join(item.release, "5E-Setup-1.6.0-windows-x64.exe")), "PUBLISH_FILE_MISSING"],
  ["extra installer appears", (item) => fs.writeFileSync(path.join(item.release, "other.exe"), "other"), "INSTALLER_SET_INVALID"],
]) {
  test(`publish rejects when ${name}`, (t) => {
    const item = fixture(t);
    change(item);
    assert.throws(() => run("publish", item.context), { code });
  });
}
