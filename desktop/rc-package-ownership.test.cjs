const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { packageRc } = require("../scripts/stabilization/rc-package-orchestrator.cjs");

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
}

function fixture(t) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "5e-rc-owner-"));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const root = path.join(sandbox, "source");
  const output = path.join(root, "release-candidates", "candidate");
  fs.mkdirSync(path.join(root, "node_modules", "electron-builder", "out", "cli"), { recursive: true });
  fs.mkdirSync(path.join(root, "release-candidates"));
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify({ version: "1.6.0-rc.1" })}\n`);
  fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\n.omo/\nrelease-candidates/\n");
  fs.writeFileSync(path.join(root, "node_modules", "electron-builder", "out", "cli", "cli.js"), "");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "user.name", "Fixture"]);
  git(root, ["add", "package.json", ".gitignore"]);
  git(root, ["commit", "-qm", "fixture"]);
  const createAuditSession = () => ({
    auditSource: () => ({ violations: [] }),
    auditArtifact: () => ({ source: {}, artifact: {} }),
  });
  return { root, output, createAuditSession };
}

function ownerPath(output) {
  return path.join(output, ".5e-rc-build-owner.json");
}

function mutateOwner(t, mutate, expected = /OUTPUT_OWNERSHIP_LOST/) {
  const item = fixture(t);
  const runner = () => {
    mutate(item, ownerPath(item.output));
    return { status: 0 };
  };
  assert.throws(() => packageRc({ ...item, runCommand: runner }), expected);
  assert.equal(fs.existsSync(path.join(item.output, ".5e-rc-build-failure.json")), false);
}

test("ownership rejects a wrong receipt schema", (t) => {
  mutateOwner(t, (_item, owner) => {
    const value = JSON.parse(fs.readFileSync(owner, "utf8"));
    fs.writeFileSync(owner, `${JSON.stringify({ ...value, schema: 2 })}\n`);
  });
});

test("ownership rejects a receipt bound to the wrong commit", (t) => {
  mutateOwner(t, (_item, owner) => {
    const value = JSON.parse(fs.readFileSync(owner, "utf8"));
    fs.writeFileSync(owner, `${JSON.stringify({ ...value, commit: "0".repeat(40) })}\n`);
  });
});

test("ownership rejects an in-place receipt rewrite with the copied token", (t) => {
  mutateOwner(t, (_item, owner) => {
    const copied = fs.readFileSync(owner);
    fs.writeFileSync(owner, copied);
    fs.utimesSync(owner, new Date(1000), new Date(1000));
  });
});

test("ownership rejects directory rename and recreation with a copied receipt", (t) => {
  mutateOwner(t, (item, owner) => {
    const moved = `${item.output}-moved`;
    fs.renameSync(item.output, moved);
    fs.mkdirSync(item.output);
    fs.copyFileSync(path.join(moved, path.basename(owner)), owner);
  });
});

test("ownership rejects a receipt path replaced by a directory junction", (t) => {
  mutateOwner(t, (_item, owner) => {
    const original = `${owner}.original`;
    const target = `${owner}.junction-target`;
    fs.renameSync(owner, original);
    fs.mkdirSync(target);
    fs.symlinkSync(target, owner, "junction");
  }, /OUTPUT_REPARSE_POINT|OUTPUT_OWNERSHIP_LOST/);
});
