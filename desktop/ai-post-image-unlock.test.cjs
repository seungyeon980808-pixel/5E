const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("a completed image ends its render turn and the panel treats that interrupt as success", () => {
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const panel = fs.readFileSync(path.join(__dirname, "..", "js", "ai-panel.js"), "utf8");

  assert.match(main, /shouldAutoFinalizeImageTurn/);
  assert.match(main, /autoFinalizingImageTurns\.add\(eventTurnId\)/);
  assert.match(main, /rpc\("turn\/interrupt", \{ threadId: renderThreadId, turnId: completedTurnId \}\)/);
  assert.match(main, /rpc\("thread\/read", \{ threadId: renderThreadId, includeTurns: true \}\)/);
  assert.match(main, /sendImageFinalization\(completedTurnId, "confirmed"/);
  assert.match(main, /sendImageFinalization\(completedTurnId, "recovered"/);
  assert.match(main, /\["\/PID", String\(child\.pid\), "\/T", "\/F"\]/);
  assert.match(main, /const admission = acquireTurnAdmission\(\);/);
  assert.match(panel, /if \(newButton\) newButton\.disabled = false/);
  assert.match(panel, /tabNewButton\.onclick = \(\) => newWorkspace\(\)/);
  assert.match(panel, /currentTurnId = result\.turnId \|\| null/);
  assert.match(panel, /if \(event\.turnId && \(!currentTurnId \|\| event\.turnId !== currentTurnId\)\) return/);
  assert.match(panel, /if \(eventEpoch !== currentRequestEpoch \|\| !serverTurnFinished\) return/);
  assert.match(panel, /advanceGenerationClock\("turn-terminal", currentTerminalOutcome\);\s*if \(previewPending\) return/);

  const start = panel.indexOf("  const finishCurrentTurnUi = ");
  const end = panel.indexOf("\n  const dispatchAiEvent = ", start);
  const finishSource = panel.slice(start, end);
  const calls = [];
  const context = {
    currentRequestEpoch: 7,
    serverTurnFinished: true,
    previewPending: true,
    currentTerminalOutcome: "completed",
    advanceGenerationClock: () => calls.push("terminal-recorded"),
    setBusy: () => calls.push("unlocked"),
  };
  new Function(...Object.keys(context), `${finishSource}; finishCurrentTurnUi(7);`)(...Object.values(context));
  assert.deepEqual(calls, ["terminal-recorded"], "provider terminal must remain locked until local image postprocessing settles");
});
