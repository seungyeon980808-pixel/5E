const { contextBridge, ipcRenderer } = require("electron");
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("desktop-shell", `platform-${process.platform}`);
});
contextBridge.exposeInMainWorld("fiveEDesktop", {
  exam: {
    annotationsReply:payload=>ipcRenderer.invoke('exam:annotations-reply',payload),
    onAnnotationsRequest:callback=>{const listener=(_event,payload)=>callback(payload);ipcRenderer.on('exam:annotations-request',listener);return()=>ipcRenderer.removeListener('exam:annotations-request',listener);},
    openProject:bytes=>ipcRenderer.invoke('exam:open-project',bytes),
    projectSnapshot:()=>ipcRenderer.invoke('exam:project-snapshot'),
    workspaceReply:payload=>ipcRenderer.invoke('exam:workspace-reply',payload),
    workspaceChanged:()=>ipcRenderer.invoke('exam:workspace-changed'),
    saveWorkspace:()=>ipcRenderer.invoke('exam:save-workspace'),
    onWorkspaceRequest:callback=>{const listener=(_event,payload)=>callback(payload);ipcRenderer.on('exam:workspace-request',listener);return()=>ipcRenderer.removeListener('exam:workspace-request',listener);},
    publishNames: names => ipcRenderer.invoke('exam:publish-names',names),
    open: payload => ipcRenderer.invoke('exam:open', payload),
    finish: payload => ipcRenderer.invoke('exam:finish',payload),
    onEdit: callback => {const listener = (_event,payload) => callback(payload);ipcRenderer.on('exam:edit',listener);return () => ipcRenderer.removeListener('exam:edit',listener);},
    onCancel: callback => {const listener = () => callback();ipcRenderer.on('exam:cancel',listener);return () => ipcRenderer.removeListener('exam:cancel',listener);},
  },
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
