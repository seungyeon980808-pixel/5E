const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mainModuleUrl, runtimeConfiguration } = require("../tests/helpers/four-session-entry.cjs");

test("AI image rendering uses a short fresh thread and optimized attachments", () => {
  const panel = fs.readFileSync(path.join(__dirname, "..", "js", "ai-panel.js"), "utf8");
  assert.match(panel, /ephemeralRender: type === "image"/);
  assert.match(panel, /conversationId: type === "chat" \? conversationId : null/);
  assert.match(panel, /Promise\.all\(outgoingItems\.map\(prepareTransportItem\)\)/);
  assert.match(panel, /compactConversation\(conversationMessages\)/);
  assert.match(panel, /markImagesSent\(outgoingItems, conversationId\)/);
  assert.match(panel, /5e\.aiPerformance\.v1/);
  assert.doesNotMatch(panel, /attachments: outgoingItems\.map\(\(item\) => \(\{ name: item\.name, data: item\.data \}\)\)/);
});

test("the optimized modules are cache-busted by the AI panel entrypoint", () => {
  const panel = fs.readFileSync(path.join(__dirname, "..", "js", "ai-panel.js"), "utf8");
  const main = fs.readFileSync(path.join(__dirname, "..", "js", "main.js"), "utf8");
  const scenePrompt = fs.readFileSync(path.join(__dirname, "..", "js", "ai-scene-prompt.js"), "utf8");
  const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(panel, /ai-image-transport\.js\?v=\d+\.\d+\.\d+[^"\s]*/);
  assert.match(panel, /ai-request-plan\.js\?v=\d+\.\d+\.\d+[^"\s]*/);
  assert.match(panel, /ai-prompt\.js\?v=\d+\.\d+\.\d+[^"\s]*/);
  assert.doesNotMatch(panel, /ai-structure-lock\.js/);
  assert.match(panel, /ai-scene-fastpath\.js\?v=\d+\.\d+\.\d+[^"\s]*/);
  assert.match(panel, /ai-motif-catalog\.js\?v=\d+\.\d+\.\d+[^"\s]*/);
  assert.match(panel, /ai-local-asset-router\.js\?v=\d+\.\d+\.\d+[^"\s]*/);
  assert.match(panel, /ai-remote-input-plan\.js\?v=\d+\.\d+\.\d+[^"\s]*/);
  assert.match(panel, /ai-output-cache-store\.js\?v=\d+\.\d+\.\d+[^"\s]*/);
  assert.match(scenePrompt, /ai-scene-fastpath\.js\?v=\d+\.\d+\.\d+[^"\s]*/);
  assert.match(scenePrompt, /ai-motif-catalog\.js\?v=\d+\.\d+\.\d+[^"\s]*/);
  assert.match(main, /ai-panel\.js\?v=\d+\.\d+\.\d+[^"\s]*/);
  // The installed package version is distinct from the shared integrated web
  // runtime. Pin its full identity, including the query, for both entrypoints.
  const origin = "https://unit.invalid";
  const expectedQuery = "?v=1.7.0-four-session-integration";
  for (const entry of ["/", "/preview/"]) {
    const html = entry === "/" ? index : fs.readFileSync(path.join(__dirname, "..", "preview", "index.html"), "utf8");
    const entryUrl = new URL(entry, origin).href;
    const mainUrl = mainModuleUrl(html, entryUrl);
    assert.equal(mainUrl, `${origin}/js/main.js${expectedQuery}`, `${entry} loads the canonical integrated entrypoint`);
    const runtime = runtimeConfiguration({ entry }, entryUrl, mainUrl, main);
    assert.equal(runtime.moduleBase, "/js/");
    assert.equal(runtime.moduleQuery, expectedQuery);
    assert.equal(runtime.stateUrl, `${origin}/js/state.js${expectedQuery}`);
    for (const [parent, source, names] of [
      ["main", main, ["ai-panel"]],
      ["ai-panel", panel, ["ai-image-transport", "ai-request-plan", "ai-prompt", "ai-scene-fastpath", "ai-motif-catalog", "ai-local-asset-router", "ai-remote-input-plan", "ai-output-cache-store"]],
      ["ai-scene-prompt", scenePrompt, ["ai-scene-fastpath", "ai-motif-catalog"]],
    ]) {
      for (const name of names) {
        const imports = [...source.matchAll(/\bfrom\s*["']([^"']+)["']/g)]
          .map(match => new URL(match[1], `${origin}/js/${parent}.js${expectedQuery}`))
          .filter(url => url.pathname.endsWith(`/${name}.js`));
        // Several named imports may share one URL; a different query or path
        // would create another module identity and must still fail this check.
        assert.deepEqual([...new Set(imports.map(url => url.href))], [`${origin}/js/${name}.js${expectedQuery}`], `${parent} uses one exact ${name} identity`);
      }
    }
  }
});

test("common scientific diagrams use the local editable scene path with exact-cache and raster fallback", () => {
  const panel = fs.readFileSync(path.join(__dirname, "..", "js", "ai-panel.js"), "utf8");
  assert.match(panel, /chooseImageEngine\(/);
  assert.match(panel, /createRemoteImageInputPlan\(/);
  assert.match(panel, /createExactOutputCacheKey\(/);
  assert.match(panel, /outputCache\.get\(key\)/);
  assert.match(panel, /stageCurrentOutput\(/);
  assert.match(panel, /purpose = type === "image"[\s\S]*?"scene"/);
  assert.match(panel, /buildFastScenePrompt\(/);
  assert.match(panel, /compileFastScene\(/);
  assert.match(panel, /insertFastSceneIntoState\(/);
  assert.match(panel, /forceEngine: IMAGE_ENGINE_IDS\.RASTER/);
});
