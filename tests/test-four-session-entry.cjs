const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const helper = require("./helpers/four-session-entry.cjs");
const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "suite-manifest.json"), "utf8"));
const origin = "http://127.0.0.1:60000";

test("entry and independent module settings accept only local unambiguous values", () => {
  assert.deepEqual(helper.entryConfiguration({}), { entry: "/preview/", moduleBase: undefined, moduleQuery: undefined });
  for (const entry of ["/", "/preview/"]) {
    assert.deepEqual(helper.entryConfiguration({ APP_ENTRY: entry, APP_MODULE_BASE: "/js/", APP_MODULE_QUERY: "?v=integrated" }),
      { entry, moduleBase: "/js/", moduleQuery: "?v=integrated" });
  }
  for (const APP_ENTRY of ["", "/bad", "/preview", "//example.org/", "/?x=1", "/;exit 0"]) {
    assert.throws(() => helper.entryConfiguration({ APP_ENTRY }));
  }
  for (const APP_MODULE_BASE of ["js/", "//example.org/", "/js/../", "/js/?x=1", "/js\\"]) {
    assert.throws(() => helper.entryConfiguration({ APP_MODULE_BASE }));
  }
  for (const APP_MODULE_QUERY of ["v=1", "?v=1#other", "?v=1\n", "?v=1';exit 0"]) {
    assert.throws(() => helper.entryConfiguration({ APP_MODULE_QUERY }));
  }
});

test("both page entries can target canonical modules without deriving base from navigation", () => {
  for (const entry of ["/", "/preview/"]) {
    const config = helper.entryConfiguration({ APP_ENTRY: entry, APP_MODULE_BASE: "/js/", APP_MODULE_QUERY: "?v=state" });
    const mainUrl = helper.mainModuleUrl('<script type="module" src="/js/main.js?v=main"></script>', origin + entry);
    const runtime = helper.runtimeConfiguration(config, origin + entry, mainUrl, 'import { state } from "./state.js?v=state";');
    assert.equal(runtime.mainUrl, origin + "/js/main.js?v=main");
    assert.equal(runtime.stateUrl, origin + "/js/state.js?v=state");
    helper.assertLoadedRuntime(runtime, [runtime.mainUrl, runtime.stateUrl]);
  }
});

test("default preview uses its observed old runtime and refuses missing or mismatched identities", () => {
  const config = helper.entryConfiguration({});
  const main = origin + "/preview/js/main.js?v=old";
  const source = 'import { state } from "./state.js?v=old";';
  const runtime = helper.runtimeConfiguration(config, origin + "/preview/", main, source);
  assert.equal(runtime.moduleBase, "/preview/js/");
  assert.equal(runtime.moduleQuery, "?v=old");
  for (const override of [{ moduleBase: "/js/" }, { moduleBase: "/nonexistent/" }, { moduleQuery: "?v=other" }]) {
    assert.throws(() => helper.runtimeConfiguration({ ...config, ...override }, origin + "/preview/", main, source));
  }
  assert.throws(() => helper.runtimeConfiguration(config, origin + "/preview/", main, ""));
  assert.throws(() => helper.mainModuleUrl("<html></html>", origin));
  assert.throws(() => helper.mainModuleUrl('<script src="https://example.org/main.js"></script>', origin));
  for (const resources of [
    [runtime.mainUrl], // A missing state is not proof.
    [runtime.mainUrl, origin + "/js/state.js?v=old"],
    [runtime.mainUrl, runtime.stateUrl, runtime.stateUrl + "-stale"],
    [runtime.mainUrl, runtime.stateUrl, origin + "/js/state.js?v=old"],
  ]) assert.throws(() => helper.assertLoadedRuntime(runtime, resources));
  helper.assertLoadedRuntime(runtime, [runtime.mainUrl, runtime.stateUrl, runtime.stateUrl]);
});

