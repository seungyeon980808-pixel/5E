const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");

const url = process.env.FIVE_E_BROWSER_HARNESS_URL;
const reportPath = process.env.FIVE_E_BROWSER_HARNESS_REPORT;
const captureDirectory = process.env.FIVE_E_BROWSER_HARNESS_CAPTURE_DIR;
const consoleErrors = [];
const unhandledExceptions = [];
let finished = false;

function messageOf(value) {
  return value instanceof Error ? value.stack || value.message : String(value);
}

function finish(report, exitCode = 0) {
  if (finished) return;
  finished = true;
  fs.writeFileSync(reportPath, JSON.stringify({
    ...report,
    consoleErrors,
    unhandledExceptions,
  }), "utf8");
  app.exit(exitCode);
}

process.on("uncaughtException", (error) => {
  unhandledExceptions.push(messageOf(error));
  finish({ appReady: false }, 1);
});
process.on("unhandledRejection", (error) => {
  unhandledExceptions.push(messageOf(error));
  finish({ appReady: false }, 1);
});

app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.on("console-message", (_event, details, message) => {
    const level = typeof details === "object" ? details.level : details;
    const text = typeof details === "object" ? details.message : message;
    if (level === "error" || level === 3) consoleErrors.push(String(text));
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    unhandledExceptions.push(`render-process-gone: ${details.reason}`);
  });
  window.webContents.on("did-fail-load", (_event, code, description) => {
    unhandledExceptions.push(`did-fail-load ${code}: ${description}`);
  });
  try {
    await window.loadURL(url);
    const result = await window.webContents.executeJavaScript(`(async () => {
      const unhandled = [];
      window.addEventListener("error", (event) => unhandled.push(String(event.error || event.message)));
      window.addEventListener("unhandledrejection", (event) => unhandled.push(String(event.reason)));
      const search = await import("./js/pdf-search.mjs");
      const sources = await import("./js/local-reference-sources.mjs");
      const requestPlan = await import("./js/ai-request-plan.js");
      const pages = [
        { id: "fixture:1", name: "별빛.pdf", pageNumber: 1, text: "빛 프리즘" },
        { id: "fixture:2", name: "별빛.pdf", pageNumber: 2, text: "빛 거울" },
      ];
      const file = { name: "별빛.pdf", webkitRelativePath: "시험/별빛.pdf", size: 4,
        lastModified: 1, arrayBuffer: async () => new ArrayBuffer(4) };
      const browserAssets = sources.sourcesFromWebFiles([file]);
      const desktopAssets = sources.sourcesFromDesktopResult({ items: [], pdfs: [{
        path: "C:\\\\시험\\\\별빛.pdf", name: "별빛.pdf", relativePath: "시험/별빛.pdf",
      }] }, { readLocalPdf: async () => new Uint8Array(4) });
      const outcome = (assets) => ({
        searchIds: search.rankPdfPages(pages, "빛 프리즘").map((page) => page.id),
        pdfPaths: assets.pdfs.map((pdf) => pdf.relativePath),
        transportKinds: requestPlan.selectImageTransportItems([
          { sourceKind: "local-pdf-crop", data: "blocked" },
          { sourceKind: "local-pdf-crop-confirmed", data: "selected-crop" },
        ]).map((item) => item.sourceKind),
      });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { appReady: Boolean(document.querySelector("#scene")), browser: outcome(browserAssets),
        desktop: outcome(desktopAssets), unhandled };
    })()`);
    unhandledExceptions.push(...result.unhandled);
    if (captureDirectory) {
      await window.webContents.executeJavaScript(`(async () => {
        const { createAiReferenceSearch } = await import("./js/ai-reference-search.js");
        document.querySelectorAll(".modal-overlay, .tut-welcome-overlay").forEach((element) => element.remove());
        const desktop = {
          pickLocalImageFolder: async () => ({ folder: "C:\\\\시험" }),
          listLocalImages: async () => ({
            folder: "C:\\\\시험",
            items: [],
            pdfs: [{ path: "C:\\\\시험\\\\스캔-물리-모의시험.pdf",
              name: "스캔-물리-모의시험.pdf", relativePath: "시험/스캔-물리-모의시험.pdf",
              size: 4096, modifiedAt: 1, kind: "pdf" }],
          }),
          readLocalPdf: async () => new Uint8Array(await (await fetch("/__phase0-textless.pdf")).arrayBuffer()),
        };
        const searchUi = createAiReferenceSearch({ desktop });
        await searchUi.open();
        document.querySelector("[data-ai-local-pick]").click();
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
          const text = document.querySelector("[data-ai-local-folder] span")?.textContent.replaceAll(" ", " ") || "";
          if (text.includes("검색 가능한 텍스트 없음")) break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        const folderText = document.querySelector("[data-ai-local-folder] span")?.textContent.replaceAll(" ", " ") || "";
        if (!folderText.includes("검색 가능한 텍스트 없음")) throw new Error("textless notice did not render");
        const input = document.querySelector(".ai-reference-search-query input");
        input.value = "prism";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      })()`);
      for (const width of [375, 768, 1280]) {
        window.setContentSize(width, 900);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const image = await window.webContents.capturePage();
        fs.writeFileSync(`${captureDirectory}/pdf-textless-${width}.png`, image.toPNG());
      }
    }
    finish({ appReady: result.appReady, browser: result.browser, desktop: result.desktop });
  } catch (error) {
    unhandledExceptions.push(messageOf(error));
    finish({ appReady: false }, 1);
  }
});
