const path = require("node:path");
const { pathToFileURL } = require("node:url");

function importFixture(relativePath) {
  return import(pathToFileURL(path.join(__dirname, "..", "..", relativePath)).href);
}

function appendControl(document, parent, tagName, dataAttribute, value) {
  const element = document.createElement(tagName);
  element.type = tagName === "button" ? "button" : element.type;
  if (dataAttribute) element.setAttribute(dataAttribute, value ?? "");
  parent.appendChild(element);
  return element;
}

function appendChoices(document, panel, className, attribute, values) {
  const group = document.createElement("div");
  group.className = className;
  panel.appendChild(group);
  return Object.fromEntries(values.map((value) => [
    value,
    appendControl(document, group, "button", attribute, value),
  ]));
}

function createImageDataUrl(encodeTestRgbaPng) {
  const width = 5;
  const height = 5;
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data.set([255, 255, 255, 255], index);
  }
  data.set([0, 0, 0, 255], (2 * width + 2) * 4);
  const png = encodeTestRgbaPng({ width, height, data });
  return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
}

async function installQualityPanelFixture() {
  const [{ installAiPanelBrowserFixture }, { encodeTestRgbaPng }] = await Promise.all([
    importFixture("tests/helpers/ai-panel-browser-fixture.mjs"),
    importFixture("tests/helpers/scoped-edit-png-fixture.mjs"),
  ]);
  const browser = installAiPanelBrowserFixture();
  const { document, panel } = browser;
  const mode = appendChoices(document, panel, "ai-mode-row", "data-ai-mode", ["diagram", "complete"]);
  const quality = appendChoices(document, panel, "ai-quality-row", "data-ai-quality", ["simple", "standard", "complex"]);
  const output = appendChoices(document, panel, "ai-output-row", "data-ai-output-engine", ["raster", "asset"]);
  const batch = appendControl(document, panel, "button", "data-ai-batch");
  const batchSummary = appendControl(document, panel, "span", "data-ai-batch-summary");
  const batchPanel = appendControl(document, panel, "section", "data-ai-batch-panel");
  const batchGrid = appendControl(document, batchPanel, "div", "data-ai-batch-grid");
  batchPanel.hidden = true;

  return {
    ...browser,
    imageDataUrl: createImageDataUrl(encodeTestRgbaPng),
    controls: { mode, quality, output, batch, batchSummary, batchPanel, batchGrid },
  };
}

function completeImageTurn(desktop, request, imageDataUrl) {
  // The request observer fires inside send(); server events arrive after the
  // panel has consumed that send result and registered its turn identity.
  queueMicrotask(() => {
    desktop.emit({
      method: "item/completed",
      params: { turnId: request.turnId, item: { type: "imageGeneration", imageDataUrl } },
    });
    desktop.emit({
      method: "turn/completed",
      params: { turn: { id: request.turnId, status: "completed", error: null } },
    });
  });
}

module.exports = { completeImageTurn, installQualityPanelFixture };
