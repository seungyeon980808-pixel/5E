const assert = require("node:assert/strict");
const test = require("node:test");

const projectIo = import("../js/project-io.js");
const storeModule = import("../js/store.js");

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.listeners = new Map();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.files = [];
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    const dispatched = { target: this, ...event };
    for (const listener of this.listeners.get(type) || []) listener(dispatched);
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    }
  }

  querySelectorAll(selector) {
    if (selector !== ".modal-btn") return [];
    if (!this.dialogButtons) {
      this.dialogButtons = [0, 1].map((index) => {
        const button = new FakeElement("button");
        button.dataset.i = String(index);
        return button;
      });
    }
    return this.dialogButtons;
  }

  querySelector(selector) {
    if (selector === ".modal-btn:last-child") return this.querySelectorAll(".modal-btn")[1];
    return null;
  }

  click() {
    this.dispatch("click", { stopPropagation() {} });
  }

  focus() {
    if (this.tagName === "BUTTON") this.click();
  }

  closest() {
    return null;
  }

  setAttribute() {}
}

function installBrowser() {
  const created = [];
  const body = new FakeElement("body");
  globalThis.document = {
    body,
    createElement(tagName) {
      const element = new FakeElement(tagName);
      created.push(element);
      return element;
    },
    getElementById() { return null; },
  };
  globalThis.window = { addEventListener() {} };
  globalThis.alert = () => {};
  globalThis.FileReader = class {
    readAsText(file) {
      this.result = file.contents;
      this.onload();
    }
  };
  return { body, created };
}

function projectFixture() {
  return {
    version: "0.17",
    activePageId: "page-open",
    rootExtension: { source: "drop-test" },
    pages: [{
      id: "page-open",
      name: "Opened",
      meta: { number: "7", points: "3" },
      pageExtension: { layout: "extension" },
      objects: [{ id: "line-open", type: "line", objectExtension: { future: true } }],
      guides: [],
      layers: [{ id: 1, name: "Layer", visible: true }],
      artboard: { w: 90, h: 60 },
    }],
  };
}

async function openThrough(entrypoint, project) {
  const [{ initProjectIO, serialize }, { createStore }] = await Promise.all([projectIo, storeModule]);
  const browser = installBrowser();
  const state = createStore({ activeLayerId: 1 });
  const svg = new FakeElement("svg");
  const file = { name: "roundtrip.5e", type: "", contents: JSON.stringify(project) };
  initProjectIO(state, svg);

  if (entrypoint === "picker") {
    const picker = browser.created.find((element) => element.accept === ".5e,.json,application/json");
    picker.files = [file];
    picker.dispatch("change");
  } else {
    svg.dispatch("drop", { preventDefault() {}, dataTransfer: { files: [file] } });
  }
  await new Promise((resolve) => setImmediate(resolve));
  return JSON.parse(JSON.stringify(serialize(state.get())));
}

test("loads a confirmed dropped project identically to the file picker", async (context) => {
  // Given
  const previousGlobals = {
    alert: globalThis.alert,
    document: globalThis.document,
    FileReader: globalThis.FileReader,
    window: globalThis.window,
  };
  context.after(() => Object.assign(globalThis, previousGlobals));
  const project = projectFixture();

  // When
  const picked = await openThrough("picker", project);
  const dropped = await openThrough("drop", project);

  // Then
  assert.deepEqual(dropped, picked);
});
