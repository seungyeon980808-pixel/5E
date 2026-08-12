const { readdirSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const testFiles = readdirSync(__dirname)
  .filter((name) => name.endsWith(".test.cjs"))
  .sort()
  .map((name) => join(__dirname, name));

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
