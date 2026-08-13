const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fiveEDesktop", {
  status: async () => ({ server: true, login: { loggedIn: true } }),
  models: async () => ({ data: [] }),
  account: async () => ({}),
  send: (payload) => ipcRenderer.invoke("phase0:capture-send", payload),
  onProbeCapture: (listener) => ipcRenderer.on("phase0:send-captured", (_event, count) => listener(count)),
  onEvent: () => {}, onLog: () => {}, onState: () => {},
});
