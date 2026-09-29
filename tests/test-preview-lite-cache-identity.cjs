const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const JS_ROOT = path.join(ROOT, "preview", "js");
const CACHE_ID = "1.7.0-preview-0930";
const GUARDED_MODULES = new Set([
  "render.js",
  "render/annotations.js",
  "render/scene.js",
  "text-editor.js",
  "tools.js",
  "tools/click-placement.js",
  "tools/free-draw.js",
  "tools/node-placement.js",
]);

function javascriptFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? javascriptFiles(fullPath) : fullPath.endsWith(".js") ? [fullPath] : [];
  });
}

test("Lite tool and leader-label render modules share one cache identity", () => {
  const versionsByModule = new Map();
  const importPattern = /["']((?:\.\.\/|\.\/)+(?:render(?:\/scene|\/annotations)?|text-editor|tools(?:\/(?:click-placement|free-draw|node-placement))?)\.js)\?v=([^"']+)["']/g;

  javascriptFiles(JS_ROOT).forEach((file) => {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const modulePath = match[1].replace(/^(?:\.\.\/|\.\/)+/, "");
      if (!GUARDED_MODULES.has(modulePath)) continue;
      if (!versionsByModule.has(modulePath)) versionsByModule.set(modulePath, new Set());
      versionsByModule.get(modulePath).add(match[2]);
    }
  });

  GUARDED_MODULES.forEach((modulePath) => {
    assert.deepEqual(
      [...(versionsByModule.get(modulePath) || [])],
      [CACHE_ID],
      `${modulePath} must use only the current Lite cache identity`,
    );
  });
});
