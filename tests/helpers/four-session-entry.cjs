const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function entryConfiguration(env = process.env) {
  const entry = env.APP_ENTRY ?? "/preview/";
  assert.ok(entry === "/" || entry === "/preview/", "APP_ENTRY must be / or /preview/");
  const moduleBase = env.APP_MODULE_BASE;
  const moduleQuery = env.APP_MODULE_QUERY;
  if (moduleBase !== undefined) {
    assert.match(moduleBase, /^\/(?:[A-Za-z0-9_-]+\/)+$/, "APP_MODULE_BASE must be an absolute local directory");
  }
  if (moduleQuery !== undefined) {
    assert.match(moduleQuery, /^(?:|\?[A-Za-z0-9._~%=&+-]+)$/, "APP_MODULE_QUERY must be empty or a query");
  }
  return { entry, moduleBase, moduleQuery };
}

function assertCompleteInventory(manifest, root) {
  assert.equal(manifest.schemaVersion, 1, "Unknown suite manifest schema");
  const classified = new Set();
  for (const classification of ["unit", "browser", "deferred"]) {
    assert.ok(Array.isArray(manifest[classification]), `Missing classification: ${classification}`);
    for (const entry of manifest[classification]) {
      assert.ok(entry && typeof entry.path === "string", "Missing suite path");
      assert.ok(!path.isAbsolute(entry.path) && !entry.path.includes("\\")
        && path.posix.normalize(entry.path) === entry.path && !entry.path.startsWith("../")
        && /\.(?:cjs|mjs)$/.test(entry.path), `Invalid suite path: ${entry.path}`);
      assert.ok(!classified.has(entry.path), `Duplicate suite path: ${entry.path}`);
      classified.add(entry.path);
      assert.ok(fs.existsSync(path.join(root, entry.path))
        && fs.statSync(path.join(root, entry.path)).isFile(), `Missing suite file: ${entry.path}`);
      if (classification === "browser" || entry.findingIds !== undefined) {
        assert.ok(Array.isArray(entry.findingIds) && entry.findingIds.length > 0
          && entry.findingIds.every(id => typeof id === "string" && id.length > 0),
        `Missing findingIds: ${entry.path}`);
      }
      if (classification === "deferred") {
        assert.ok(typeof entry.reason === "string" && entry.reason.length > 0, `Missing deferral reason: ${entry.path}`);
      }
    }
  }
  const candidates = fs.readdirSync(path.join(root, "tests"))
    .filter(name => /\.(?:cjs|mjs)$/.test(name) && name !== "run-browser-tests.cjs")
    .map(name => `tests/${name}`);
  const missing = candidates.filter(file => !classified.has(file));
  assert.deepEqual(missing, [], `Unclassified test scripts: ${missing.join(", ")}`);
}

function mainModuleUrl(html, entryUrl) {
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)]
    .map(match => new URL(match[1], entryUrl))
    .filter(url => url.pathname.endsWith("/main.js"));
  assert.equal(scripts.length, 1, "Entry must load exactly one main module");
  assert.equal(scripts[0].origin, new URL(entryUrl).origin, "Main module must be same-origin");
  return scripts[0].href;
}

function runtimeConfiguration(config, entryUrl, mainUrl, mainSource) {
  const imported = [...mainSource.matchAll(/\bfrom\s*["']([^"']*\/state\.js(?:\?[^"']*)?)["']/g)];
  assert.equal(imported.length, 1, "Main must import exactly one state module");
  const state = new URL(imported[0][1], mainUrl);
  const main = new URL(mainUrl);
  const moduleBase = config.moduleBase ?? new URL(".", main).pathname;
  const moduleQuery = config.moduleQuery ?? state.search;
  assert.equal(main.origin, new URL(entryUrl).origin, "Main module must be same-origin");
  assert.equal(main.pathname, `${moduleBase}main.js`, "APP_MODULE_BASE differs from loaded main");
  assert.equal(state.href, new URL(`${moduleBase}state.js${moduleQuery}`, entryUrl).href,
    "Requested state module differs from the entry runtime; refusing a second instance");
  return { ...config, entryUrl, moduleBase, moduleQuery, mainUrl: main.href, stateUrl: state.href };
}

function assertLoadedRuntime(runtime, resourceUrls) {
  for (const [name, expected] of [["main", runtime.mainUrl], ["state", runtime.stateUrl]]) {
    const loaded = [...new Set(resourceUrls.filter(url => new URL(url).pathname.endsWith(`/${name}.js`)))];
    assert.deepEqual(loaded, [expected], `Loaded ${name} identity does not match requested runtime`);
  }
}

// Subscribe before navigation. Inspect resources only: importing an expected URL
// here could manufacture the very second state instance this guard rejects.
async function inspectEntry(page, origin, config) {
  const resources = [];
  const responses = [];
  const record = response => {
    if (response.url().startsWith(origin + "/")) {
      resources.push(response.url());
      responses.push({ url: response.url(), status: response.status(), headers: response.headers() });
    }
  };
  page.on("response", record);
  try {
    const entryUrl = new URL(config.entry, origin).href;
    const response = await page.goto(`${entryUrl}?mode=pro&mobile=0`, { waitUntil: "load", timeout: 30_000 });
    assert.equal(response.status(), 200, "Entry request failed");
    const html = await response.text();
    const mainUrl = mainModuleUrl(html, entryUrl);
    const mainResponse = await page.request.get(mainUrl, { timeout: 10_000 });
    assert.equal(mainResponse.status(), 200, "Main module request failed");
    const mainSource = await mainResponse.text();
    const runtime = runtimeConfiguration(config, entryUrl, mainUrl, mainSource);
    assertLoadedRuntime(runtime, resources);
    const stateResponse = await page.request.get(runtime.stateUrl, { timeout: 10_000 });
    assert.equal(stateResponse.status(), 200, "State module request failed");
    await page.locator("#canvas").waitFor({ state: "visible", timeout: 10_000 });
    return { ...runtime, resources: responses, http: [
      { url: response.url(), status: response.status(), headers: response.headers(), body: html },
      { url: mainUrl, status: mainResponse.status(), headers: mainResponse.headers(), body: mainSource },
      { url: runtime.stateUrl, status: stateResponse.status(), headers: stateResponse.headers(), body: await stateResponse.text() },
    ] };
  } catch (error) {
    error.resourceReceipt = responses;
    throw error;
  } finally {
    page.off("response", record);
  }
}

module.exports = { entryConfiguration, assertCompleteInventory, mainModuleUrl, runtimeConfiguration, assertLoadedRuntime, inspectEntry };
