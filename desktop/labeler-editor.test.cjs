const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
function store(value) {
  return { get: () => value, update(fn) { fn(value); } };
}

function placement() {
  const events = new Map();
  const opened = [];
  const value = { activeTool: "LABELER", objects: [], undoStack: [], redoStack: [], activeLayerId: 1 };
  const target = { addEventListener(type, fn) { events.set(type, fn); } };
  const sandbox = {
    window: target, screenToWorld: (_svg, _vb, x, y) => ({ x, y }),
    isSpaceHeld: () => false, snapKey: () => false, setSnapPreview() {},
    initLabelerMagnifier() {},
    initLabelerBranches() {},
    applyNewObjectStyleDefaults: (shape) => shape,
    DEFAULT_TEXT_FONT: "Dotum", DEFAULT_TEXT_SIZE_MM: 4, DEFAULT_STROKE_WIDTH: 0.3,
    MIN_SIZE: 0.1, nextObjectId: () => "new-label",
    openLabelerTextEditor: (id, pending) => opened.push({ id, pending }),
  };
  const source = read("js/tools/click-placement.js")
    .replace(/^import\s+[\s\S]*?;\r?\n/gm, "").replace(/\bexport\s+/g, "");
  vm.runInNewContext(source + "\nglobalThis.setup = setupClickDrawing;", sandbox);
  sandbox.setup(target, store(value));
  return {
    value, opened,
    click(x, y) { events.get("click")({ button: 0, clientX: x, clientY: y }); },
    move(x, y) { events.get("mousemove")({ clientX: x, clientY: y }); },
    key(key, target = { tagName: "BODY" }) {
      const event = { key, code: key === " " ? "Space" : key, target,
        preventDefault() { this.prevented = true; },
        stopImmediatePropagation() { this.stopped = true; } };
      events.get("keydown")(event);
      return event;
    },
  };
}

test("labeler keeps two clicks as a draft and commits one elbow on the third", () => {
  const runtime = placement();
  runtime.click(10, 20);
  assert.deepEqual(plain(runtime.value.draft.p1), { x: 10, y: 20 });
  runtime.click(30, 40);
  assert.equal(runtime.value.objects.length, 0);
  assert.deepEqual(plain(runtime.value.draft.elbow), { x: 30, y: 40 });
  runtime.click(70, 40);
  const label = runtime.opened[0].pending;
  assert.deepEqual(plain(label.p1), { x: 10, y: 20 });
  assert.deepEqual(plain(label.elbow), { x: 30, y: 40 });
  assert.deepEqual(plain(label.p2), { x: 70, y: 40 });
  assert.equal(label.text, "");
  assert.equal(runtime.opened[0].id, label.id);
  assert.equal(runtime.value.objects.length, 0);
  assert.equal(runtime.value.undoStack.length, 0);
  assert.equal(runtime.value.draft, null);
});

test("Enter and Space finalize a straight label at the live pointer and consume the shortcut", () => {
  for (const key of ["Enter", " "]) {
    const runtime = placement();
    runtime.click(10, 20);
    runtime.move(70, 40);
    const event = runtime.key(key);
    const label = runtime.opened[0].pending;
    assert.deepEqual(plain(label.p2), { x: 70, y: 40 });
    assert.equal(label.elbow, undefined);
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
    assert.equal(runtime.opened.length, 1);
    assert.equal(runtime.value.objects.length, 0);
    assert.equal(runtime.value.undoStack.length, 0);
  }
});

test("typing shortcuts do not place a label; Escape cancels its draft", () => {
  const runtime = placement();
  runtime.click(10, 20);
  runtime.move(70, 40);
  runtime.key("Enter", { tagName: "TEXTAREA" });
  assert.equal(runtime.value.objects.length, 0);
  runtime.key("Escape");
  assert.equal(runtime.value.draft, null);
  assert.equal(runtime.opened.length, 0);
});

