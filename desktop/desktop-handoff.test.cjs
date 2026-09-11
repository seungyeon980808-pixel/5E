const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function loadHandoff() {
  let source = fs.readFileSync(path.join(root, "js", "ai-install-guide.js"), "utf8");
  source = source.replace(/^import\s+[\s\S]*?;\r?\n/gm, "").replace(/\bexport\s+/g, "");
  source += "\nglobalThis.__handoff = { createDesktopHandoff, DESKTOP_RELEASE_URL };";
  const sandbox = { URL, Object, JSON, Number, String, Array, Date, Promise, setTimeout, clearTimeout, globalThis: null };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "js/ai-install-guide.js" });
  return sandbox.__handoff;
}

function storage(initial = undefined) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_, next) => { value = next; },
    value: () => value,
  };
}

test("Given no completed work, when the handoff is created, then it does not present a prompt", () => {
  const { createDesktopHandoff } = loadHandoff();
  const prompts = [];
  const handoff = createDesktopHandoff({ storage: storage(), onPrompt: (prompt) => prompts.push(prompt) });

  assert.equal(handoff.status().promptVisible, false);
  assert.equal(prompts.length, 0);
});

test("Given one successful AI result, when the result is reported repeatedly, then one prompt is presented", () => {
  const { createDesktopHandoff } = loadHandoff();
  const prompts = [];
  const handoff = createDesktopHandoff({ storage: storage(), onPrompt: (prompt) => prompts.push(prompt) });

  assert.equal(handoff.reportAiSuccess().kind, "prompt");
  assert.equal(handoff.reportAiSuccess().kind, "suppressed");
  assert.equal(prompts.length, 1);
});

test("Given a local-folder intent, when it is reported, then it presents the same handoff contract", () => {
  const { createDesktopHandoff } = loadHandoff();
  const prompts = [];
  const handoff = createDesktopHandoff({ storage: storage(), onPrompt: (prompt) => prompts.push(prompt) });

  const result = handoff.reportLocalFolderIntent();

  assert.equal(result.kind, "prompt");
  assert.equal(prompts[0].reason, "local-folder");
});

test("Given a dismissed prompt, when a new controller reads the same storage, then it remains suppressed", () => {
  const { createDesktopHandoff } = loadHandoff();
  const persistentStorage = storage();
  const first = createDesktopHandoff({ storage: persistentStorage, onPrompt() {} });
  first.reportAiSuccess();
  assert.equal(first.dismiss(), true);

  const second = createDesktopHandoff({ storage: persistentStorage, onPrompt() {} });
  assert.equal(second.reportAiSuccess().kind, "suppressed");
  assert.equal(second.status().dismissed, true);
});

test("Given a deferred prompt, when the reminder period has not elapsed, then a new controller keeps it suppressed", () => {
  const { createDesktopHandoff } = loadHandoff();
  const persistentStorage = storage();
  const first = createDesktopHandoff({ storage: persistentStorage, now: () => 100, onPrompt() {} });
  first.reportAiSuccess();
  assert.equal(first.remindLater(), true);

  const second = createDesktopHandoff({ storage: persistentStorage, now: () => 101, onPrompt() {} });
  assert.equal(second.reportLocalFolderIntent().kind, "suppressed");
});

test("Given a saved web project, when installation is requested, then save completes before the release opens", async () => {
  const { createDesktopHandoff } = loadHandoff();
  const calls = [];
  const handoff = createDesktopHandoff({
    storage: storage(),
    onPrompt() {},
    saveProject: async () => { calls.push("save"); return true; },
    openExternal: (url) => { calls.push(url); return true; },
  });
  handoff.reportAiSuccess();

  const result = await handoff.install();

  assert.deepEqual(calls, ["save", "https://github.com/seungyeon980808-pixel/5E/releases/latest"]);
  assert.equal(result.kind, "release-opened");
});

test("Given unavailable, cancelled, or failed project export, when installation is requested, then it returns an explicit save outcome without opening a release", async () => {
  const { createDesktopHandoff } = loadHandoff();
  const cases = [
    { outcome: "save-unavailable" },
    { outcome: "save-cancelled", saveProject: async () => false },
    { outcome: "save-failed", saveProject: async () => { throw new Error("save failed"); } },
  ];
  for (const expected of cases) {
    const persistentStorage = storage();
    let opened = false;
    const handoff = createDesktopHandoff({
      storage: persistentStorage,
      onPrompt() {},
      saveProject: expected.saveProject,
      openExternal: () => { opened = true; },
    });
    handoff.reportAiSuccess();

    const result = await handoff.install();

    assert.equal(result.kind, expected.outcome);
    assert.equal(opened, false);
    assert.equal(handoff.status().installStarted, false);
  }
});

test("Given an unsafe configured release URL, when installation is requested, then it is blocked before project export", async () => {
  const { createDesktopHandoff } = loadHandoff();
  let saved = false;
  const handoff = createDesktopHandoff({
    storage: storage(),
    onPrompt() {},
    releaseUrl: "javascript:alert(1)",
    saveProject: async () => { saved = true; return true; },
    openExternal() { throw new Error("must not open"); },
  });
  handoff.reportAiSuccess();

  const result = await handoff.install();

  assert.equal(result.kind, "blocked");
  assert.equal(saved, false);
});

test("Given an installed desktop runtime, when a handoff signal arrives, then it opens the existing panel without a web prompt", () => {
  const { createDesktopHandoff } = loadHandoff();
  let opened = 0;
  const handoff = createDesktopHandoff({
    storage: storage(),
    isDesktop: () => true,
    openDesktopPanel: () => { opened += 1; },
    onPrompt() { throw new Error("web prompt must not render"); },
  });

  const result = handoff.reportAiSuccess();

  assert.equal(result.kind, "desktop-opened");
  assert.equal(opened, 1);
});

test("Given an installed desktop runtime with an active prompt, when its install action runs, then it uses the panel and existing project chooser", async () => {
  const { createDesktopHandoff } = loadHandoff();
  let desktop = false;
  let panel = 0;
  let chooser = 0;
  const handoff = createDesktopHandoff({
    storage: storage(),
    isDesktop: () => desktop,
    openDesktopPanel: () => { panel += 1; },
    openProjectChooser: () => { chooser += 1; },
    onPrompt() {},
  });
  handoff.reportAiSuccess();
  desktop = true;

  const result = await handoff.install();

  assert.equal(result.kind, "desktop-opened");
  assert.equal(panel, 1);
  assert.equal(chooser, 1);
});

test("Given malformed stored state or a stale prompt action, when a new signal follows dismissal, then no stale action changes the handoff", async () => {
  const { createDesktopHandoff } = loadHandoff();
  const persistentStorage = storage("not-json");
  const prompts = [];
  let saves = 0;
  const handoff = createDesktopHandoff({
    storage: persistentStorage,
    onPrompt: (prompt) => prompts.push(prompt),
    saveProject: async () => { saves += 1; return true; },
    openExternal() { throw new Error("stale action must not open"); },
  });
  handoff.reportAiSuccess();
  assert.equal(handoff.dismiss(), true);

  const result = await prompts[0].install();

  assert.equal(result.kind, "stale");
  assert.equal(saves, 0);
  assert.equal(handoff.reportLocalFolderIntent().kind, "suppressed");
});
