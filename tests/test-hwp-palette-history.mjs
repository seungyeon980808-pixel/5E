import test from "node:test";
import assert from "node:assert/strict";
import { installDocumentHistory } from "../js/hwp-palette/subdocuments.js";

class Document {
  constructor(value = "initial") {
    if (value === "corrupt") throw Error("corrupt");
    this.value = value;
    this.saved = new Map();
    this.id = 0;
    this.freed = false;
  }
  check() {
    assert.equal(this.freed, false, "native handle must still be alive");
  }
  saveSnapshot() {
    this.check();
    const id = ++this.id;
    this.saved.set(id, this.value);
    return id;
  }
  restoreSnapshot(id) {
    this.check();
    assert.ok(this.saved.has(id));
    this.value = this.saved.get(id);
  }
  discardSnapshot(id) {
    this.check();
    this.saved.delete(id);
  }
  convertToEditable() {
    this.check();
  }
  setFileName() {
    this.check();
  }
  free() {
    this.check();
    this.freed = true;
  }
}
function bridge() {
  return {
    doc: new Document(),
    fileName: "exam.hwp",
    borrowDocumentHandle() {
      return this.doc;
    },
    saveSnapshot() {
      return this.doc.saveSnapshot();
    },
    restoreSnapshot(id) {
      this.doc.restoreSnapshot(id);
    },
    discardSnapshot(id) {
      this.doc.discardSnapshot(id);
    },
    loadDocument(value) {
      const next = new Document(value);
      this.doc.free();
      this.doc = next;
      return next;
    },
    createNewDocument() {
      this.doc.value = "blank";
    },
    destroy() {
      this.doc.free();
      this.doc = null;
    },
  };
}
test("native history keeps snapshot IDs with each document and frees retired handles once", () => {
  const wasm = bridge(),
    adapter = installDocumentHistory(wasm),
    before = wasm.doc;
  const a = wasm.saveSnapshot();
  before.value = "typed before subdocument";
  const b = wasm.saveSnapshot(),
    after = new Document("header/table/image/note");
  adapter.adopt(after);
  const c = wasm.saveSnapshot();
  after.value = "typed after subdocument";
  const d = wasm.saveSnapshot();
  wasm.restoreSnapshot(b);
  assert.equal(wasm.doc.value, "typed before subdocument");
  wasm.restoreSnapshot(a);
  assert.equal(wasm.doc.value, "initial");
  wasm.restoreSnapshot(c);
  assert.equal(wasm.doc.value, "header/table/image/note");
  wasm.restoreSnapshot(d);
  assert.equal(wasm.doc.value, "typed after subdocument");
  for (const id of [a, b]) wasm.discardSnapshot(id);
  assert.equal(before.freed, true);
  for (const id of [c, d]) wasm.discardSnapshot(id);
  assert.equal(after.freed, false);
  assert.deepEqual(adapter.stats(), { snapshots: 0, retired: 1 });
  wasm.loadDocument("next exam");
  assert.equal(after.freed, true);
  const e = wasm.saveSnapshot();
  wasm.discardSnapshot(e);
  assert.deepEqual(adapter.stats(), { snapshots: 0, retired: 0 });
  wasm.destroy();
});
test("failed open preserves history; new document clears stale cross-document history", () => {
  const wasm = bridge(),
    adapter = installDocumentHistory(wasm),
    original = wasm.doc;
  const before = wasm.saveSnapshot();
  adapter.adopt(new Document("edited note"));
  const after = wasm.saveSnapshot();
  assert.throws(() => wasm.loadDocument("corrupt"), /corrupt/);
  wasm.restoreSnapshot(before);
  assert.equal(wasm.doc, original);
  wasm.restoreSnapshot(after);
  assert.equal(wasm.doc.value, "edited note");
  wasm.createNewDocument();
  assert.equal(original.freed, true);
  assert.equal(wasm.doc.value, "blank");
  assert.deepEqual(adapter.stats(), { snapshots: 0, retired: 0 });
  assert.throws(() => wasm.restoreSnapshot(before), /유효하지/);
  wasm.discardSnapshot(before);
  wasm.destroy();
});
