const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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
  assert.match(panel, /ai-image-transport\.js\?v=1\.5\.3/);
  assert.match(panel, /ai-request-plan\.js\?v=1\.5\.3/);
  assert.match(panel, /ai-prompt\.js\?v=1\.5\.5/);
  assert.match(panel, /ai-events\.js\?v=1\.5\.4/);
  assert.doesNotMatch(panel, /ai-structure-lock\.js/);
  assert.match(panel, /ai-scene-fastpath\.js\?v=1\.5\.3/);
  assert.match(panel, /ai-motif-catalog\.js\?v=1\.5\.3/);
  assert.match(panel, /ai-local-asset-router\.js\?v=1\.5\.3/);
  assert.match(panel, /ai-remote-input-plan\.js\?v=1\.5\.3/);
  assert.match(panel, /ai-output-cache-store\.js\?v=1\.5\.3/);
  assert.match(panel, /ai-reference-search\.js\?v=1\.5\.8-pdf-crop-coordinates/);
  assert.match(scenePrompt, /ai-scene-fastpath\.js\?v=1\.5\.3/);
  assert.match(scenePrompt, /ai-motif-catalog\.js\?v=1\.5\.3/);
  assert.match(main, /ai-panel\.js\?v=1\.5\.11-pdf-crop-responsive-2/);
  assert.match(index, /css\/ai-panel\.css\?v=1\.5\.6-pdf-crop-workspace-3/);
  assert.match(index, /js\/main\.js\?v=1\.5\.9-delayed-cut-cache-pdf-crop-responsive-2/);
});

test("the MCP bridge can import the PNG density helper", () => {
  const svgExport = fs.readFileSync(path.join(__dirname, "..", "js", "svg-export.js"), "utf8");
  assert.match(svgExport, /export\s+function\s+insertPngPhys\s*\(/);
});

test("AI reference crops remain fully visible in a 720px workspace", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "css", "ai-panel.css"), "utf8");
  const panel = fs.readFileSync(path.join(__dirname, "..", "js", "ai-panel.js"), "utf8");
  assert.match(css, /@media\s*\(max-height:\s*760px\)[\s\S]*?--ai-reference-preview-height:\s*100px;/);
  assert.match(panel, /calc\(var\(--ai-reference-preview-height\) \* \$\{zoomLevel\}\)/);
});

test("PDF crop pointer coordinates use the rendered image bounds", () => {
  const search = fs.readFileSync(path.join(__dirname, "..", "js", "ai-reference-search.js"), "utf8");
  assert.match(search, /const image = pageWrap\.querySelector\("img"\);[\s\S]*?const rect = image\.getBoundingClientRect\(\);/);
});

test("common scientific diagrams use the local editable scene path with exact-cache and raster fallback", () => {
  const panel = fs.readFileSync(path.join(__dirname, "..", "js", "ai-panel.js"), "utf8");
  assert.match(panel, /chooseImageEngine\(/);
  assert.match(panel, /createRemoteImageInputPlan\(/);
  assert.match(panel, /createExactOutputCacheKey\(/);
  assert.match(panel, /outputCache\.get\(key\)/);
  assert.match(panel, /storeCurrentOutput\(/);
  assert.match(panel, /purpose = type === "image"[\s\S]*?"scene"/);
  assert.match(panel, /buildFastScenePrompt\(/);
  assert.match(panel, /compileFastScene\(/);
  assert.match(panel, /insertFastSceneIntoState\(/);
  assert.match(panel, /forceEngine: IMAGE_ENGINE_IDS\.RASTER/);
});
