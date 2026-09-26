const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "tests", "suite-manifest.json"), "utf8"));
const desktop = fs.readdirSync(__dirname)
  .filter((name) => name.endsWith(".test.cjs"))
  .sort()
  .map((name) => path.join("desktop", name));
const unit = manifest.unit.map((entry) => entry.path);
const files = [...desktop, ...unit];

if (process.argv.includes("--list")) {
  console.log(JSON.stringify({ desktop, unit, deferred: manifest.deferred }, null, 2));
  process.exit(0);
}
if (files.length === 0) throw new Error("No unit tests were discovered");

console.log(`Unit suites (${files.length}); deferred mapped suites (${manifest.deferred.length})`);
for (const file of files) console.log(`  ${file}`);
const environment = { ...process.env };
delete environment.NODE_TEST_CONTEXT;
const result = spawnSync(process.execPath, ["--test", ...files], {
  cwd: root,
  stdio: "inherit",
  env: environment,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
