import assert from "node:assert/strict";
import { parseAiEvent } from "../js/ai-events.js";

assert.deepEqual(parseAiEvent({ method: "item/agentMessage/delta", params: { delta: "내부 스트림" } }), { kind: "ignore" });
assert.deepEqual(parseAiEvent({ method: "item/reasoning/summaryTextDelta", params: { delta: "추론" } }), { kind: "ignore" });
assert.deepEqual(parseAiEvent({ method: "item/completed", params: { item: { type: "agentMessage", phase: "commentary", text: "진행 중" } } }), { kind: "ignore" });
assert.deepEqual(parseAiEvent({ method: "item/completed", params: { turnId: "turn-1", item: { type: "agentMessage", phase: "final_answer", text: "완료했습니다." } } }), { kind: "assistant", turnId: "turn-1", text: "완료했습니다." });
assert.equal(parseAiEvent({ method: "item/started", params: { item: { type: "imageGeneration" } } }).kind, "progress");
assert.deepEqual(parseAiEvent({ method: "item/completed", params: { turnId: "turn-1", item: { type: "imageGeneration", imageDataUrl: "data:image/png;base64,AA==" } } }), { kind: "image", turnId: "turn-1", src: "data:image/png;base64,AA==" });
assert.deepEqual(parseAiEvent({ method: "turn/completed", params: { turn: { id: "turn-1", status: "completed", error: null } } }), { kind: "done", turnId: "turn-1", status: "completed", error: null });
assert.deepEqual(
  parseAiEvent({ method: "thread/tokenUsage/updated", params: { threadId: "thread-1", turnId: "turn-1", tokenUsage: { last: { totalTokens: 1200 } } } }),
  { kind: "tokens", threadId: "thread-1", turnId: "turn-1", usage: { totalTokens: 1200 } },
);
assert.deepEqual(
  parseAiEvent({ method: "5e/performance", params: { turnId: "turn-1", totalMs: 42000, imageCallCount: 1 } }),
  { kind: "performance", turnId: "turn-1", metrics: { turnId: "turn-1", totalMs: 42000, imageCallCount: 1 } },
);
assert.deepEqual(
  parseAiEvent({ method: "5e/image-finalization", params: { turnId: "turn-1", state: "confirmed", status: "interrupted" } }),
  { kind: "finalization", turnId: "turn-1", state: "confirmed", status: "interrupted", message: null },
);

console.log("AI App Server 이벤트 필터 테스트 통과");
