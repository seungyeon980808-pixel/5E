import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  OUTPUT,
  REPO_ROOT,
  buildIllustrationAudit,
  renderMarkdown,
  validateIllustrationAudit,
} from "../scripts/engine-v2/audit-illustration-assets.mjs";

let audit;

test.before(() => {
  audit = buildIllustrationAudit(REPO_ROOT);
});

test("illustration blocker inventory is tied to the 3,961-item library and 936-row atlas", () => {
  assert.equal(audit.scope.examLibraryItems, 3961);
  assert.equal(audit.scope.atlasRows, 936);
  assert.equal(audit.scope.examItemsWithoutVisualAtlas, 3025);
  assert.deepEqual(audit.totals, { person: 63, vehicle: 28, hand: 19 });
  assert.equal(audit.scope.targetBlockerMentions, 110);
  assert.equal(audit.occurrences.length, 110);
  assert.equal(audit.supplementalEvidence.speechBubble.blockerMentions, 31);
  assert.equal(audit.supplementalEvidence.speechBubble.uniqueExamRows, 31);
  assert.ok(audit.supplementalEvidence.speechBubble.sourcePanelRefs.length >= 31);
});

test("every occurrence has exam and panel provenance plus conservative unknown guards", () => {
  assert.deepEqual(validateIllustrationAudit(audit), []);
  assert.equal(new Set(audit.occurrences.map((row) => row.occurrenceId)).size, audit.occurrences.length);
  for (const occurrence of audit.occurrences) {
    assert.ok(occurrence.examId);
    assert.ok(occurrence.panelRefs.length > 0);
    assert.ok(occurrence.panelRefs.every((panel) => panel.ref.startsWith(`${occurrence.examId}#panel-`)));
    if (occurrence.taxonomy.orientation === "unknown") {
      assert.ok(occurrence.doNotGeneralize.some((rule) => /Orientation/.test(rule)));
    }
  }
});

test("existing hand assets remain exact, provenance-backed matches", () => {
  const grip = audit.existingAssets.find((row) => row.id === "hand_grip");
  const press = audit.existingAssets.find((row) => row.id === "hand_press");
  assert.equal(grip.source.examId, "p1_2025_06_19");
  assert.equal(press.source.examId, "p1_2024_11_08");
  assert.equal(grip.filesPresent, true);
  assert.equal(press.filesPresent, true);
  assert.deepEqual(press.eligibleOccurrenceIds, ["p1_2024_11_08#hand"]);
  assert.ok(grip.doNotGeneralize.some((rule) => /source-specific mark/.test(rule)));
});

test("candidate manifest lists only existing occurrences and explicit non-generalization rules", () => {
  const occurrenceIds = new Set(audit.occurrences.map((row) => row.occurrenceId));
  assert.ok(audit.candidates.length >= 4);
  for (const candidate of audit.candidates) {
    assert.ok(candidate.evidenceCount > 0, candidate.id);
    assert.ok(candidate.sourceExamIds.length > 0, candidate.id);
    assert.ok(candidate.sourcePanelRefs.length > 0, candidate.id);
    assert.ok(candidate.doNotGeneralize.length > 0, candidate.id);
    assert.ok(candidate.occurrenceIds.every((id) => occurrenceIds.has(id)), candidate.id);
  }
  const seated = audit.candidates.find((row) => row.id === "candidate_student_trio_seated_dialogue");
  const spacecraft = audit.candidates.find((row) => row.id === "candidate_spacecraft_flat_shell_family");
  assert.ok(seated.evidenceCount >= 5);
  assert.ok(spacecraft.evidenceCount >= 10);
  assert.equal(seated.status, "implemented_code_native");
  assert.equal(spacecraft.status, "implemented_code_native");
  assert.equal(seated.implementation.assetId, "student_trio_seated_dialogue");
  assert.equal(spacecraft.implementation.assetId, "spacecraft_flat_shell");
  assert.equal(audit.candidates.some((row) => row.id === "candidate_student_trio_standing_dialogue"), false);
  const standing = audit.deferredClusters.find((row) => row.id === "defer_student_trio_standing_dialogue");
  assert.equal(standing.evidenceCount, 1);
  assert.match(standing.status, /do_not_build_yet/);
});

test("checked-in JSON and report are deterministic products of the script", () => {
  const manifestPath = path.join(REPO_ROOT, ...OUTPUT.manifest.split("/"));
  const reportPath = path.join(REPO_ROOT, ...OUTPUT.report.split("/"));
  assert.equal(fs.readFileSync(manifestPath, "utf8"), `${JSON.stringify(audit, null, 2)}\n`);
  assert.equal(fs.readFileSync(reportPath, "utf8"), `${renderMarkdown(audit).trimEnd()}\n`);
});
