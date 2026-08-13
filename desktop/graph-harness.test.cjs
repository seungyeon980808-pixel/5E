const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");

test("synthetic graph harness audits structural geometry and visual layers", async () => {
  // Given
  const { auditSyntheticGraphCase } = await import(pathToFileURL(path.join(root, "scripts", "stabilization", "graph-harness.mjs")));
  const fixture = JSON.parse(fs.readFileSync(path.join(root, "tests", "stabilization", "fixtures", "graphs", "synthetic-graph-cases.json"), "utf8"));

  // When
  const report = auditSyntheticGraphCase(fixture.cases[0]);

  // Then
  assert.equal(report.compiler.deterministic, true);
  assert.deepEqual(report.structural, {
    axes: true, rangesAndTicks: true, seriesAndPoints: true, labels: true,
    lineKinds: true, dualAxis: true, multiPanel: true, editable: true,
  });
  assert.deepEqual(report.geometry, {
    dataPoints: true, curveSamples: true, extrema: true, intersections: true,
    barWidthAndGap: true, axesAndTicks: true, labelAnchors: true, panelGap: true,
  });
  assert.deepEqual(report.visual, {
    overlay: true, difference: true, strokeWidth: true, dashPeriod: true,
    unclipped: true, cjkAndMath: true,
  });
});

test("synthetic graph failure ledger requires every contract field", async () => {
  // Given
  const { auditFailureLedger } = await import(pathToFileURL(path.join(root, "scripts", "stabilization", "graph-harness.mjs")));
  const ledger = JSON.parse(fs.readFileSync(path.join(root, "docs", "engine-v2", "graph-failure-ledger.synthetic.json"), "utf8"));

  // When / Then
  assert.deepEqual(auditFailureLedger(ledger), { entries: 2, valid: true, errors: [] });
  assert.equal(auditFailureLedger({ entries: [{ fixtureId: "incomplete" }] }).valid, false);
});
