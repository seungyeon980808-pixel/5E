const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveTurnPlan,
  shouldAutoFinalizeImageTurn,
  readTurnTerminalStatus,
  TurnPerformanceRegistry,
} = require("./codex-turn-runtime.cjs");

test("resetConversation never resumes the supplied conversation", () => {
  assert.deepEqual(resolveTurnPlan({ conversationId: "chat-old", resetConversation: true }), {
    purpose: "chat",
    ephemeralRender: false,
    resetChatThread: true,
    resumeConversationId: null,
    preservedConversationId: "chat-old",
  });
});

test("image purpose always uses a fresh render thread without resetting chat", () => {
  assert.deepEqual(resolveTurnPlan({
    purpose: "image",
    conversationId: "chat-keep",
    resetConversation: true,
  }), {
    purpose: "image",
    ephemeralRender: true,
    resetChatThread: false,
    resumeConversationId: null,
    preservedConversationId: "chat-keep",
  });
  assert.equal(resolveTurnPlan({ ephemeralRender: true, conversationId: "chat-keep" }).resumeConversationId, null);
});

test("fast scene purpose uses a fresh isolated thread and preserves its metric purpose", () => {
  assert.deepEqual(resolveTurnPlan({
    purpose: "scene",
    conversationId: "chat-keep",
  }), {
    purpose: "scene",
    ephemeralRender: true,
    resetChatThread: false,
    resumeConversationId: null,
    preservedConversationId: "chat-keep",
  });
});

test("ordinary chat may resume its conversation", () => {
  const plan = resolveTurnPlan({ conversationId: "chat-current" });
  assert.equal(plan.purpose, "chat");
  assert.equal(plan.resumeConversationId, "chat-current");
});

test("a successful image output finalizes only its active image turn", () => {
  const message = {
    method: "item/completed",
    params: {
      turnId: "turn-image",
      item: { id: "image-1", type: "imageGeneration", status: "completed", savedPath: "C:\\tmp\\result.png" },
    },
  };
  const observation = { performance: { turnId: "turn-image", purpose: "image" } };
  assert.equal(shouldAutoFinalizeImageTurn({ message, observation, activeTurnId: "turn-image" }), true);
  assert.equal(shouldAutoFinalizeImageTurn({ message, observation, activeTurnId: "turn-other" }), false);
  assert.equal(shouldAutoFinalizeImageTurn({ message, observation, activeTurnId: "turn-image", alreadyFinalizing: true }), false);
  assert.equal(shouldAutoFinalizeImageTurn({
    message,
    observation: { performance: { turnId: "turn-image", purpose: "chat" } },
    activeTurnId: "turn-image",
  }), false);
  assert.equal(shouldAutoFinalizeImageTurn({
    message: { ...message, params: { ...message.params, item: { ...message.params.item, status: "failed" } } },
    observation,
    activeTurnId: "turn-image",
  }), false);
});

test("terminal image turn recovery only accepts server-confirmed terminal states", () => {
  assert.equal(readTurnTerminalStatus({
    thread: { status: { type: "active", activeFlags: [] }, turns: [{ id: "turn-1", status: "inProgress" }] },
  }, "turn-1"), null);
  assert.equal(readTurnTerminalStatus({
    thread: { status: { type: "idle" }, turns: [{ id: "turn-1", status: "inProgress" }] },
  }, "turn-1"), null);
  assert.equal(readTurnTerminalStatus({
    thread: { status: { type: "idle" }, turns: [{ id: "turn-1", status: "interrupted" }] },
  }, "turn-1"), "interrupted");
  assert.equal(readTurnTerminalStatus({
    thread: { status: { type: "idle" }, turns: [] },
  }, "turn-1"), "completed");
  assert.equal(readTurnTerminalStatus({
    thread: { status: { type: "systemError" }, turns: [] },
  }, "turn-1"), "failed");
});

test("performance registry measures image calls without mutating raw events", () => {
  let now = 1_800;
  const registry = new TurnPerformanceRegistry(() => now);
  const initial = registry.register({
    turnId: "turn-1",
    threadId: "render-1",
    purpose: "image",
    startedAt: 1_000,
    prepareEndedAt: 1_100,
    attachmentCount: 2,
    attachmentBytes: 4_096,
  });
  assert.equal(initial.prepareMs, 100);
  assert.equal(initial.totalMs, null);

  const started = {
    method: "item/started",
    params: { turnId: "turn-1", startedAtMs: 1_300, item: { id: "image-1", type: "imageGeneration", status: "inProgress" } },
  };
  const startedCopy = structuredClone(started);
  registry.observe(started);
  assert.deepEqual(started, startedCopy);

  registry.observe({
    method: "item/completed",
    params: { turnId: "turn-1", completedAtMs: 1_600, item: { id: "image-1", type: "imageGeneration", status: "completed" } },
  });
  registry.observe({
    method: "item/started",
    params: { turnId: "turn-1", startedAtMs: 1_650, item: { id: "image-2", type: "imageGeneration", status: "inProgress" } },
  });
  registry.observe({
    method: "item/completed",
    params: { turnId: "turn-1", completedAtMs: 1_750, item: { id: "image-2", type: "imageGeneration", status: "failed" } },
  });
  const completed = registry.observe({ method: "turn/completed", params: { turn: { id: "turn-1", status: "completed" } } });

  assert.equal(completed.completed, true);
  assert.deepEqual(completed.performance, {
    threadId: "render-1",
    turnId: "turn-1",
    purpose: "image",
    totalMs: 800,
    prepareMs: 100,
    imageStartMs: 300,
    firstImageStartMs: 300,
    imageToolMs: 400,
    toolMs: 400,
    imageCallCount: 2,
    imageFailedCount: 1,
    failedCount: 1,
    attachmentCount: 2,
    attachmentBytes: 4_096,
  });
});
