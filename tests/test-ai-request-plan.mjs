import assert from "node:assert/strict";
import {
  compactConversation,
  markImagesSent,
  selectOutgoingImageItems,
} from "../js/ai-request-plan.js";

const reference = { data: "data:image/png;base64,REF", comments: [] };
const generated = { data: "data:image/png;base64,GEN", comments: [{ text: "오른쪽만 수정" }] };

assert.deepEqual(
  selectOutgoingImageItems({ type: "chat", references: [reference], generated: [], conversationId: null }),
  [reference],
);
markImagesSent([reference], "chat-1");
assert.deepEqual(
  selectOutgoingImageItems({ type: "chat", references: [reference], generated: [], conversationId: "chat-1" }),
  [],
  "unchanged references must not be resent to the same discussion thread",
);
assert.deepEqual(
  selectOutgoingImageItems({ type: "image", references: [reference], generated: [generated], latestGenerated: generated, conversationId: "chat-1" }),
  [reference, generated],
  "a fresh render receives each required source exactly once",
);

const latest = { data: "data:image/png;base64,LATEST", comments: [] };
assert.deepEqual(
  selectOutgoingImageItems({ type: "chat", references: [], generated: [latest], latestGenerated: latest, conversationId: "chat-1" }),
  [latest],
  "the discussion thread receives a fresh render result once",
);
markImagesSent([latest], "chat-1");
assert.deepEqual(
  selectOutgoingImageItems({ type: "chat", references: [], generated: [latest], latestGenerated: latest, conversationId: "chat-1" }),
  [],
  "the latest result is deduplicated after it reaches the discussion thread",
);

const duplicateReference = { data: reference.data, comments: [] };
assert.deepEqual(
  selectOutgoingImageItems({ type: "image", references: [reference, duplicateReference], generated: [] }),
  [reference],
  "identical image data is sent only once even when it appears in two cards",
);

const compact = compactConversation([
  { role: "user", text: "도르래는 하나만 남겨줘" },
  { role: "assistant", text: "도르래 하나와 추 두 개로 정리했습니다." },
  { role: "user", text: "문자는 모두 빼줘" },
], { maxChars: 80, maxMessages: 3 });
assert.match(compact, /문자는 모두 빼줘/);
assert.ok(compact.length <= 82);

console.log("AI 요청 계획 및 참고 이미지 중복 방지 테스트 통과");
