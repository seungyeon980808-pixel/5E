import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("common shell uses the single outlined header control for each editor panel", async () => {
  const [panelScript, panelCss, loginScript] = await Promise.all([
    source("js/panel-visibility.js"),
    source("css/panel-visibility.css"),
    source("js/web-login-ui.js"),
  ]);
  assert.match(panelScript, /panel-shell-toggles/u);
  assert.match(panelScript, /moveEditorHeader/u);
  assert.match(panelScript, /kind === 'editor' \? document\.getElementById\(`drawer-\$\{side\}-toggle`\) : null/u);
  assert.doesNotMatch(panelCss, /panel-edge-toggle/u);
  assert.doesNotMatch(panelScript, /panelInternalToggle/u);
  assert.match(panelCss, /\.app-shell-header \{[\s\S]*grid-column:1 \/ -1/u);
  assert.match(panelCss, /data-left-collapsed="true"\] \{ grid-template-columns: 0 minmax\(0, 1fr\) var\(--panel-right-w\); \}/u);
  assert.match(panelCss, /data-right-collapsed="true"\] \{ grid-template-columns: var\(--panel-left-w\) minmax\(0, 1fr\) 0; \}/u);
  assert.match(loginScript, /\.app-shell-header \.canvas-global-controls/u);
  assert.match(panelCss, /#ai-image-panel \.ai-head > \.panel-shell-toggles \{[\s\S]*position:absolute/u);
  assert.doesNotMatch(panelCss, /#ai-image-panel \.panel-visibility-toggle\[aria-expanded="true"\] \{ display: none/u);
});

test("library keeps search geometry independent from help and uses header panel controls", async () => {
  const [script, css, escapeLayers] = await Promise.all([
    source("js/unified-library-ui.js"),
    source("css/unified-library.css"),
    source("js/escape-layers.js"),
  ]);
  const searchRow = /<div class="unilib-search-row library-search-row">([\s\S]*?)<\/div>\s*<div class="unilib-filter-row/u.exec(script)?.[1] || "";
  assert.match(script, /unilib-header-panel-toggle" data-unilib-folders-open/u);
  assert.match(script, /unilib-header-panel-toggle" data-unilib-preview-toggle/u);
  assert.match(script, /ICONS\.panelLeft/u);
  assert.match(script, /ICONS\.panelRight/u);
  assert.doesNotMatch(script, /data-unilib-pane-collapse/u);
  assert.doesNotMatch(searchRow, /data-unilib-folders-open|data-unilib-preview-toggle/u);
  assert.match(css, /\.unilib-help p \{[\s\S]*position: absolute/u);
  assert.match(css, /\.unilib-help \{\s*position:relative/u);
  assert.match(script, /document\.addEventListener\("pointerdown", \(event\) => \{[\s\S]*help\.open/u);
  assert.match(escapeLayers, /details\[open\]\[data-unilib-help\]/u);
});

test("library shows loading and connection errors without publishing a false empty state", async () => {
  const script = await source("js/unified-library-ui.js");
  assert.match(script, /data-unilib-result-state/u);
  assert.match(script, /data-unilib-result-retry/u);
  assert.match(script, /setResultState\("loading"[\s\S]*?await provider\(\)/u);
  assert.match(script, /setResultState\("error"/u);
  assert.match(script, /setProvidedRetry\(callback\)/u);
  assert.match(script, /setProvidedStatus\(message, error = false\)/u);
});
