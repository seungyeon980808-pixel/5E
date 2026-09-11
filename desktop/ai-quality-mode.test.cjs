const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const { assertResolvedContracts } = require("./test-fixtures/ai-prompt-contract.cjs");
const {
  completeImageTurn,
  installQualityPanelFixture,
} = require("./test-fixtures/ai-quality-panel-fixture.cjs");

let importSerial = 0;
let panelModulePromise;

async function importLocal(name) {
  const url = pathToFileURL(path.join(__dirname, "..", "js", name));
  url.searchParams.set("test", String(++importSerial));
  return import(url.href);
}

function loadPanelModule() {
  panelModulePromise ||= importLocal("ai-panel.js");
  return panelModulePromise;
}

async function openPanel() {
  const [{ initAiPanel }, browser] = await Promise.all([
    loadPanelModule(),
    installQualityPanelFixture(),
  ]);
  const stateValue = {
    objects: [],
    selectedIds: [],
    activePageId: "page-1",
    activeLayerId: "layer-1",
    artboard: { width: 100, height: 100 },
  };
  const manager = initAiPanel({ get: () => stateValue });
  assert.ok(manager);
  await manager.open();
  return { browser, manager };
}

function closePanel({ browser, manager }) {
  manager.close();
  browser.restore();
}

test("quality and output choices expose stable machine contracts", async () => {
  const modes = await importLocal("ai-quality-mode.js");
  const qualityModes = ["simple", "standard", "complex"];

  assert.deepEqual(Object.values(modes.AI_QUALITY_MODES), qualityModes);
  assert.deepEqual(Object.values(modes.AI_OUTPUT_ENGINES), ["raster", "asset"]);
  assert.deepEqual(
    Object.fromEntries(qualityModes.map((mode) => [mode, {
      id: modes.QUALITY_MODE_PROFILES[mode].id,
      correctionPasses: modes.QUALITY_MODE_PROFILES[mode].correctionPasses,
    }])),
    {
      simple: { id: "simple", correctionPasses: 0 },
      standard: { id: "standard", correctionPasses: 0 },
      complex: { id: "complex", correctionPasses: 1 },
    },
  );
  assert.equal(Object.isFrozen(modes.QUALITY_MODE_PROFILES), true);
  assert.equal(qualityModes.every((mode) => Object.isFrozen(modes.QUALITY_MODE_PROFILES[mode])), true);

  assert.equal(modes.normalizeQualityMode("simple"), "simple");
  assert.equal(modes.normalizeQualityMode("complex"), "complex");
  assert.equal(modes.normalizeQualityMode("unknown"), "standard");
  assert.equal(modes.normalizeOutputEngine("asset"), "asset");
  assert.equal(modes.normalizeOutputEngine("automatic"), "raster");
  assert.deepEqual(qualityModes.map(modes.qualityModeCacheVersion), [
    "quality-simple-v2",
    "quality-standard-v2",
    "quality-complex-v2",
  ]);

  const firstPassRules = qualityModes.map((mode) => modes.qualityModeRule(mode));
  assert.equal(new Set(firstPassRules).size, qualityModes.length);
  assert.equal(modes.qualityModeRule("unknown"), firstPassRules[1]);
  assert.equal(modes.qualityModeRule("simple", { revision: true }), firstPassRules[0]);
  assert.equal(modes.qualityModeRule("standard", { revision: true }), firstPassRules[1]);
  assert.notEqual(modes.qualityModeRule("complex", { revision: true }), firstPassRules[2]);
});

test("exam palette removes color and keeps only black, gray and white", async () => {
  const { quantizeExamLineart } = await importLocal("image-background.js");
  const rgba = new Uint8ClampedArray([
    255, 0, 0, 255,
    20, 190, 80, 255,
    250, 250, 250, 255,
    40, 40, 40, 0,
  ]);
  quantizeExamLineart(rgba);
  for (let index = 0; index < rgba.length; index += 4) {
    if (rgba[index + 3] === 0) continue;
    assert.equal(rgba[index], rgba[index + 1]);
    assert.equal(rgba[index + 1], rgba[index + 2]);
    assert.ok([0, 176, 255].includes(rgba[index]));
  }
});

