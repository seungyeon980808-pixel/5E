const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const {
  ARROW_POLICIES,
  BACKGROUND_POLICIES,
  OPERATION_ATTRIBUTES,
  assertResolvedContracts,
  imagegenTokenCount,
  namespaceEntries,
  occurrenceCount,
  onlyTag,
  sharedInvariantValues,
  tagEntries,
} = require("./test-fixtures/ai-prompt-contract.cjs");

let importSerial = 0;
async function loadPromptModule() {
  const moduleUrl = pathToFileURL(path.join(__dirname, "..", "js", "ai-prompt.js"));
  moduleUrl.searchParams.set("test", String(++importSerial));
  return import(moduleUrl.href);
}

test("image prompt is self-contained and invokes imagegen exactly once", async () => {
  const { buildImagePrompt } = await loadPromptModule();
  const prompt = buildImagePrompt({ request: "  REQUEST_SENTINEL  ", mode: "diagram" });

  assert.equal(prompt.includes("docs/"), false);
  assert.equal(prompt.includes("EXAM_SCIENTIFIC_DIAGRAM_STYLE.md"), false);
  assert.equal(occurrenceCount(prompt, "REQUEST_SENTINEL"), 1);
  assertResolvedContracts(prompt, {
    operation: "generate",
    backgroundPolicy: "white",
    arrowPolicy: "scientific-only",
  });
});

test("operation and policy defaults, fallbacks, and precedence are deterministic", async () => {
  const { buildImagePrompt } = await loadPromptModule();
  const cases = [
    [{}, { operation: "generate", backgroundPolicy: "white", arrowPolicy: "scientific-only" }],
    [{ revision: true }, { operation: "transform", backgroundPolicy: "preserve", arrowPolicy: "scientific-only" }],
    [{ operation: "generate", revision: true }, { operation: "generate", backgroundPolicy: "white", arrowPolicy: "scientific-only" }],
    [{ operation: "transform" }, { operation: "transform", backgroundPolicy: "preserve", arrowPolicy: "scientific-only" }],
    [{ operation: "scoped-edit", backgroundPolicy: "transparent", arrowPolicy: "none" }, { operation: "scoped-edit", backgroundPolicy: "transparent", arrowPolicy: "none" }],
    [{ operation: "separate", backgroundPolicy: "white", arrowPolicy: "preserve" }, { operation: "separate", backgroundPolicy: "white", arrowPolicy: "preserve" }],
    [{ operation: "unknown", backgroundPolicy: "unknown", arrowPolicy: "unknown" }, { operation: "generate", backgroundPolicy: "white", arrowPolicy: "scientific-only" }],
    [{ operation: "unknown", revision: true, backgroundPolicy: "unknown" }, { operation: "transform", backgroundPolicy: "preserve", arrowPolicy: "scientific-only" }],
  ];

  for (const [options, expected] of cases) {
    const prompt = buildImagePrompt({ request: "REQUEST_SENTINEL", ...options });
    assertResolvedContracts(prompt, expected);
  }
});

test("every operation, background, and arrow combination emits one scoped contract", async () => {
  const { buildImagePrompt } = await loadPromptModule();

  for (const operation of Object.keys(OPERATION_ATTRIBUTES)) {
    for (const backgroundPolicy of BACKGROUND_POLICIES) {
      for (const arrowPolicy of ARROW_POLICIES) {
        const prompt = buildImagePrompt({
          request: "REQUEST_SENTINEL",
          operation,
          backgroundPolicy,
          arrowPolicy,
        });
        assertResolvedContracts(prompt, { operation, backgroundPolicy, arrowPolicy });
      }
    }
  }
});

test("background policy emits one non-conflicting output contract", async () => {
  const { buildImagePrompt } = await loadPromptModule();
  const prompts = [];

  for (const backgroundPolicy of BACKGROUND_POLICIES) {
    const prompt = buildImagePrompt({
      request: "REQUEST_SENTINEL",
      operation: "transform",
      backgroundPolicy,
    });
    assertResolvedContracts(prompt, {
      operation: "transform",
      backgroundPolicy,
      arrowPolicy: "scientific-only",
    });
    prompts.push(prompt);
  }

  assert.equal(new Set(prompts).size, BACKGROUND_POLICIES.length);
});

test("arrow policies remain distinct and mutually exclusive", async () => {
  const { buildImagePrompt } = await loadPromptModule();
  const prompts = [];

  for (const arrowPolicy of ARROW_POLICIES) {
    const prompt = buildImagePrompt({ request: "REQUEST_SENTINEL", arrowPolicy });
    assertResolvedContracts(prompt, {
      operation: "generate",
      backgroundPolicy: "white",
      arrowPolicy,
    });
    prompts.push(prompt);
  }

  assert.equal(new Set(prompts).size, ARROW_POLICIES.length);
});

