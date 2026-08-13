const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { withTemporaryDirectory } = require("../tests/stabilization/harness/common-fixtures.cjs");
const { createTextlessSyntheticPdf } = require("../tests/stabilization/fixtures/pdf/generate-synthetic-pdf.cjs");

const root = path.resolve(__dirname, "..");

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return new Map([
    [".css", "text/css"], [".html", "text/html"], [".js", "text/javascript"],
    [".json", "application/json"], [".mjs", "text/javascript"], [".svg", "image/svg+xml"],
    [".woff2", "font/woff2"],
  ]).get(extension) || "application/octet-stream";
}

function createStaticServer() {
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    if (pathname === "/__phase0-textless.pdf") {
      response.writeHead(200, { "content-type": "application/pdf" }).end(createTextlessSyntheticPdf());
      return;
    }
    const filePath = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!filePath.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) response.writeHead(404).end();
      else response.writeHead(200, { "content-type": contentType(filePath) }).end(data);
    });
  });
}

function electronExecutable() {
  const name = process.platform === "win32" ? "electron.exe" : "electron";
  const commonGitDirectory = path.resolve(root,
    execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim());
  const candidates = [
    process.env.FIVE_E_BROWSER_HARNESS_EXE,
    path.join(root, "node_modules", "electron", "dist", name),
    path.join(path.dirname(commonGitDirectory), "node_modules", "electron", "dist", name),
  ].filter(Boolean);
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(executable, `Electron executable not found in: ${candidates.join(", ")}`);
  return executable;
}

function runProbe(executable, url, reportPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [path.join(__dirname, "browser-served-probe.cjs")], {
      cwd: root,
      env: { ...process.env, FIVE_E_BROWSER_HARNESS_URL: url, FIVE_E_BROWSER_HARNESS_REPORT: reportPath },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Chromium probe timed out after 30 seconds"));
    }, 30_000);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`Chromium probe exited ${code}: ${stderr}`));
    });
  });
}

test("HTTP-served AI panel and Electron IPC enforce identical local-reference transport privacy", { timeout: 60_000 }, async () => {
  // Given
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/index.html`;

  // When
  const report = await withTemporaryDirectory("5e-browser-harness-", async (directory) => {
    const reportPath = path.join(directory, "report.json");
    try {
      await runProbe(electronExecutable(), url, reportPath);
      return JSON.parse(fs.readFileSync(reportPath, "utf8"));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
  // Then
  assert.equal(report.appReady, true, JSON.stringify(report));
  assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.unhandledExceptions, []);
  assert.deepEqual(report.desktop, report.browser);
  assert.equal(report.browser.single.calls, 1);
  assert.equal(report.browser.batch.calls, 3);
  assert.deepEqual(report.browser.single.purposes, ["image"]);
  assert.deepEqual(report.browser.batch.purposes, ["image", "image", "image"]);
  assert.deepEqual(report.browser.single.attachmentNames, [
    "ai-input-1-overview.png",
    "ai-input-3-crop.png",
    "ai-input-4-contact-sheet.png",
  ]);
  assert.equal(report.browser.single.requestPromptCount, 1);
  assert.equal(report.browser.batch.requestPromptCount, 3);
  for (const flow of [report.browser.single, report.browser.batch]) {
    assert.deepEqual(flow.blocked, {
      nameInPrompt: false, nameInAttachments: false, commentInPrompt: false, pixels: 0,
    });
    assert.equal(flow.confirmed.nameInPrompt, true);
    assert.equal(flow.confirmed.commentInPrompt, true);
    assert.ok(flow.confirmed.pixels > 0);
    assert.equal(flow.automatic.nameInPrompt, true);
    assert.equal(flow.automatic.commentInPrompt, true);
    assert.ok(flow.automatic.pixels > 0);
  }
  assert.equal(report.browser.single.confirmed.nameInAttachments, false);
  assert.equal(report.browser.single.automatic.nameInAttachments, false);
  assert.equal(report.browser.batch.confirmed.nameInAttachments, true);
  assert.equal(report.browser.batch.automatic.nameInAttachments, true);
});