test("inventory keeps every real classified path and rejects duplicate missing or unclassified files", () => {
  helper.assertCompleteInventory(manifest, root);
  const mutation = mutate => {
    const copy = structuredClone(manifest);
    mutate(copy);
    assert.throws(() => helper.assertCompleteInventory(copy, root));
  };
  mutation(copy => copy.browser.push(copy.browser[0]));
  mutation(copy => copy.unit.push(copy.browser[0]));
  mutation(copy => copy.unit.push({ path: "tests/nonexistent-four-session.cjs" }));
  mutation(copy => copy.browser.shift());
  mutation(copy => { delete copy.unit; });
  mutation(copy => { delete copy.browser[0].findingIds; });
  mutation(copy => { delete copy.deferred[0].reason; });
  mutation(copy => { copy.unit[0].path = "../tests/escape.cjs"; });
  for (const count of [0, 1, manifest.browser.length - 1]) {
    mutation(copy => { copy.browser = copy.browser.slice(0, count); });
  }
  const reordered = structuredClone(manifest);
  for (const classification of ["unit", "browser", "deferred"]) reordered[classification].reverse();
  helper.assertCompleteInventory(reordered, root);
});

function runner({ env = {}, args = ["--only", "test-project-file-size-browser.cjs"], validationError, status = 0, startupError, suiteError, statuses } = {}) {
  const calls = [];
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.pid = 123456789; // Synthetic child; no OS signals.
  child.kill = signal => {
    calls.push({ kind: "kill", signal });
    child.signalCode = signal;
    queueMicrotask(() => child.emit("close", null, signal));
    return true;
  };
  const engine = name => ({ name: () => name, launch: async () => {
    calls.push({ kind: "browser", name });
    return { newPage: async () => ({}), close: async () => { calls.push({ kind: "closedBrowser", name }); } };
  } });
  const fakeProcess = { env: { ...env, PLAYWRIGHT_MODULE: "owned-test-playwright" },
    argv: [process.execPath, "tests/run-browser-tests.cjs", ...args], execPath: process.execPath };
  const module = { exports: {} };
  const mockRequire = name => {
    if (name === "node:child_process") return {
      spawn: () => {
        calls.push({ kind: "server" });
        queueMicrotask(() => {
          if (startupError) child.emit("error", startupError);
          else {
            child.stdout.emit("data", "Local pre");
            child.stdout.emit("data", "view: " + origin + "/preview/\n");
          }
        });
        return child;
      },
      spawnSync: (command, args, options) => { calls.push({ kind: "suite", command, args, env: options.env }); return suiteError ? { status: null, signal: "SIGKILL", error: suiteError } : { status: statuses ? statuses.shift() : status }; },
    };
    if (name === "owned-test-playwright") return { chromium: engine("chromium"), webkit: engine("webkit") };
    if (name === "./helpers/four-session-entry.cjs") return { ...helper, inspectEntry: async (page, origin, config) => {
      if (validationError) throw validationError;
      return { ...config, entryUrl: origin + config.entry, moduleBase: config.moduleBase || "/preview/js/",
        moduleQuery: config.moduleQuery || "?v=old", mainUrl: origin + "/preview/js/main.js?v=old",
        stateUrl: origin + "/preview/js/state.js?v=old" };
    } };
    return require(name);
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "run-browser-tests.cjs"), "utf8"), {
    require: mockRequire, module, __dirname, process: fakeProcess, console: { log() {}, error() {} }, setTimeout, clearTimeout,
  });
  return { run: module.exports.run, calls, process: fakeProcess };
}

test("runner overrides inherited exam origin with its owned combined server", async () => {
  const instance = runner({ env: { EXAM_URL: "http://127.0.0.1:65177/" } });
  await instance.run();
  const suite = instance.calls.find(call => call.kind === "suite");
  assert.equal(suite.env.EXAM_URL, origin + "/");
  assert.equal(suite.env.EXAM_URL, suite.env.RELEASE_URL);
});

test("runner rejects invalid entries and selectors before server or browser launch", async () => {
  for (const options of [{ env: { APP_ENTRY: "/bad" } }, { args: ["--only"] }, { args: ["--only", "nonexistent.cjs"] }]) {
    const instance = runner(options);
    await assert.rejects(instance.run());
    assert.equal(instance.calls.length, 0);
  }
  const listing = runner({ args: ["--list"] });
  await listing.run();
  assert.equal(listing.calls.length, 0);
});

