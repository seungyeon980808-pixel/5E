import assert from "node:assert/strict";
import test from "node:test";

import {
  IMPLEMENTED_ALIASES,
  REPO_ROOT,
  auditRepository,
  checkAudit,
  countBy,
  renderMarkdown,
} from "./audit-exam-motifs.mjs";

let audit;

test.before(() => {
  audit = auditRepository(REPO_ROOT, { hashImages: false });
});

test("exam assets, manifests, and atlas rows are internally consistent", () => {
  assert.deepEqual(checkAudit(audit), []);
  assert.equal(audit.examLibrary.declaredCount, 3961);
  assert.equal(audit.examLibrary.manifestItems, audit.examLibrary.diskPngs);
  assert.equal(audit.atlas.rows, 936);
  assert.equal(audit.atlas.uniqueFiles, 936);
  assert.equal(audit.atlas.missingFromExamManifest, 0);
});

test("current semantic registries and blocker aliases are evidence-backed", () => {
  assert.equal(audit.currentCoverage.templates, 116);
  assert.equal(audit.currentCoverage.objectTypes, 44);
  assert.equal(audit.currentCoverage.aliasEvidenceMissing.length, 0);
  assert.equal(
    audit.currentCoverage.implementedAliasCount,
    Object.keys(IMPLEMENTED_ALIASES).length,
  );
  assert.ok(audit.currentCoverage.blockerMentionsCovered > 500);
  assert.ok(audit.currentCoverage.blockerMentionsUnresolved > 0);
});

test("the audit keeps measured baseline separate from potential current coverage", () => {
  const baselineFull = audit.atlas.baselineRepro.find((row) => row.key === "full")?.count;
  assert.equal(baselineFull, 345);
  assert.ok(audit.currentCoverage.potentiallyUnblockedRows > baselineFull);
  assert.ok(audit.currentCoverage.newlyPotentiallyUnblockedRows > 0);
});

test("training and reusable-asset inventories are discoverable", () => {
  assert.equal(audit.training.evalReproduction.cases, 101);
  assert.equal(audit.training.imageReproduction.cases, 100);
  assert.equal(audit.reusableAssets.partsManifestItems, 991);
  assert.equal(audit.reusableAssets.examPartEntries, 2);
  assert.equal(audit.reusableAssets.partsManifestMissingFiles, 0);
  assert.equal(audit.reusableAssets.examPartMissingFiles, 0);
});

test("Markdown and generic counting output are stable enough for handoff", () => {
  assert.deepEqual(countBy(["b", "a", "b"]), [
    { key: "b", count: 2 },
    { key: "a", count: 1 },
  ]);
  const markdown = renderMarkdown(audit);
  assert.match(markdown, /3,961/);
  assert.match(markdown, /현재 미해결 blocker/);
  assert.match(markdown, /person/);
});
