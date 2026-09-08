import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css", "ai-panel.css"), "utf8");
const workbench = fs.readFileSync(path.join(root, "js", "ai-workbench.js"), "utf8");
const workbenchModule = await import(`data:text/javascript;base64,${Buffer.from(workbench).toString("base64")}`);

function attributeCount(attribute) {
  return (index.match(new RegExp(`\\s${attribute}(?=[\\s=>])`, "g")) || []).length;
}

test("AI panel keeps one compatible instance of each logic-owned control", () => {
  for (const attribute of [
    "data-ai-close", "data-ai-send", "data-ai-chat-send", "data-ai-batch",
    "data-ai-compare", "data-ai-capture", "data-ai-reference-search", "data-ai-model",
    "data-ai-effort", "data-ai-speed", "data-ai-login", "data-ai-new",
    "data-ai-previews", "data-ai-attachment-list", "data-ai-batch-panel", "data-ai-batch-grid",
  ]) {
    assert.equal(attributeCount(attribute), 1, `${attribute} must remain unique`);
  }
  assert.match(index, /<script type="module" src="js\/ai-workbench\.js\?v=[^"]+"><\/script>/);
});

test("workbench defaults to large result with comments and keeps comparison and chat accessible", () => {
  const railAt = index.indexOf("ai-task-rail");
  const resultsAt = index.indexOf("ai-results mode-result");
  const reviewAt = index.indexOf("ai-review-panel");
  assert.ok(railAt > 0 && resultsAt > railAt && reviewAt > resultsAt, "task, compare, review order");
  assert.match(index, /class="ai-comparison-grid"[\s\S]*class="ai-image-pane ai-original-pane"[\s\S]*class="ai-image-pane ai-result-pane"/);
  assert.match(index, /<details class="ai-batch-section">[\s\S]*data-ai-batch-panel/);
  assert.match(index, /data-ai-comments-panel/);
  assert.match(index, /data-ai-chat-panel[\s\S]*hidden/);
  assert.match(index, /data-ai-comment-tool="pan"/);
  assert.match(index, /data-ai-comment-tool="point"/);
  assert.match(index, /data-ai-comment-tool="area"/);
  assert.doesNotMatch(index, /data-ai-comment-tool="(?:keep|arrow)"/);
  assert.match(index, /<details class="ai-advanced-settings">/);
  assert.doesNotMatch(index, /<details class="(?:ai-history-section|ai-advanced-settings)"\s+open/);
  assert.match(index, /data-ai-review-mode checked/);
  assert.match(index, /data-ai-pixel-inspection hidden/);
  assert.match(index, /기본: 평가원식 · 흰 배경 · 무채색 · 과학적 구조 보존/);
  assert.match(index, /권장 생성 Sol · 보통 \/ 검수 Sol · 높음/);
});

test("workbench inherits the existing theme and retains zoom and responsive layouts", () => {
  assert.doesNotMatch(css, /--bg-panel:\s*#f7f9fb/);
  assert.doesNotMatch(css, /--accent:\s*#2468c5/);
  assert.match(css, /background:\s*var\(--bg-panel\)/);
  assert.match(css, /grid-template-columns:\s*150px minmax\(0,\s*1fr\) 326px/);
  assert.match(css, /\.ai-comparison-grid/);
  assert.match(css, /\.ai-batch-card\[data-state="failed"\] img \{ display: none !important; \}/);
  assert.match(css, /#ai-image-panel\[hidden\],[\s\S]*#ai-image-panel \[hidden\] \{ display:\s*none !important; \}/);
  assert.match(css, /transform: scale\(var\(--ai-workbench-zoom, 1\)\)/);
  assert.match(css, /@media \(max-width: 1000px\)/);
  assert.match(css, /#ai-image-panel \.ai-compare-heading > \.ai-annotation-toolbar \{ flex-direction:row/);
});

test("review rendering is event-driven, candidate-specific, and text-safe", () => {
  assert.match(workbench, /panel\.addEventListener\("5e:ai-review"/);
  assert.match(workbench, /reports\.set\(record\.candidateId, record\)/);
  assert.match(workbench, /card\.dataset\.aiCandidateId/);
  assert.match(workbench, /card\.dataset\.aiReviewState/);
  assert.match(workbench, /textContent = check\.label/);
  assert.match(workbench, /textContent = `\$\{prefix\}\$\{issue\.message\}`/);
  assert.doesNotMatch(workbench, /\.innerHTML\s*=/);
  assert.match(workbench, /Review bbox contract: x\/y\/width\/height are normalized/);
  assert.match(workbench, /bbox\.x \+ bbox\.width > 1\.001/);
  assert.match(workbench, /uncertain: "확인 필요"/);
  assert.match(workbench, /major: "주요 문제"/);
  assert.match(workbench, /renderPixelInspection\(normalized\.pixelInspection\)/);
});

test("comparison controls retain versions and apply one synchronized zoom", () => {
  assert.match(workbench, /candidateSelect\.replaceChildren\(\)/);
  assert.match(workbench, /card\.classList\.toggle\("is-ai-active-candidate"/);
  assert.match(workbench, /--ai-workbench-zoom/);
  assert.match(workbench, /for \(const card of \[activeCandidate\(\), sourceCards\(\)/);
  assert.ok(workbench.includes('generatedCards().length ? "result" : "source"'), 'narrow view shows source until a result exists');
  assert.match(workbench, /const requestedKey = panel\.dataset\.aiSelectedCandidateId/);
  assert.match(workbench, /if \(keys\.includes\(requestedKey\)\) activeCandidateKey = requestedKey/);
  assert.match(workbench, /new CustomEvent\("5e:ai-candidate-select"/);
  assert.match(workbench, /detail: \{ candidateId \}/);
  assert.match(workbench, /function fitCardStage\(card\)/);
});


test("review payload normalization rejects unsafe bbox coordinates and unknown states", () => {
  assert.equal(workbenchModule.normalizeReviewState("passed"), "passed");
  assert.equal(workbenchModule.normalizeReviewState("invented-success"), "idle");
  assert.deepEqual(workbenchModule.normalizeReviewBBox([.1, .2, .3, .4]), {
    x: .1, y: .2, width: .3, height: .4,
  });
  assert.equal(workbenchModule.normalizeReviewBBox([12, 20, 30, 40]), null);
  const detail = workbenchModule.normalizeReviewDetail({
    state: "needs-attention",
    candidateId: "candidate-2",
    report: { checks: [{ label: "구조", status: "warning" }], issues: [{ message: "연결 확인" }] },
  });
  assert.equal(detail.state, "needs-attention");
  assert.equal(detail.candidateId, "candidate-2");
  assert.equal(detail.report.checks[0].status, "warning");
  const inspection = workbenchModule.normalizePixelInspection({
    opaque: true,
    strictlyAchromatic: false,
    channelDifferenceOver3Share: 0.0125,
    exactWhiteBorderShare: 0.98,
    ignored: null,
  });
  assert.deepEqual(inspection, {
    opaque: true,
    strictlyAchromatic: false,
    channelDifferenceOver3Share: 0.0125,
    exactWhiteBorderShare: 0.98,
  });
  const reviewWithInspection = workbenchModule.normalizeReviewDetail({ pixelInspection: inspection });
  assert.deepEqual(reviewWithInspection.pixelInspection, inspection);
});
