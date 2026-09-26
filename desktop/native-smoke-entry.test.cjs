const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function loadMainTestSeam() {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === "electron") {
      return {
        app: { whenReady: () => ({ then() {} }), on() {} },
        BrowserWindow: function BrowserWindow() {},
        ipcMain: { handle() {} },
        shell: {},
        Menu: {},
        desktopCapturer: {},
        dialog: {},
        nativeImage: {},
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve("./main.cjs")];
    return require("./main.cjs");
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("./main.cjs")];
  }
}

test("packaged smoke accepts the legacy empty primary scope without weakening sender trust", () => {
  const { createSmokeFixtureTurn, isValidSmokeFixtureRequest } = loadMainTestSeam();
  assert.equal(typeof isValidSmokeFixtureRequest, "function", "main process exposes the smoke request validation seam");

  const expectedUrl = pathToFileURL(path.join(__dirname, "..", "preview", "index.html")).href;
  const mainFrame = { url: expectedUrl };
  const webContents = { mainFrame };
  const expectedWindow = { isDestroyed: () => false, webContents };
  const trustedEvent = { sender: webContents, senderFrame: mainFrame };

  assert.equal(isValidSmokeFixtureRequest(trustedEvent, { clientScope: "" }, expectedWindow), true,
    "the supported legacy primary workspace reaches the packaged fixture");
  assert.equal(isValidSmokeFixtureRequest({ ...trustedEvent, senderFrame: { url: expectedUrl } }, { clientScope: "" }, expectedWindow), false,
    "a lookalike frame remains untrusted");
  assert.equal(isValidSmokeFixtureRequest(trustedEvent, {}, expectedWindow), false,
    "missing correlation scope is rejected");
  assert.equal(isValidSmokeFixtureRequest(trustedEvent, { clientScope: "x".repeat(257) }, expectedWindow), false,
    "oversized correlation scope is rejected");

  const fixture = createSmokeFixtureTurn({ clientScope: "" }, 1, "data:image/png;base64,fixture");
  assert.deepEqual(fixture.response, { turnId: "smoke-fixture-1", renderThreadId: "smoke-render-1" });
  assert.deepEqual(fixture.events.map(({ clientScope, method }) => ({ clientScope, method })), [
    { clientScope: "", method: "item/completed" },
    { clientScope: "", method: "turn/completed" },
  ], "controlled native fixture events preserve the empty primary-scope correlation");
  assert.equal(fixture.events[0].params.item.type, "imageGeneration");
  assert.equal(fixture.events[1].params.turn.id, fixture.response.turnId);
});

test("packaged smoke dismisses the first-run tutorial through its public skip control", () => {
  const mainSource = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const tutorialSource = fs.readFileSync(path.join(__dirname, "..", "preview", "js", "tutorial.js"), "utf8");
  assert.match(tutorialSource, /class="tut-btn tut-banner-no">건너뛰기<\/button>/,
    "the first-run tutorial exposes a public dismissal control");
  assert.match(mainSource, /document\.querySelector\("\.tut-welcome-overlay \.tut-banner-no"\)\?\.click\(\)/,
    "the packaged smoke uses the product dismissal control");
  assert.doesNotMatch(mainSource, /localStorage\.setItem\([^\n]*tutorial\.bannerSeen/,
    "the packaged smoke does not bypass first-run state through preferences");
});

test("packaged smoke follows the current source, library, state, and platform shortcut contracts", () => {
  const mainSource = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  assert.match(mainSource, /panel\?\.querySelector\("\[data-ai-source-file\]"\)/);
  assert.match(mainSource, /panel\?\.querySelector\("\[data-ai-source-action=\\"library\\"\]"\)/);
  assert.match(mainSource, /document\.querySelector\("\.unified-library-overlay:not\(\[hidden\]\)"\)/);
  assert.match(mainSource, /document\.querySelector\("\[data-unilib-close\]"\)\?\.click\(\)/);
  assert.match(mainSource, /document\.querySelector\("\[data-unilib-query\]"\)/);
  assert.doesNotMatch(mainSource, /\.ai-file-button input\[type=file\]/);
  assert.doesNotMatch(mainSource, /document\.querySelector\("\.ai-reference-search-dialog"\)/);
  assert.match(mainSource, /import\("\.\/js\/state\.js\?v=1\.6\.0-preview-labeler-0917-1111"\)/);
  assert.match(mainSource, /ctrlKey: true, metaKey: true/);
});