test("explicit changes precede operation rules while unmentioned structure remains protected", async () => {
  const { buildImagePrompt } = await loadPromptModule();
  const prompt = buildImagePrompt({
    request: "EXPLICIT_CHANGE_SENTINEL",
    operation: "scoped-edit",
    preserve: ["KEEP_RIGHT_OBJECT", "", "   ", null, 17, "KEEP_CONNECTION_PATH"],
  });

  assertResolvedContracts(prompt, {
    operation: "scoped-edit",
    backgroundPolicy: "preserve",
    arrowPolicy: "scientific-only",
  });
  assert.equal(occurrenceCount(prompt, "EXPLICIT_CHANGE_SENTINEL"), 1);
  assert.deepEqual(
    tagEntries(prompt, "explicit-preserve").map((entry) => entry.value),
    ["KEEP_RIGHT_OBJECT", "KEEP_CONNECTION_PATH"],
  );

  const priority = onlyTag(prompt, "priority");
  const explicitChange = onlyTag(prompt, "explicit-change");
  const operation = onlyTag(prompt, "operation:scoped-edit");
  const explicitPreserve = tagEntries(prompt, "explicit-preserve")[0];
  const sharedInvariant = tagEntries(prompt, "shared-invariant")[0];
  const style = onlyTag(prompt, "style");
  assert.ok(priority.lineIndex < explicitChange.lineIndex);
  assert.ok(explicitChange.lineIndex < operation.lineIndex);
  assert.ok(operation.lineIndex < explicitPreserve.lineIndex);
  assert.ok(explicitPreserve.lineIndex < sharedInvariant.lineIndex);
  assert.ok(sharedInvariant.lineIndex < style.lineIndex);
});

test("all quality modes retain structure without overriding an explicit change", async () => {
  const { buildImagePrompt } = await loadPromptModule();
  const prompts = [];
  let baselineInvariants;

  for (const qualityMode of ["simple", "standard", "complex"]) {
    const prompt = buildImagePrompt({
      request: "EXPLICIT_CHANGE_SENTINEL",
      mode: "diagram",
      qualityMode,
    });
    assertResolvedContracts(prompt, {
      operation: "generate",
      backgroundPolicy: "white",
      arrowPolicy: "scientific-only",
    });
    assert.equal(occurrenceCount(prompt, "EXPLICIT_CHANGE_SENTINEL"), 1);

    const invariants = sharedInvariantValues(prompt);
    if (baselineInvariants) assert.deepEqual(invariants, baselineInvariants);
    else baselineInvariants = invariants;

    assert.ok(prompt.length < 3400, `image prompt is unexpectedly long: ${prompt.length}`);
    prompts.push(prompt);
  }

  assert.equal(new Set(prompts).size, 3, "quality modes must produce distinct prompt contracts");
});

test("complex legacy revision is a transform correction and discussion never renders", async () => {
  const { buildDiscussionPrompt, buildImagePrompt } = await loadPromptModule();
  const firstPass = buildImagePrompt({
    request: "REVISION_REQUEST_SENTINEL",
    mode: "diagram",
    qualityMode: "complex",
  });
  const revision = buildImagePrompt({
    request: "REVISION_REQUEST_SENTINEL",
    mode: "diagram",
    revision: true,
    qualityMode: "complex",
  });
  const discussion = buildDiscussionPrompt({ request: "DISCUSSION_REQUEST_SENTINEL", mode: "complete" });

  assertResolvedContracts(firstPass, {
    operation: "generate",
    backgroundPolicy: "white",
    arrowPolicy: "scientific-only",
  });
  assertResolvedContracts(revision, {
    operation: "transform",
    backgroundPolicy: "preserve",
    arrowPolicy: "scientific-only",
  });
  assert.deepEqual(sharedInvariantValues(revision), sharedInvariantValues(firstPass));
  assert.notEqual(revision, firstPass);

  assert.equal(occurrenceCount(discussion, "DISCUSSION_REQUEST_SENTINEL"), 1);
  assert.equal(tagEntries(discussion, "image-contract").length, 0);
  assert.equal(namespaceEntries(discussion, "operation").length, 0);
  assert.equal(namespaceEntries(discussion, "background").length, 0);
  assert.equal(namespaceEntries(discussion, "arrows").length, 0);
  assert.equal(imagegenTokenCount(discussion), 0);
  assert.ok(discussion.length < 700, `discussion prompt is unexpectedly long: ${discussion.length}`);
});
