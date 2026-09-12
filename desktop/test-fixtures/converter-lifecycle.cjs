const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "../..");

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = "";
    this.textContent = "";
    this.files = [];
    this.clientWidth = 800;
    this.clientHeight = 400;
    this.listeners = new Map();
    this.style = {};
    this.classList = {
      add() {},
      remove() {},
      toggle() {},
    };
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) || []) listener(event);
  }

  click() {
    this.dispatchEvent({ type: "click", target: this, preventDefault() {}, stopPropagation() {} });
  }

  appendChild() {}
  focus() {}
  remove() {}
  setAttribute() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 1, height: 1 }; }
}

class FakeCanvas extends FakeElement {
  constructor(id = "") {
    super(id);
    this.width = 1;
    this.height = 1;
  }

  getContext() {
    return {
      drawImage() {},
      fillRect() {},
      getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
    };
  }
}

const selectorIds = [
  "objectify-file",
  "objectify-dropzone",
  "objectify-preview",
  "objectify-legend",
  "objectify-legend-body",
  "objectify-status",
  "objectify-analyze",
  "objectify-insert",
  "objectify-removegrid",
  "objectify-graylevels",
  "objectify-reference",
  "objectify-advanced",
  "objectify-dilate",
  "objectify-minarea",
  "objectify-textsize",
  "objectify-eps",
  "objectify-stage",
  "objectify-tools",
  "objectify-zoom-reset",
  "objectify-region",
  "objectify-tool-hint",
  "objectify-cancel",
  "objectify-dilate-value",
  "objectify-minarea-value",
  "objectify-textsize-value",
  "objectify-eps-value",
];

const elements = new Map(selectorIds.map((id) => [
  id,
  id === "objectify-preview" ? new FakeCanvas(id) : new FakeElement(id),
]));
elements.get("objectify-graylevels").checked = true;
elements.get("objectify-dilate").value = "3";
elements.get("objectify-minarea").value = "25";
elements.get("objectify-textsize").value = "55";
elements.get("objectify-eps").value = "12";

