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

test("image renderer supports text-only creation without claiming an attachment exists", () => {
  const actual = buildEphemeralThreadStartParams({ purpose: 'image' });
  assert.match(actual.baseInstructions, /when no image is attached/);
  assert.doesNotMatch(actual.baseInstructions, /source image is already attached/);
  assert.match(actual.developerInstructions, /creation or editing/);
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

// R2(10-21): 출제 대화(chat)와 알 수 없는 용도도 도구 없이 시작한다 — 읽기 전용 샌드박스도 홈 폴더는 읽을 수 있어서,
// 불러온 문항·PDF에 숨은 지시가 파일을 읽어 답에 섞게 할 수 있었다.
test("chat and unrecognized purposes start without tools or capability roots", () => {
  for (const purpose of ["chat", "other"]) {
    assert.deepEqual(buildEphemeralThreadStartParams({ purpose }), {
      ...BASE,
      serviceName: "5e-image-render",
      environments: [],
      selectedCapabilityRoots: [],
    });
  }
});
