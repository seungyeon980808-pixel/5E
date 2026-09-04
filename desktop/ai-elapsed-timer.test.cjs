const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const timerModule = import("../js/ai-elapsed-timer.mjs");

test("monotonic timer survives tab snapshots and freezes every terminal state", async () => {
  const { createMonotonicTimer, formatElapsedTime } = await timerModule;
  let now = 1000;
  const timer = createMonotonicTimer({ now: () => now });

  timer.start();
  now = 2250;
  assert.equal(timer.elapsedMs(), 1250);
  assert.equal(formatElapsedTime(timer.elapsedMs()), "1초");
  timer.start();
  assert.equal(timer.elapsedMs(), 1250, "duplicate starts must not reset a running timer");

  const restored = createMonotonicTimer({ now: () => now });
  restored.restore(timer.snapshot());
  now = 4300;
  assert.equal(restored.elapsedMs(), 3300, "tab restore must retain the original monotonic origin");

  for (const state of ["complete", "failed", "cancelled"]) {
    const terminal = createMonotonicTimer({ now: () => now });
    terminal.start();
    now += 1400;
    const fixed = terminal.finish(state);
    now += 5000;
    assert.equal(terminal.elapsedMs(), fixed);
    assert.equal(terminal.snapshot().status, state);
  }
});

test("elapsed ticker owns at most one scheduled callback and releases it", async () => {
  const { createElapsedTicker } = await timerModule;
  const scheduled = [];
  const cancelled = [];
  let renders = 0;
  const ticker = createElapsedTicker({
    schedule: (callback) => {
      scheduled.push(callback);
      return scheduled.length;
    },
    cancel: (id) => cancelled.push(id),
    render: () => { renders += 1; },
  });

  ticker.start();
  ticker.start();
  assert.equal(scheduled.length, 1);
  scheduled[0]();
  assert.equal(renders, 2, "start renders immediately and scheduled ticks render again");
  ticker.stop();
  ticker.stop();
  assert.deepEqual(cancelled, [1]);
});

test("AI panel displays turn and batch elapsed state and restores it with tabs", () => {
  const panel = fs.readFileSync(path.join(__dirname, "..", "js", "ai-panel.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /data-ai-elapsed[^>]*role="timer"/);
  assert.match(panel, /elapsedTimer:\s*turnTimer\.snapshot\(\)/);
  assert.match(panel, /turnTimer\.restore\(runtime\.elapsedTimer\)/);
  assert.match(panel, /batchTimer\.start\(\)/);
  assert.match(panel, /전체 \$\{formatElapsedTime\(batchTimer\.elapsedMs\(\)\)\}/);
  assert.ok((panel.match(/finishTurnTimer\("complete"\)/g) || []).length >= 2,
    "cache and local-asset completion must freeze the timer");
  assert.match(panel, /setStatus\("요청 실패", "error"\);[\s\S]{0,160}finishTurnTimer\("failed"\)/);
  assert.match(panel, /event\.state === "recoveryFailed"[\s\S]{0,420}currentTurnTerminalStatus = "failed";[\s\S]{0,120}finishCurrentTurnUi/);
  assert.match(panel, /finalizeTurnUiState\([\s\S]{0,420}syncElapsedTicker\(\)/);
  const batchStart = panel.indexOf("const runBatch = () =>");
  const clearPreviousBatch = panel.indexOf("batchRuns.clear()", batchStart);
  const activateNextBatch = panel.indexOf("batchActive = true", batchStart);
  assert.ok(clearPreviousBatch > batchStart && clearPreviousBatch < activateNextBatch,
    "prior batch state must be cleared before the timer can render and finalize");
});
