const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener, options = {}) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ listener, once: Boolean(options?.once) });
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || [])
      .filter((entry) => entry.listener !== listener));
  }
  dispatch(type, values = {}) {
    const event = { target: this, preventDefault() {}, ...values };
    for (const entry of [...(this.listeners.get(type) || [])]) {
      entry.listener(event);
      if (entry.once) this.removeEventListener(type, entry.listener);
    }
  }
}

class FakeElement extends FakeEventTarget {
  constructor(tagName = "DIV") {
    super();
    this.tagName = tagName;
    this.children = [];
    this.style = {};
    this.classList = { toggle() {} };
    this.hidden = false;
    this.disabled = false;
    this.isConnected = true;
    this.textContent = "";
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = String(value); }
  removeAttribute(name) { delete this[name]; }
}

function createWorkspaceDom() {
  const workspace = new FakeElement();
  const empty = new FakeElement();
  const wrap = new FakeElement();
  const image = new FakeElement("IMG");
  const title = new FakeElement();
  const cropButton = new FakeElement("BUTTON");
  const wholeButton = new FakeElement("BUTTON");
  const applyButton = new FakeElement("BUTTON");
  const resultTitle = new FakeElement();
  const resultList = new FakeElement();
  const masks = Array.from({ length: 4 }, () => new FakeElement());
  const selection = new FakeElement();
  image.clientWidth = 100;
  image.clientHeight = 200;
  image.naturalWidth = 1000;
  image.naturalHeight = 2000;
  image.getBoundingClientRect = () => ({ left: 0, top: 0,
    width: image.clientWidth, height: image.clientHeight });
  wrap.querySelector = (selector) => selector === "img" ? image
    : selector === ".ai-pdf-crop-selection" ? selection : null;
  wrap.querySelectorAll = (selector) => selector === ".ai-pdf-crop-mask" ? masks : [];
  wrap.setPointerCapture = () => {};
  const elements = new Map([
    ["[data-ai-pdf-page-empty]", empty], ["[data-ai-pdf-page-wrap]", wrap],
    ["[data-ai-pdf-page-title]", title], ["[data-ai-pdf-crop-toggle]", cropButton],
    ["[data-ai-pdf-add-whole]", wholeButton], ["[data-ai-pdf-add-crop]", applyButton],
    ["[data-ai-pdf-result-title]", resultTitle], ["[data-ai-pdf-result-list]", resultList],
  ]);
  workspace.querySelector = (selector) => elements.get(selector) || null;
  return { root: { querySelector: () => workspace }, workspace, wrap, image, cropButton,
    resultList, selection };
}

test("PDF crop overlay reprojects after every resize and stops after disposal", async () => {
  // Given a selected PDF page with a normalized crop.
  const previous = { window: global.window, document: global.document,
    requestAnimationFrame: global.requestAnimationFrame };
  const windowTarget = new FakeEventTarget();
  const dom = createWorkspaceDom();
  global.window = windowTarget;
  global.document = { createElement: (tagName) => new FakeElement(tagName.toUpperCase()) };
  global.requestAnimationFrame = (callback) => callback();
  try {
    const { createPdfWorkspace } = await import("../js/ai-pdf-workspace.js");
    const state = { visible: true, results: [{ id: "page-1", kind: "pdf-page", name: "lesson.pdf",
      pageNumber: 1, matchPercent: 90 }], searchQuery: "", hasFolder: true, indexing: false };
    let api;
    api = createPdfWorkspace({ root: dom.root, loadPreview: async () => "data:image/png;base64,AA==",
      onSelect: () => api.render(state) });
    api.render(state);
    dom.resultList.children[0].onclick();
    await new Promise((resolve) => setImmediate(resolve));
    dom.image.dispatch("load");
    dom.cropButton.onclick();
    dom.wrap.dispatch("pointerdown", { button: 0, target: dom.image, clientX: 10, clientY: 20, pointerId: 1 });
    dom.wrap.dispatch("pointermove", { target: dom.image, clientX: 50, clientY: 100, pointerId: 1 });
    dom.wrap.dispatch("pointerup", { target: dom.image, pointerId: 1 });

    // When the viewport changes size twice in succession.
    dom.image.clientWidth = 200; dom.image.clientHeight = 400;
    windowTarget.dispatch("resize");
    assert.deepEqual({ left: dom.selection.style.left, top: dom.selection.style.top,
      width: dom.selection.style.width, height: dom.selection.style.height },
    { left: "20px", top: "40px", width: "80px", height: "160px" });
    dom.image.clientWidth = 300; dom.image.clientHeight = 600;
    windowTarget.dispatch("resize");

    // Then the second projection is current, and disposal removes the listener.
    assert.deepEqual({ left: dom.selection.style.left, top: dom.selection.style.top,
      width: dom.selection.style.width, height: dom.selection.style.height },
    { left: "30px", top: "60px", width: "120px", height: "240px" });
    api.dispose();
    dom.image.clientWidth = 400; dom.image.clientHeight = 800;
    windowTarget.dispatch("resize");
    assert.equal(dom.selection.style.left, "30px");
  } finally {
    global.window = previous.window;
    global.document = previous.document;
    global.requestAnimationFrame = previous.requestAnimationFrame;
  }
});

test("closing reference search disposes its PDF workspace", () => {
  // Given the reference-search lifecycle source.
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "ai-reference-search.js"), "utf8");

  // When the close path is inspected.
  const close = source.slice(source.indexOf("function close()"), source.indexOf("async function cachedPages"));

  // Then it tears down the workspace listener before removing the dialog.
  assert.match(close, /pdfWorkspace\?\.dispose\(\)/);
  assert.ok(close.indexOf("pdfWorkspace?.dispose()") < close.indexOf("overlay?.remove()"));
});
