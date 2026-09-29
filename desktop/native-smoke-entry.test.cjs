const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const vm = require("node:vm");

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

async function captureDesktopSmokeScript() {
  const originalLoad = Module._load;
  const originalSmokeTest = process.env.FIVE_E_SMOKE_TEST;
  let readyCallback;
  let didFinishLoad;
  let smokeScript;
  class FakeBrowserWindow {
    static getAllWindows() { return []; }
    constructor() {
      this.webContents = {
        once(event, callback) { if (event === "did-finish-load") didFinishLoad = callback; },
        setWindowOpenHandler() {},
        on() {},
        async executeJavaScript(source) { smokeScript = source; return {}; },
      };
    }
    isDestroyed() { return false; }
    isMenuBarVisible() { return true; }
    loadFile() {}
    on() {}
    once() {}
    setMenu() {}
    setMenuBarVisibility() {}
    show() {}
  }
  Module._load = function load(request, parent, isMain) {
    if (request === "electron") {
      return {
        app: {
          dock: { setIcon() {} },
          exit() {},
          on() {},
          whenReady: () => ({ then(callback) { readyCallback = callback; } }),
        },
        BrowserWindow: FakeBrowserWindow,
        ipcMain: { handle() {} },
        shell: {},
        Menu: { setApplicationMenu() {} },
        desktopCapturer: {},
        dialog: {},
        nativeImage: { createFromPath: () => ({ isEmpty: () => false }) },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  process.env.FIVE_E_SMOKE_TEST = "1";
  try {
    delete require.cache[require.resolve("./main.cjs")];
    require("./main.cjs");
    readyCallback();
    await didFinishLoad();
    return smokeScript;
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("./main.cjs")];
    if (originalSmokeTest === undefined) delete process.env.FIVE_E_SMOKE_TEST;
    else process.env.FIVE_E_SMOKE_TEST = originalSmokeTest;
  }
}

async function executeDesktopSmokeContractProbe(probe) {
  const smokeScript = await captureDesktopSmokeScript();
  assert.equal(typeof smokeScript, "string", "the production executeJavaScript payload is captured as source text");
  assert.ok(smokeScript.length > 0, "the production executeJavaScript payload is non-empty before execution");
  class ProbePointerEvent {
    constructor(type, init = {}) {
      Object.assign(this, { type, isPrimary: false, pointerType: "", button: 0, buttons: 0 }, init);
    }
  }
  const context = {
    __FIVE_E_SMOKE_CONTRACT_PROBE__: probe,
    PointerEvent: ProbePointerEvent,
    getComputedStyle(element) { return element.computedStyle; },
    innerWidth: 1600,
    innerHeight: 1000,
    requestAnimationFrame(callback) { callback(); },
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  return new vm.Script(smokeScript, { filename: "packaged-smoke-renderer.js" }).runInNewContext(context);
}

async function loadPlatformTestSeam() {
  const source = fs.readFileSync(path.join(__dirname, "..", "preview", "js", "platform.js"), "utf8")
    .replace(/^import .*preview-storage\.js[^;]+;$/m, "const previewStorage = { getItem() { return null; }, setItem() {} };");
  const original = {
    navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
    document: Object.getOwnPropertyDescriptor(globalThis, "document"),
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    CustomEvent: Object.getOwnPropertyDescriptor(globalThis, "CustomEvent"),
  };
  Object.defineProperties(globalThis, {
    navigator: { configurable: true, value: { platform: "MacIntel" } },
    document: { configurable: true, value: { documentElement: { setAttribute() {} } } },
    window: { configurable: true, value: { dispatchEvent() {} } },
    CustomEvent: { configurable: true, value: class CustomEvent {} },
  });
  const restore = () => {
    for (const [name, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
  return {
    platform: await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#native-smoke-shortcut`),
    restore,
  };
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
  assert.match(mainSource, /panel\?\.querySelector\('\[data-ai-source-action="library"\]'\)/);
  assert.match(mainSource, /document\.querySelector\("\.unified-library-overlay:not\(\[hidden\]\)"\)/);
  assert.match(mainSource, /document\.querySelector\("\[data-unilib-close\]"\)\?\.click\(\)/);
  assert.match(mainSource, /document\.querySelector\("\[data-unilib-query\]"\)/);
  assert.doesNotMatch(mainSource, /\.ai-file-button input\[type=file\]/);
  assert.doesNotMatch(mainSource, /document\.querySelector\("\.ai-reference-search-dialog"\)/);
  assert.match(mainSource, /import\("\.\/js\/state\.js\?v=1\.7\.0-preview-0930"\)/);
  assert.doesNotMatch(mainSource, /ctrlKey: true, metaKey: true/);
  assert.match(mainSource, /navigator\.userAgentData\?\.platform \|\| navigator\.platform/);
  assert.match(mainSource, /\.\.\.shortcutModifiersForPlatform\(shortcutPlatform\)/);
});

test("packaged smoke uses only the platform-primary delayed-cut modifier", async (context) => {
  const { shortcutModifiersForPlatform } = loadMainTestSeam();
  const { platform, restore } = await loadPlatformTestSeam();
  context.after(restore);

  for (const [configuration, runtimePlatform, primary, nonPrimary] of [
    ["mac", "MacIntel", { metaKey: true }, { ctrlKey: true }],
    ["windows", "Win32", { ctrlKey: true }, { metaKey: true }],
  ]) {
    platform.setShortcutPlatform(configuration);
    assert.deepEqual(shortcutModifiersForPlatform(runtimePlatform), primary,
      `${configuration} smoke input contains only its primary modifier`);
    assert.equal(Boolean(platform.modKey(primary)), true,
      `${configuration} accepts its primary modifier`);
    assert.equal(Boolean(platform.modKey(nonPrimary)), false,
      `${configuration} rejects its non-primary modifier alone`);
  }
});

test("packaged smoke renderer payload compiles after production substitutions", async () => {
  const smokeScript = await captureDesktopSmokeScript();
  assert.doesNotThrow(
    () => new vm.Script(smokeScript, { filename: "packaged-smoke-renderer.js" }),
    "the exact executeJavaScript payload must remain syntactically valid after fixture and platform substitutions",
  );
});

test("packaged smoke generated payload drives current native geometry and public controls", async () => {
  let attached = false;
  let areaActive = false;
  let commentReady = false;
  const pointerTargets = [];
  const stageListeners = new Map();
  const stage = {
    classList: { contains(name) { return name === "is-annotating" && areaActive; } },
    addEventListener(type, listener) { stageListeners.set(type, listener); },
    dispatchEvent(event) {
      event.target = stage;
      pointerTargets.push({ type: event.type, target: "stage", isPrimary: event.isPrimary,
        pointerType: event.pointerType, button: event.button, buttons: event.buttons });
      stageListeners.get(event.type)?.(event);
    },
    setPointerCapture() {},
  };
  const imageRect = { left: 200, top: 200, width: 600, height: 300, right: 800, bottom: 500 };
  const image = {
    closest(selector) { return selector === ".ai-preview-stage" ? stage : null; },
    getBoundingClientRect() { return imageRect; },
    dispatchEvent(event) {
      event.target = image;
      pointerTargets.push({ type: event.type, target: "image", isPrimary: event.isPrimary,
        pointerType: event.pointerType, button: event.button, buttons: event.buttons });
      stageListeners.get(event.type)?.(event);
    },
  };
  let dragStart = false;
  stageListeners.set("pointerdown", event => {
    if (areaActive && event.target === image && event.isPrimary !== false && event.button === 0) dragStart = true;
  });
  stageListeners.set("pointermove", () => {});
  stageListeners.set("pointerup", () => { if (dragStart) commentReady = true; });

  const overlayRect = { left: 0, top: 30, width: 1600, height: 970 };
  const modalRect = { left: 6, top: 36, width: 1588, height: 958 };
  const modal = { getBoundingClientRect() { return modalRect; } };
  const conversionOptions = { open: false };
  const rasterButton = {
    hidden: false,
    computedStyle: { display: "none", visibility: "visible", opacity: "1" },
    getBoundingClientRect() { return attached ? { left: 1100, top: 300, width: 100, height: 30, right: 1200, bottom: 330 } : { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }; },
    scrollIntoView() {},
  };
  const areaTool = { click() { areaActive = true; } };
  const panel = {
    classList: { contains(name) { return name === "modal-overlay"; } },
    getBoundingClientRect() { return overlayRect; },
    querySelector(selector) {
      if (selector === ".modal-ai") return modal;
      if (selector === ".ai-conversion-options") return conversionOptions;
      if (selector === '[data-ai-output-engine="raster"]') return rasterButton;
      if (selector === '[data-ai-comment-tool="area"]') return areaTool;
      if (selector === '[data-ai-comment-row]') return commentReady ? {} : null;
      return null;
    },
    querySelectorAll(selector) { return selector === "[data-ai-reference-id]" && attached ? [{}] : []; },
  };

  const result = await executeDesktopSmokeContractProbe({
    panel,
    image,
    pointerTargets,
    attachFixture() {
      attached = true;
      rasterButton.computedStyle.display = "block";
    },
  });

  const observed = JSON.parse(JSON.stringify(result));
  assert.equal(observed.aiUsesCentralModal, true);
  assert.equal(observed.aiPublicRasterVisible, true);
  assert.equal(observed.aiAreaCommentReady, true,
    "the generated smoke payload must create a comment through the production primary-pointer guard");
  assert.deepEqual(observed.pointerTargets, [
    { type: "pointerdown", target: "image", isPrimary: true, pointerType: "mouse", button: 0, buttons: 1 },
    { type: "pointermove", target: "stage", isPrimary: true, pointerType: "mouse", button: 0, buttons: 1 },
    { type: "pointerup", target: "stage", isPrimary: true, pointerType: "mouse", button: 0, buttons: 0 },
  ], "the generated smoke payload uses a realistic primary mouse lifecycle");
});
