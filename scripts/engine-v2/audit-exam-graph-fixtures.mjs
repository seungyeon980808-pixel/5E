#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { compileFastScene } from "../../js/ai-scene-fastpath.js";
import { normalizeObject } from "../../tools/mcp-5e/lib/schema.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST = path.join(ROOT, "docs", "engine-v2", "graph-validation-manifest.jsonl");

function readJsonl(filename) {
  return fs.readFileSync(filename, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function validNormRect(value) {
  return Array.isArray(value) && value.length === 4 && value.every(Number.isFinite)
    && value[0] >= 0 && value[1] >= 0 && value[2] > 0 && value[3] > 0
    && value[0] + value[2] <= 1.000001 && value[1] + value[3] <= 1.000001;
}

function rectContains(outer, inner, tolerance = 1e-6) {
  return outer[0] <= inner[0] + tolerance && outer[1] <= inner[1] + tolerance
    && outer[0] + outer[2] + tolerance >= inner[0] + inner[2]
    && outer[1] + outer[3] + tolerance >= inner[1] + inner[3];
}

const CHECK_ASSERTION_KIND = Object.freeze({
  panelCrop: "panel_crop", graphAspectRatio: "graph_aspect_ratio", axes: "axes",
  axisRange: "axis_range", grid: "grid", seriesGeometry: "series_geometry",
  pointPositions: "point_positions", guides: "guides", arrows: "arrows", labels: "labels",
  bands: "bands", axisBreaks: "axis_breaks", dimensions: "dimensions", ranges: "ranges", leaders: "leaders",
});

function samePair(a, b, tolerance = 1e-9) {
  return Array.isArray(a) && Array.isArray(b) && a.length === 2 && b.length === 2
    && Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance;
}

function validatePositionedItems(row, kind, assertion, actual, errors) {
  if (!assertion) return;
  if (assertion.count !== actual.length) errors.push(`${row.id}: ${kind} count differs`);
  if (!actual.length) return;
  if (!Array.isArray(assertion.items) || assertion.items.length !== actual.length) {
    errors.push(`${row.id}: ${kind} exact geometry missing`);
    return;
  }
  assertion.items.forEach((expected, index) => {
    const item = actual[index] || {};
    if (Array.isArray(expected.from) && !samePair(expected.from, item.from)) errors.push(`${row.id}: ${kind} ${index} start differs`);
    if (Array.isArray(expected.to) && !samePair(expected.to, item.to)) errors.push(`${row.id}: ${kind} ${index} end differs`);
    for (const field of ["axis", "at", "from", "to", "label", "variant", "level"]) {
      if ((field === "from" || field === "to") && Array.isArray(expected[field])) continue;
      if (Object.hasOwn(expected, field) && expected[field] !== item[field]) errors.push(`${row.id}: ${kind} ${index} ${field} differs`);
    }
  });
}

function validateAssertions(row, fixture, errors) {
  const byKind = new Map(fixture.assertions.map((a) => [a.kind, a]));
  for (const [check, required] of Object.entries(row.requiredChecks || {})) {
    if (required && !byKind.has(CHECK_ASSERTION_KIND[check])) errors.push(`${row.id}: ${CHECK_ASSERTION_KIND[check]} assertion missing`);
  }
  const graph = (fixture.scene.elements || []).find((el) => el.type === "graph");
  if (!graph) { errors.push(`${row.id}: graph element missing`); return; }
  const aspect = byKind.get("graph_aspect_ratio");
  if (aspect) {
    const sourceRatio = (fixture.graphBox[2] * row.sourceWidth) / (fixture.graphBox[3] * row.sourceHeight);
    const renderRatio = graph.box[2] / graph.box[3], tolerance = aspect.tolerance ?? 0.03;
    if (Math.abs(renderRatio / sourceRatio - 1) > tolerance) errors.push(`${row.id}: graph aspect ratio differs`);
  }
  const axes = byKind.get("axes");
  if (axes && axes.variant !== graph.axisVariant) errors.push(`${row.id}: axis variant differs`);
  const range = byKind.get("axis_range");
  if (range && (!samePair(range.x, graph.xRange) || !samePair(range.y, graph.yRange))) errors.push(`${row.id}: axis range differs`);
  const grid = byKind.get("grid");
  if (grid && (Boolean(grid.enabled) !== (graph.grid !== false)
      || (grid.xStep != null && grid.xStep !== graph.xStep)
      || (grid.yStep != null && grid.yStep !== graph.yStep))) errors.push(`${row.id}: grid specification differs`);
  const series = byKind.get("series_geometry");
  if (series) {
    const actualKinds = (graph.series || []).map((s) => s.kind || "curve");
    if (series.count !== actualKinds.length || JSON.stringify(series.kinds) !== JSON.stringify(actualKinds)) errors.push(`${row.id}: series geometry differs`);
  }
  const points = byKind.get("point_positions");
  if (points) for (const point of points.points || []) {
    const actual = graph.series?.[point.series]?.points?.[point.index];
    const pair = Array.isArray(actual) ? actual : [actual?.x, actual?.y];
    if (!samePair(point.at, pair, point.tolerance ?? 1e-9)) errors.push(`${row.id}: point position ${point.series}:${point.index} differs`);
  }
  for (const [kind, field] of [["bands", "bands"], ["axis_breaks", "axisBreaks"], ["dimensions", "dimensions"], ["ranges", "ranges"], ["leaders", "leaders"]]) {
    validatePositionedItems(row, kind, byKind.get(kind), graph[field] || [], errors);
  }
  const arrows = byKind.get("arrows");
  if (arrows) {
    const actual = graph.arrows || [];
    if (arrows.count !== actual.length) errors.push(`${row.id}: arrows count differs`);
    if (actual.length && (!Array.isArray(arrows.items) || arrows.items.length !== actual.length)) errors.push(`${row.id}: arrows exact geometry missing`);
    for (let i = 0; i < Math.min(actual.length, arrows.items?.length || 0); i += 1) {
      const expected = arrows.items[i], item = actual[i];
      if (!samePair(expected.at, [item.x, item.y]) || !samePair(expected.delta, [item.dx, item.dy])) errors.push(`${row.id}: arrow ${i} geometry differs`);
    }
  }
  const guides = byKind.get("guides");
  if (guides) {
    const actual = [
      ...(graph.guides || []).map((point) => ({ at: Array.isArray(point) ? point : [point.x, point.y] })),
      ...(graph.guideLines || []).map((line) => ({ from: line.from, to: line.to })),
    ];
    if (guides.count !== actual.length) errors.push(`${row.id}: guides count differs`);
    if (actual.length && (!Array.isArray(guides.items) || guides.items.length !== actual.length)) errors.push(`${row.id}: guides exact geometry missing`);
    for (let i = 0; i < Math.min(actual.length, guides.items?.length || 0); i += 1) {
      const expected = guides.items[i], item = actual[i];
      if (expected.at && !samePair(expected.at, item.at)) errors.push(`${row.id}: guide ${i} point differs`);
      if (expected.from && !samePair(expected.from, item.from)) errors.push(`${row.id}: guide ${i} start differs`);
      if (expected.to && !samePair(expected.to, item.to)) errors.push(`${row.id}: guide ${i} end differs`);
    }
  }
  const labels = byKind.get("labels");
  if (labels) {
    const serialized = JSON.stringify(graph);
    for (const value of labels.values || []) if (!serialized.includes(JSON.stringify(value).slice(1, -1))) errors.push(`${row.id}: label ${value} missing`);
    const actual = graph.labels || [];
    if (actual.length && (!Array.isArray(labels.positions) || labels.positions.length !== actual.length)) errors.push(`${row.id}: exact label positions missing`);
    for (let i = 0; i < Math.min(actual.length, labels.positions?.length || 0); i += 1) {
      const expected = labels.positions[i], item = actual[i];
      if (expected.value !== item.label || !samePair(expected.at, [item.x, item.y])) errors.push(`${row.id}: label ${i} position differs`);
    }
  }
}

export function auditFixtures() {
  const rows = readJsonl(MANIFEST), errors = [], fixtureIds = [], verified = [];
  const ids = new Set();
  for (const row of rows) {
    if (ids.has(row.id)) errors.push(`${row.id}: duplicate manifest id`);
    ids.add(row.id);
    const sourcePath = path.join(ROOT, row.source);
    if (!fs.existsSync(sourcePath)) { errors.push(`${row.id}: source image missing`); continue; }
    const hash = crypto.createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex");
    if (hash !== row.sourceSha256) errors.push(`${row.id}: source image hash changed`);
    if (!row.fixture) {
      if (row.status === "verified" || row.status === "candidate") errors.push(`${row.id}: ${row.status} row has no fixture`);
      continue;
    }
    const fixturePath = path.join(ROOT, row.fixture);
    if (!fs.existsSync(fixturePath)) { errors.push(`${row.id}: fixture missing`); continue; }
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    if (fixture.sourceId !== row.id) errors.push(`${row.id}: fixture sourceId mismatch`);
    if (!validNormRect(fixture.sourceCrop)) errors.push(`${row.id}: invalid normalized sourceCrop`);
    if (!validNormRect(fixture.graphBox)) errors.push(`${row.id}: invalid normalized graphBox`);
    if (validNormRect(fixture.sourceCrop) && validNormRect(fixture.graphBox) && !rectContains(fixture.sourceCrop, fixture.graphBox)) errors.push(`${row.id}: graphBox lies outside sourceCrop`);
    if (!fixture.scene || !Array.isArray(fixture.assertions)) { errors.push(`${row.id}: fixture scene/assertions missing`); continue; }
    const result = compileFastScene(fixture.scene, { idPrefix: "fixture_audit" });
    if (!result.valid || !result.supported) errors.push(`${row.id}: GraphSpec compile failed`);
    const overlayText = result.objects.filter((object) => object.type === "text" || object.type === "formula");
    if (overlayText.length) errors.push(`${row.id}: standalone text/formula overlay emitted (${overlayText.length})`);
    for (const object of result.objects) {
      if (normalizeObject(object).errors.length) errors.push(`${row.id}: invalid native ${object.type} object`);
    }
    validateAssertions(row, fixture, errors);
    fixtureIds.push(row.id);
    if (row.status === "verified") {
      if (row.verification?.nativeVisual !== true) errors.push(`${row.id}: verified row lacks nativeVisual evidence`);
      verified.push(row.id);
    }
  }
  if (rows.length !== 314) errors.push(`manifest has ${rows.length} rows, expected 314`);
  return { rows: rows.length, fixtures: fixtureIds.length, candidates: fixtureIds.length - verified.length, verified: verified.length, pending: rows.length - fixtureIds.length, errors };
}

function main() {
  const result = auditFixtures();
  console.log(`Exam graph fixtures: ${result.verified}/${result.rows} verified, ${result.candidates} candidates, ${result.pending} without fixtures`);
  console.log(result.errors.length ? `fixture integrity: FAIL (${result.errors.length})` : "fixture integrity: PASS");
  result.errors.slice(0, 30).forEach((error) => console.log(`  ${error}`));
  if (result.errors.length || (process.argv.includes("--strict") && result.verified !== result.rows)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
