import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  unavailablePaddleCandidate,
  unavailableTesseractCandidate,
} from "./benchmark-failures.mjs";
import { runCandidateProcess } from "./benchmark-process.mjs";

const experimentDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(experimentDirectory, "benchmark-process-fixture.mjs");
const silentOutput = { write() {} };

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("a benchmark child that completes before its deadline is measured normally", { timeout: 2_000 }, async () => {
  const run = await runCandidateProcess(fixture, ["success"], {
    cwd: experimentDirectory,
    timeoutMs: 1_000,
    stdout: silentOutput,
  });
  assert.equal(run.exitCode, 0);
  assert.equal(run.timedOut, false);
  assert.equal(run.termination, null);
  assert.match(run.stdout, /success/);
});

test("deadline signal terminates the benchmark process tree after both processes are ready", { timeout: 3_000 }, async () => {
  const manualDeadline = new AbortController();
  const ready = deferred();
  let output = "";
  const deadline = AbortSignal.any([manualDeadline.signal, AbortSignal.timeout(2_000)]);
  const pending = runCandidateProcess(fixture, ["tree"], {
    cwd: experimentDirectory,
    timeoutMs: 1_234,
    timeoutSignal: deadline,
    stdout: {
      write(chunk) {
        output += chunk.toString();
        if (output.includes("parent-ready") && output.includes("descendant-ready")) ready.resolve();
      },
    },
  });

  const firstEvent = await Promise.race([
    ready.promise.then(() => "ready"),
    pending.then(() => "closed"),
  ]);
  assert.equal(firstEvent, "ready");
  manualDeadline.abort();
  const run = await pending;

  assert.equal(run.timedOut, true);
  assert.equal(run.timeoutMs, 1_234);
  assert.equal(run.termination.targetPid > 0, true);
  assert.equal(run.termination.exitObserved, true);
  assert.equal(run.termination.error, null);
  if (process.platform === "win32") {
    assert.equal(run.termination.method, "windows-taskkill-tree");
    assert.equal(run.termination.forceKillUsed, true);
  } else {
    assert.equal(run.termination.method, "posix-process-group");
    assert.equal(run.termination.initialSignal, "SIGTERM");
    assert.match(run.stdout, /descendant-sigterm/);
    assert.match(run.stdout, /parent-after-descendant/);
  }
});

test("timeout reports remain unavailable evidence rather than accuracy results", () => {
  const run = {
    exitCode: null,
    signal: "SIGKILL",
    spawnError: null,
    stderr: "partial engine output",
    wallMs: 1_250,
    timedOut: true,
    timeoutMs: 1_234,
    termination: {
      method: "posix-process-group",
      targetPid: 42,
      initialSignal: "SIGTERM",
      forceKillUsed: true,
      forceSignal: "SIGKILL",
      fallback: null,
      exitObserved: true,
      error: null,
    },
  };
  const reports = [
    unavailableTesseractCandidate("fast", "kor", run),
    unavailablePaddleCandidate(run, "candidate-process"),
  ];
  for (const report of reports) {
    assert.equal(report.status, "unavailable");
    assert.equal(report.feasible, false);
    assert.equal(report.aggregate, null);
    assert.deepEqual(report.cases, []);
    assert.equal(report.failure.stage, "candidate-timeout");
    assert.equal(report.failure.code, "CANDIDATE_PROCESS_TIMEOUT");
    assert.equal(report.failure.timedOut, true);
    assert.equal(report.failure.timeoutMs, 1_234);
    assert.deepEqual(report.failure.termination, run.termination);
    assert.match(report.failure.diagnostic, /1234 ms deadline/);
  }
});
