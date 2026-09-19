import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const projectIo = fs.readFileSync(path.join(root, "js", "project-io.js"), "utf8");

function projectPackagePolicyScript() {
  const scripts = [...index.matchAll(/<script>([\s\S]*?)<\/script>/gu)];
  const policy = scripts.find(([, source]) => source.includes("FIVE_E_PROJECT_PACKAGE_API_URL"));
  assert.ok(policy, "the web document must configure project package policy before saving");
  return policy[1];
}

function projectSaveHarness() {
  const downloads = [];
  const downloadRequests = [];
  const packageRequests = [];
  const marks = [];
  const window = {
    FIVE_E_PROJECT_PACKAGE_API_URL: "https://example.test/project-package",
    FIVE_E_PROJECT_PACKAGE_TARGETS: ["darwin"],
  };
  vm.runInNewContext(projectPackagePolicyScript(), { window });

  const document = {
    body: {
      appendChild(node) { downloads.push(node); },
      removeChild(node) { const index = downloads.indexOf(node); if (index >= 0) downloads.splice(index, 1); },
    },
    createElement(tag) {
      assert.equal(tag, "a");
      return { click() { downloadRequests.push({ href: this.href, download: this.download }); } };
    },
  };
  const url = {
    createObjectURL(blob) { assert.ok(blob instanceof Blob); return "blob:5e-project"; },
    revokeObjectURL() {},
  };
  const context = {
    window,
    document,
    URL: url,
    Blob,
    captureProjectStatus: () => "before-save",
    markProjectStatus: (_state, token, kind) => marks.push({ token, kind }),
    nativeProjectTarget: () => "darwin",
    saveNativeProjectPackage: async () => { packageRequests.push(true); return { kind: "saved" }; },
  };
  context.globalThis = context;
  const executable = projectIo
    .replace(/^import\s+[\s\S]*?;\r?\n/gmu, "")
    .replace(/\bexport\s+/gu, "");
  vm.runInNewContext(`${executable}\nglobalThis.saveProject = saveProject;`, context);
  const state = {
    get: () => ({
      activePageId: "page-1",
      pages: [{ id: "page-1", name: "페이지 1", meta: {}, objects: [], guides: [], layers: [], artboard: { w: 90, h: 60 } }],
      objects: [], guides: [], layers: [], artboard: { w: 90, h: 60 },
    }),
  };
  return { downloads, downloadRequests, packageRequests, marks, saveProject: context.saveProject, state };
}

test("public web save downloads an editable .5e project without requesting an executable package", async () => {
  const harness = projectSaveHarness();
  const outcome = await harness.saveProject(harness.state);

  assert.equal(outcome.kind, "download-requested");
  assert.deepEqual(harness.packageRequests, []);
  assert.deepEqual(harness.downloadRequests, [{ href: "blob:5e-project", download: "physics_drawing.5e" }]);
  assert.equal(harness.downloads.length, 0, "the temporary browser download anchor is removed after click");
  assert.deepEqual(harness.marks, [{ token: "before-save", kind: "download" }]);
});
