const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const runner = path.join(root, "scripts", "stabilization", "run-release-verify.cjs");
const audit = path.join(root, "scripts", "stabilization", "package-assets-audit.cjs");
const defaultPolicy = require(path.join(root, "scripts", "stabilization", "package-assets-policy.json"));
const expectedCalls = [
  "test",
  "run test:graph",
  "run test:stabilization-harness",
  "run test:desktop",
  "run audit:exam-graphs:strict",
  "run audit:package-assets:strict",
  "audit --audit-level=high",
];

function makeFakeNpm(t, { failCall, failStatus = 0, policyPath } = {}) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "5e-release-verify-"));
  const bin = path.join(fixture, "bin");
  const log = path.join(fixture, "npm-calls.txt");
  fs.mkdirSync(bin);
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  if (process.platform === "win32") {
    const lines = [`@echo %*>>"${log}"`];
    if (failCall) lines.push(`@if "%*"=="${failCall}" exit /b ${failStatus}`);
    if (policyPath) lines.push('@if "%*"=="run audit:package-assets:strict" goto strict_audit');
    lines.push("@exit /b 0", "");
    if (policyPath) {
      lines.push(":strict_audit", `@"${process.execPath}" "${audit}" --strict --root "${root}" --policy "${policyPath}"`, "@exit /b %ERRORLEVEL%", "");
    }
    fs.writeFileSync(path.join(bin, "npm.cmd"), lines.join("\r\n"));
  } else {
    const executable = path.join(bin, "npm");
    const lines = ["#!/bin/sh", `printf '%s\n' "$*" >> '${log}'`];
    if (policyPath) lines.push(`[ "$*" = "run audit:package-assets:strict" ] && exec '${process.execPath}' '${audit}' --strict --root '${root}' --policy '${policyPath}'`);
    if (failCall) lines.push(`[ "$*" = "${failCall}" ] && exit ${failStatus}`);
    lines.push("exit 0", "");
    fs.writeFileSync(executable, lines.join("\n"));
    fs.chmodSync(executable, 0o755);
  }
  return { bin, log, fixture };
}

function runWithFakeNpm(fake) {
  return spawnSync(process.execPath, [runner], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH: `${fake.bin}${path.delimiter}${process.env.PATH || ""}` },
  });
}

function calls(fake) {
  return fs.existsSync(fake.log) ? fs.readFileSync(fake.log, "utf8").trim().split(/\r?\n/) : [];
}

test("release verifier runs each strict gate once in order", (t) => {
  // Given: an npm adapter whose every release gate succeeds.
  const fake = makeFakeNpm(t);
  // When: the unified verifier runs.
  const result = runWithFakeNpm(fake);
  // Then: all named gates run once and a structured PASS receipt is emitted.
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(calls(fake), expectedCalls);
  assert.match(result.stdout, /"state":"complete"/);
});

test("release verifier propagates the exact failing status and stops", (t) => {
  // Given: the graph gate exits with a distinctive status.
  const fake = makeFakeNpm(t, { failCall: "run test:graph", failStatus: 23 });
  // When: the unified verifier runs.
  const result = runWithFakeNpm(fake);
  // Then: later gates are skipped and the failed gate is named.
  assert.equal(result.status, 23);
  assert.deepEqual(calls(fake), expectedCalls.slice(0, 2));
  assert.match(result.stdout, /"gate":"graph".*"state":"failed".*"exitCode":23/);
});

for (const [name, mutate, expectedCode] of [
  ["forbidden package pattern", (policy) => { policy.forbiddenBuildPatterns = ["index.html"]; }, "FORBIDDEN_BUILD_PATTERN"],
  ["missing required runtime", (policy) => { policy.requiredRuntime = [...policy.requiredRuntime, "desktop/required-missing.cjs"]; }, "REQUIRED_RUNTIME_MISSING"],
]) {
  test(`release verifier fails closed for ${name}`, (t) => {
    // Given: a temporary strict policy whose real source audit must fail.
    const policy = structuredClone(defaultPolicy);
    mutate(policy);
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "5e-release-policy-"));
    t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
    const policyPath = path.join(fixture, "policy.json");
    fs.writeFileSync(policyPath, JSON.stringify(policy));
    const fake = makeFakeNpm(t, { policyPath });
    // When: the policy reaches the strict package gate through the unified verifier.
    const result = runWithFakeNpm(fake);
    // Then: the verifier is nonzero, reports the real violation, and never reaches npm audit.
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, new RegExp(expectedCode));
    assert.deepEqual(calls(fake), expectedCalls.slice(0, 6));
    t.diagnostic(JSON.stringify({ expectedCode, unifiedExit: result.status, npmAuditSkipped: true }));
  });
}
