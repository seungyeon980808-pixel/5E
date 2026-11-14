const { contextBridge, ipcRenderer } = require("electron");
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("desktop-shell", `platform-${process.platform}`);
  // 시작 창이 뜨지 않는 경우(검사·화면 오류)에도 창이 작은 채로 남지 않게: 6초 안에 시작 창이 없으면 바로 키운다.
  setTimeout(() => { if (!document.getElementById("start-screen")) ipcRenderer.invoke("window:start-expand").catch(() => {}); }, 6000);
  if (process.platform !== "darwin") return;
  // 11-14 지적 16: 위에서 내려오는 제목 줄은 없앴다 — 신호등은 로고 칸 감지로만 켜고, 창 끌기는 머리줄 빈 자리(-webkit-app-region)로 한다.
  const root = document.documentElement;
  // 11-14(시안 review-1114 7번 안 B): 로고 칸(왼쪽 위)에 마우스를 올리면 로고가 오른쪽으로 0.2초 밀리고, 비운 자리에 진짜 신호등 단추가 0.12초 뒤 켜진다.
  // 벗어나면 단추를 바로 끄고 로고는 0.15초에 돌아온다.
  let lights = false, lightTimer = 0;
  const lightsOn = (next) => {
    if (lights === next) return;
    lights = next; clearTimeout(lightTimer);
    root.classList.toggle("desktop-lights-on", next);
    for (const frame of document.querySelectorAll("iframe")) { try { frame.contentDocument?.documentElement.classList.toggle("desktop-lights-on", next); } catch {} }
    if (next) lightTimer = setTimeout(() => ipcRenderer.invoke("window:traffic-lights", true).catch(() => {}), 120);
    else ipcRenderer.invoke("window:traffic-lights", false).catch(() => {});
  };
  const inLogo = (x, y) => x >= 0 && x <= 190 && y >= 0 && y <= 52;
  const track = (x, y) => {
    if (document.getElementById("start-screen")) return;
    lightsOn(inLogo(x, y) || (lights && x <= 230 && y <= 64));
  };
  document.addEventListener("mousemove", (event) => track(event.clientX, event.clientY), { passive: true });
  document.addEventListener("mouseleave", () => lightsOn(false));
  // 출제 칸 같은 안쪽 문서(iframe)는 마우스 움직임이 바깥으로 오지 않는다 — 같은 출처 문서면 안에서도 듣고, 로고 밀림 모양도 넣는다.
  // 11-14 밤 지적 15: 밀 것은 로고만 — 바로 옆 접기 단추와 겹치지 않게 오른쪽 끝을 기준으로 살짝 줄이며 비켜난다(신호등 자리 확보).
  // 지적 16: 머리줄 빈 자리는 창 끌기 자리(단추·입력칸은 뺌).
  // 11-14 2차 지적 26: 로고가 줄어도 마우스가 닿는 자리는 원래 크기 그대로(::after가 줄어든 만큼 왼쪽을 덮음) — 줄어든 로고 밖으로 커서가 빠져
  // 드롭다운·신호등이 꺼지던 것. 로고 칸(.top-cell)은 끌기 자리가 아니다(끌기 자리에서는 마우스 움직임이 앱에 오지 않는다).
  const SLIDE_CSS = '.top #brand-home{position:relative;transition:transform .15s cubic-bezier(.32,.72,0,1);transform-origin:right center}.top #brand-home::after{content:"";position:absolute;inset:0 0 0 -62%}html.desktop-lights-on .top #brand-home{transform:scale(.62);transition-duration:.2s}'
    + '.top{-webkit-app-region:drag}.top *{-webkit-app-region:no-drag}.top :is(.crumbs,.top-actions){-webkit-app-region:drag}';
  const hooked = new WeakSet();
  const hook = (frame) => { try {
    const doc = frame.contentDocument; if (!doc || hooked.has(doc)) return; hooked.add(doc);
    const st = doc.createElement("style"); st.textContent = SLIDE_CSS; (doc.head || doc.documentElement).append(st);
    doc.addEventListener("mousemove", (e) => { const r = frame.getBoundingClientRect(); track(e.clientX + r.left, e.clientY + r.top); }, { passive: true });
  } catch {} };
  // 안쪽 문서(5E_exam 출제 칸)의 -webkit-app-region은 창 끌기에 안 잡힐 수 있다 — 바깥 문서에 머리줄 빈 자리만 덮는 투명 끌기 띠를 둔다.
  // 띠 자리마다 바깥·안쪽 문서 모두 맨 위가 그 머리줄일 때만 둔다(AI 작업대·라이브러리·창 안 대화상자가 덮으면 띠 없음).
  const strips = document.createElement("div"); strips.id = "fivee-drag-strips";
  strips.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000";
  let stripRaf = 0;
  const INTERACTIVE = "button,a,input,select,textarea,label,summary,[role=button],[role=tab],[tabindex],#brand-home,.crumb-step,.workflow-pick";
  const layoutStrips = () => { stripRaf = 0; try {
    if (!strips.isConnected) document.body?.append(strips);
    strips.style.display = "none"; const boxes = [];
    for (const frame of document.querySelectorAll("iframe")) {
      const doc = frame.contentDocument, top = doc?.querySelector("header.top"); if (!top) continue;
      const fr = frame.getBoundingClientRect(), r = top.getBoundingClientRect(); if (!fr.width || !r.width || !r.height) continue;
      const busy = [...top.querySelectorAll(INTERACTIVE)].map((n) => n.getBoundingClientRect()).filter((b) => b.width && b.height).map((b) => [b.left - 4, b.right + 4]).sort((a, b) => a[0] - b[0]);
      let x = Math.max(r.left, 230); const gaps = []; // 로고·신호등 칸(왼쪽 230px)은 끌기 띠를 두지 않는다
      for (const [a, b] of busy) { if (a - x >= 12) gaps.push([x, a]); x = Math.max(x, b); }
      if (r.right - x >= 12) gaps.push([x, r.right]);
      for (const [a, b] of gaps) {
        const cx = (a + b) / 2, cy = r.top + r.height / 2;
        if (document.elementFromPoint(fr.left + cx, fr.top + cy) !== frame) continue;
        const inner = doc.elementFromPoint(cx, cy); if (!inner || !top.contains(inner)) continue;
        boxes.push({ x: fr.left + a, y: fr.top + r.top, w: b - a, h: r.height });
      }
    }
    strips.replaceChildren(...boxes.map((b) => { const d = document.createElement("div"); d.style.cssText = `position:fixed;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;-webkit-app-region:drag`; return d; }));
    strips.style.display = "";
  } catch {} };
  const queueStrips = () => { if (!stripRaf) stripRaf = requestAnimationFrame(layoutStrips); };
  window.addEventListener("resize", queueStrips);
  new MutationObserver((list) => { if (list.some((m) => !strips.contains(m.target))) queueStrips(); }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class", "style"] });
  const watched = new WeakSet();
  const watchFrame = (frame) => { try { const doc = frame.contentDocument; if (!doc || watched.has(doc)) return; watched.add(doc);
    new MutationObserver(queueStrips).observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class", "open"] });
    doc.defaultView?.addEventListener("resize", queueStrips); queueStrips(); } catch {} };
  const scan = () => document.querySelectorAll("iframe").forEach((f) => { hook(f); watchFrame(f); f.addEventListener("load", () => { hook(f); watchFrame(f); }); });
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true }); scan();
});
contextBridge.exposeInMainWorld("fiveEDesktop", {
  // 5E 클립보드(11-14): 맥·윈도우 클립보드 그림 읽기 — {dataUrl,width,height,sig} 또는 null. readClipboardImage는 AI 붙여넣기용(data:URL).
  readClipboardImageInfo: () => ipcRenderer.invoke("clipboard:read-image"),
  readClipboardImage: () => ipcRenderer.invoke("clipboard:read-image").then(r => r?.dataUrl || null),
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
  // 11-11: 출제 자료 파일 저장(~/Documents/5E/출제). 경로는 넘기지 않고 이름·종류만.
  examFiles: {
    autosave: text => ipcRenderer.invoke("exam-files:autosave", text),
    readLatest: () => ipcRenderer.invoke("exam-files:read-latest"),
    save: payload => ipcRenderer.invoke("exam-files:save", payload),
    open: file => ipcRenderer.invoke("exam-files:open", file),
    reveal: file => ipcRenderer.invoke("exam-files:reveal", file),
    folder: () => ipcRenderer.invoke("exam-files:folder"),
    openFolder: () => ipcRenderer.invoke("exam-files:open-folder"),
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
