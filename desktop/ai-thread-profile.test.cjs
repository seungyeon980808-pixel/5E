const test = require("node:test");
const assert = require("node:assert/strict");
const {
  IMAGE_BASE_INSTRUCTIONS,
  IMAGE_DEVELOPER_INSTRUCTIONS,
  SCENE_BASE_INSTRUCTIONS,
  SCENE_DEVELOPER_INSTRUCTIONS,
  buildEphemeralThreadStartParams,
} = require("./ai-thread-profile.cjs");

const BASE = {
  model: null,
  serviceTier: null,
  cwd: null,
  approvalPolicy: "never",
  sandbox: "read-only",
  ephemeral: true,
};

test("default image profile is isolated and uses the native image tool only", () => {
  const actual = buildEphemeralThreadStartParams();
  assert.deepEqual(actual, {
    ...BASE,
    serviceName: "5e-image-render",
    baseInstructions: IMAGE_BASE_INSTRUCTIONS,
    developerInstructions: IMAGE_DEVELOPER_INSTRUCTIONS,
    environments: [],
    selectedCapabilityRoots: [],
  });
});

test("image profile preserves selected model, service tier, cwd and caller inputs", () => {
  const input = {
    purpose: "image",
    model: "gpt-6.1-sol",
    serviceTier: "priority",
    cwd: "/unchanged/image-workspace",
    effort: "medium",
    attachments: [{ name: "source.png", data: "data:image/png;base64,source" }],
  };
  const before = structuredClone(input);
  const actual = buildEphemeralThreadStartParams(input);
  assert.deepEqual(input, before);
  assert.deepEqual(actual, {
    ...BASE,
    model: input.model,
    serviceTier: input.serviceTier,
    cwd: input.cwd,
    serviceName: "5e-image-render",
    baseInstructions: IMAGE_BASE_INSTRUCTIONS,
    developerInstructions: IMAGE_DEVELOPER_INSTRUCTIONS,
    environments: [],
    selectedCapabilityRoots: [],
  });
  assert.equal(Object.hasOwn(actual, "effort"), false, "effort remains a turn/start field");
  assert.equal(Object.hasOwn(actual, "attachments"), false, "attachments remain turn/start input");
});

test("scene profile keeps its existing JSON-only instructions and isolation", () => {
  assert.deepEqual(buildEphemeralThreadStartParams({ purpose: "scene", model: "gpt-6.1-sol", serviceTier: "priority", cwd: "/unchanged/scene-workspace" }), {
    ...BASE,
    model: "gpt-6.1-sol",
    serviceTier: "priority",
    cwd: "/unchanged/scene-workspace",
    serviceName: "5e-fast-scene",
    baseInstructions: SCENE_BASE_INSTRUCTIONS,
    developerInstructions: SCENE_DEVELOPER_INSTRUCTIONS,
    environments: [],
    selectedCapabilityRoots: [],
  });
});

test("isolation arrays are independent for every ephemeral request", () => {
  for (const purpose of ["image", "scene"]) {
    const first = buildEphemeralThreadStartParams({ purpose });
    const second = buildEphemeralThreadStartParams({ purpose });
    first.environments.push({ id: "must-not-leak" });
    first.selectedCapabilityRoots.push("must-not-leak");
    assert.deepEqual(second.environments, []);
    assert.deepEqual(second.selectedCapabilityRoots, []);
  }
});

test("unrecognized purposes retain the existing base profile behavior", () => {
  assert.deepEqual(buildEphemeralThreadStartParams({ purpose: "other" }), {
    ...BASE,
    serviceName: "5e-image-render",
  });
});
