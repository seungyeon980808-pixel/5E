const test = require("node:test");
const assert = require("node:assert/strict");

test("Given a complex exact request, when cache candidates are checked, then only its corrected terminal output can satisfy the repeat", async () => {
  const [{ cacheEntryCompletesRequest }, cacheModule, planModule, qualityModule, engineModule] = await Promise.all([
    import("../js/ai-panel.js"),
    import("../js/ai-output-cache-store.js"),
    import("../js/ai-remote-input-plan.js"),
    import("../js/ai-quality-mode.js"),
    import("../js/ai-engine-router.js"),
  ]);
  const { ExactOutputCacheStore, MemoryOutputCacheBackend } = cacheModule;
  const { buildExactOutputCacheDescriptor, createExactOutputCacheKey } = planModule;
  const { AI_QUALITY_MODES } = qualityModule;
  const { IMAGE_ENGINE_IDS } = engineModule;
  const descriptor = buildExactOutputCacheDescriptor({
    styleVersion: "test-style",
    mode: "diagram",
    prompt: "same exact request",
    outputOptions: { qualityMode: AI_QUALITY_MODES.COMPLEX },
  });
  const key = createExactOutputCacheKey(descriptor);
  const store = new ExactOutputCacheStore({ backend: new MemoryOutputCacheBackend(), now: () => 1_000 });
  const request = { engine: IMAGE_ENGINE_IDS.RASTER, qualityMode: AI_QUALITY_MODES.COMPLEX };

  await store.put({
    key,
    descriptor,
    output: { data: "data:image/png;base64,Zmlyc3Q=", complete: true, complexPass: 1 },
  });
  const firstPass = await store.get(key);
  assert.equal(cacheEntryCompletesRequest(firstPass.entry, request), false);

  await store.put({
    key,
    descriptor,
    output: { data: "data:image/png;base64,Y29ycmVjdGVk", complete: true, complexPass: 2 },
  });
  const corrected = await store.get(key);
  assert.equal(cacheEntryCompletesRequest(corrected.entry, request), true);

  assert.equal(cacheEntryCompletesRequest({
    ...corrected.entry,
    output: { ...corrected.entry.output, cancelled: true },
  }, request), false);
  assert.equal(corrected.entry.key, createExactOutputCacheKey(descriptor));
});

test("Given preview post-processing finishes after terminal, when outcome is resolved, then failure and user cancellation never become success", async () => {
  const { resolveAiTerminalOutcome, aiTerminalStatusView } = await import("../js/ai-panel.js");

  assert.equal(resolveAiTerminalOutcome({ status: "failed", imageReceived: true }), "failed");
  assert.equal(resolveAiTerminalOutcome({ status: "interrupted", imageReceived: true, cancelRequested: true }), "cancelled");
  assert.equal(resolveAiTerminalOutcome({ status: "interrupted", imageReceived: true, cancelRequested: false }), "completed");
  assert.equal(resolveAiTerminalOutcome({ status: "completed", imageReceived: true }), "completed");
  assert.deepEqual(aiTerminalStatusView("failed"), { text: "작업 실패", kind: "error" });
  assert.deepEqual(aiTerminalStatusView("cancelled"), { text: "작업 취소됨", kind: "warn" });
  assert.deepEqual(aiTerminalStatusView("completed", { imageReceived: true }), { text: "생성 완료", kind: "ok" });
});
