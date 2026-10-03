const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const validator = path.join(root, "scripts", "check-release-identity.cjs");

test("release identity binds the 1.6.1 package, lock, canonical UI, and artifact names", () => {
  const result = spawnSync(process.execPath, [validator], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Release identity OK: 1\.6\.1/);
});

test("tag mismatch fails before a build can start", (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "5e-release-identity-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  for (const relativePath of ["package.json", "package-lock.json", "release-channels.json", "index.html"]) {
    const destination = path.join(fixture, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relativePath), destination);
  }
  fs.mkdirSync(path.join(fixture, "scripts"), { recursive: true });
  fs.copyFileSync(validator, path.join(fixture, "scripts", "check-release-identity.cjs"));
  const pkg = JSON.parse(fs.readFileSync(path.join(fixture, "package.json"), "utf8"));
  pkg.version = "0.0.0";
  fs.writeFileSync(path.join(fixture, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

  const result = spawnSync(process.execPath, ["scripts/check-release-identity.cjs", "--tag", "v1.6.1"], {
    cwd: fixture,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /package\.version.*candidate version/);
});

test("release workflows require same-SHA Test and Release Identity jobs", () => {
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "windows-release.yml"), "utf8");
  assert.match(workflow, /test:\n\s+name: Test/);
  assert.match(workflow, /release-identity:\n\s+name: Release Identity/);
  assert.match(workflow, /needs: \[test, release-identity\]/);
  assert.match(workflow, /--sha "\$\{\{ github\.sha \}\}" --tag "\$\{\{ github\.ref_name \}\}"/);
});
