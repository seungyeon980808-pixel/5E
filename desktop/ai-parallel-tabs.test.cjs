const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("five tab turns can run concurrently and route back to their owning tabs", () => {
  const main = read("desktop/main.cjs");
  const preload = read("desktop/preload.cjs");
  const panel = read("js/ai-panel.js");
  const events = read("js/ai-events.js");

  assert.match(main, /const MAX_CONCURRENT_TURNS = 5/);
  assert.match(main, /const activeTurns = new Map\(\)/);
  assert.match(main, /activeTurns\.size \+ pendingTurnStarts >= MAX_CONCURRENT_TURNS/);
  assert.match(main, /activeTurns\.set\(requestTurnId/);
  assert.match(main, /clientRequestId: typeof clientRequestId === "string" \? clientRequestId : null/);
  assert.match(main, /msg\.params\.clientRequestId = activeTurn\.clientRequestId/);
  assert.match(main, /activeTurns\.delete\(completedTurnId\)/);
  assert.match(preload, /interrupt: \(turnId\)/);

  assert.match(events, /const scope = \{ turnId, threadId, clientRequestId \}/);
  assert.match(panel, /const tabRunsByClientRequestId = new Map\(\)/);
  assert.match(panel, /const tabRunsByTurnId = new Map\(\)/);
  assert.match(panel, /tabRunsByClientRequestId\.set\(clientRequestId, activeTaskTabId\)/);
  assert.match(panel, /routedTab\.pendingEvents\.push\(event\)/);
  assert.match(panel, /restoreTaskTab\(tab\.id\)/);
  assert.match(panel, /window\.fiveEDesktop\?\.interrupt\(currentTurnId\)/);
  assert.doesNotMatch(main, /if \(turnId\) throw new Error\("이전 AI 작업/);
});
