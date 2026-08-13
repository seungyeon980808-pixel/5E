const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("diagram results expose a manual editable-label workspace without claiming OCR", () => {
  const root = path.join(__dirname, "..");
  const panel = fs.readFileSync(path.join(root, "js", "ai-panel.js"), "utf8");
  const workspace = fs.readFileSync(path.join(root, "js", "ai-label-workspace.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "css", "ai-panel.css"), "utf8");
  assert.match(panel, /편집 가능한 라벨 배치/);
  assert.match(panel, /openEditableLabelWorkspace/);
  assert.match(panel, /planningReferences\.length === 1\s*\? snapshotImageItem\(planningReferences\[0\]\)\s*:\s*null/);
  assert.match(panel, /buildDiagramOutputProvenance\(job\.source\?\.referenceProvenance/);
  assert.match(panel, /insertImageFromSrc\(state, item\.data, \{ provenance: item\.referenceProvenance \}\)/);
  assert.match(workspace, /원본 라벨 위치/);
  assert.match(workspace, /결과 지시선 대상/);
  assert.match(workspace, /결과 라벨 위치/);
  assert.match(workspace, /확인 필요/);
  assert.match(workspace, /도판 \+ 라벨을 캔버스에 삽입/);
  assert.match(workspace, /data-label-source-marks/);
  assert.match(workspace, /data-label-result-marks/);
  assert.match(workspace, /labelOverlayDescriptors/);
  assert.doesNotMatch(workspace, /input\.oninput\s*=\s*\(\)\s*=>\s*\{[^}]*render\(\)/s,
    "typing must not replace the focused input or interrupt Korean IME composition");
  assert.doesNotMatch(workspace, /OCR 완료|자동 인식 완료/);
  assert.match(styles, /\.ai-label-layout\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.ai-label-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /\.ai-label-source-mark/);
  assert.match(styles, /\.ai-label-result-line/);
  assert.match(styles, /\.ai-label-result-text/);
});
