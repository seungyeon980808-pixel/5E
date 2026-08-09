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
  assert.match(main, /if \(turnId\) throw new Error\("이전 AI 작업을 종료하고 있습니다/);
  assert.match(panel, /if \(newButton\) newButton\.disabled = on/);
  assert.match(panel, /newButton\.onclick = \(\) => \{\s*if \(busy\) return;/);
  assert.match(panel, /currentTurnId = result\.turnId \|\| null/);
  assert.match(panel, /if \(event\.turnId && \(!currentTurnId \|\| event\.turnId !== currentTurnId\)\) return/);
  assert.match(panel, /!serverTurnFinished \|\| previewPending/);
});