const overlay = new FakeElement("objectify-overlay");
overlay.hidden = true;
overlay.querySelector = (selector) => {
  if (selector === 'input[name="objectify-textmode"]:checked') {
    const radio = new FakeElement("text-mode");
    radio.value = "image";
    return radio;
  }
  return elements.get(selector.replace(/^#/, "")) || new FakeElement(selector);
};

const openButton = new FakeElement("image-objectify-open");
const documentListeners = new Map();
const windowListeners = new Map();
function addListener(registry, type, listener) {
  const listeners = registry.get(type) || [];
  listeners.push(listener);
  registry.set(type, listeners);
}
function dispatch(registry, type) {
  for (const listener of registry.get(type) || []) {
    listener({ type, target: null, preventDefault() {}, stopPropagation() {} });
  }
}

class HeldWorker {
  static instances = [];

  constructor() {
    this.terminated = false;
    this.messages = [];
    HeldWorker.instances.push(this);
    queueMicrotask(() => this.onmessage?.({ data: { type: "ready" } }));
  }

  postMessage(message, transfer) {
    this.messages.push({ message, transfer });
  }

  terminate() {
    this.terminated = true;
  }

  respond(data) {
    this.onmessage?.({ data });
  }
}

class FakeFileReader {
  readAsDataURL() {
    this.result = "data:image/png;base64,AQID";
    queueMicrotask(() => this.onload?.());
  }
}

class FakeImage {
  constructor() {
    this.naturalWidth = 1;
    this.naturalHeight = 1;
  }

  set src(_value) {
    queueMicrotask(() => this.onload?.());
  }
}

const sandbox = {
  Array,
  Date,
  Error,
  JSON,
  Map,
  Math,
  Number,
  Object,
  Promise,
  Set,
  String,
  Uint8Array,
  Uint8ClampedArray,
  Worker: HeldWorker,
  FileReader: FakeFileReader,
  Image: FakeImage,
  Path2D: class {},
  MAX_PROCESS_DIMENSION: 2000,
  DEFAULT_TEXT_FONT: "sans-serif",
  analyzeImageData: () => ({ result: { width: 1, height: 1, components: [] }, inkRatio: 0 }),
  applyNewObjectStyleDefaults: (value) => value,
  measureFormula: () => ({ width: 1, height: 1 }),
  setTimeout,
  clearTimeout,
  queueMicrotask,
  console,
  document: {
    head: { appendChild() {} },
    body: { appendChild() {} },
    getElementById(id) {
      if (id === "image-objectify-open") return openButton;
      if (id === "objectify-enh-styles") return null;
      return elements.get(id) || null;
    },
    createElement(tag) {
      if (tag === "div") return overlay;
      if (tag === "canvas") return new FakeCanvas();
      return new FakeElement();
    },
    addEventListener(type, listener) { addListener(documentListeners, type, listener); },
  },
  window: {
    addEventListener(type, listener) { addListener(windowListeners, type, listener); },
  },
};
sandbox.globalThis = sandbox;

const platformSource = fs.readFileSync(path.join(repositoryRoot, "js/platform.js"), "utf8")
  .replace(/^export\s*\{[^}]+\};?\s*$/m, "");
vm.runInNewContext(platformSource, sandbox, { filename: "js/platform.js" });

let controllerSource = fs.readFileSync(path.join(repositoryRoot, "js/image-analysis-controller.js"), "utf8");
controllerSource = controllerSource
  .replace(/^import[^\n]+\n/, "")
  .replace('new URL("./image-analysis-worker.js", import.meta.url)', '"image-analysis-worker.js"')
  .replace(/\bexport\s+/g, "");
controllerSource += "\nglobalThis.createImageAnalysisController = createImageAnalysisController;";
vm.runInNewContext(controllerSource, sandbox, { filename: "js/image-analysis-controller.js" });

let integrationSource = fs.readFileSync(path.join(repositoryRoot, "js/image-objectify.js"), "utf8");
integrationSource = integrationSource
  .replace(/^import[^\n]+\n/gm, "")
  .replace(/\bexport\s+/g, "");
integrationSource += "\nglobalThis.__probe = { initImageObjectify, openObjectifyWithFile };";
vm.runInNewContext(integrationSource, sandbox, { filename: "js/image-objectify.js" });

const state = {
  get: () => ({ activeLayerId: 1 }),
  update() {},
};

async function run() {
  sandbox.__probe.initImageObjectify(state);
  assert.equal(sandbox.__probe.openObjectifyWithFile({ type: "image/png", size: 3 }), true);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const status = elements.get("objectify-status");
  const analyze = elements.get("objectify-analyze");
  const insert = elements.get("objectify-insert");
  const worker = HeldWorker.instances[0];
  const pinned = {
    phase: "active-analysis",
    status: status.textContent,
    analyzeDisabled: analyze.disabled,
    insertDisabled: insert.disabled,
    workerStarted: worker?.messages.length === 1,
    workerTerminated: worker?.terminated === true,
    pagehideListeners: (windowListeners.get("pagehide") || []).length,
    pageshowListeners: (windowListeners.get("pageshow") || []).length,
  };
  console.log(JSON.stringify(pinned));
  assert.match(pinned.status, /분석하는 중/);
  assert.equal(pinned.analyzeDisabled, true);
  assert.equal(pinned.insertDisabled, true);
  assert.equal(pinned.workerStarted, true);

  dispatch(windowListeners, "pagehide");
  dispatch(windowListeners, "pageshow");
  await new Promise((resolve) => setImmediate(resolve));

  const restored = {
    phase: "after-pagehide-pageshow",
    status: status.textContent,
    analyzeDisabled: analyze.disabled,
    insertDisabled: insert.disabled,
    workerTerminated: worker.terminated,
    pagehideListeners: (windowListeners.get("pagehide") || []).length,
    pageshowListeners: (windowListeners.get("pageshow") || []).length,
  };
  console.log(JSON.stringify(restored));
  assert.equal(restored.workerTerminated, true);
  assert.equal(restored.analyzeDisabled, false, "restored converter must expose an actionable Analyze button");
  assert.equal(restored.insertDisabled, true, "a cancelled result must not become insertable after restore");
  assert.equal(restored.status, "분석이 중단되었습니다. 다시 분석하세요.");
  assert.equal(restored.pageshowListeners, 1);

  analyze.click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const retryWorker = HeldWorker.instances[1];
  assert.equal(retryWorker.messages.length, 1, "retry must start fresh worker analysis");
  retryWorker.respond({
    jobId: 2,
    ok: true,
    value: { result: { width: 1, height: 1, components: [] }, inkRatio: 0 },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(analyze.disabled, false, "completed retry must leave Analyze enabled");

  analyze.click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const interruptedRetryWorker = HeldWorker.instances[2];
  assert.equal(interruptedRetryWorker.messages.length, 1, "second retry must begin before repeated suspension");
  dispatch(windowListeners, "pagehide");
  dispatch(windowListeners, "pagehide");
  dispatch(windowListeners, "pageshow");
  const repeatedRestore = {
    phase: "after-repeated-suspension",
    status: status.textContent,
    analyzeDisabled: analyze.disabled,
    insertDisabled: insert.disabled,
    interruptedWorkerTerminated: interruptedRetryWorker.terminated,
  };
  console.log(JSON.stringify(repeatedRestore));
  assert.equal(repeatedRestore.interruptedWorkerTerminated, true);
  assert.equal(repeatedRestore.analyzeDisabled, false);
  assert.equal(repeatedRestore.status, "분석이 중단되었습니다. 다시 분석하세요.");

  interruptedRetryWorker.respond({
    jobId: 3,
    ok: true,
    value: { result: { width: 1, height: 1, components: [{ stale: true }] }, inkRatio: 0 },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(status.textContent, "분석이 중단되었습니다. 다시 분석하세요.", "late stale completion must not replace restored status");
  assert.equal(insert.disabled, true, "late stale completion must not enable Insert");

  analyze.click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const finalRetryWorker = HeldWorker.instances[3];
  assert.equal(finalRetryWorker.messages.length, 1, "retry remains available after stale completion");
  finalRetryWorker.respond({
    jobId: 4,
    ok: true,
    value: { result: { width: 1, height: 1, components: [] }, inkRatio: 0 },
  });
  await new Promise((resolve) => setImmediate(resolve));
  const finalState = {
    phase: "fresh-retry-complete",
    status: status.textContent,
    analyzeDisabled: analyze.disabled,
    insertDisabled: insert.disabled,
    workerCount: HeldWorker.instances.length,
  };
  console.log(JSON.stringify(finalState));
  assert.equal(finalState.analyzeDisabled, false);
  assert.equal(finalState.insertDisabled, true);
  assert.equal(finalState.workerCount, 4);
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
