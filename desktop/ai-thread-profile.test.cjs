const test = require("node:test");
const assert = require("node:assert/strict");
const { buildEphemeralThreadStartParams } = require("./ai-thread-profile.cjs");

test("scene threads disable unrelated capabilities and carry minimal instructions", () => {
  const params = buildEphemeralThreadStartParams({ purpose: "scene", model: "gpt-5.6-luna", serviceTier: "priority", cwd: "C:\\tmp" });
  assert.equal(params.ephemeral, true);
  assert.equal(params.serviceName, "5e-fast-scene");
  assert.deepEqual(params.environments, []);
  assert.deepEqual(params.selectedCapabilityRoots, []);
  assert.match(params.baseInstructions, /Return only the requested compact JSON/);
  assert.match(params.developerInstructions, /Never call image generation/);
});

test("raster threads preserve the default capability surface", () => {
  const params = buildEphemeralThreadStartParams({ purpose: "image" });
  assert.equal(params.serviceName, "5e-image-render");
  assert.equal("selectedCapabilityRoots" in params, false);
  assert.equal("baseInstructions" in params, false);
});
