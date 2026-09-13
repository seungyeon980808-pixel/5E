import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("Given a narrow inspector, when geometry is shown, then every full precision value and unit reflows without shrinking type", async () => {
  const geometry = await source("js/inspector/section-geometry.js");
  const inspector = await source("js/inspector.js");
  const css = await source("css/inspector.css");
  assert.match(geometry, /className = "insp-geometry-pair"/);
  assert.match(geometry, /className = "insp-unit"/);
  assert.doesNotMatch(inspector, /(?:xyPair|whPair|arcPair)\.style\.display[^\n]+"flex"/);
  assert.match(css, /@container inspector-panel \(max-width: 239px\)[\s\S]*\.insp-geometry-pair\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.insp-geometry-pair \.insp-input\s*\{[^}]*width:\s*100%/);
  assert.doesNotMatch(css, /@container inspector-panel[^}]*font-size:\s*(?:[0-9]|1[01])px/);
});

test("Given fill patterns, when opened by pointer, keyboard, or touch, then the current visual and every accessible name remain available", async () => {
  const fill = await source("js/inspector/section-fill.js");
  assert.match(fill, /className = "fill-style-picker"/);
  assert.match(fill, /aria-haspopup/);
  assert.match(fill, /aria-expanded/);
  assert.match(fill, /btn\.setAttribute\("aria-label", label\)/);
  assert.match(fill, /btn\.dataset\.fillStyle = value/);
  assert.match(fill, /fillStyleTrigger\.innerHTML = fillStyleIcon/);
  assert.match(fill, /e\.key === "Escape"/);
});

test("Given bulk edit, when the dialog is resized, then grouped controls reflow and the action footer stays visible", async () => {
  const bulk = await source("js/bulk-edit.js");
  const css = await source("css/inspector.css");
  assert.match(bulk, /class="modal bulk-modal"/);
  assert.match(bulk, /class="bulk-scroll"/);
  assert.match(bulk, /data-bulk-group="style"/);
  assert.match(bulk, /data-bulk-group="dimensions"/);
  assert.match(bulk, /data-bulk-group="alignment"/);
  assert.match(css, /\.bulk-modal\s*\{[^}]*max-height:\s*calc\(100dvh - 32px\)/);
  assert.match(css, /\.bulk-fields-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.bulk-fields-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.bulk-modal > \.modal-actions\s*\{[^}]*flex:\s*0 0 auto/);
});

test("Given mixed selected objects, Apply remains one undo step while Cancel performs no state write", async () => {
  const bulk = await source("js/bulk-edit.js");
  assert.equal((bulk.match(/s2\.undoStack\.push\(JSON\.parse\(JSON\.stringify\(s2\.objects\)\)\)/g) || []).length, 1);
  assert.match(bulk, /#bulk-cancel"\)\.addEventListener\("click", \(\) => \{ _overlay\.hidden = true; \}\)/);
  assert.doesNotMatch(bulk, /#bulk-cancel[\s\S]{0,180}_state\.update/);
});
