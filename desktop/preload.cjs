const { contextBridge, ipcRenderer } = require("electron");
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("desktop-shell", `platform-${process.platform}`);
});
contextBridge.exposeInMainWorld("fiveEDesktop", {
  fullscreen: {
    toggle: () => ipcRenderer.invoke("window:toggle-fullscreen"),
    get: () => ipcRenderer.invoke("window:get-fullscreen"),
    onChange: (callback) => {
      const listener = (_event, active) => callback(Boolean(active));
      ipcRenderer.on("window:fullscreen-changed", listener);
      return () => ipcRenderer.removeListener("window:fullscreen-changed", listener);
    },
  },
  setAiTaskShortcutActive: (active) => ipcRenderer.send("ai:task-shortcut-active", Boolean(active)),
  onAiCloseTaskShortcut: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("ai:close-task-shortcut", listener);
    return () => ipcRenderer.removeListener("ai:close-task-shortcut", listener);
  },
  readClipboardImage: () => ipcRenderer.invoke("clipboard:read-image"),
  status: (options) => ipcRenderer.invoke("codex:status", options),
  start: (options) => ipcRenderer.invoke("codex:start", options),
  stop: (options) => ipcRenderer.invoke("codex:stop", options),
  models: (options) => ipcRenderer.invoke("codex:models", options),
  account: (options) => ipcRenderer.invoke("codex:account", options),
  login: (options) => ipcRenderer.invoke("codex:login", options),
  send: (payload) => ipcRenderer.invoke("codex:send", payload),
  interrupt: (options) => ipcRenderer.invoke("codex:interrupt", options),
  captureSources: () => ipcRenderer.invoke("capture:sources"),
  pickLocalImageFolder: () => ipcRenderer.invoke("local-images:pick-folder"),
  listLocalImages: (folder) => ipcRenderer.invoke("local-images:list", folder),
  localImageThumbnail: (filePath) => ipcRenderer.invoke("local-images:thumbnail", filePath),
  readLocalImage: (filePath) => ipcRenderer.invoke("local-images:read", filePath),
  pdfLibrary: {
    pickFolder: () => ipcRenderer.invoke("pdf-library:pick-folder"),
    ensureDefaultFolder: () => ipcRenderer.invoke("pdf-library:ensure-default-folder"),
    connections: () => ipcRenderer.invoke("pdf-library:connections"),
    folderTree: (value) => ipcRenderer.invoke("pdf-library:folder-tree", typeof value === "string" ? { connectionId: value } : value),
    setFolderSelection: (value, selected) => ipcRenderer.invoke("pdf-library:set-folder-selection", typeof value === "string" ? { folderId: value, selected } : value),
    disconnect: (payload) => ipcRenderer.invoke("pdf-library:disconnect", payload),
    sync: (value, operationId) => ipcRenderer.invoke("pdf-library:sync", typeof value === "string" ? { connectionId: value, operationId } : value),
    cancel: (payload) => ipcRenderer.invoke("pdf-library:cancel", payload),
    list: (value) => ipcRenderer.invoke("pdf-library:list", typeof value === "string" ? { connectionId: value } : value),
    read: (payload) => ipcRenderer.invoke("pdf-library:read", payload),
    readImage: (value) => ipcRenderer.invoke("pdf-library:read-image", typeof value === "string" ? { imageId: value } : value),
    openFolder: (value) => ipcRenderer.invoke("pdf-library:open-folder", typeof value === "string" ? { folderId: value } : value),
    revealItem: (payload) => ipcRenderer.invoke("pdf-library:reveal-item", payload),
    saveIndex: (payload) => ipcRenderer.invoke("pdf-library:save-index", payload),
    loadIndex: (payload) => ipcRenderer.invoke("pdf-library:load-index", payload),
    indexState: (payload) => ipcRenderer.invoke("pdf-library:index-state", payload),
    saveIndexState: (payload) => ipcRenderer.invoke("pdf-library:save-index-state", payload),
    listCorrections: (payload) => ipcRenderer.invoke("pdf-library:list-corrections", payload),
    saveCorrection: (payload) => ipcRenderer.invoke("pdf-library:save-correction", payload),
    deleteCorrection: (payload) => ipcRenderer.invoke("pdf-library:delete-correction", payload),
    capabilities: () => ipcRenderer.invoke("pdf-library:capabilities"),
    bundledPack: () => ipcRenderer.invoke("pdf-library:bundled-pack"),
    readBundledPack: (path) => ipcRenderer.invoke("pdf-library:read-bundled-pack", { path }),
    saveDownload: (payload) => ipcRenderer.invoke("pdf-library:save-download", payload),
    onProgress: (callback) => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on("pdf-library:progress", listener);
      return () => ipcRenderer.removeListener("pdf-library:progress", listener);
    },
  },
  batchOutput: {
    pickFolder: () => ipcRenderer.invoke("batch-output:pick-folder"),
    save: (payload) => ipcRenderer.invoke("batch-output:save", payload),
  },
  imageExport: {
    save: (payload) => ipcRenderer.invoke("image-export:save", payload),
  },
  onEvent: (callback) => ipcRenderer.on("codex:event", (_, value) => callback(value)),
  onLog: (callback) => ipcRenderer.on("codex:log", (_, value) => callback(value)),
  onState: (callback) => ipcRenderer.on("codex:state", (_, value) => callback(value))
});
