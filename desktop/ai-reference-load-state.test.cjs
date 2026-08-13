const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const policyModule = import("../js/ai-reference-source-policy.js");
const dialogModule = import("../js/ai-reference-dialog.js");

function createReferenceStatusFixture() {
  const makeElement = () => ({
    attributes: new Map(), dataset: {}, hidden: true, textContent: "", children: [],
    setAttribute(name, value) { this.attributes.set(name, value); },
    getAttribute(name) { return this.attributes.get(name); },
    replaceChildren(...children) { this.children = children; },
  });
  const summary = makeElement();
  const grid = makeElement();
  const button = makeElement();
  button.disabled = false;
  grid.ownerDocument = { createElement: makeElement };
  const empty = makeElement();
  empty.dataset.aiSearchState = "empty";
  grid.replaceChildren(empty);
  const root = { querySelector: (selector) => selector === "[data-ai-search-summary]" ? summary
    : selector === "[data-ai-search-add]" ? button : grid };
  return { button, empty, grid, root, summary };
}

test("remote catalog loading stays visible and accessible inside the dialog", async () => {
  // Given the real dialog status controller over a ready-empty result grid.
  const { createReferenceLoadStatus } = await dialogModule;
  const { empty, grid, root, summary } = createReferenceStatusFixture();
  const status = createReferenceLoadStatus(root);

  // When loading begins.
  status.loading();

  // Then the summary and grid expose one accessible loading state.
  assert.equal(summary.hidden, false);
  assert.equal(summary.dataset.aiSearchState, "loading");
  assert.equal(summary.getAttribute("aria-live"), "polite");
  assert.equal(summary.getAttribute("aria-busy"), "true");
  assert.equal(grid.getAttribute("aria-busy"), "true");
  assert.ok(summary.textContent);
  assert.equal(grid.children.length, 1);
  assert.notEqual(grid.children[0], empty);
  assert.equal(grid.children[0].dataset.aiSearchState, "loading");
  assert.ok(grid.children[0].textContent);
});

test("remote catalog failure stays visible and accessible inside the dialog", async () => {
  // Given the real dialog status controller.
  const { createReferenceLoadStatus } = await dialogModule;
  const { grid, root, summary } = createReferenceStatusFixture();
  const status = createReferenceLoadStatus(root);

  // When catalog loading fails.
  status.error(new Error("catalog unavailable"));

  // Then the active dialog announces the explicit non-busy error.
  assert.equal(summary.dataset.aiSearchState, "error");
  assert.equal(summary.getAttribute("aria-live"), "assertive");
  assert.equal(summary.getAttribute("aria-busy"), "false");
  assert.equal(grid.getAttribute("aria-busy"), "false");
  assert.equal(summary.textContent, "catalog unavailable");
});

test("pending remote activation renders before loading and cannot replace its dialog status", async () => {
  // Given a remote load that stays pending and the real dialog state controllers.
  const policy = await policyModule;
  const { createReferenceAddControl, createReferenceLoadStatus } = await dialogModule;
  const { button, grid, root, summary } = createReferenceStatusFixture();
  const addControl = createReferenceAddControl(root);
  const loadStatus = createReferenceLoadStatus(root);
  const events = [];
  let resolveRemote;
  const remote = new Promise((resolve) => { resolveRemote = resolve; });

  // When the source activates while its catalog request is unresolved.
  const activation = policy.activateReferenceSource("parts", {
    currentSource: "local",
    selection: new Map(),
    onSourceActivate: () => {
      events.push("render");
      summary.dataset.aiSearchState = "ready";
      grid.replaceChildren();
      addControl.selection(0);
    },
    onRemoteLoad: () => {
      events.push("loading");
      loadStatus.loading();
      addControl.loading();
    },
    loadRemote: () => remote,
  });

  // Then generic rendering precedes and cannot overwrite the pending loading affordance.
  assert.deepEqual(events, ["render", "loading"]);
  assert.equal(summary.dataset.aiSearchState, "loading");
  assert.equal(grid.children[0].dataset.aiSearchState, "loading");
  assert.equal(button.disabled, true);
  resolveRemote();
  await activation;
});

test("rejected remote activation remains loading until the active dialog exposes its error", async () => {
  // Given a rejectable remote load and the real dialog state controllers.
  const policy = await policyModule;
  const { createReferenceAddControl, createReferenceLoadStatus } = await dialogModule;
  const { button, grid, root, summary } = createReferenceStatusFixture();
  const addControl = createReferenceAddControl(root);
  const loadStatus = createReferenceLoadStatus(root);
  let rejectRemote;
  const remote = new Promise((resolve, reject) => { rejectRemote = reject; });
  const activation = policy.activateReferenceSource("exam", {
    currentSource: "parts",
    selection: new Map(),
    onSourceActivate: () => {},
    onRemoteLoad: () => { loadStatus.loading(); addControl.loading(); },
    loadRemote: () => remote,
  });

  // When the pending request fails and the coordinator exposes that failure.
  assert.equal(summary.dataset.aiSearchState, "loading");
  rejectRemote(new Error("catalog unavailable"));
  await assert.rejects(activation, /catalog unavailable/);
  loadStatus.error(new Error("catalog unavailable"));
  addControl.error();

  // Then loading changes only to an explicit error, while Add remains disabled.
  assert.equal(summary.dataset.aiSearchState, "error");
  assert.equal(grid.children[0].dataset.aiSearchState, "error");
  assert.equal(button.disabled, true);
});

test("the search coordinator exposes remote activation state inside its dialog", () => {
  // Given / When the shipped coordinator source is inspected.
  const search = fs.readFileSync(path.join(__dirname, "..", "js", "ai-reference-search.js"), "utf8");

  // Then source rendering belongs to activation and precedes loading, ready, or error state.
  assert.match(search, /createReferenceLoadStatus\(overlay\)/);
  assert.match(search, /onSourceActivate:\s*\(\)\s*=>\s*\{\s*source\s*=\s*nextSource;\s*render\(\);\s*\}/);
  assert.match(search, /referenceLoadStatus\.loading\(\)/);
  assert.match(search, /referenceLoadStatus\.error\(error\)/);
});
