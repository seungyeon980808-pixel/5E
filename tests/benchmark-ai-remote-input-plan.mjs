import { performance } from "node:perf_hooks";
import {
  buildExactOutputCacheDescriptor,
  createExactOutputCacheKey,
  createRemoteImageInputPlan,
} from "../js/ai-remote-input-plan.js";

const makeImage = (id, character, comments = []) => ({
  id,
  kind: "reference",
  data: `data:image/png;base64,${character.repeat(2_000_000)}`,
  comments,
});

const references = [
  makeImage("primary", "A", [{ number: 1, x: 10, y: 10, w: 25, h: 20, text: "주요 장치를 유지" }]),
  makeImage("secondary-1", "B"),
  makeImage("secondary-2", "C"),
  makeImage("secondary-3", "D"),
];
references[0].primary = true;
const latestResult = makeImage("latest", "E");
latestResult.kind = "generated";

function measure(label, operation) {
  const startedAt = performance.now();
  const value = operation();
  return { label, durationMs: Math.round((performance.now() - startedAt) * 100) / 100, value };
}

const cold = measure("cold-plan", () => createRemoteImageInputPlan({
  references,
  latestResult,
  prompt: "주요 장치를 유지하고 오른쪽만 수정",
}));
const warm = measure("warm-plan", () => createRemoteImageInputPlan({
  references,
  latestResult,
  prompt: "주요 장치를 유지하고 오른쪽만 수정",
}));
const cacheKey = measure("exact-cache-key", () => createExactOutputCacheKey(buildExactOutputCacheDescriptor({
  styleVersion: "benchmark-style-v1",
  mode: "diagram",
  prompt: "주요 장치를 유지하고 오른쪽만 수정",
  references,
  latestResult,
  model: "gpt-5.6-luna",
  effort: "low",
  serviceTier: "priority",
})));

console.log(JSON.stringify({
  inputBytes: cold.value.metrics.sourceBytes,
  plannedImages: cold.value.visuals.length,
  contactSheetTiles: cold.value.metrics.contactSheetTileCount,
  measurements: [
    { label: cold.label, durationMs: cold.durationMs },
    { label: warm.label, durationMs: warm.durationMs },
    { label: cacheKey.label, durationMs: cacheKey.durationMs },
  ],
  cacheKeyPrefix: cacheKey.value.slice(0, 32),
}, null, 2));
