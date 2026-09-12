const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

function harness() {
  const handlers = new Map();
  const appHandlers = new Map();
  const children = [];
  const events = [];
  class Window extends EventEmitter {
    constructor() {
      super();
      this.fullscreen = false;
      this.bounds = { x: 20, y: 30, width: 1280, height: 800 };
      this.webContents = new EventEmitter();
      this.webContents.send = (channel, payload) => events.push({ channel, payload });
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.isDestroyed = () => false;
    }
    loadFile() {} setMenu() {} setMenuBarVisibility() {} isDestroyed() { return false; }
    isFullScreen() { return this.fullscreen; }
    getBounds() { return { ...this.bounds }; }
    getNormalBounds() { return { ...this.bounds }; }
    setBounds(bounds) { this.bounds = { ...bounds }; }
    setFullScreen(active) {
      if (this.fullscreen === active) return;
      this.fullscreen = active;
      queueMicrotask(() => this.emit(active ? "enter-full-screen" : "leave-full-screen"));
    }
  }
  const electron = {
    app: {
      setAppUserModelId() {}, setPath() {}, disableHardwareAcceleration() {},
      getPath: () => __dirname, getVersion: () => "test",
      whenReady: () => ({ then: (callback) => callback() }),
      on: (name, callback) => appHandlers.set(name, callback),
    },
    BrowserWindow: Window,
    ipcMain: { handle: (name, callback) => handlers.set(name, callback), on() {} },
    Menu: { setApplicationMenu() {} },
  };
  function spawn() {
    const child = new EventEmitter();
    const serial = children.length + 1;
    let turns = 0;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.calls = [];
    child.killed = false;
    child.kill = () => { child.killed = true; return true; };
    child.stdin = { write(line) {
      const call = JSON.parse(line);
      child.calls.push(call);
      if (call.id != null) queueMicrotask(() => {
        const result = call.method === "thread/start" ? { thread: { id: `thread-${serial}` } }
          : call.method === "turn/start" ? { turn: { id: `turn-${serial}-${++turns}` } }
            : call.method === "thread/read" ? { thread: { status: "idle", turns: [] } } : {};
        child.stdout.emit("line", JSON.stringify({ id: call.id, result }));
      });
      return true;
    } };
    children.push(child);
    return child;
  }
  const mainPath = path.join(__dirname, "main.cjs");
  const localRequire = createRequire(mainPath);
  vm.runInNewContext(fs.readFileSync(mainPath, "utf8"), {
    require: (name) => name === "electron" ? electron
      : name === "node:child_process" ? { spawn, execFile: (_file, _args, _opts, done) => done(null, "logged in", "") }
        : name === "node:readline" ? { createInterface: ({ input }) => input } : localRequire(name),
    __dirname, __filename: mainPath, process, Buffer, console, setTimeout, clearTimeout,
  }, { filename: mainPath });
  return {
    children, events,
    invoke: (method, payload) => handlers.get(`codex:${method}`)(null, payload),
    emit: (index, message) => children[index].stdout.emit("line", JSON.stringify(message)),
    quit: () => appHandlers.get("before-quit")(),
  };
}

test("independent client scopes start simultaneous turns, preserve same-scope admission, and isolate cancellation", async () => {
  const h = harness();
  try {
    const [a, b] = await Promise.all([
      h.invoke("send", { clientScope: "a", text: "first", purpose: "image" }),
      h.invoke("send", { clientScope: "b", text: "second", purpose: "image" }),
    ]);
    assert.equal(h.children.length, 2);
    assert.notEqual(a.turnId, b.turnId);
    await assert.rejects(h.invoke("send", { clientScope: "a", text: "duplicate" }), /이전 AI 작업/);
    await h.invoke("interrupt", { clientScope: "a" });
    assert.equal(h.children[0].calls.filter((call) => call.method === "turn/interrupt").length, 1);
    assert.equal(h.children[1].calls.filter((call) => call.method === "turn/interrupt").length, 0);
    h.emit(0, { method: "turn/completed", params: { turn: { id: a.turnId, status: "interrupted" } } });
    const next = await h.invoke("send", { clientScope: "a", text: "next" });
    assert.notEqual(next.turnId, a.turnId);
    await assert.rejects(h.invoke("send", { clientScope: "b", text: "still running" }), /이전 AI 작업/);
    const terminals = h.events.filter(({ payload }) => payload.method === "turn/completed");
    assert.equal(terminals.length, 1);
    assert.equal(terminals[0].payload.clientScope, "a");
    await h.invoke("stop", { clientScope: "a" });
    assert.equal(h.children[0].killed, true);
    assert.equal(h.children[1].killed, false);
    assert.equal((await h.invoke("status", { clientScope: "b" })).server, true);
  } finally { h.quit(); }
  assert.ok(h.children.every((child) => child.killed));
});

test("models, account, state, logs and default legacy calls retain their own runtime", async () => {
  const h = harness();
  try {
    await Promise.all([h.invoke("models"), h.invoke("account", { clientScope: "b" })]);
    assert.equal(h.children.length, 2);
    assert.ok(h.children[0].calls.some((call) => call.method === "model/list"));
    assert.ok(!h.children[0].calls.some((call) => call.method === "account/read"));
    assert.ok(h.children[1].calls.some((call) => call.method === "account/read"));
    h.children[1].stderr.emit("data", "scoped log");
    assert.equal(h.events.find(({ channel }) => channel === "codex:log").payload.clientScope, "b");
    assert.deepEqual(h.events.filter(({ channel }) => channel === "codex:state").map(({ payload }) => payload.clientScope), ["", "b"]);
    const legacy = await h.invoke("send", { text: "legacy" });
    assert.equal(legacy.turnId, "turn-1-1");
    assert.throws(() => h.invoke("start", { clientScope: {} }), /식별자/);
  } finally { h.quit(); }
});

