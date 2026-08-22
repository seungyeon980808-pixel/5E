const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("late token usage and SVG fallbacks cannot contaminate a later AI attempt", () => {
  const panel = fs.readFileSync(path.join(__dirname, "..", "js", "ai-panel.js"), "utf8");
  const events = fs.readFileSync(path.join(__dirname, "..", "js", "ai-events.js"), "utf8");

  assert.match(events, /kind: "tokens",\s*turnId,\s*threadId: params\.threadId \|\| null/);
  assert.match(panel, /currentRenderThreadId = result\.renderThreadId \|\| result\.threadId \|\| null/);
  assert.match(panel, /"assistant", "tokens", "performance"/);
  assert.match(panel, /event\.threadId !== currentRenderThreadId/);
  assert.match(panel, /event\.kind === "tokens" && currentTurnId/);
  assert.match(panel, /\^data:image\\\/svg\\\+xml/);
});
