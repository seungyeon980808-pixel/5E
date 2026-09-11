import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const panelSource = await fs.readFile(new URL("../js/ai-panel.js", import.meta.url), "utf8");
const workbenchSource = await fs.readFile(new URL("../js/ai-workbench.js", import.meta.url), "utf8");
const panelModule = await import(new URL("../js/ai-panel.js", import.meta.url));
const workbenchModule = await import(new URL("../js/ai-workbench.js", import.meta.url));

test("scoped edit acceptance uses its own review state and report instead of generating", () => {
  assert.match(panelSource, /reviewState = "generating", reviewReport = emptyReviewReport\(\)/);
  assert.doesNotMatch(panelSource, /alreadyEditable\s*\?\s*"scoped-applied"/);
  assert.match(panelSource, /reviewState:\s*"scoped-applied"/);
  assert.match(panelSource, /scopedAppliedReviewReport\(\)/);
  assert.match(panelSource, /선택 결과 · 부분 수정 적용 완료/);
  assert.equal(panelModule.snapshotImageItem({ reviewState: "scoped-applied" }).reviewState, "scoped-applied");
  assert.equal(panelModule.snapshotImageItem({}).reviewState, "idle");
});

test("workbench preserves scoped-applied through restore and labels it distinctly", () => {
  assert.equal(workbenchModule.normalizeReviewState("scoped-applied"), "scoped-applied");
  assert.match(workbenchSource, /"scoped-applied": \["부분 수정 적용 완료", "영역 밖 픽셀 보존 확인\. 시각 품질은 자동 검수하지 않았습니다\."\]/);
  assert.match(workbenchSource, /"scoped-applied": "부분 수정 적용 완료"/);
  assert.match(workbenchSource, /"scoped-applied": \["부분 수정 적용 완료", "영역 밖 픽셀 보존 확인\. 시각 품질은 자동 검수하지 않았습니다\."\]/);
  assert.match(workbenchSource, /"scoped-applied": "부분 수정 적용 완료"/);
});