test("stopping a scope during initialization rejects it without stopping a concurrent scope", async () => {
  const h = harness();
  try {
    const stopped = h.invoke("send", { clientScope: "a", text: "preparing" });
    const survivor = h.invoke("send", { clientScope: "b", text: "surviving" });
    h.invoke("stop", { clientScope: "a" });
    await assert.rejects(stopped, /중지/);
    assert.equal((await survivor).turnId, "turn-2-1");
    assert.equal(h.children[0].calls.filter((call) => call.method === "turn/start").length, 0);
    assert.equal((await h.invoke("send", { clientScope: "a", text: "restarted" })).turnId, "turn-3-1");
  } finally { h.quit(); }
});

test("first-image finalization only interrupts and releases its owning scope", async () => {
  const h = harness();
  try {
    const [a, b] = await Promise.all(["a", "b"].map((clientScope) =>
      h.invoke("send", { clientScope, text: "draw", purpose: "image" })));
    h.emit(0, { method: "item/completed", params: {
      turnId: a.turnId,
      item: { type: "imageGeneration", status: "completed", imageDataUrl: "data:image/png;base64,dGVzdA==" },
    } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.children[0].calls.filter((call) => call.method === "turn/interrupt").length, 1);
    assert.equal(h.children[1].calls.filter((call) => call.method === "turn/interrupt").length, 0);
    const confirmed = h.events.find(({ payload }) => payload.method === "5e/image-finalization" && payload.params.state === "confirmed");
    assert.equal(confirmed?.payload.clientScope, "a");
    assert.equal(confirmed?.payload.params.turnId, a.turnId);
    await assert.rejects(h.invoke("send", { clientScope: "b", text: "duplicate" }), /이전 AI 작업/);
    assert.notEqual((await h.invoke("send", { clientScope: "a", text: "next" })).turnId, a.turnId);
    assert.equal(b.turnId, "turn-2-1");
  } finally { h.quit(); }
});

test("a scoped server disconnect releases only its own turn, deduplicates exit, and drops late output", async () => {
  const h = harness();
  try {
    const [a, b] = await Promise.all(["a", "b"].map((clientScope) =>
      h.invoke("send", { clientScope, text: "draw", purpose: "image" })));
    h.children[0].emit("error", new Error("pipe closed"));
    h.children[0].exitCode = 17;
    h.children[0].emit("exit", 17, null);

    const failures = h.events.filter(({ payload }) =>
      payload.method === "5e/image-finalization" && payload.params.turnId === a.turnId);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].payload.clientScope, "a");
    assert.equal(failures[0].payload.params.state, "recoveryFailed");
    assert.equal(failures[0].payload.params.message, "pipe closed");
    await assert.rejects(h.invoke("send", { clientScope: "b", text: "duplicate" }), /이전 AI 작업/);
    h.emit(1, { method: "turn/completed", params: { turn: { id: b.turnId, status: "completed" } } });
    await assert.doesNotReject(h.invoke("send", { clientScope: "b", text: "next" }));

    const restarted = await h.invoke("send", { clientScope: "a", text: "restart" });
    h.events.length = 0;
    h.emit(0, { method: "turn/completed", params: { turn: { id: a.turnId, status: "completed" } } });
    assert.equal(h.events.some(({ payload }) => payload.params?.turn?.id === a.turnId), false);
    assert.notEqual(restarted.turnId, a.turnId);
  } finally {
    h.quit();
  }
  assert.ok(h.children.every((child) => child.killed || child.exitCode != null));
});

test("a hung repeated interrupt stays deduplicated and does not block its concurrent scope", async () => {
  const h = harness();
  try {
    const [a, b] = await Promise.all(["a", "b"].map((clientScope) =>
      h.invoke("send", { clientScope, text: "draw", purpose: "image" })));
    const originalWrite = h.children[0].stdin.write;
    h.children[0].stdin.write = (line) => {
      const call = JSON.parse(line);
      if (call.method === "turn/interrupt") {
        h.children[0].calls.push(call);
        return true;
      }
      return originalWrite(line);
    };

    const first = h.invoke("interrupt", { clientScope: "a" });
    const repeated = h.invoke("interrupt", { clientScope: "a" });
    assert.strictEqual(first, repeated);
    assert.equal(h.children[0].calls.filter((call) => call.method === "turn/interrupt").length, 1);
    await assert.rejects(h.invoke("send", { clientScope: "a", text: "duplicate" }), /이전 AI 작업/);

    h.emit(1, { method: "turn/completed", params: { turn: { id: b.turnId, status: "completed" } } });
    assert.notEqual((await h.invoke("send", { clientScope: "b", text: "next" })).turnId, b.turnId);
    await h.invoke("stop", { clientScope: "a" });
    assert.equal((await first).state, "interrupt-failed");
  } finally {
    h.quit();
  }
  assert.ok(h.children.every((child) => child.killed));
});
