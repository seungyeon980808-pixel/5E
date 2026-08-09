import assert from "node:assert/strict";
import {
  EXACT_OUTPUT_CACHE_SCHEMA,
  buildExactOutputCacheDescriptor,
  createExactOutputCacheEntry,
  createExactOutputCacheKey,
  createRemoteImageInputPlan,
  evaluateExactOutputCacheEntry,
  measurePreparationStage,
  normalizeCropRect,
  pruneExactOutputCacheEntries,
  pruneOutgoingAttachments,
  sha256Hex,
  stableStringify,
} from "../js/ai-remote-input-plan.js";

const image = (name, payload, extra = {}) => ({
  id: name,
  name,
  kind: "reference",
  data: `data:image/png;base64,${payload}`,
  comments: [],
  ...extra,
});

assert.equal(
  sha256Hex("abc"),
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  "portable SHA-256 must match the standard vector",
);
assert.equal(stableStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');

assert.deepEqual(
  normalizeCropRect({ x: 90, y: 95, w: 20, h: 20 }, 0.1),
  { x: 89, y: 94.5, w: 11, h: 5.5 },
  "padded crops must remain inside the source image",
);

const primary = image("primary", "PRIMARY", {
  primary: true,
  comments: [
    { number: 1, x: 10, y: 20, w: 20, h: 30, text: "도르래 연결만 유지" },
    { number: 2, x: 55, y: 20, w: 15, h: 20, text: "추를 오른쪽으로 이동" },
    { number: 3, x: 5, y: 5, w: 10, h: 10, text: "지지대 삭제" },
  ],
});
const duplicate = image("duplicate", "PRIMARY", {
  comments: [{ number: 4, x: 70, y: 70, w: 10, h: 10, text: "바닥선 유지" }],
});
const secondaryA = image("secondary-a", "SECONDARY-A");
const secondaryB = image("secondary-b", "SECONDARY-B", { stale: true });
const oldGenerated = image("generated-old", "OLD", { kind: "generated" });
const latest = image("generated-new", "LATEST", {
  kind: "generated",
  comments: [{ number: 1, x: 30, y: 30, w: 25, h: 20, text: "이 부분만 더 작게" }],
});

const pruned = pruneOutgoingAttachments(
  [primary, duplicate, secondaryA, secondaryB, oldGenerated],
  { latestResult: latest },
);
assert.deepEqual(pruned.items.map((item) => item.id), ["primary", "secondary-a"]);
assert.equal(pruned.items[0].comments.length, 4, "duplicate comments must be merged into the retained source");
assert.equal(pruned.metrics.duplicateCount, 1);
assert.equal(pruned.metrics.staleCount, 2);

let clock = 0;
const plan = createRemoteImageInputPlan({
  references: [primary, duplicate, secondaryA, secondaryB, oldGenerated],
  latestResult: latest,
  prompt: "오른쪽 도르래와 추를 수정해 줘",
  now: () => ++clock,
});
assert.equal(plan.primaryReference.id, "primary");
assert.equal(plan.visuals.length <= 4, true, "remote visual input count must stay bounded");
assert.equal(plan.visuals[0].role, "latest-result");
assert.equal(plan.visuals[1].role, "primary-reference");
assert.equal(plan.visuals.some((visual) => visual.kind === "crop"), true);
assert.equal(
  plan.visuals.find((visual) => visual.kind === "crop")?.sourceId,
  "generated-new",
  "a requested region on the latest result must be transmitted as the highest-priority direct crop",
);
assert.equal(plan.visuals.some((visual) => visual.kind === "contact-sheet"), true);
assert.equal(plan.metrics.plannedImageCount, plan.visuals.length);
assert.equal(plan.metrics.totalMs, 3, "planner must expose deterministic stage timing");
assert.equal(plan.metrics.representedSourceCount, 3, "latest, primary, and secondary pixels must remain represented");
assert.equal(plan.metrics.totalSourceBytes > plan.metrics.sourceBytes, true, "latest-result bytes must be measured separately");
const noDirectCropPlan = createRemoteImageInputPlan({
  references: [primary, secondaryA],
  prompt: "수정",
  options: { maxDirectCrops: 0 },
});
assert.equal(noDirectCropPlan.visuals.some((visual) => visual.kind === "crop"), false);
assert.equal(noDirectCropPlan.visuals.some((visual) => visual.kind === "contact-sheet"), true);

const baseRequest = {
  styleVersion: "kice-v2.3",
  mode: "diagram",
  prompt: " 장치의 배치를 유지해 줘\r\n",
  references: [primary, secondaryA],
  latestResult: latest,
  model: "gpt-5.6-luna",
  effort: "low",
  serviceTier: "priority",
};
const descriptor = buildExactOutputCacheDescriptor(baseRequest);
assert.equal(descriptor.schema, EXACT_OUTPUT_CACHE_SCHEMA);
assert.equal(descriptor.referenceSignatures.length, 2);
assert.match(descriptor.latestResultHash, /^sha256:/);
const key = createExactOutputCacheKey(descriptor);
assert.equal(key, createExactOutputCacheKey(baseRequest), "descriptor and request must make the same key");
assert.notEqual(
  key,
  createExactOutputCacheKey({ ...baseRequest, mode: "complete" }),
  "mode changes must invalidate the exact cache",
);
assert.notEqual(
  key,
  createExactOutputCacheKey({ ...baseRequest, styleVersion: "kice-v2.4" }),
  "style changes must invalidate the exact cache",
);
assert.notEqual(
  key,
  createExactOutputCacheKey({ ...baseRequest, prompt: "다른 배치로 바꿔 줘" }),
  "prompt changes must invalidate the exact cache",
);
assert.notEqual(
  key,
  createExactOutputCacheKey({ ...baseRequest, latestResult: image("newer", "NEWER", { kind: "generated" }) }),
  "latest-result pixels must invalidate revisions",
);
assert.notEqual(
  key,
  createExactOutputCacheKey({
    ...baseRequest,
    latestResult: { ...latest, comments: [{ number: 1, x: 10, y: 10, w: 20, h: 20, text: "이 부분만 줄여 줘" }] },
  }),
  "latest-result comments must invalidate revisions",
);
assert.notEqual(
  key,
  createExactOutputCacheKey({
    ...baseRequest,
    references: [{ ...primary, comments: [{ ...primary.comments[0], text: "반대로 이동" }] }, secondaryA],
  }),
  "comment text changes must invalidate the exact cache",
);
assert.notEqual(
  key,
  createExactOutputCacheKey({
    ...baseRequest,
    references: [{ ...primary, aiTransport: { transportDataUrl: "data:image/png;base64,OPTIMIZED" } }, secondaryA],
  }),
  "the exact key must follow the pixels actually sent after transport optimization",
);
assert.notEqual(
  key,
  createExactOutputCacheKey({ ...baseRequest, inputPlanOptions: { maxOutgoingImages: 2 } }),
  "input composition options must invalidate the exact cache",
);
assert.equal(
  key,
  createExactOutputCacheKey({ ...baseRequest, inputPlanOptions: { maxOutgoingImages: 4 } }),
  "explicit defaults must not create a different exact-cache identity",
);

const output = { data: "data:image/png;base64,QUJD" };
const entry = createExactOutputCacheEntry({ descriptor, output, now: 1000 });
assert.equal(entry.cacheable, true);
assert.deepEqual(evaluateExactOutputCacheEntry(entry, key, { now: 1001 }).output, output);
assert.equal(evaluateExactOutputCacheEntry(entry, `${key}-different`, { now: 1001 }).reason, "key-mismatch");
assert.equal(evaluateExactOutputCacheEntry(entry, key, { now: entry.expiresAt + 1 }).reason, "expired");
assert.equal(createExactOutputCacheEntry({ descriptor, output, status: "failed" }).reason, "incomplete");

const second = { ...entry, key: `${key}-2`, lastAccessedAt: 2000 };
const third = { ...entry, key: `${key}-3`, lastAccessedAt: 3000 };
const bounded = pruneExactOutputCacheEntries([entry, second, third], {
  now: 1001,
  policy: { maxEntries: 2, maxBytes: 1024, maxEntryBytes: 1024, ttlMs: 10000 },
});
assert.deepEqual(bounded.kept.map((candidate) => candidate.key), [`${key}-3`, `${key}-2`]);
assert.equal(bounded.evicted.some((candidate) => candidate.reason === "count-limit"), true);

let timer = 10;
const measurements = [];
const measured = await measurePreparationStage("compose-contact-sheet", async () => "done", {
  now: () => (timer += 5),
  onMeasurement: (measurement) => measurements.push(measurement),
});
assert.equal(measured.value, "done");
assert.deepEqual(measurements, [{ name: "compose-contact-sheet", durationMs: 5, ok: true }]);

console.log("AI remote input planning and exact output cache tests passed");
