const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");
const settings = fs.readFileSync(path.join(root, "js", "settings.js"), "utf8");
const main = fs.readFileSync(path.join(root, "js", "main.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");

function functionBody(name, nextName) {
  const start = settings.indexOf(`function ${name}(`);
  const end = settings.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return settings.slice(start, end);
}

test("settings dialogs trap focus, close on Escape, and restore the opening control", () => {
  assert.match(settings, /import \{ installModalFocus \} from "\.\/modal-focus\.js\?v=/);

  const preferences = functionBody("openPreferencesDialog", "openExportDialog");
  assert.match(preferences, /const returnFocus = document\.getElementById\("settings-menu-btn"\) \|\| event\?\.currentTarget \|\| document\.activeElement/);
  assert.match(preferences, /installModalFocus\(\{[\s\S]*?root: overlay,[\s\S]*?initialFocus: overlay\.querySelector\("\.pref-tab\.is-on"\),[\s\S]*?returnFocus,[\s\S]*?onRequestClose: close/);

  const backup = functionBody("openExportDialog", "validateSettingsPayload");
  assert.match(backup, /const returnFocus = document\.getElementById\("settings-menu-btn"\) \|\| event\?\.currentTarget \|\| document\.activeElement/);
  assert.match(backup, /installModalFocus\(\{[\s\S]*?root: overlay,[\s\S]*?initialFocus: overlay\.querySelector\("#sx-ok"\),[\s\S]*?returnFocus,[\s\S]*?onRequestClose: close/);
});

test("preference tabs and zoom control can shrink without horizontal overflow", () => {
  assert.match(settings, /\.pref-tabs \{[^}]*grid-template-columns:repeat\(auto-fit, minmax\(min\(72px, 100%\), 1fr\)\)/);
  assert.match(settings, /\.pref-tab \{[^}]*min-width:0; white-space:nowrap; word-break:keep-all/);
  assert.match(settings, /\.pref-panel \{[^}]*flex:0 0 auto/);
  assert.match(settings, /\.pref-zoom \{[^}]*min-width:0/);
  assert.match(settings, /@media \(max-width:420px\) \{[\s\S]*?\.pref-zoom-row \{[^}]*grid-template-columns:minmax\(0, 1fr\) auto/);
  assert.match(settings, /\.pref-zoom-row \.pref-zoom \{[^}]*grid-column:1 \/ -1;[^}]*width:100%/);
  assert.match(settings, /@container \(max-width:120px\) \{[\s\S]*?\.pref-zoom-row \.pref-zoom \{[^}]*grid-column:1;[^}]*grid-row:3/);
  assert.match(settings, /<span class="pref-nowrap">글씨·패널 크기 조절<\/span>/);
  assert.match(settings, /<span class="pref-nowrap">5E 화면에만 적용<\/span>/);
});

test("settings dialogs expose complete keyboard and naming semantics", () => {
  assert.match(settings, /id="pref-tab-\$\{t\.id\}" role="tab"[\s\S]*?aria-controls="pref-panel-\$\{t\.id\}" tabindex="\$\{i === 0 \? 0 : -1\}"/);
  assert.match(settings, /role="tabpanel"[\s\S]*?aria-labelledby="pref-tab-screen"/);
  assert.match(settings, /<label class="modal-label" for="pref-zoom">화면 크기<\/label>/);
  assert.match(settings, /event\.key === "ArrowRight"[\s\S]*?event\.key === "ArrowLeft"[\s\S]*?event\.key === "Home"[\s\S]*?event\.key === "End"/);
  assert.match(settings, /role="dialog" aria-modal="true" aria-labelledby="sx-title"/);
  assert.match(settings, /<h2 class="modal-title" id="sx-title">전체 저장 \(백업\)<\/h2>/);
});

test("settings module cache key is fresh without changing the authoritative RC identity", () => {
  assert.match(main, /settings\.js\?v=1\.6\.0-rc\.1-settings-health/);
  assert.match(index, /main\.js\?v=1\.6\.0-rc\.1"/);
});

test("restored subject and display settings are applied in the current tab", async (t) => {
  const stored = new Map();
  const attributes = new Map();
  const inlineStyles = new Map();
  const subjectEvents = [];
  const subjectSelect = {
    value: "p",
    dispatchEvent(event) { subjectEvents.push(event.type); },
  };
  globalThis.localStorage = {
    getItem(key) { return stored.has(key) ? stored.get(key) : null; },
    setItem(key, value) { stored.set(key, String(value)); },
    removeItem(key) { stored.delete(key); },
  };
  globalThis.document = {
    activeElement: null,
    addEventListener() {},
    documentElement: {
      setAttribute(name, value) { attributes.set(name, String(value)); },
      style: {
        setProperty(name, value) { inlineStyles.set(name, String(value)); },
        removeProperty(name) { inlineStyles.delete(name); },
      },
    },
    getElementById(id) { return id === "subject-select" ? subjectSelect : null; },
  };
  globalThis.window = { dispatchEvent() {} };
  t.after(() => {
    delete globalThis.localStorage;
    delete globalThis.document;
    delete globalThis.window;
  });

  const moduleUrl = `${pathToFileURL(path.join(root, "js", "settings.js")).href}?settings-regression=${Date.now()}`;
  const { applyImportedSettings } = await import(moduleUrl);
  const result = await applyImportedSettings({
    "5e.subject": "c",
    "5e.screenSize": "wide",
    "5e.uiZoom": "1.25",
  });

  assert.deepEqual(result, {
    applied: ["5e.subject", "5e.screenSize", "5e.uiZoom"],
    failed: [],
    skipped: [],
  });
  assert.equal(subjectSelect.value, "c");
  assert.deepEqual(subjectEvents, ["change"]);
  assert.equal(attributes.get("data-screen"), "wide");
  assert.equal(inlineStyles.get("--ui-zoom"), "1.25");
});
