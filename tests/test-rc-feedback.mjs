import assert from "node:assert/strict";
import test from "node:test";
import { capturePageHistory, isPageHistoryEntry, restorePageHistory } from "../js/page-history.js";
import { cutSelectedObjects } from "../js/clipboard-commands.js";
import { defaultExportBaseName, rasterDimensions, sanitizeExportBaseName } from "../js/export-policy.js";
import { clampTextSize, parseTextSize } from "../js/text-size.js";

function pageState() {
  const first = { id: "a", name: "첫 장", objects: [{ id: "one" }], guides: [], layers: [{ id: 1 }], artboard: { width: 100 } };
  const second = { id: "b", name: "둘째 장", objects: [{ id: "two" }], guides: [], layers: [{ id: 2 }], artboard: { width: 200 } };
  return { pages: [first, second], activePageId: "a", activeLayerId: 1, objects: first.objects, guides: [], layers: first.layers, artboard: first.artboard, selectedIds: ["one"] };
}

test("page history restores page structure and active-page working state", () => {
  const state = pageState();
  const snapshot = capturePageHistory(state);
  assert.equal(isPageHistoryEntry(snapshot), true);
  state.pages.reverse();
  state.pages[1].name = "변경";
  state.activePageId = "b";
  restorePageHistory(state, snapshot);
  assert.deepEqual(state.pages.map((page) => [page.id, page.name]), [["a", "첫 장"], ["b", "둘째 장"]]);
  assert.equal(state.activePageId, "a");
  assert.deepEqual(state.objects, [{ id: "one" }]);
  assert.deepEqual(state.selectedIds, []);
});

test("cut removes only mutable selected objects as one undoable operation", () => {
  const state = { objects: [{ id: "a" }, { id: "b", locked: true }, { id: "c" }], selectedIds: ["a", "b"], targetedId: "a", undoStack: [], redoStack: [["stale"]] };
  const clipboard = cutSelectedObjects(state);
  assert.deepEqual(clipboard, [{ id: "a" }]);
  assert.deepEqual(state.objects.map((object) => object.id), ["b", "c"]);
  assert.equal(state.undoStack.length, 1);
  assert.deepEqual(state.redoStack, []);
});

test("locked-only cut is a no-op", () => {
  const state = { objects: [{ id: "a", locked: true }], selectedIds: ["a"], undoStack: [], redoStack: [] };
  assert.equal(cutSelectedObjects(state), null);
  assert.equal(state.undoStack.length, 0);
});

test("export names are page-led and Windows-safe", () => {
  assert.equal(sanitizeExportBaseName(" 실험:결과. "), "실험_결과");
  assert.equal(sanitizeExportBaseName("CON"), "5E-export");
  assert.equal(defaultExportBaseName({ pages: [{ id: "p", name: "1/2 페이지" }], activePageId: "p" }, "stamp"), "1_2 페이지");
});

test("raster sizing permits high DPI but rejects unsafe allocations", () => {
  assert.deepEqual(rasterDimensions(100, 100, 600), { width: 2362, height: 2362, dpi: 600 });
  assert.throws(() => rasterDimensions(100, 100, 601), /72~600/);
  assert.throws(() => rasterDimensions(1000, 1000, 600), /안전 한도/);
  assert.throws(() => rasterDimensions(Number.NaN, 100, 300), /크기/);
});

test("direct text size accepts decimals and reports invalid ranges", () => {
  assert.deepEqual(parseTextSize("12.5"), { ok: true, value: 12.5 });
  assert.equal(parseTextSize(5).ok, false);
  assert.equal(parseTextSize(401).ok, false);
  assert.equal(clampTextSize(999), 400);
});
