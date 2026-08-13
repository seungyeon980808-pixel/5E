#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { FAST_SCENE_SCHEMA_ID, compileFastScene } from "../../js/ai-scene-fastpath.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ATLASES = [
  "docs/figure-atlas.jsonl",
  "docs/figure-atlas-c.jsonl",
  "docs/figure-atlas-b.jsonl",
  "docs/figure-atlas-e.jsonl",
];

// Controlled atlas vocabulary. New tokens must be classified here before the basic
// audit can pass. Lossless GraphSpec support is checked separately by --strict.
const KNOWN_VOCABULARY = Object.freeze({
  skeleton: new Set(["plane", "frame_box", "axis"]),
  zone: new Set(["shade_band", "area_fill", "misc:polarity_column"]),
  object: new Set([
    "curve", "line", "point_marker", "bar", "pie_sector",
    "misc:bar", "misc:bar_column", "misc:bar_chart", "misc:contour_line",
    "misc:point_scatter", "misc:hr_diagram", "misc:spectral_line", "misc:isopycnal",
  ]),
  link: new Set([]),
  aux: new Set([
    "guide_dash", "axis_tick", "leader_line", "grid_lines", "axis_break", "dim_line",
    "arrow_direction", "arrow_transition", "arrow_motion", "range_bar", "misc:axis_pointer",
    "misc:arrow_transition", "ref_point",
  ]),
  annot: new Set([
    "tick_label", "axis_title", "label_name", "label_panel", "label_qty", "label_unit",
    "label_formula", "label_roman", "label_circled", "label_caption", "legend", "label_partname",
  ]),
});

// Tokens that are classified in the atlas but do not yet have a lossless
// GraphSpec field/compiler path. `--strict` treats these as release blockers.
// Keep this list honest: vocabulary recognition alone is not structural support.
const STRUCTURAL_PROBES = Object.freeze([
  {
    tokens: ["zone:shade_band", "zone:misc:polarity_column"],
    required: "graph.bands[] → editable coordplane band data",
    graph: { bands: [{ axis: "x", from: 2, to: 4, level: 225 }] },
    pass: (objects) => objects.some((o) => o.type === "coordplane" && o.bands?.length === 1),
  },
  {
    tokens: ["aux:leader_line"], required: "graph.leaders[] → editable coordplane leader data",
    graph: { leaders: [{ from: [2, 3], to: [4, 5], label: "A" }] },
    pass: (objects) => objects.some((o) => o.type === "coordplane" && o.leaders?.length === 1 && o.leaders[0].label === "A"),
  },
  {
    tokens: ["aux:dim_line"], required: "graph.dimensions[] → editable coordplane dimension data",
    graph: { dimensions: [{ from: [2, 7], to: [4, 7], label: "Ⅰ" }] },
    pass: (objects) => objects.some((o) => o.type === "coordplane" && o.dimensions?.length === 1 && o.dimensions[0].label === "Ⅰ"),
  },
  {
    tokens: ["aux:range_bar"], required: "graph.ranges[] → editable coordplane range data",
    graph: { ranges: [{ from: [1, 1], to: [5, 1], label: "A" }] },
    pass: (objects) => objects.some((o) => o.type === "coordplane" && o.ranges?.length === 1 && o.ranges[0].label === "A"),
  },
]);

function runStructuralProbe(probe) {
  const result = compileFastScene({
    schema: FAST_SCENE_SCHEMA_ID, mode: "complete", artboard: { w: 160, h: 90 },
    elements: [{
      type: "graph", box: [-60, -30, 110, 60], xRange: [0, 10], yRange: [0, 10],
      axisVariant: "quadrant", series: [], ...probe.graph,
    }],
  }, { idPrefix: "graph_audit" });
  return result.valid && result.supported && probe.pass(result.objects);
}

function readAtlas(relative) {
  const filename = path.join(ROOT, relative);
  return fs.readFileSync(filename, "utf8").split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${relative}:${index + 1}: ${error.message}`); }
  });
}

function increment(map, key) { map.set(key, (map.get(key) || 0) + 1); }
function sorted(map) { return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); }

export function auditExamGraphs() {
  const panels = [];
  for (const atlas of ATLASES) {
    for (const entry of readAtlas(atlas)) {
      for (const panel of entry.panels || []) {
        if (panel.kind === "graph") panels.push({ atlas, file: entry.file, panel });
      }
    }
  }

  const counts = {
    skeleton: new Map(), zone: new Map(), object: new Map(),
    link: new Map(), aux: new Map(), annot: new Map(),
  };
  const unknown = [];
  for (const row of panels) {
    const elements = row.panel.elements || {};
    for (const layer of Object.keys(counts)) {
      for (const token of elements[layer] || []) {
        increment(counts[layer], token);
        if (!KNOWN_VOCABULARY[layer].has(token)) unknown.push({ file: row.file, panel: row.panel.name, layer, token });
      }
    }
  }

  return {
    schema: "5e-exam-graph-audit@1",
    atlases: ATLASES,
    examFigures: new Set(panels.map((row) => row.file)).size,
    graphPanels: panels.length,
    vocabulary: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, sorted(value)])),
    unknown,
    structuralGaps: STRUCTURAL_PROBES.flatMap((probe) => {
      if (runStructuralProbe(probe)) return [];
      return probe.tokens.map((key) => {
        const split = key.indexOf(":"), layer = key.slice(0, split), token = key.slice(split + 1);
        return { layer, token, count: counts[layer].get(token) || 0, required: probe.required };
      }).filter((item) => item.count > 0);
    }),
    covered: unknown.length === 0,
  };
}

function main() {
  const result = auditExamGraphs();
  if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Exam graph audit: ${result.graphPanels} panels in ${result.examFigures} figures`);
    for (const [layer, rows] of Object.entries(result.vocabulary)) {
      console.log(`${layer}: ${rows.map(([name, count]) => `${name}=${count}`).join(", ")}`);
    }
    console.log(result.covered ? "coverage: PASS" : `coverage: FAIL (${result.unknown.length} unknown tokens)`);
    if (result.structuralGaps.length) {
      console.log(`structural fidelity: INCOMPLETE (${result.structuralGaps.length} capability gaps)`);
      for (const gap of result.structuralGaps) console.log(`  ${gap.layer}:${gap.token} (${gap.count}) -> ${gap.required}`);
    } else console.log("structural fidelity: PASS");
  }
  if (process.argv.includes("--check") && !result.covered) process.exitCode = 1;
  if (process.argv.includes("--strict") && (!result.covered || result.structuralGaps.length)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
