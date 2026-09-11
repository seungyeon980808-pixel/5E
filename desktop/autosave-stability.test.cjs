const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

class FakeClock {
  #now = 0;
  #nextId = 1;
  #timers = new Map();

  now = () => this.#now;

  setTimeout = (callback, delay) => {
    const id = this.#nextId++;
    this.#timers.set(id, { at: this.#now + delay, callback });
    return id;
  };

  clearTimeout = (id) => this.#timers.delete(id);

  tick(milliseconds) {
    const target = this.#now + milliseconds;
    while (true) {
      const due = [...this.#timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort(([, a], [, b]) => a.at - b.at)[0];
      if (!due) break;
      const [id, timer] = due;
      this.#timers.delete(id);
      this.#now = timer.at;
      timer.callback();
    }
    this.#now = target;
  }
}

class FakeDocument {
  #listeners = new Map();
  visibilityState = "visible";

  addEventListener(type, listener) {
    const listeners = this.#listeners.get(type) || [];
    listeners.push(listener);
    this.#listeners.set(type, listeners);
  }

  dispatch(type) {
    for (const listener of this.#listeners.get(type) || []) listener();
  }
}

class FakeIndexedDB {
  records = [];
  pending = [];
  failNext = null;
  openError = null;

  open = () => {
    if (this.openError) throw this.openError;
    const request = { result: this.#database() };
    queueMicrotask(() => {
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  };

  completeNext() {
    const pending = this.pending.shift();
    assert.ok(pending, "a write should be pending");
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      pending.transaction.error = error;
      pending.transaction.onerror?.();
      pending.transaction.onabort?.();
      return;
    }
    this.records.push({ id: this.records.length + 1, ...pending.value });
    pending.transaction.oncomplete?.();
  }

  #database() {
    return {
      objectStoreNames: { contains: () => false },
      createObjectStore() {},
      transaction: (_store, mode) => this.#transaction(mode),
    };
  }

  #transaction(mode) {
    const transaction = { error: null, oncomplete: null, onerror: null, onabort: null };
    const store = {
      add: (value) => {
        this.pending.push({ transaction, value: structuredClone(value) });
      },
      delete() {},
      getAllKeys: () => {
        const request = { result: this.records.map((record) => record.id) };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
      openCursor: () => {
        const request = { result: this.records.length ? { value: this.records.at(-1) } : null };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    };
    transaction.objectStore = () => store;
    if (mode === "readonly") queueMicrotask(() => transaction.oncomplete?.());
    return transaction;
  }
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function snapshot(label) {
  return { pages: [{ objects: [{ id: label, type: "rect" }] }] };
}

function loadAutosave({ clock, indexedDB, document, alerts }) {
  let source = fs.readFileSync(path.join(root, "js/autosave.js"), "utf8");
  source = source.replace(/^import\s+[^;]+;\r?\n/gm, "").replace(/\bexport\s+/g, "");
  source += "\nglobalThis.__testExports = { initAutosave };";
  const FakeDate = class extends Date { static now() { return clock.now(); } };
  const sandbox = {
    Array,
    Date: FakeDate,
    JSON,
    Promise,
    DOMException,
    indexedDB,
    document,
    window: { addEventListener: (type, listener) => document.addEventListener(type, listener) },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    captureProjectStatus() {},
    markProjectStatus() {},
    serialize: (state) => structuredClone(state.snapshot),
    migrate: (value) => value,
    applyLoaded() {},
    showConfirm: async () => false,
    showAlert: (message, options) => { alerts.push({ message, options }); return Promise.resolve(); },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "js/autosave.js" });
  return sandbox.__testExports;
}

async function setup(options = {}) {
  const clock = new FakeClock();
  const indexedDB = new FakeIndexedDB();
  const document = new FakeDocument();
  const alerts = [];
  let subscriber;
  const state = {
    snapshot: snapshot("first"),
    get() { return this; },
    subscribe(listener) { subscriber = listener; },
  };
  if (options.openError) indexedDB.openError = options.openError;
  const autosave = loadAutosave({ clock, indexedDB, document, alerts });
  await autosave.initAutosave(state);
  await flush();
  return {
    alerts, clock, document, indexedDB, state,
    update(label) { state.snapshot = snapshot(label); subscriber(state); },
  };
}

test("autosave retains the existing 2500ms quiet debounce", async () => {
  const fixture = await setup();
  fixture.update("quiet");
  fixture.clock.tick(2499);
  assert.equal(fixture.indexedDB.pending.length, 0);
  fixture.clock.tick(1);
  await flush();
  assert.equal(fixture.indexedDB.pending.length, 1);
});

test("sustained 100ms updates save no later than the 10s dirty bound", async () => {
  const fixture = await setup();
  for (let index = 0; index < 100; index += 1) {
    fixture.update(`update-${index}`);
    fixture.clock.tick(100);
  }
  await flush();
  assert.equal(fixture.indexedDB.pending.length, 1);
});

test("writes are serialized and retain immutable data captured for each write", async () => {
  const fixture = await setup();
  fixture.update("older");
  fixture.clock.tick(2500);
  fixture.update("newer");
  fixture.clock.tick(2500);
  await flush();
  assert.equal(fixture.indexedDB.pending.length, 1);
  fixture.indexedDB.completeNext();
  await flush();
  assert.equal(fixture.indexedDB.records[0].data.pages[0].objects[0].id, "older");
  assert.equal(fixture.indexedDB.pending.length, 1);
  fixture.indexedDB.completeNext();
  await flush();
  assert.equal(fixture.indexedDB.records.at(-1).data.pages[0].objects[0].id, "newer");
});

test("failed writes retry without repeating the same warning", async () => {
  const fixture = await setup();
  fixture.indexedDB.failNext = new DOMException("quota", "QuotaExceededError");
  fixture.update("retry");
  fixture.clock.tick(2500);
  await flush();
  fixture.indexedDB.completeNext();
  await flush();
  assert.equal(fixture.alerts.length, 1);
  fixture.clock.tick(2500);
  await flush();
  assert.equal(fixture.indexedDB.pending.length, 1);
  fixture.indexedDB.failNext = new DOMException("quota", "QuotaExceededError");
  fixture.indexedDB.completeNext();
  await flush();
  assert.equal(fixture.alerts.length, 1);
});

test("continued edits share one outage warning until recovery, then warn for a later outage", async () => {
  const fixture = await setup();
  fixture.indexedDB.records.push({ id: 1, ts: 1, data: snapshot("good") });

  fixture.indexedDB.failNext = new DOMException("quota", "QuotaExceededError");
  fixture.update("first-failure");
  fixture.clock.tick(2500);
  await flush();
  fixture.indexedDB.completeNext();
  await flush();
  assert.equal(fixture.alerts.length, 1);

  fixture.indexedDB.failNext = new DOMException("quota", "QuotaExceededError");
  fixture.update("changed-during-outage");
  fixture.clock.tick(2500);
  await flush();
  fixture.indexedDB.completeNext();
  await flush();
  assert.equal(fixture.alerts.length, 1, "one outage must not warn for every changed snapshot");
  assert.equal(fixture.indexedDB.records.at(-1).data.pages[0].objects[0].id, "good");

  fixture.clock.tick(2500);
  await flush();
  fixture.indexedDB.completeNext();
  await flush();
  assert.equal(fixture.indexedDB.records.at(-1).data.pages[0].objects[0].id, "changed-during-outage");

  fixture.indexedDB.failNext = new DOMException("quota", "QuotaExceededError");
  fixture.update("later-outage");
  fixture.clock.tick(2500);
  await flush();
  fixture.indexedDB.completeNext();
  await flush();
  assert.equal(fixture.alerts.length, 2, "a durable recovery must permit one warning for a later outage");
});

test("visibility-hidden and pagehide flush a pending save as best effort", async () => {
  const fixture = await setup();
  fixture.update("hidden");
  fixture.document.visibilityState = "hidden";
  fixture.document.dispatch("visibilitychange");
  await flush();
  assert.equal(fixture.indexedDB.pending.length, 1);
  fixture.indexedDB.completeNext();
  await flush();
  fixture.update("pagehide");
  fixture.document.dispatch("pagehide");
  await flush();
  assert.equal(fixture.indexedDB.pending.length, 1);
});

test("unchanged and empty documents preserve the last good recovery snapshot", async () => {
  const fixture = await setup();
  fixture.indexedDB.records.push({ id: 1, ts: 1, data: snapshot("good") });
  fixture.state.snapshot = { pages: [{ objects: [] }] };
  fixture.update("ignored");
  fixture.state.snapshot = { pages: [{ objects: [] }] };
  fixture.clock.tick(10_000);
  await flush();
  assert.equal(fixture.indexedDB.pending.length, 0);
  assert.equal(fixture.indexedDB.records.length, 1);
  fixture.state.snapshot = snapshot("same");
  fixture.update("same");
  fixture.clock.tick(2500);
  await flush();
  fixture.indexedDB.completeNext();
  await flush();
  fixture.update("same");
  fixture.clock.tick(2500);
  assert.equal(fixture.indexedDB.pending.length, 0);
});

test("unavailable IndexedDB is visible while the editor remains usable", async () => {
  const clock = new FakeClock();
  const indexedDB = new FakeIndexedDB();
  const document = new FakeDocument();
  const alerts = [];
  indexedDB.openError = new DOMException("denied", "SecurityError");
  const autosave = loadAutosave({ clock, indexedDB, document, alerts });
  const state = { get: () => ({}), subscribe() { throw new Error("autosave should not subscribe"); } };
  await autosave.initAutosave(state);
  assert.equal(alerts.length, 1);
});
