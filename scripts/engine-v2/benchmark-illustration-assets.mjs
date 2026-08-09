#!/usr/bin/env node
import { performance } from "node:perf_hooks";

import { compileIllustrationAsset } from "../../js/ai-illustration-assets.js";

const iterationsFlag = process.argv.find((arg) => arg.startsWith("--iterations="));
const iterations = iterationsFlag ? Number(iterationsFlag.split("=")[1]) : 4000;
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100000) {
  throw new RangeError("--iterations must be an integer from 1 to 100000");
}

const cases = [
  ["student_trio_seated_dialogue", {}],
  ["student_trio_seated_dialogue", {
    tableShape: "round",
    speechBubbles: "three_blank",
    speechBubbleEvidence: "source",
    bubbleTails: ["down_right", "down", "down_left"],
  }],
  ["spacecraft_flat_shell", {}],
  ["spacecraft_flat_shell", {
    facing: "left",
    window: "wide",
    occupant: "seated",
    device: "detector_box",
    deviceSlot: "front",
  }],
];

const started = performance.now();
let objects = 0;
const byAsset = Object.fromEntries(cases.map(([id]) => [id, { compiles: 0, objects: 0 }]));
for (let index = 0; index < iterations; index += 1) {
  const [id, options] = cases[index % cases.length];
  const result = compileIllustrationAsset(id, options, { idPrefix: `strict_bench_${index}` });
  if (!result.valid || !result.supported) throw new Error(JSON.stringify(result.errors));
  objects += result.objects.length;
  byAsset[id].compiles += 1;
  byAsset[id].objects += result.objects.length;
}
const elapsedMs = performance.now() - started;

process.stdout.write(`${JSON.stringify({
  schemaVersion: "5e-strict-illustration-benchmark@1",
  iterations,
  cases: cases.length,
  objects,
  elapsedMs: Number(elapsedMs.toFixed(3)),
  meanCompileMs: Number((elapsedMs / iterations).toFixed(6)),
  compilesPerSecond: Number((iterations * 1000 / elapsedMs).toFixed(1)),
  byAsset,
}, null, 2)}\n`);
