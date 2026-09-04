const assert = require("node:assert/strict");
const test = require("node:test");

function withFakeDocument(callback) {
  const previous = global.document;
  const appended = [];
  global.document = {
    createElement: () => ({ className: "", innerHTML: "" }),
    documentElement: { appendChild: (element) => appended.push(element) },
  };
  return Promise.resolve(callback(appended)).finally(() => { global.document = previous; });
}

test("production reference dialog exposes only the connected PDF and image folder", async () => {
  const { createReferenceDialog } = await import("../js/ai-reference-dialog.js");
  await withFakeDocument(() => {
    const dialog = createReferenceDialog();
    assert.match(dialog.innerHTML, /PDF·이미지 폴더 연결/);
    assert.match(dialog.innerHTML, /<strong>폴더 연결<\/strong>/);
    assert.match(dialog.innerHTML, /연결된 폴더가 없습니다/);
    assert.match(dialog.innerHTML, /data-ai-local-pick/);
    assert.doesNotMatch(dialog.innerHTML, /data-ai-search-source="(?:parts|exam)"/);
    assert.doesNotMatch(dialog.innerHTML, />일러스트 이미지<|>기출문제</);
    assert.match(dialog.innerHTML, />PDF 페이지 추가</);
    assert.match(dialog.innerHTML, />선택 영역을 시험문제용 도판으로 변환</);
    assert.match(dialog.innerHTML, /PDF 원문 검색 결과/);
    assert.match(dialog.innerHTML, /data-ai-pdf-crop-selection[^>]*tabindex="0"/);
    assert.match(dialog.innerHTML, /data-ai-pdf-crop-dimensions[^>]*aria-live="polite"/);
    assert.doesNotMatch(dialog.innerHTML, /교과서/);
  });
});

test("legacy reference sources require an explicit development option", async () => {
  const { createReferenceDialog } = await import("../js/ai-reference-dialog.js");
  await withFakeDocument(() => {
    const dialog = createReferenceDialog({ legacyLibraryUiEnabled: true });
    assert.match(dialog.innerHTML, /data-ai-search-source="parts"/);
    assert.match(dialog.innerHTML, /data-ai-search-source="exam"/);
    assert.match(dialog.innerHTML, /data-ai-search-source="local"/);
  });
});

test("keyboard crop movement and resizing stay normalized", async () => {
  const { adjustCropBoxWithKeyboard } = await import("../js/ai-pdf-workspace.js");
  const box = { x: 0.1, y: 0.2, w: 0.4, h: 0.5 };
  assert.deepEqual(adjustCropBoxWithKeyboard(box, "ArrowRight"),
    { x: 0.11, y: 0.2, w: 0.4, h: 0.5 });
  assert.deepEqual(adjustCropBoxWithKeyboard(box, "ArrowDown", { shiftKey: true }),
    { x: 0.1, y: 0.2, w: 0.4, h: 0.51 });
  assert.deepEqual(adjustCropBoxWithKeyboard({ x: 0.99, y: 0.99, w: 0.01, h: 0.01 }, "ArrowRight"),
    { x: 0.99, y: 0.99, w: 0.01, h: 0.01 });
  assert.deepEqual(adjustCropBoxWithKeyboard({ x: 0.2, y: 0.2, w: 0.01, h: 0.01 }, "ArrowLeft", { shiftKey: true }),
    { x: 0.2, y: 0.2, w: 0.01, h: 0.01 });
  assert.equal(adjustCropBoxWithKeyboard(box, "Enter"), null);
});

class FakeRoot {
  constructor(document, focusables) {
    this.ownerDocument = document;
    this.focusables = focusables;
    this.listeners = new Map();
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
  querySelectorAll() { return this.focusables; }
  dispatch(type, event) { this.listeners.get(type)?.(event); }
}

function focusable(document, extra = {}) {
  return {
    disabled: false, hidden: false, isConnected: true,
    getAttribute: () => null,
    focus() { document.activeElement = this; this.focusCount = (this.focusCount || 0) + 1; },
    ...extra,
  };
}

function keyEvent(key, shiftKey = false) {
  return {
    key, shiftKey, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  };
}

test("modal focus starts inside, cycles, closes on Escape, and returns to its trigger", async () => {
  const { installModalFocus } = await import("../js/modal-focus.js");
  const document = { activeElement: null };
  const trigger = focusable(document);
  const first = focusable(document);
  const hidden = focusable(document, { hidden: true });
  const last = focusable(document);
  const root = new FakeRoot(document, [first, hidden, last]);
  let closeRequests = 0;

  const release = installModalFocus({ root, initialFocus: first, returnFocus: trigger,
    onRequestClose: () => { closeRequests += 1; } });
  assert.equal(document.activeElement, first);
  document.activeElement = last;
  const forward = keyEvent("Tab");
  root.dispatch("keydown", forward);
  assert.equal(document.activeElement, first);
  assert.equal(forward.prevented, true);
  const backward = keyEvent("Tab", true);
  root.dispatch("keydown", backward);
  assert.equal(document.activeElement, last);
  const escape = keyEvent("Escape");
  root.dispatch("keydown", escape);
  assert.equal(closeRequests, 1);
  assert.equal(escape.prevented, true);
  assert.equal(escape.stopped, true);

  release();
  assert.equal(document.activeElement, trigger);
  assert.equal(root.listeners.has("keydown"), false);
});
