const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function createRoot() {
  const button = { disabled: false };
  const summary = {
    dataset: {}, hidden: true, textContent: "",
    setAttribute(name, value) { this[name] = String(value); },
  };
  return { button, summary, root: { querySelector: (selector) =>
    selector === "[data-ai-search-add]" ? button : summary } };
}

test("remote Add is enabled only for a ready selection", async () => {
  // Given a remote dialog Add controller with no selection.
  const { createReferenceAddControl } = await import("../js/ai-reference-dialog.js");
  const { root, button } = createRoot();
  const control = createReferenceAddControl(root);

  // When selection and load states change.
  assert.equal(button.disabled, true);
  control.selection(2);
  assert.equal(button.disabled, false);
  control.loading();
  assert.equal(button.disabled, true);
  control.ready();
  assert.equal(button.disabled, false);
  control.error();

  // Then error and no-selection states remain fail-closed.
  assert.equal(button.disabled, true);
  control.ready();
  control.selection(0);
  assert.equal(button.disabled, true);
});

test("selection warnings are exposed inside the active reference dialog", async () => {
  // Given the active dialog's state controller.
  const { createReferenceAddControl } = await import("../js/ai-reference-dialog.js");
  const { root, summary } = createRoot();
  const control = createReferenceAddControl(root);

  // When an Add attempt has no selection.
  control.warning("Choose a reference");

  // Then the active dialog owns the accessible warning.
  assert.equal(summary.hidden, false);
  assert.equal(summary.dataset.aiSearchState, "warning");
  assert.equal(summary.role, "status");
  assert.equal(summary["aria-live"], "polite");
  assert.equal(summary.textContent, "Choose a reference");
});

test("reference coordinator binds Add state to selection and remote loading", () => {
  // Given the shipped reference dialog and coordinator sources.
  const dialog = fs.readFileSync(path.join(__dirname, "..", "js", "ai-reference-dialog.js"), "utf8");
  const search = fs.readFileSync(path.join(__dirname, "..", "js", "ai-reference-search.js"), "utf8");

  // When their integration contract is inspected.
  // Then the initial control and every remote state are fail-closed at the dialog boundary.
  assert.match(dialog, /data-ai-search-add disabled/);
  assert.match(search, /referenceAddControl\?\.selection\(localWorkspace \? 0 : selected\.size\)/);
  assert.match(search, /activateReferenceSource\(nextSource,\s*\{\s*currentSource:\s*source,\s*selection:\s*selected/s);
  assert.match(search, /const activation = activateReferenceSource[\s\S]*source = nextSource; render\(\)/);
  for (const state of ["loading", "ready", "error", "warning"]) {
    assert.match(search, new RegExp(`referenceAddControl\\?\\.${state}\\(`));
  }
});

test("remote Add visually distinguishes disabled and ready states", () => {
  // Given the reference-dialog footer styling.
  const css = fs.readFileSync(path.join(__dirname, "..", "css", "ai-panel.css"), "utf8");

  // When ready, disabled, and keyboard-focus selectors are inspected.
  // Then ready is accented while disabled is muted and unmistakably unavailable.
  assert.match(css, /\.ai-reference-search-dialog > footer button\s*\{[^}]*background:\s*var\(--accent/s);
  assert.match(css, /\.ai-reference-search-dialog > footer button:disabled\s*\{[^}]*color:\s*var\(--text-secondary[^}]*background:\s*var\(--btn-tool[^}]*border-color:\s*var\(--border[^}]*opacity:\s*\.6[^}]*cursor:\s*not-allowed/s);
  assert.match(css, /\.ai-reference-search-dialog > footer button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent/s);
});

test("parts selection is cleared when the exam source is activated", async () => {
  // Given a selected parts card and a ready Add control.
  const { activateReferenceSource, REFERENCE_SOURCES } = await import("../js/ai-reference-source-policy.js");
  const { createReferenceAddControl } = await import("../js/ai-reference-dialog.js");
  const { root, button } = createRoot();
  const control = createReferenceAddControl(root);
  const selected = new Map([["parts:one", { source: REFERENCE_SOURCES.PARTS }]]);
  control.selection(selected.size);

  // When the visible source changes from parts to exams.
  await activateReferenceSource(REFERENCE_SOURCES.EXAM, {
    currentSource: REFERENCE_SOURCES.PARTS,
    selection: selected,
    loadRemote: async () => {},
  });
  control.selection(selected.size);

  // Then no hidden selection keeps Add enabled.
  assert.equal(selected.size, 0);
  assert.equal(button.disabled, true);
});

test("same-source activation preserves its visible ready selection", async () => {
  // Given one selected card in the active parts source.
  const { activateReferenceSource, REFERENCE_SOURCES } = await import("../js/ai-reference-source-policy.js");
  const { createReferenceAddControl } = await import("../js/ai-reference-dialog.js");
  const { root, button } = createRoot();
  const control = createReferenceAddControl(root);
  const selected = new Map([["parts:one", { source: REFERENCE_SOURCES.PARTS }]]);

  // When the same parts source is activated again.
  await activateReferenceSource(REFERENCE_SOURCES.PARTS, {
    currentSource: REFERENCE_SOURCES.PARTS,
    selection: selected,
    loadRemote: async () => {},
  });
  control.selection(selected.size);

  // Then the visible selection remains ready to add.
  assert.equal(selected.size, 1);
  assert.equal(button.disabled, false);
});

test("local activation clears stale remote selection", async () => {
  // Given a selected exam card before entering the local workspace.
  const { activateReferenceSource, REFERENCE_SOURCES } = await import("../js/ai-reference-source-policy.js");
  const selected = new Map([["exam:one", { source: REFERENCE_SOURCES.EXAM }]]);

  // When the local source is activated.
  await activateReferenceSource(REFERENCE_SOURCES.LOCAL, {
    currentSource: REFERENCE_SOURCES.EXAM,
    selection: selected,
    loadRemote: async () => { throw new Error("local activation must not load remote data"); },
  });

  // Then the remote selection cannot reappear on a later tab.
  assert.equal(selected.size, 0);
});
