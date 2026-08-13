const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("Phase 0 runner invokes every npm gate in order on the host platform", () => {
  // Given
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "5e-phase0-runner-"));
  const bin = path.join(fixture, "bin");
  const log = path.join(fixture, "npm-calls.txt");
  fs.mkdirSync(bin);
  if (process.platform === "win32") {
    fs.writeFileSync(path.join(bin, "npm.cmd"), `@echo %*>>"${log}"\r\n@exit /b 0\r\n`);
  } else {
    const executable = path.join(bin, "npm");
    fs.writeFileSync(executable, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\n`);
    fs.chmodSync(executable, 0o755);
  }
  const runner = path.join(__dirname, "..", "scripts", "stabilization", "run-phase0.cjs");

  try {
    // When
    const result = spawnSync(process.execPath, [runner], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH || ""}` },
    });

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(fs.readFileSync(log, "utf8").trim().split(/\r?\n/), [
      "test",
      "run test:graph",
      "run test:desktop",
      "run audit:exam-graphs:strict",
      "run audit:package-assets",
    ]);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
