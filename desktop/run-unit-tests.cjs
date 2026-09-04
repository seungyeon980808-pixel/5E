const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const desktopDir = __dirname;
const testFiles = fs
  .readdirSync(desktopDir)
  .filter((name) => name.endsWith(".test.cjs"))
  .sort()
  .map((name) => path.join(desktopDir, name));
const serializedNames = new Set(["browser-served-phase0.test.cjs"]);
const regularTests = testFiles.filter((file) => !serializedNames.has(path.basename(file)));
const serializedTests = testFiles.filter((file) => serializedNames.has(path.basename(file)));

if (testFiles.length === 0) {
  throw new Error("No desktop unit tests were found");
}

function run(files) {
  if (!files.length) return 0;
  const result = spawnSync(process.execPath, ["--test", ...files], {
    cwd: path.resolve(desktopDir, ".."),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const regularStatus = run(regularTests);
if (regularStatus !== 0) process.exit(regularStatus);
process.exit(run(serializedTests));
