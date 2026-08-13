const assert = require("node:assert/strict");
const test = require("node:test");

class Element {
  constructor(tagName = "DIV") { this.tagName = tagName; this.children = []; this.style = {};
    this.classList = { toggle() {} }; this.hidden = false; this.disabled = false; this.isConnected = true; this.textContent = ""; this.listeners = new Map(); }
  addEventListener(type, listener, options = {}) { this.listeners.set(type, [...(this.listeners.get(type) || []), { listener, once: options.once }]); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter((entry) => entry.listener !== listener)); }
  dispatch(type, values = {}) { for (const entry of [...(this.listeners.get(type) || [])]) { entry.listener({ target: this, preventDefault() {}, ...values }); if (entry.once) this.removeEventListener(type, entry.listener); } }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = String(value); }
  removeAttribute(name) { delete this[name]; }
  focus() { this.focused = true; }
}

function pagePixels() {
  const width = 100, height = 140, data = new Uint8ClampedArray(width * height * 4).fill(255);
  const fill = (left, top, right, bottom) => {
    for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
      const offset = (y * width + x) * 4; data[offset] = data[offset + 1] = data[offset + 2] = 0; data[offset + 3] = 255;
    }
  };
  fill(8, 12, 80, 16); fill(35, 42, 88, 45); fill(35, 80, 88, 83); fill(35, 42, 38, 83); fill(85, 42, 88, 83);
  return { data, width, height };
}

function fixture() {
  const workspace = new Element(), wrap = new Element(), image = new Element("IMG");
  image.clientWidth = image.naturalWidth = 100; image.clientHeight = image.naturalHeight = 140;
  image.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 140 });
  const masks = Array.from({ length: 4 }, () => new Element()), selection = new Element();
  wrap.querySelector = (selector) => selector === "img" ? image : selector === ".ai-pdf-crop-selection" ? selection : null;
  wrap.querySelectorAll = () => masks; wrap.setPointerCapture = () => {};
  const preview = new Element(), previewCanvas = new Element("CANVAS"), previewLabel = new Element();
  preview.querySelector = (selector) => selector === "canvas" ? previewCanvas : selector === "span" ? previewLabel : null;
  previewCanvas.getContext = () => ({ drawImage() {} }); previewCanvas.toDataURL = () => "data:image/png;base64,CROP";
  const controls = Object.fromEntries(["empty","title","crop","whole","apply","resultTitle","resultList","dimensions","question","figure"]
    .map((name) => [name, new Element(name.includes("crop") || name === "question" || name === "figure" ? "BUTTON" : "DIV")]));
  const selectors = new Map([
    ["[data-ai-pdf-page-empty]", controls.empty], ["[data-ai-pdf-page-wrap]", wrap], ["[data-ai-pdf-page-title]", controls.title],
    ["[data-ai-pdf-crop-toggle]", controls.crop], ["[data-ai-pdf-add-whole]", controls.whole], ["[data-ai-pdf-add-crop]", controls.apply],
    ["[data-ai-pdf-result-title]", controls.resultTitle], ["[data-ai-pdf-result-list]", controls.resultList], ["[data-ai-pdf-crop-dimensions]", controls.dimensions],
    ["[data-ai-pdf-suggest-question]", controls.question], ["[data-ai-pdf-suggest-figure]", controls.figure], ["[data-ai-pdf-crop-preview]", preview],
  ]);
  workspace.querySelector = (selector) => selectors.get(selector) || null;
  return { root: { querySelector: () => workspace }, image, selection, preview, controls };
}

test("a suggested figure remains editable and local until the explicit crop confirmation", async () => {
  const previous = { window: global.window, document: global.document, requestAnimationFrame: global.requestAnimationFrame };
  const dom = fixture(), additions = [];
  global.window = { addEventListener() {}, removeEventListener() {} };
  global.requestAnimationFrame = (callback) => callback();
  global.document = { createElement: (tagName) => {
    const element = new Element(tagName.toUpperCase());
    if (tagName === "canvas") { element.getContext = () => ({ drawImage() {}, getImageData: pagePixels }); element.toDataURL = () => "data:image/png;base64,CROP"; }
    return element;
  } };
  try {
    const { createPdfWorkspace } = await import("../js/ai-pdf-workspace.js");
    const state = { visible: true, results: [{ id: "p1", kind: "pdf-page", name: "시험.pdf", pageNumber: 1, matchPercent: 100 }], searchQuery: "", hasFolder: true, indexing: false };
    let api = createPdfWorkspace({ root: dom.root, loadPreview: async () => "data:image/png;base64,PAGE", onSelect: () => api.render(state), onAddCrop: (crop) => additions.push(crop) });
    api.render(state); dom.controls.resultList.children[0].onclick(); await new Promise((resolve) => setImmediate(resolve)); dom.image.dispatch("load");
    assert.equal(dom.controls.figure.disabled, false);

    dom.controls.figure.onclick();
    assert.equal(additions.length, 0);
    assert.equal(dom.selection.style.display, "block");
    assert.equal(dom.preview.hidden, false);
    assert.equal(dom.controls.apply.disabled, false);

    dom.controls.apply.onclick();
    assert.equal(additions.length, 1);
    assert.match(additions[0].name, /도판 영역/);
  } finally { Object.assign(global, previous); }
});
