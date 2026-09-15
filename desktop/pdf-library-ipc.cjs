const fs = require("node:fs/promises");
const path = require("node:path");

const MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024;

function safePdfFileName(value) {
  const cleaned = String(value || "PDF 자료.pdf").replace(/[\\/:*?"<>|\u0000-\u001f]+/gu, "-").trim();
  const name = cleaned || "PDF 자료.pdf";
  return /\.pdf$/iu.test(name) ? name.slice(0, 240) : `${name.slice(0, 236)}.pdf`;
}

async function savePdfDownload(options, payload = {}) {
  const bytes = Buffer.from(payload.data || []);
  if (bytes.length < 5 || bytes.length > MAX_DOWNLOAD_BYTES || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new TypeError("저장할 PDF 데이터가 올바르지 않습니다.");
  }
  const fileName = safePdfFileName(payload.fileName);
  const result = await options.dialog.showSaveDialog(options.getWindow(), {
    title: "PDF 저장",
    defaultPath: path.join(options.downloadsPath, fileName),
    filters: [{ name: "PDF 문서", extensions: ["pdf"] }],
  });
  if (result.canceled || !result.filePath) return { saved: false, canceled: true };
  await (options.writeFile || fs.writeFile)(result.filePath, bytes);
  return { saved: true, canceled: false, filePath: result.filePath };
}

function registerPdfLibraryIpc(options) {
  const invoke = (channel, handler) => options.ipcMain.handle(`pdf-library:${channel}`, (_event, payload) => handler(payload));
  invoke("pick-folder", async () => {
    const result = await options.dialog.showOpenDialog(options.getWindow(), {
      title: "PDF 라이브러리 폴더 선택",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return options.service.connect(result.filePaths[0]);
  });
  invoke("ensure-default-folder", () => options.service.ensureDefaultFolder());
  invoke("connections", () => ({ connections: options.service.connections() }));
  invoke("folder-tree", (payload) => options.service.folderTree(payload));
  invoke("set-folder-selection", (payload) => options.service.setFolderSelection(payload));
  invoke("disconnect", (payload) => options.service.disconnect(payload));
  invoke("sync", (payload) => options.service.sync(payload));
  invoke("cancel", (payload) => options.service.cancel(payload));
  invoke("list", (payload) => options.service.list(payload));
  invoke("read", (payload) => options.service.read(payload));
  invoke("read-image", (payload) => options.service.readImage(payload));
  invoke("open-folder", async (payload) => {
    const target = await options.service.folderPathForOpen(payload);
    const message = await options.shell.openPath(target);
    if (message) throw new Error(message);
    return { opened: true };
  });
  invoke("reveal-item", async (payload) => {
    const target = await options.service.itemPathForReveal(payload);
    options.shell.showItemInFolder(target);
    return { opened: true };
  });
  invoke("save-index", (payload) => options.service.saveIndex(payload));
  invoke("load-index", (payload) => options.service.loadIndex(payload));
  invoke("index-state", (payload) => options.service.indexState(payload));
  invoke("save-index-state", (payload) => options.service.saveIndexState(payload));
  invoke("retry-index", (payload) => options.service.retryIndex(payload));
  invoke("list-corrections", (payload) => options.service.listCorrections(payload));
  invoke("save-correction", (payload) => options.service.saveCorrection(payload));
  invoke("delete-correction", (payload) => options.service.deleteCorrection(payload));
  invoke("capabilities", () => options.service.capabilities());
  invoke("bundled-pack", () => options.bundledPack?.describe() || { available: false });
  invoke("read-bundled-pack", (payload) => {
    if (!options.bundledPack) throw new Error("The bundled PDF pack is unavailable.");
    return options.bundledPack.read(payload?.path);
  });
  invoke("save-download", (payload) => savePdfDownload(options, payload));
}

module.exports = { registerPdfLibraryIpc, safePdfFileName, savePdfDownload };
