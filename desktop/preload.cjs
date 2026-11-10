const { contextBridge, ipcRenderer } = require("electron");
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("desktop-shell", `platform-${process.platform}`);
  // 시작 창이 뜨지 않는 경우(검사·화면 오류)에도 창이 작은 채로 남지 않게: 6초 안에 시작 창이 없으면 바로 키운다.
  setTimeout(() => { if (!document.getElementById("start-screen")) ipcRenderer.invoke("window:start-expand").catch(() => {}); }, 6000);
  if (process.platform !== "darwin") return;
  // 맥 제목 줄: 평소엔 숨김. 마우스가 맨 위 6px 안에 오면 얇은 줄(창 끌기 자리)과 신호등 단추가 내려오고,
  // 줄 아래로 벗어나면 0.4초 뒤 다시 올라간다(11-04 사용자: 가까이 가야 내려오게, 문구 없이).
  const root = document.documentElement;
  let shown = false, timer = 0;
  const set = (next) => {
    clearTimeout(timer);
    if (shown === next) return;
    shown = next;
    // 11-05: 라이브러리처럼 창을 다 덮는 화면은 자기 머리줄을 창 끌기 자리로 쓴다 — 제목 줄을 내리지 않고 신호등 단추만 보인다.
    root.classList.toggle("desktop-titlebar-open", next && !document.querySelector(".unified-library-overlay:not([hidden])"));
    ipcRenderer.invoke("window:traffic-lights", next).catch(() => {});
  };
  document.addEventListener("mousemove", (event) => {
    if (event.clientY <= 6 && !document.getElementById("start-screen")) set(true);
    else if (shown && event.clientY > 34) { clearTimeout(timer); timer = setTimeout(() => set(false), 400); }
    else if (shown) clearTimeout(timer);
  }, { passive: true });
  document.addEventListener("mouseleave", () => { if (shown) { clearTimeout(timer); timer = setTimeout(() => set(false), 400); } });
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
  examEvidence: (request) => ipcRenderer.invoke("exampool:evidence", request),
  status: () => ipcRenderer.invoke("codex:status"),
  start: () => ipcRenderer.invoke("codex:start"),
  stop: (payload) => ipcRenderer.invoke("codex:stop", payload),
  models: () => ipcRenderer.invoke("codex:models"),
  account: () => ipcRenderer.invoke("codex:account"),
  login: () => ipcRenderer.invoke("codex:login"),
  send: (payload) => ipcRenderer.invoke("codex:send", payload),
  // 11-10: 원본 그림을 읽는 글자 호출(라벨 복원). 에이전트를 거치지 않는다.
  readImageText: (payload) => ipcRenderer.invoke("codex:read-image-text", payload),
  interrupt: (payload) => ipcRenderer.invoke("codex:interrupt", payload),
  captureSources: () => ipcRenderer.invoke("capture:sources"),
  // 문항 라이브러리 「내 컴퓨터 폴더 연결」(11-04 되살림)
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
    onProgress: (callback) => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on("pdf-library:progress", listener);
      return () => ipcRenderer.removeListener("pdf-library:progress", listener);
    },
  },
  // 시작 창에서 고르면 창을 작업 화면 크기로 키운다(11-04)
  startWindow: { expand: () => ipcRenderer.invoke("window:start-expand"), shrink: () => ipcRenderer.invoke("window:start-shrink") },
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
