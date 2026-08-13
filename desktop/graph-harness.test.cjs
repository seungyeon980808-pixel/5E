const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { installSvgDom } = require("../tests/stabilization/harness/svg-dom.cjs");
const { svgTokens } = require("../tests/stabilization/harness/svg-tokens.cjs");

const root = path.join(__dirname, "..");

test("synthetic graph harness audits structural geometry and visual layers", async () => {
  // Given
  installSvgDom();
  const { auditSyntheticGraphCase } = await import(pathToFileURL(path.join(root, "scripts", "stabilization", "graph-harness.mjs")));
  const fixture = JSON.parse(fs.readFileSync(path.join(root, "tests", "stabilization", "fixtures", "graphs", "synthetic-graph-cases.json"), "utf8"));
  const breakMode = process.env.FIVE_E_GRAPH_HARNESS_BREAK;

  // When
  const { renderObject } = await import(pathToFileURL(path.join(root, "js", "render.js")));
  const report = auditSyntheticGraphCase(fixture.cases[0], {
    renderObject, svgTokens,
    compilerBreak: breakMode === "compiler",
    rendererBreak: breakMode === "renderer",
  });

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
    deterministic: true, overlay: true, difference: true, strokeWidth: true, dashPeriod: true,
    unclipped: true, cjkAndMath: true,
  });
});

test("graph visual proof is sensitive to compiler and renderer regressions", async () => {
  // Given
  installSvgDom();
  const { auditSyntheticGraphCase } = await import(pathToFileURL(path.join(root, "scripts", "stabilization", "graph-harness.mjs")));
  const fixture = JSON.parse(fs.readFileSync(path.join(root, "tests", "stabilization", "fixtures", "graphs", "synthetic-graph-cases.json"), "utf8")).cases[0];

  // When
  const { renderObject } = await import(pathToFileURL(path.join(root, "js", "render.js")));
  const compilerBreak = auditSyntheticGraphCase(fixture, { renderObject, svgTokens, compilerBreak: true });
  const rendererBreak = auditSyntheticGraphCase(fixture, { renderObject, svgTokens, rendererBreak: true });

  // Then
  assert.equal(compilerBreak.visual.overlay, false);
  assert.equal(rendererBreak.visual.difference, false);
  assert.equal(rendererBreak.visual.deterministic, false);
});

test("synthetic graph failure ledger requires every contract field", async () => {
  // Given
  const { auditFailureLedger, auditFailureCases } = await import(pathToFileURL(path.join(root, "scripts", "stabilization", "graph-harness.mjs")));
  const ledger = JSON.parse(fs.readFileSync(path.join(root, "docs", "engine-v2", "graph-failure-ledger.synthetic.json"), "utf8"));
  const fixtures = JSON.parse(fs.readFileSync(path.join(root, "tests", "stabilization", "fixtures", "graphs", "synthetic-graph-cases.json"), "utf8"));

  // When / Then
  assert.deepEqual(auditFailureLedger(ledger), { entries: 2, valid: true, errors: [] });
  assert.deepEqual(auditFailureCases(fixtures.cases, ledger).map(({ fixtureId, matched }) => ({ fixtureId, matched })), [
    { fixtureId: "synthetic-dual-panel-curve-bars", matched: true },
    { fixtureId: "synthetic-log-axis", matched: true },
    { fixtureId: "synthetic-polar", matched: true },
    { fixtureId: "synthetic-axis-at", matched: true },
  ]);
  assert.equal(auditFailureLedger({ entries: [{ fixtureId: "incomplete" }] }).valid, false);
});
