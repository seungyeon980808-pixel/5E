const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createProcessFailureFinalization } = require("./codex-process-failure.cjs");

test("unexpected App Server error preserves the active turn in a terminal signal", () => {
  assert.deepEqual(createProcessFailureFinalization({
    activeTurnId: "turn-active",
    error: new Error("pipe closed"),
  }), {
    turnId: "turn-active",
    state: "recoveryFailed",
    status: "failed",
    message: "pipe closed",
  });
});

test("unexpected App Server exit reports its code or signal", () => {
  assert.equal(createProcessFailureFinalization({
    activeTurnId: "turn-code",
    code: 7,
  }).message, "Codex App Server exited (exit code 7).");
  assert.equal(createProcessFailureFinalization({
    activeTurnId: "turn-signal",
    signal: "SIGTERM",
  }).message, "Codex App Server exited (signal SIGTERM).");
});

test("no active turn and intentional recovery exits do not emit duplicate failures", () => {
  assert.equal(createProcessFailureFinalization({ code: 1 }), null);
  assert.equal(createProcessFailureFinalization({
    activeTurnId: "turn-recovery",
    recoveryTerminatingTurnId: "turn-recovery",
    signal: "SIGTERM",
  }), null);
});

test("main reports terminal failure before process state is cleared and marks intentional recovery", () => {
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  assert.match(main, /createProcessFailureFinalization/);
  assert.match(main, /sendImageFinalization\(failure\.turnId, failure\.state/);
  assert.match(main, /recoveryTerminatingTurnIds\.add\(completedTurnId\)/);
  assert.match(main, /for \(const activeTurnId of activeTurnIds\)/);
  const handler = main.slice(main.indexOf("function handleServerProcessTermination"), main.indexOf("function startServer"));
  assert.ok(handler.indexOf("sendImageFinalization(failure.turnId") >= 0);
  assert.ok(handler.indexOf("sendImageFinalization(failure.turnId") < handler.indexOf("server = null"));
});
