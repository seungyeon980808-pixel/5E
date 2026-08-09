import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { matchLocalAssetRequest } from "../js/ai-local-asset-router.js";
import { compilePanelScene } from "../js/ai-panel.js";

test("an exact internal asset compiles through the same panel path without an image call", () => {
  const match = matchLocalAssetRequest({
    request: "한반도 물리 해안선 지도를 그려 줘",
    mode: "diagram",
    references: [],
  });
  assert.equal(match.matched, true);
  const compiled = compilePanelScene(match.motifRequest, { mode: "diagram", idPrefix: "local_test" });
  assert.equal(compiled.result.valid, true);
  assert.equal(compiled.result.supported, true);
  assert.ok(compiled.result.objects.length > 0);
  assert.match(compiled.compileSource, /verified_map_outline/);
});

test("the local asset completion branch returns before desktop send", async () => {
  const source = await readFile(new URL("../js/ai-panel.js", import.meta.url), "utf8");
  const matcher = source.indexOf("matchLocalAssetRequest({");
  const localStatusBranch = source.indexOf("if (localAssetMatch.matched) {", matcher + 1);
  const localBranch = source.indexOf("if (localAssetMatch.matched) {", localStatusBranch + 1);
  const localReturn = source.indexOf("return;", localBranch);
  const desktopSend = source.indexOf("window.fiveEDesktop.send({", localBranch);

  assert.ok(matcher >= 0, "panel must invoke the strict local matcher");
  assert.ok(localBranch > localStatusBranch, "panel must handle an exact local match");
  assert.ok(localReturn > localBranch, "local completion must terminate the request");
  assert.ok(desktopSend > localReturn, "local completion must happen before any desktop/model turn");
  assert.match(source.slice(localBranch, localReturn), /imageCallCount:\s*0/);
});
