const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("Electron launchers use the package entry point instead of an eager dist path", () => {
  const packageJson = require(path.join(root, "package.json"));
  const smokeSource = fs.readFileSync(path.join(__dirname, "run-smoke.cjs"), "utf8");
  assert.equal(packageJson.scripts.desktop, "electron .");
  assert.match(smokeSource, /require\("electron"\)/);
  assert.doesNotMatch(smokeSource, /node_modules.*electron.*dist/);
});