test("AI panel exposes three modes, explicit output engines, and one-source task tabs", () => {
  const html = require("node:fs").readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const panel = require("node:fs").readFileSync(path.join(__dirname, "..", "js", "ai-panel.js"), "utf8");
  for (const mode of ["simple", "standard", "complex"]) assert.match(html, new RegExp(`data-ai-quality="${mode}"`));
  assert.match(html, /data-ai-output-engine="raster"/);
  assert.match(html, /data-ai-output-engine="asset"/);
  assert.doesNotMatch(html, /data-ai-batch/);
  assert.match(html, /data-ai-tab-list/);
  assert.match(html, /data-ai-output-processing/);
  assert.match(panel, /distributeSourcesToTaskTabs/);
  assert.match(panel, /sourceReferenceId/);
  assert.doesNotMatch(panel, /createStructureLockedLineart/);
  assert.match(panel, /복잡 변환 완료 · 원본 구조 확인 필요/);
  assert.match(panel, /AI_OUTPUT_ENGINES\.RASTER/);
});

test("AI panel choices update machine-readable DOM and persisted state", async () => {
  const context = await openPanel();
  const { browser } = context;
  const { controls, panel, storage } = browser;
  try {
    controls.mode.complete.click();
    const qualityButtons = panel.querySelectorAll("[data-ai-quality]");
    assert.deepEqual(qualityButtons.map((button) => button.dataset.aiQuality), ["simple", "standard", "complex"]);
    for (const selected of ["simple", "standard", "complex"]) {
      controls.quality[selected].click();
      assert.equal(storage.getItem("5e.aiQualityMode"), selected);
      assert.deepEqual(
        qualityButtons.map((button) => button.getAttribute("aria-pressed")),
        qualityButtons.map((button) => String(button.dataset.aiQuality === selected)),
      );
    }

    const outputButtons = panel.querySelectorAll("[data-ai-output-engine]");
    assert.deepEqual(outputButtons.map((button) => button.dataset.aiOutputEngine), ["raster", "asset"]);
    for (const selected of ["asset", "raster"]) {
      controls.output[selected].click();
      assert.equal(storage.getItem("5e.aiOutputEngine"), selected);
      assert.deepEqual(
        outputButtons.map((button) => button.getAttribute("aria-pressed")),
        outputButtons.map((button) => String(button.dataset.aiOutputEngine === selected)),
      );
    }

    const tabs = panel.querySelector("[data-ai-tab-list]").children;
    assert.equal(tabs.length, 1);
    assert.equal(tabs[0].getAttribute("role"), "tab");
    assert.equal(tabs[0].getAttribute("aria-selected"), "true");
  } finally {
    closePanel(context);
  }
});

test("complex raster completion executes exactly one correction pass and requires review", async () => {
  const context = await openPanel();
  const { browser } = context;
  const { controls, desktop, imageDataUrl, panel } = browser;
  try {
    controls.mode.complete.click();
    controls.quality.complex.click();
    controls.output.raster.click();
    panel.querySelector("[data-ai-input]").value = "COMPLEX_REQUEST_SENTINEL";

    const firstSendReady = desktop.waitForSend(0);
    panel.querySelector("[data-ai-send]").click();
    const first = await firstSendReady;
    assert.equal(first.payload.purpose, "image");
    assertResolvedContracts(first.payload.text, {
      operation: "generate",
      backgroundPolicy: "white",
      arrowPolicy: "scientific-only",
    });

    const correctionSendReady = desktop.waitForSend(1);
    completeImageTurn(desktop, first, imageDataUrl);
    const correction = await correctionSendReady;
    assert.equal(correction.payload.purpose, "image");
    assert.ok(correction.payload.attachments.length > 0);
    assertResolvedContracts(correction.payload.text, {
      operation: "transform",
      backgroundPolicy: "preserve",
      arrowPolicy: "scientific-only",
    });

    const settled = browser.document.waitForState(() => panel.dataset.aiBusy === "false");
    completeImageTurn(desktop, correction, imageDataUrl);
    await settled;
    assert.equal(desktop.sends.length, 2);
    assert.equal(panel.querySelectorAll(".ai-generated-card").length, 2);
    assert.equal(panel.querySelector("[data-ai-status]").dataset.kind, "warn");
    assert.equal(panel.querySelector("[data-ai-tab-list] .ai-task-tab").dataset.workState, "completed");
  } finally {
    closePanel(context);
  }
});
