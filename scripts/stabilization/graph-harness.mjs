import { compileFastScene } from "../../js/ai-scene-fastpath.js";
import visualProofModule from "../../tests/stabilization/harness/graph-visual-proof.cjs";

const { createGraphVisualProof } = visualProofModule;

const LEDGER_FIELDS = Object.freeze([
  "fixtureId", "sourceCategory", "graphType", "failureType",
  "currentlySupported", "requiredFeature", "workaround", "regressionTestStatus",
]);

function equal(left, right, tolerance = 1e-9) {
  return Math.abs(left - right) <= tolerance;
}

function localExtrema(points) {
  return points.slice(1, -1).filter((point, index) => {
    const before = points[index][1], value = point[1], after = points[index + 2][1];
    return (value > before && value > after) || (value < before && value < after);
  });
}

function segmentIntersectionCount(first, second) {
  let count = 0;
  for (let leftIndex = 1; leftIndex < first.length; leftIndex += 1) {
    const [x1, y1] = first[leftIndex - 1], [x2, y2] = first[leftIndex];
    for (let rightIndex = 1; rightIndex < second.length; rightIndex += 1) {
      const [x3, y3] = second[rightIndex - 1], [x4, y4] = second[rightIndex];
      const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (equal(denominator, 0)) continue;
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
      const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denominator;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) count += 1;
    }
  }
  return count;
}

function stableCompilerResult(result) {
  const copy = structuredClone(result);
  delete copy.stats.compileMs;
  return copy;
}

export function auditSyntheticGraphCase(fixture, seams = {}) {
  const scene = fixture.interpretation;
  const expected = fixture.expected;
  const first = compileFastScene(scene, { idPrefix: fixture.fixtureId });
  const second = compileFastScene(scene, { idPrefix: fixture.fixtureId });
  if (seams.compilerBreak) first.objects.splice(0, 1);
  const panels = scene.elements.filter(({ type }) => type === "graph");
  const series = panels.flatMap((panel) => panel.series || []);
  const points = series.flatMap((item) => item.points || []).map((point) =>
    Array.isArray(point) ? point : [point.x, point.y]);
  const planes = first.objects.filter(({ type }) => type === "coordplane");
  const nativeSeries = first.objects.filter(({ type }) => type === "funcgraph");
  const curve = series.find(({ kind }) => kind === "curve");
  const line = series.find(({ kind }) => kind === "line");
  const bar = series.find(({ kind }) => kind === "bar");
  const barPoints = bar.points.map((point) => [point.x, point.y]);
  const labels = panels.flatMap((panel) => panel.labels || []);
  const labelText = labels.map(({ label }) => label);
  const nativeCurve = nativeSeries.find(({ curveStyle }) => curve && curveStyle === "smooth");
  const renderedRoots = first.objects.map((object) => seams.renderObject(object));
  const repeatedRoots = second.objects.map((object) => seams.renderObject(object));
  const visual = createGraphVisualProof({
    roots: renderedRoots, repeatedRoots, oracle: seams.visualOracle,
    damage: seams.visualDamage, artifactDir: seams.artifactDir,
  });
  return {
    fixtureId: fixture.fixtureId,
    compiler: {
      valid: first.valid, supported: first.supported,
      deterministic: JSON.stringify(stableCompilerResult(first)) === JSON.stringify(stableCompilerResult(second)),
    },
    structural: {
      axes: planes.length === expected.panels && panels.every(({ axisVariant }) => axisVariant === "quadrant"),
      rangesAndTicks: panels.every((panel) => panel.xRange?.length === 2 && panel.yRange?.length === 2 && panel.xStep > 0 && panel.yStep > 0),
      seriesAndPoints: series.length === expected.series && points.length === expected.points,
      labels: labelText.every((label) => JSON.stringify(first.objects).includes(label)),
      lineKinds: series.some(({ kind }) => kind === "curve") && series.some(({ kind }) => kind === "line") && series.some(({ kind }) => kind === "bar"),
      dualAxis: panels.some(({ y2Range }) => Array.isArray(y2Range)) && series.some(({ axis }) => axis === "y2"),
      multiPanel: panels.length === expected.panels,
      editable: first.objects.every(({ locked }) => locked !== true),
    },
    geometry: {
      dataPoints: nativeSeries.reduce((sum, item) => sum + (item.mathPoints?.length || 0), 0) === points.length - 1,
      curveSamples: JSON.stringify(nativeCurve?.mathPoints) === JSON.stringify(curve.points.map(([x, y]) => ({ x, y }))),
      extrema: JSON.stringify(localExtrema(curve.points)) === JSON.stringify(expected.extrema),
      intersections: segmentIntersectionCount(curve.points, line.points) === expected.intersections,
      barWidthAndGap: equal(bar.barWidth, expected.barWidth) && equal(barPoints[1][0] - barPoints[0][0] - bar.barWidth, expected.barGap),
      axesAndTicks: planes.every((plane, index) => equal(plane.gridStepX, panels[index].xStep) && equal(plane.gridStepY, panels[index].yStep)),
      labelAnchors: labels.every((label) => planes.some((plane) => plane.annLabelPoints.some((item) => item.text === label.label && equal(item.x, label.x) && equal(item.y, label.y)))),
      panelGap: equal(panels[1].box[0] - panels[0].box[0] - panels[0].box[2], expected.panelGap),
    },
    visual,
  };
}

export function auditFailureCases(fixtures, ledger) {
  return fixtures.map((fixture) => {
    const result = compileFastScene(fixture.interpretation, { idPrefix: fixture.fixtureId, strict: true });
    const actualSupport = result.supported;
    const expectedSupport = fixture.expectedSupport ?? true;
    const matches = ledger.entries.filter((entry) => entry.fixtureId === fixture.fixtureId);
    const ledgerMatches = expectedSupport ? matches.length === 0 : matches.length === 1 && matches[0].currentlySupported === false;
    return { fixtureId: fixture.fixtureId, actualSupport, valid: result.valid, matched: actualSupport === expectedSupport && ledgerMatches };
  });
}

export function auditFailureLedger(ledger, fixtures = []) {
  const entries = Array.isArray(ledger?.entries) ? ledger.entries : [];
  const errors = [];
  entries.forEach((entry, index) => {
    for (const field of LEDGER_FIELDS) {
      if (!Object.hasOwn(entry, field) || entry[field] === "") errors.push(`${index}:${field}`);
    }
    if (typeof entry.currentlySupported !== "boolean") errors.push(`${index}:currentlySupported:type`);
  });
  const unsupportedIds = new Set(fixtures.filter((fixture) => fixture.expectedSupport === false).map((fixture) => fixture.fixtureId));
  const counts = new Map(entries.map((entry) => [entry.fixtureId, entries.filter((item) => item.fixtureId === entry.fixtureId).length]));
  for (const fixtureId of unsupportedIds) {
    const count = counts.get(fixtureId) || 0;
    if (count !== 1) errors.push(`fixture:${fixtureId}:${count === 0 ? "missing" : `duplicate:${count}`}`);
  }
  entries.forEach((entry, index) => {
    if (!unsupportedIds.has(entry.fixtureId)) errors.push(`${index}:fixtureId:orphan`);
    if (entry.currentlySupported !== false) errors.push(`${index}:currentlySupported:unsupported`);
  });
  return { entries: entries.length, valid: errors.length === 0, errors };
}
