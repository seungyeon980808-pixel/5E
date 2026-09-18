import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("common shell keeps panel controls anchored in each full-width header", async () => {
  const [panelScript, panelCss] = await Promise.all([
    source("js/panel-visibility.js"),
    source("css/panel-visibility.css"),
  ]);
  assert.match(panelScript, /panel-shell-toggles/u);
  assert.match(panelScript, /kind === 'editor' \? document\.getElementById\(`drawer-\$\{side\}-toggle`\) : null/u);
  assert.match(panelCss, /\.app \.panel-edge-toggle \{[\s\S]*position: fixed/u);
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
