const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const insertionModule = import("../js/ai-canvas-insertion.mjs");

test("successful canvas insertion selects the result before closing the workflow", async () => {
  const { performCanvasInsertion } = await insertionModule;
  const events = [];
  const result = await performCanvasInsertion({
    insert: async () => {
      events.push("insert");
      return { ids: ["obj-1"], selectedIds: ["obj-1"] };
    },
    onSuccess: (value) => events.push(`selected:${value.selectedIds.join(",")}`),
    close: () => events.push("close"),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(events, ["insert", "selected:obj-1", "close"]);
});

test("failed canvas insertion keeps the workflow open with recovery guidance", async () => {
  const { performCanvasInsertion } = await insertionModule;
  const events = [];
  const result = await performCanvasInsertion({
    insert: async () => {
      events.push("insert");
      throw new Error("fixture insertion failed");
    },
    onFailure: (message) => events.push(message),
    close: () => events.push("close"),
  });

  assert.equal(result.ok, false);
  assert.equal(events.includes("close"), false);
  assert.match(events[1], /창은 그대로 유지됩니다/);
  assert.match(events[1], /다시 시도/);
});

test("generated image, vector, and editable-label insertion use the guarded canvas handoff", () => {
  const panel = fs.readFileSync(path.join(__dirname, "..", "js", "ai-panel.js"), "utf8");
  assert.match(panel, /performCanvasInsertion\(\{/);
  assert.match(panel, /selectedIds:\s*inserted\.ids/);
  assert.match(panel, /selectedIds:\s*\[insertedId\]/);
  assert.match(panel, /selectedIds:\s*\[inserted\.imageId,\s*\.\.\.inserted\.labelIds\]/);
  assert.match(panel, /setStatus\("캔버스 삽입 완료",\s*"ok"\)/);
  assert.match(panel, /const outcome = await performCanvasInsertion\([\s\S]{0,1400}if \(!outcome\.ok\) throw outcome\.error/);
});

test("close, back, and cancel snapshot image context instead of clearing it", () => {
  const panel = fs.readFileSync(path.join(__dirname, "..", "js", "ai-panel.js"), "utf8");
  const closeBody = panel.match(/const close = \(\) => \{([\s\S]*?)\n  \};/)?.[1] || "";
  const interruptBody = panel.match(/panel\.querySelector\("\[data-ai-interrupt\]"\)\.onclick = async \(\) => \{([\s\S]*?)\n  \};/)?.[1] || "";
  assert.match(closeBody, /captureActiveTaskTab\(\)/);
  assert.match(interruptBody, /captureActiveTaskTab\(\)/);
  assert.doesNotMatch(closeBody, /attachments\s*=\s*\[\]|generatedImages\s*=\s*\[\]|input\.value\s*=\s*""/);
  assert.doesNotMatch(interruptBody, /attachments\s*=\s*\[\]|generatedImages\s*=\s*\[\]|input\.value\s*=\s*""/);
});
