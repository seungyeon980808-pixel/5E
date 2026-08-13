const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { assertBrowserDesktopParity } = require("../tests/stabilization/harness/browser-desktop-parity.cjs");
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

test("HTTP-served Chromium behavior matches the Electron adapter without console or unhandled errors", { timeout: 45_000 }, async () => {
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
  const { rankPdfPages } = await import(pathToFileURL(path.join(root, "js", "pdf-search.mjs")).href);
  const { selectImageTransportItems } = await import(pathToFileURL(path.join(root, "js", "ai-request-plan.js")).href);
  const pages = [
    { id: "fixture:1", name: "별빛.pdf", pageNumber: 1, text: "빛 프리즘" },
    { id: "fixture:2", name: "별빛.pdf", pageNumber: 2, text: "빛 거울" },
  ];
  const expected = {
    searchIds: rankPdfPages(pages, "빛 프리즘").map((page) => page.id),
    pdfPaths: ["시험/별빛.pdf"],
    transportKinds: selectImageTransportItems([
      { sourceKind: "local-pdf-crop", data: "blocked" },
      { sourceKind: "local-pdf-crop-confirmed", data: "selected-crop" },
    ]).map((item) => item.sourceKind),
  };

  // Then
  assert.equal(report.appReady, true);
  assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.unhandledExceptions, []);
  assertBrowserDesktopParity(assert,
    { outcome: report.browser, transportCalls: [] },
    { outcome: report.desktop, transportCalls: [] });
  assert.deepEqual(report.browser, expected);
});
