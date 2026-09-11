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
  invoke("list-corrections", (payload) => options.service.listCorrections(payload));
  invoke("save-correction", (payload) => options.service.saveCorrection(payload));
  invoke("delete-correction", (payload) => options.service.deleteCorrection(payload));
  invoke("capabilities", () => options.service.capabilities());
  invoke("bundled-pack", () => options.bundledPack?.describe() || { available: false });
  invoke("read-bundled-pack", (payload) => {
    if (!options.bundledPack) throw new Error("The bundled PDF pack is unavailable.");
    return options.bundledPack.read(payload?.path);
  });
}

module.exports = { registerPdfLibraryIpc };
