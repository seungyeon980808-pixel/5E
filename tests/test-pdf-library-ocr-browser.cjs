const electron = require("electron");
const { spawnSync } = require("node:child_process");
const { readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const repositoryRoot = path.join(__dirname, "..");
const evidenceDirectory = path.join(repositoryRoot, ".omo", "evidence", "pdf-library", "OCR");

if (typeof electron === "string") {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(electron, [__filename], { env: environment, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} else {
  const { app, BrowserWindow } = electron;
  app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: `ocr-smoke-${process.pid}` },
  });
  const requests = [];
  window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    requests.push(details.url);
    callback({});
  });
  try {
    await window.loadFile(path.join(repositoryRoot, "tests", "fixtures", "pdf-library-ocr.html"));
    await window.webContents.session.enableNetworkEmulation({ offline: true });
    const image = await readFile(path.join(evidenceDirectory, "raster-korean-rendered.png"));
    const result = await window.webContents.executeJavaScript(`(async () => {
      const { createPdfOcrService } = await import("../../js/pdf-library/ocr.js");
      const document = {
        schemaVersion: "pdf-library-v1", id: "browser-raster", title: "Browser raster",
        source: { kind: "file", locator: "test:browser-raster", displayName: "browser-raster.pdf" },
        pageCount: 1, status: "image-only",
        pages: [{ documentId: "browser-raster", pageNumber: 1, widthPoints: 612, heightPoints: 792, rotation: 0, text: "", words: [], items: [] }],
      };
      const progress = [];
      const runtime = { async renderPage() {
        return { bytes: Uint8Array.from(${JSON.stringify([...image])}), width: 1020, height: 1320 };
      } };
      const service = createPdfOcrService({ runtime });
      const recognized = await service.recognizeDocument({ document, language: "kor+eng", onProgress(event) { progress.push(event); } });
      return { text: recognized.document.pages[0].text, confidence: recognized.confidence, progress };
    })()`);
    if (!result.text.includes("운동량 보존 실험")) throw new Error(`Unexpected OCR text: ${result.text}`);
    if (result.confidence < 0.8) throw new Error(`Unexpected OCR confidence: ${result.confidence}`);
    const externalRequests = requests.filter((url) => /^https?:/u.test(url));
    if (externalRequests.length) throw new Error(`OCR made external requests: ${externalRequests.join(", ")}`);
    await writeFile(path.join(evidenceDirectory, "browser-ocr-result.json"), JSON.stringify({ ...result, requests, externalRequests }, null, 2));
    process.stdout.write(`${JSON.stringify({ ok: true, text: result.text, confidence: result.confidence })}\n`);
  } finally {
    window.destroy();
    app.quit();
  }
  }).catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    app.exit(1);
  });
}