test("runner forwards independent routing and completes owned cleanup before returning", async () => {
  for (const env of [{}, { APP_ENTRY: "/", APP_MODULE_BASE: "/js/", APP_MODULE_QUERY: "?v=state" }]) {
    const instance = runner({ env });
    await instance.run();
    const suites = instance.calls.filter(call => call.kind === "suite");
    assert.equal(suites.length, 1);
    assert.equal(suites[0].env.PREVIEW_URL, origin + (env.APP_ENTRY || "/preview/"));
    assert.equal(suites[0].env.RELEASE_URL, origin + "/");
    assert.equal(suites[0].env.APP_MODULE_BASE, env.APP_MODULE_BASE || "/preview/js/");
    assert.equal(suites[0].env.APP_MODULE_QUERY, env.APP_MODULE_QUERY || "?v=old");
    assert.equal(instance.calls.filter(call => call.kind === "closedBrowser").length, 2);
    assert.equal(instance.calls.at(-1).kind, "kill");
  }
});

test("runtime failure and startup failure clean the owned server without suite success", async () => {
  for (const options of [{ validationError: new Error("mismatch") }, { startupError: new Error("startup rejected") }]) {
    const instance = runner(options);
    await assert.rejects(instance.run());
    assert.equal(instance.calls.filter(call => call.kind === "suite").length, 0);
    assert.equal(instance.calls.filter(call => call.kind === "kill").length, 1);
    if (options.validationError) assert.equal(instance.calls.filter(call => call.kind === "closedBrowser").length, 1);
  }
});

test("nonzero and signaled suites cannot become success even when they print success", async () => {
  for (const status of [1, null]) {
    const instance = runner({ status });
    await instance.run();
    assert.equal(instance.process.exitCode, 1);
    assert.equal(instance.calls.at(-1).kind, "kill");
  }
});

function knownList(suites) {
  const file = path.join(fs.mkdtempSync(path.join(require("node:os").tmpdir(), "5e-known-")), "known.json");
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, suites }));
  return file;
}
const sampleSuite = "tests/test-project-file-size-browser.cjs";

test("listed known failures do not fail the run, unlisted failures still do", async () => {
  const listed = runner({ status: 1, args: ["--only", "test-project-file-size-browser.cjs", "--known-failures", knownList([{ path: sampleSuite, reason: "기준 실패" }])] });
  await listed.run();
  assert.notEqual(listed.process.exitCode, 1);
  const unlisted = runner({ status: 1, args: ["--only", "test-project-file-size-browser.cjs", "--known-failures", knownList([])] });
  await unlisted.run();
  assert.equal(unlisted.process.exitCode, 1);
});

test("a timed-out suite counts as a failure instead of crashing the runner", async () => {
  const error = Object.assign(new Error("spawnSync ETIMEDOUT"), { code: "ETIMEDOUT" });
  const instance = runner({ suiteError: error, env: { BROWSER_SUITE_TIMEOUT_MS: "1000" } });
  await instance.run();
  assert.equal(instance.process.exitCode, 1);
  assert.equal(instance.calls.at(-1).kind, "kill");
});

test("invalid known-failure lists are rejected before server or browser launch", async () => {
  for (const suites of [[{ path: "tests/nope-browser.cjs", reason: "x" }], [{ path: sampleSuite, reason: "" }],
    [{ path: sampleSuite, reason: "a" }, { path: sampleSuite, reason: "b" }]]) {
    const instance = runner({ args: ["--only", "test-project-file-size-browser.cjs", "--known-failures", knownList(suites)] });
    await assert.rejects(instance.run());
    assert.equal(instance.calls.length, 0);
  }
});

test("a failing suite that passes on retry is not a new failure, but repeated failure still is", async () => {
  const flaky = runner({ statuses: [1, 0], env: { BROWSER_SUITE_RETRIES: "1" } });
  await flaky.run();
  assert.notEqual(flaky.process.exitCode, 1);
  assert.equal(flaky.calls.filter(call => call.kind === "suite").length, 2);
  const broken = runner({ statuses: [1, 1], env: { BROWSER_SUITE_RETRIES: "1" } });
  await broken.run();
  assert.equal(broken.process.exitCode, 1);
  const noRetry = runner({ statuses: [1, 0] });
  await noRetry.run();
  assert.equal(noRetry.process.exitCode, 1);
  assert.equal(noRetry.calls.filter(call => call.kind === "suite").length, 1);
});
