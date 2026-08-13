#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ATLASES = [
  "docs/figure-atlas.jsonl", "docs/figure-atlas-c.jsonl",
  "docs/figure-atlas-b.jsonl", "docs/figure-atlas-e.jsonl",
];
const IMAGE_ROOT = path.join(ROOT, "assets", "exam-library", "images");
const OUTPUT = path.join(ROOT, "docs", "engine-v2", "graph-validation-manifest.jsonl");
const LAYERS = ["skeleton", "zone", "object", "link", "aux", "annot"];

function readJsonl(filename) {
  return fs.readFileSync(filename, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function pngSize(buffer, filename) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`${filename} is not a PNG image`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function checksFor(elements) {
  const has = (layer, token) => (elements[layer] || []).includes(token);
  return {
    panelCrop: true,
    graphAspectRatio: true,
    axes: has("skeleton", "plane") || has("skeleton", "axis"),
    axisRange: has("skeleton", "plane") || has("annot", "tick_label"),
    grid: has("aux", "grid_lines"),
    seriesGeometry: (elements.object || []).some((t) => /curve|line|bar|scatter|sector|marker|diagram|isopycnal/.test(t)),
    pointPositions: has("object", "point_marker") || has("object", "misc:point_scatter") || has("object", "misc:hr_diagram"),
    guides: has("aux", "guide_dash"),
    arrows: (elements.aux || []).some((t) => t.startsWith("arrow_") || t === "misc:axis_pointer"),
    labels: (elements.annot || []).length > 0,
    bands: (elements.zone || []).length > 0,
    axisBreaks: has("aux", "axis_break"),
    dimensions: has("aux", "dim_line"),
    // Some atlas rows use range_bar for the span carried by an explicit shade_band
    // (the bar is not a second visible bracket). Require graph.ranges only when the
    // source has a standalone underline/bracket range.
    ranges: has("aux", "range_bar") && !has("zone", "shade_band"),
    leaders: has("aux", "leader_line"),
  };
}

function existingRows() {
  if (!fs.existsSync(OUTPUT)) return new Map();
  return new Map(readJsonl(OUTPUT).map((row) => [row.id, row]));
}

export function buildLedger() {
  const previous = existingRows();
  const rows = [];
  for (const atlasRelative of ATLASES) {
    for (const entry of readJsonl(path.join(ROOT, atlasRelative))) {
      (entry.panels || []).forEach((panel, panelIndex) => {
        if (panel.kind !== "graph") return;
        const imagePath = path.join(IMAGE_ROOT, entry.file);
        if (!fs.existsSync(imagePath)) throw new Error(`Missing exam image: ${entry.file}`);
        const image = fs.readFileSync(imagePath), size = pngSize(image, entry.file);
        const id = `${entry.file}#${panelIndex + 1}`;
        const old = previous.get(id) || {};
        const fixtureRelative = `tests/fixtures/exam-graphs/${path.parse(entry.file).name}__p${panelIndex + 1}.json`;
        const hasFixture = fs.existsSync(path.join(ROOT, fixtureRelative));
        const elements = Object.fromEntries(LAYERS.map((layer) => [layer, [...(panel.elements?.[layer] || [])]]));
        rows.push({
          schema: "5e-exam-graph-validation@1", id,
          subject: entry.subject, year: entry.year, month: entry.month ?? null, question: entry.no,
          source: `assets/exam-library/images/${entry.file}`,
          sourceSha256: crypto.createHash("sha256").update(image).digest("hex"),
          sourceWidth: size.width, sourceHeight: size.height,
          panelIndex: panelIndex + 1, panelName: panel.name ?? null,
          atlasElements: elements, requiredChecks: checksFor(elements),
          // A fixture proves that a GraphSpec candidate exists. It does not prove
          // native visual fidelity or round-trip editability. Only an explicit
          // nativeVisual verification record may promote a row to verified.
          status: hasFixture
            ? (old.status === "verified" && old.verification?.nativeVisual === true ? "verified" : "candidate")
            : "pending",
          fixture: hasFixture ? fixtureRelative : (old.fixture || null),
          verification: old.verification || null,
        });
      });
    }
  }
  rows.sort((a, b) => a.source.localeCompare(b.source) || a.panelIndex - b.panelIndex);
  fs.writeFileSync(OUTPUT, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = buildLedger();
  console.log(`Graph validation ledger: ${rows.length} panels (${rows.filter((r) => r.status === "verified").length} verified, ${rows.filter((r) => r.status === "candidate").length} candidates)`);
}
