const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..", "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const commit = process.env.GITHUB_SHA || process.env.FIVE_E_BUILD_COMMIT
  || execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const builder = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "electron-builder.cmd" : "electron-builder");
const build = spawnSync(builder, ["--dir", "--publish", "never", `-c.extraMetadata.buildCommit=${commit}`], {
  cwd: root, stdio: "inherit", shell: process.platform === "win32",
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
const audit = spawnSync(process.execPath, [
  path.join(__dirname, "package-artifact-audit.cjs"),
  "--artifact", path.join(root, "release", "win-unpacked"),
  "--web-version", packageJson.version,
  "--web-commit", commit,
], { cwd: root, stdio: "inherit" });
if (audit.error) throw audit.error;
process.exit(audit.status ?? 1);
