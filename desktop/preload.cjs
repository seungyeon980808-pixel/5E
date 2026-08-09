const { contextBridge, ipcRenderer } = require("electron");
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("desktop-shell");
});
contextBridge.exposeInMainWorld("fiveEDesktop", {
  status: () => ipcRenderer.invoke("codex:status"),
  start: () => ipcRenderer.invoke("codex:start"),
  stop: () => ipcRenderer.invoke("codex:stop"),
  models: () => ipcRenderer.invoke("codex:models"),
  account: () => ipcRenderer.invoke("codex:account"),
  login: () => ipcRenderer.invoke("codex:login"),
  send: (payload) => ipcRenderer.invoke("codex:send", payload),
  interrupt: () => ipcRenderer.invoke("codex:interrupt"),
  captureSources: () => ipcRenderer.invoke("capture:sources"),
  onEvent: (callback) => ipcRenderer.on("codex:event", (_, value) => callback(value)),
  onLog: (callback) => ipcRenderer.on("codex:log", (_, value) => callback(value)),
  onState: (callback) => ipcRenderer.on("codex:state", (_, value) => callback(value))
});
