const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repositoryRoot = path.resolve(__dirname, "..");
const runnerPath = path.join(__dirname, "run-unit-tests.cjs");

function withFixture(run) {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "5e-runner-"));
  try {
    return run(fixtureDirectory);
  } finally {
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
  }
}

test("Given a failing desktop assertion fixture, when the unit runner is invoked, then it exits nonzero", () => {
  withFixture((fixtureDirectory) => {
    fs.writeFileSync(
      path.join(fixtureDirectory, "failing.test.cjs"),
      'const assert = require("node:assert/strict"); assert.equal(1, 2);\n',
    );

    const result = spawnSync(process.execPath, [runnerPath, "--desktop-test-dir", fixtureDirectory], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /Expected values to be strictly equal/);
  });
});
