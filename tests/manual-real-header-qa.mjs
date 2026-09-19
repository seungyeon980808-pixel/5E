import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url).pathname;
const output = ".omo/evidence/stage1-repair-0919/header";
const mime = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".json": "application/json" };
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  const path = normalize(join(root, decodeURIComponent(new URL(request.url, "http://localhost").pathname)));
  if (!path.startsWith(root)) { response.writeHead(403).end(); return; }
  try { response.setHeader("content-type", mime[extname(path)] || "application/octet-stream"); response.end(await readFile(path)); }
  catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const report = { viewports: [] };

const inspectEditor = async (page) => page.evaluate(() => {
  const rect = (selector) => { const box = document.querySelector(selector).getBoundingClientRect(); return [box.x, box.y, box.width, box.height]; };
  const toggles = [...document.querySelectorAll(".app .app-shell-header [data-panel-toggle]")].map((node) => ({
    side: node.dataset.panelToggle,
    expanded: node.getAttribute("aria-expanded"),
    viewBox: node.querySelector("svg")?.getAttribute("viewBox"),
    rect: (() => { const box = node.getBoundingClientRect(); return [box.x, box.y, box.width, box.height]; })(),
  }));
  return {
    viewport: [innerWidth, innerHeight],
    header: rect(".app-shell-header"),
    center: rect(".panel-center"),
    toggles,
    internalControls: document.querySelectorAll(".app [data-panel-internal-toggle]").length,
    edgeControls: document.querySelectorAll(".app .panel-edge-toggle").length,
    undoParent: document.querySelector("#undo-btn")?.parentElement?.className,
    themeParent: document.querySelector("#theme-toggle")?.parentElement?.className,
    headerAccount: document.querySelectorAll(".app-shell-header .web-account-status").length,
    inspectorAccount: document.querySelectorAll(".panel-right .web-account-status").length,
    accountParent: document.querySelector(".web-account-status")?.parentElement?.className,
  };
});

try {
  for (const viewport of [[1280, 768], [768, 768]]) {
    const page = await browser.newPage({ viewport: { width: viewport[0], height: viewport[1] }, colorScheme: "dark" });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html?real-header=${viewport[0]}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell-header [data-panel-toggle]");
    await page.waitForTimeout(500);
    const editor = await inspectEditor(page);
    assert.equal(editor.header[0], 0, "the editor header begins at the window edge");
    assert.equal(editor.header[2], viewport[0], "the editor header spans every panel column");
    assert.equal(editor.center[1], editor.header[1] + editor.header[3], "the canvas begins below the shared header row");
    assert.deepEqual(editor.toggles.map((toggle) => toggle.side).sort(), ["left", "right"]);
    assert.ok(editor.toggles.every((toggle) => toggle.viewBox === "0 0 20 20"), "both header controls retain the outlined panel SVG");
    assert.equal(editor.internalControls, 0, "the real editor has no inner duplicate panel controls");
    assert.equal(editor.edgeControls, 0, "the real editor has no obsolete fixed edge controls");
    assert.equal(editor.undoParent, "canvas-toolbar");
    assert.equal(editor.themeParent, "canvas-global-controls");
    if (editor.headerAccount + editor.inspectorAccount) {
      assert.equal(editor.headerAccount, 1, "the ChatGPT connection control is mounted in the shared header");
      assert.equal(editor.inspectorAccount, 0, "the inspector has no duplicate ChatGPT connection control");
      assert.equal(editor.accountParent, "canvas-global-controls");
    }
    await page.locator('.app-shell-header [data-panel-toggle="left"]').click();
    await page.locator('.app-shell-header [data-panel-toggle="right"]').click();
    await page.waitForTimeout(500);
    const collapsed = await inspectEditor(page);
    assert.deepEqual(collapsed.toggles.map((toggle) => toggle.expanded).sort(), ["false", "false"], "the same two header controls collapse both panels");
    assert.equal(collapsed.header[0], 0, "the shared header still begins at the window edge after both panels collapse");
    assert.equal(collapsed.header[2], viewport[0], "the shared header still spans every column after both panels collapse");
    assert.equal(collapsed.center[0], 0, "the canvas has no dead left column after both panels collapse");
    assert.equal(collapsed.center[2], viewport[0], "the canvas fills the collapsed desktop grid");
    await page.screenshot({ path: join(output, `editor-${viewport[0]}-collapsed.png`) });
    report.viewports.push({ editor, collapsed });
    await page.close();
  }

  await writeFile(join(output, "actual-dom-qa.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
