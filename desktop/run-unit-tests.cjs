const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const desktopDir = __dirname;
const testFiles = fs
  .readdirSync(desktopDir)
  .filter((name) => name.endsWith(".test.cjs"))
  .sort()
  .map((name) => path.join(desktopDir, name));

if (testFiles.length === 0) {
  throw new Error("No desktop unit tests were found");
}

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  cwd: path.resolve(desktopDir, ".."),
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
