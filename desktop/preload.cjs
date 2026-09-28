const { contextBridge, ipcRenderer } = require("electron");
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("desktop-shell", `platform-${process.platform}`);
});
contextBridge.exposeInMainWorld("fiveEDesktop", {
  status: () => ipcRenderer.invoke("codex:status"),
  start: () => ipcRenderer.invoke("codex:start"),
  stop: (payload) => ipcRenderer.invoke("codex:stop", payload),
  models: () => ipcRenderer.invoke("codex:models"),
  account: () => ipcRenderer.invoke("codex:account"),
  login: () => ipcRenderer.invoke("codex:login"),
  send: (payload) => ipcRenderer.invoke("codex:send", payload),
  interrupt: (payload) => ipcRenderer.invoke("codex:interrupt", payload),
  captureSources: () => ipcRenderer.invoke("capture:sources"),
  pickLocalImageFolder: () => ipcRenderer.invoke("local-images:pick-folder"),
  listLocalImages: (folder) => ipcRenderer.invoke("local-images:list", folder),
  localImageThumbnail: (filePath) => ipcRenderer.invoke("local-images:thumbnail", filePath),
  readLocalImage: (filePath) => ipcRenderer.invoke("local-images:read", filePath),
  onEvent: (callback) => {
    const listener = (_, value) => callback(value);
    ipcRenderer.on("codex:event", listener);
    return () => ipcRenderer.removeListener("codex:event", listener);
  },
  onLog: (callback) => {
    const listener = (_, value) => callback(value);
    ipcRenderer.on("codex:log", listener);
    return () => ipcRenderer.removeListener("codex:log", listener);
  },
  onState: (callback) => {
    const listener = (_, value) => callback(value);
    ipcRenderer.on("codex:state", listener);
    return () => ipcRenderer.removeListener("codex:state", listener);
  }
});
