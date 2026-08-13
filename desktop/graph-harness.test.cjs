const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
const { installSvgDom } = require("../tests/stabilization/harness/svg-dom.cjs");

const root = path.join(__dirname, "..");

function fixtureData() {
  const cases = JSON.parse(fs.readFileSync(path.join(root, "tests", "stabilization", "fixtures", "graphs", "synthetic-graph-cases.json"), "utf8"));
  const visualOracle = JSON.parse(fs.readFileSync(path.join(root, "tests", "stabilization", "fixtures", "graphs", "synthetic-graph-visual-oracle.json"), "utf8"));
  return { fixture: cases.cases[0], cases, visualOracle };
}

function pngEvidence(file) {
  const bytes = fs.readFileSync(file);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20),
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

test("synthetic graph harness audits structural geometry and visual layers", async (t) => {
  // Given
  installSvgDom();
  const { auditSyntheticGraphCase } = await import(pathToFileURL(path.join(root, "scripts", "stabilization", "graph-harness.mjs")));
  const { fixture, visualOracle } = fixtureData();
  const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), "5e-graph-visual-"));
  t.after(() => fs.rmSync(artifactDir, { recursive: true, force: true }));
  const visualDamage = process.env.FIVE_E_GRAPH_HARNESS_BREAK;

  // When
  const { renderObject } = await import(pathToFileURL(path.join(root, "js", "render.js")));
  const report = auditSyntheticGraphCase(fixture, { renderObject, visualOracle, artifactDir, visualDamage });

  // Then
  assert.deepEqual(report.compiler, { valid: true, supported: true, deterministic: true });
  assert.deepEqual(report.structural, {
    axes: true, rangesAndTicks: true, seriesAndPoints: true, labels: true,
    lineKinds: true, dualAxis: true, multiPanel: true, editable: true,
  });
  assert.deepEqual(report.geometry, {
    dataPoints: true, curveSamples: true, extrema: true, intersections: true,
    barWidthAndGap: true, axesAndTicks: true, labelAnchors: true, panelGap: true,
  });
  assert.equal(report.visual.deterministic, true);
  assert.deepEqual(report.visual.contract, {
    independentOracle: true, pathStructure: true, coordinates: true, text: true,
    strokeWidth: true, dashPeriod: true, clipped: true,
  });
  assert.equal(report.visual.oracleMatched, true);
  assert.equal(report.visual.diffPixels, 0);
  const evidence = Object.fromEntries(Object.entries(report.visual.artifacts).map(([name, file]) => [name, pngEvidence(file)]));
  for (const item of Object.values(evidence)) assert.deepEqual({ width: item.width, height: item.height }, { width: 440, height: 240 });
  assert.equal(evidence.oracle.sha256, evidence.actual.sha256);
  assert.notEqual(evidence.overlay.sha256, evidence.oracle.sha256);
  assert.notEqual(evidence.difference.sha256, evidence.oracle.sha256);
  assert.deepEqual(report.visual.hashes, Object.fromEntries(Object.entries(evidence).map(([name, item]) => [name, item.sha256])));
});

test("graph visual proof rejects empty renderer shells and partial visual damage", async (t) => {
  // Given
  installSvgDom();
  const { auditSyntheticGraphCase } = await import(pathToFileURL(path.join(root, "scripts", "stabilization", "graph-harness.mjs")));
  const { fixture, visualOracle } = fixtureData();
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "5e-graph-damage-"));
  t.after(() => fs.rmSync(artifactRoot, { recursive: true, force: true }));

  // When
  const { renderObject } = await import(pathToFileURL(path.join(root, "js", "render.js")));
  const emptyShell = auditSyntheticGraphCase(fixture, {
    visualOracle, artifactDir: path.join(artifactRoot, "empty-shell"),
    renderObject(object) {
      const node = document.createElementNS("http://www.w3.org/2000/svg", "g");
      node.dataset.id = object.id;
      node.setAttribute("data-dummy", "present");
      return node;
    },
  });
  const damaged = Object.fromEntries(["path", "coordinate", "text"].map((damage) => [damage,
    auditSyntheticGraphCase(fixture, {
      renderObject, visualOracle, visualDamage: damage, artifactDir: path.join(artifactRoot, damage),
    })]));

  // Then
  assert.equal(emptyShell.visual.oracleMatched, false);
  assert.ok(emptyShell.visual.diffPixels > 0);
  for (const [name, file] of Object.entries(emptyShell.visual.artifacts)) {
    const evidence = pngEvidence(file);
    assert.deepEqual({ width: evidence.width, height: evidence.height }, { width: 440, height: 240 });
    assert.equal(evidence.sha256, emptyShell.visual.hashes[name]);
  }
  assert.equal(damaged.path.visual.contract.pathStructure, false);
  assert.equal(damaged.coordinate.visual.contract.pathStructure, true);
  assert.equal(damaged.coordinate.visual.contract.coordinates, false);
  assert.equal(damaged.text.visual.contract.text, false);
  for (const report of Object.values(damaged)) {
    assert.equal(report.visual.oracleMatched, false);
    assert.ok(report.visual.diffPixels > 0);
    assert.notEqual(report.visual.hashes.actual, report.visual.hashes.oracle);
    for (const [name, file] of Object.entries(report.visual.artifacts)) {
      const evidence = pngEvidence(file);
      assert.deepEqual({ width: evidence.width, height: evidence.height }, { width: 440, height: 240 });
      assert.equal(evidence.sha256, report.visual.hashes[name]);
    }
  }
});

test("synthetic graph failure ledger requires every contract field", async () => {
  // Given
  const { auditFailureLedger, auditFailureCases } = await import(pathToFileURL(path.join(root, "scripts", "stabilization", "graph-harness.mjs")));
  const ledger = JSON.parse(fs.readFileSync(path.join(root, "docs", "engine-v2", "graph-failure-ledger.synthetic.json"), "utf8"));
  const { cases: fixtures } = fixtureData();

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
