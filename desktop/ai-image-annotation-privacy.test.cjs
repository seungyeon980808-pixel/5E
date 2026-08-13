const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const annotationModule = import("../js/ai-image-annotations.js");
const requestPlanModule = import("../js/ai-request-plan.js");

function source(id, sourceKind) {
  return {
    id,
    name: `${id}-filename.png`,
    data: `data:image/png;base64,${id}-bytes`,
    sourceKind,
    comments: [{ number: 1, x: 2, y: 3, w: 4, h: 5, text: `${id}-comment` }],
  };
}

async function captureSend(items) {
  const { buildPlanningSafeAnnotationPrompt } = await annotationModule;
  const { selectImageTransportItems } = await requestPlanModule;
  let captured;
  const desktop = { send: async (payload) => { captured = payload; } };
  await desktop.send({
    text: `request${buildPlanningSafeAnnotationPrompt(items)}`,
    attachments: selectImageTransportItems(items),
  });
  return captured;
}

function assertPrivacyBoundary(payload) {
  const serialized = JSON.stringify(payload);
  for (const suffix of ["filename", "comment", "bytes"]) {
    assert.doesNotMatch(serialized, new RegExp(`blocked-${suffix}`));
    assert.match(serialized, new RegExp(`confirmed-${suffix}`));
    assert.match(serialized, new RegExp(`automatic-${suffix}`));
  }
}

test("single image send excludes unconfirmed local names comments and bytes", async () => {
  const payload = await captureSend([
    source("blocked", "local-pdf-crop"),
    source("confirmed", "local-pdf-crop-confirmed"),
    source("automatic", "auto"),
  ]);

  assertPrivacyBoundary(payload);
});

test("batch image send excludes unconfirmed local names comments and bytes", async () => {
  const payload = await captureSend([
    source("blocked", "local-pdf"),
    source("confirmed", "local-pdf-confirmed"),
    source("automatic", "drop"),
  ]);

  assertPrivacyBoundary(payload);
});

test("the panel uses the planning-safe annotation builder for single and batch sends", () => {
  const panel = fs.readFileSync(path.join(__dirname, "..", "js", "ai-panel.js"), "utf8");
  const calls = panel.match(/buildPlanningSafeAnnotationPrompt\(/g) || [];

  assert.equal(calls.length, 2);
  assert.match(panel, /buildPlanningSafeAnnotationPrompt\(batchTransportItems\)/);
  assert.match(panel, /buildPlanningSafeAnnotationPrompt\(\[\s*\.\.\.planningReferences,/s);
});