test("label placement and text picking share the initialized module URLs", () => {
  const tools = read("js/tools.js");
  const editorVersion = tools.match(/text-editor\.js\?([^"']+)/)[1];
  const pickVersion = tools.match(/pick\.js\?([^"']+)/)[1];
  assert.equal(read("js/tools/click-placement.js").match(/text-editor\.js\?([^"']+)/)[1], editorVersion);
  assert.equal(read("js/text-editor.js").match(/pick\.js\?([^"']+)/)[1], pickVersion);
});

function editorRuntime(value, input) {
  const source = read("js/text-editor.js");
  const commit = source.slice(source.indexOf("function _commitText()"), source.indexOf("export function cancelActiveTextEditor"));
  const sync = source.slice(source.indexOf("function _syncDraftFromUnifiedEditor()"), source.indexOf("function _insertIntoUnifiedText"));
  const cancel = source.slice(source.indexOf("function _cancelText()"), source.indexOf("function _commitText()"));
  const sandbox = {
    _state: store(value), _textEditor: { value: input }, _idCounter: 0,
    DEFAULT_TEXT_FONT: "Dotum", looksLikeFormula: () => false,
    normalizeFormulaSource: (text) => text,
    resolveTextFontStyle: () => "normal", resolveTextLetterSpacing: () => 0,
    normalizeTextRuns: (draft) => draft.textRuns || [],
    _syncDraftRunsToText(draft, raw) { draft.textRuns = [{ text: raw }]; },
    _refreshUnifiedPreview() {},
  };
  sandbox._textValue = () => sandbox._textEditor.value;
  sandbox._removeTextEditor = () => { sandbox._textEditor = null; };
  vm.runInNewContext(sync + cancel + commit + "\nglobalThis.commit = _commitText; globalThis.cancel = _cancelText;", sandbox);
  return sandbox;
}

test("commit uses the final native input even before its input event updates the draft", () => {
  const value = { activeTool: "T", objects: [], undoStack: [], redoStack: [],
    draftText: { text: "stale", textRuns: [{ text: "stale" }], x: 1, y: 2 } };
  editorRuntime(value, "조합 완료").commit();
  assert.equal(value.objects[0].text, "조합 완료");
  assert.equal(value.objects[0].textRuns[0].text, "조합 완료");
  assert.equal(value.draftText, null);
  assert.equal(value.activeTool, "V");
});

test("unchanged text and label commits clear editing visibility without adding undo", () => {
  for (const type of ["text", "labeler"]) {
    const object = { id: "existing", type, text: "내용", textRuns: [{ text: "내용" }],
      fontFamily: "Dotum", fontSize: 4, labelSize: 4, fontWeight: "normal", italic: false };
    const value = { activeTool: "V", objects: [object], undoStack: [], redoStack: [],
      draftText: { ...object, editingId: object.id, editingType: type } };
    editorRuntime(value, "내용").commit();
    assert.equal(value.draftText, null, `${type} must become visible immediately`);
    assert.equal(value.undoStack.length, 0);
    assert.equal(value.objects[0], object);
  }
});

test("new labels create exactly one history entry only after nonempty text confirmation", () => {
  const runtime = placement();
  runtime.click(10, 20);
  runtime.move(70, 40);
  runtime.key("Enter");
  const pending = runtime.opened[0].pending;
  runtime.value.draftText = { editingType: "labeler", pendingLabeler: pending,
    text: "", fontFamily: "Dotum", fontSize: 4 };
  editorRuntime(runtime.value, "새 라벨").commit();
  assert.equal(runtime.value.objects.length, 1);
  assert.equal(runtime.value.objects[0].text, "새 라벨");
  assert.equal(runtime.value.undoStack.length, 1);
  assert.deepEqual(plain(runtime.value.undoStack[0]), []);
  assert.equal(runtime.value.draftText, null);
});

test("empty confirmation and cancellation discard a pending label without object or history", () => {
  for (const action of ["commit", "cancel"]) {
    const value = { activeTool: "V", objects: [], undoStack: [], redoStack: [],
      draftText: { editingType: "labeler", text: "", pendingLabeler: { type: "labeler", id: "pending", text: "" } } };
    editorRuntime(value, "   ")[action]();
    assert.equal(value.objects.length, 0);
    assert.equal(value.undoStack.length, 0);
    assert.equal(value.draftText, null);
  }
});

for (const keyEvent of [{ key: "Enter" }, { key: "Process", code: "Enter", keyCode: 229 }, { key: "Process", code: "NumpadEnter", keyCode: 229 }]) {
test(`IME ${keyEvent.code || keyEvent.key} (${keyEvent.key}) waits for final input before committing once`, () => {
  const source = read("js/text-editor.js");
  const start = source.indexOf("  const editor = _textEditor;", source.indexOf("function _openUnifiedTextEditor"));
  assert.notEqual(start, -1);
  const end = source.indexOf("\n  _syncDraftFromUnifiedEditor();\n}", start);
  assert.notEqual(end, -1);
  const events = new Map();
  const timers = [];
  const editor = { value: "조합", addEventListener(type, fn) { events.set(type, fn); } };
  const committed = [];
  const sandbox = { _textEditor: editor, setTimeout: (fn) => timers.push(fn),
    _commitText() { committed.push(editor.value); sandbox._textEditor = null; } };
  vm.runInNewContext(source.slice(start, end), sandbox);
  events.get("compositionstart")();
  events.get("keydown")({ ...keyEvent, isComposing: true, stopPropagation() {},
    preventDefault() { assert.fail("IME completion must not be prevented"); } });
  assert.equal(committed.length, 0);
  events.get("compositionend")();
  editor.value = "조합 완료";
  timers.forEach((fn) => fn());
  assert.deepEqual(committed, ["조합 완료"]);
});
}
