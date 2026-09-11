const { contextBridge, ipcRenderer } = require("electron");
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("desktop-shell");
});
contextBridge.exposeInMainWorld("fiveEDesktop", {
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
  onEvent: (callback) => ipcRenderer.on("codex:event", (_, value) => callback(value)),
  onLog: (callback) => ipcRenderer.on("codex:log", (_, value) => callback(value)),
  onState: (callback) => ipcRenderer.on("codex:state", (_, value) => callback(value))
});
