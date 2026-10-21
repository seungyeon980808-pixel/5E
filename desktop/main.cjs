const { app, BrowserWindow, ipcMain, shell, Menu, desktopCapturer, dialog, nativeImage, protocol, net } = require("electron");
const { desktopSmokePasses } = require("./smoke-contract.cjs");
const { spawn, execFile } = require("node:child_process");
const { createInterface } = require("node:readline");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL, fileURLToPath } = require("node:url");
const {
  LOCAL_IMAGE_EXTENSIONS,
  createLocalImageAccess,
  isTrustedIpcSender,
} = require("./local-image-policy.cjs");
const {
  resolveTurnPlan,
  shouldAutoFinalizeImageTurn,
  readTurnTerminalStatus,
  TurnPerformanceRegistry,
} = require("./codex-turn-runtime.cjs");
const { buildEphemeralThreadStartParams } = require("./ai-thread-profile.cjs");
const { snapshotAttachments } = require("./codex-attachment-audit.cjs");
const { createProcessFailureFinalization } = require("./codex-process-failure.cjs");
const { startExamServer } = require('./exam-server.cjs');

const DESKTOP_RESOURCE_DIRECTORIES = new Set(['js', 'css', 'vendor', 'assets', 'fonts']);
const DESKTOP_RESOURCE_FILES = new Set([
  'manifest.json',
  'docs/EXAM_SCIENTIFIC_DIAGRAM_STYLE.md',
  'docs/GPT_KNOWLEDGE_EVALUATION_SCIENCE_LINEART.md',
  'docs/IMAGE_COMPLEXITY_MODE_SPEC.md',
  'experiments/web-codex-auth/editor-bridge.js',
]);
function resolveSmokeStateModuleUrl(root = path.join(__dirname, '..')) {
  const entry = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const mainSource = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
  const mainEntry = entry.match(/<script\b[^>]*\bsrc=["']((?:\.\/|\/)?js\/main\.js(?:\?[^"']*)?)["']/)?.[1];
  const stateImport = mainSource.match(/import\s*\{\s*state\s*\}\s*from\s*["']([^"']+)["']/)?.[1];
  if (!mainEntry || !stateImport) throw new Error('Cannot resolve the live renderer state module for desktop smoke');
  // Include the exact dependency query and the entry's URL base: another URL
  // creates another singleton even when Electron serves the same source bytes.
  return new URL(stateImport, new URL(mainEntry, pathToFileURL(path.join(root, 'index.html')))).href;
}
function relativeInside(root, target) {
  const relative = path.relative(root, target);
  return relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep) ? relative : null;
}
function isDesktopResource(relative, allowEntry) {
  const parts = relative.split(path.sep);
  if (parts.some(part => !part || part.startsWith('.') || part.includes(':'))) return false;
  const portable = parts.join('/');
  return DESKTOP_RESOURCE_DIRECTORIES.has(parts[0]) || DESKTOP_RESOURCE_FILES.has(portable)
    || (allowEntry && (portable === 'index.html' || portable === 'desktop/splash.html'));
}
function resolveDesktopEntryResource(requestUrl, root = path.join(__dirname, '..')) {
  try {
    // Inspect the path before URL normalization. Encoded separators and dot
    // segments must not turn a private path into an approved public alias.
    const rawPath = /^file:\/\/[^/]*([^?#]*)/.exec(requestUrl)?.[1];
    if (!rawPath || /\\|%2f|%5c|%00/i.test(rawPath)) return null;
    const decoded = decodeURIComponent(rawPath);
    if (decoded.split('/').some(part => part === '.' || part === '..') || decoded.includes('\0')) return null;
    const url = new URL(requestUrl);
    if (url.protocol !== 'file:' || url.hostname || url.username || url.password || url.port) return null;
    const requested = fileURLToPath(url), appRoot = path.resolve(root);
    let relative = relativeInside(appRoot, requested), allowEntry = relative !== null;
    if (!allowEntry) relative = relativeInside(path.parse(appRoot).root, requested);
    if (!relative || !isDesktopResource(relative, allowEntry)) return null;
    const realRoot = fs.realpathSync(appRoot), file = fs.realpathSync(path.join(appRoot, relative));
    const realRelative = relativeInside(realRoot, file);
    if (!realRelative || !isDesktopResource(realRelative, allowEntry) || !fs.statSync(file).isFile()) return null;
    return file;
  } catch {
    return null;
  }
}
function createDesktopEntryProtocolHandler(root = path.join(__dirname, '..'), fetchFile = (url, options) => net.fetch(url, options)) {
  return async request => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, {status:405, headers:{Allow:'GET, HEAD'}});
    const file = resolveDesktopEntryResource(request.url, root);
    if (!file) return new Response(null, {status:404});
    try {
      // Keep Chromium's requested /js URL (and query) as the module identity.
      // Delegate only the validated file to Electron's built-in file loader,
      // retaining MIME/ASAR support without recursing through this handler.
      return await fetchFile(pathToFileURL(file).href, {
        method:request.method, headers:request.headers, signal:request.signal, bypassCustomProtocolHandlers:true,
      });
    } catch {
      return new Response(null, {status:404});
    }
  };
}
let examServerPromise, examWindow, examWindowReady, examOrigin, examEdit;
let examTabNames = [];

async function openExamWindow(payload = {}) {
  if (!examServerPromise) examServerPromise = startExamServer({root:path.join(__dirname,'..'), port:Number(process.env.FIVE_E_EXAM_PORT || 39821)}).catch(error => { examServerPromise = null; throw error; });
  const host = await examServerPromise, seed = host.seed(payload); examOrigin = host.origin;
  if (examWindow && !examWindow.isDestroyed()) {
    await examWindowReady;
    await examWindow.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('5e:exam-source-url',{detail:${JSON.stringify('/exam-seed/' + seed)}}))`);
    examWindow.show(); examWindow.focus(); return {ok:true};
  }
  const target = new URL('/?mode=pro&mobile=0&exam=1', host.origin); target.searchParams.set('examSeed',seed);
  const window = new BrowserWindow({width:1440,height:950,minWidth:900,minHeight:650,show:false,title:'5E 시험지',
    webPreferences:{preload:path.join(__dirname,'exam-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'persist:5e-exam-workspace'}});
  examWindow = window; window.setMenu(null); window.once('ready-to-show',()=>window.show());
  window.on('closed',()=>{ if (examWindow === window) {examWindow = null;cancelExamEdit('시험지 창을 닫았습니다.');cancelExamAnnotations('시험지 창을 닫았습니다.');} });
  window.webContents.on('did-start-navigation',(_event,_url,inPlace,isMainFrame)=>{if(isMainFrame) {cancelExamEdit('시험지를 다시 열었습니다.');if(!inPlace)cancelExamAnnotations('시험지를 다시 열었습니다.');}});
  window.webContents.on('render-process-gone',()=>cancelExamAnnotations('시험지 창의 연결이 끊겼습니다.'));
  window.webContents.on('will-navigate',(event,url)=>{ if (new URL(url).origin !== host.origin || new URL(url).pathname !== '/') event.preventDefault(); });
  window.webContents.setWindowOpenHandler(({url})=>{ if (/^https:\/\//i.test(url)) void shell.openExternal(url); return {action:'deny'}; });
  window.webContents.on('will-prevent-unload', event => {
    const answer = dialog.showMessageBoxSync(window,{type:'question',buttons:['계속 편집','닫기'],defaultId:0,cancelId:0,
      title:'시험지 편집 중',message:'저장하지 않은 그림 편집이나 시험지 변경이 있습니다. 창을 닫을까요?'});
    if (answer === 1) event.preventDefault();
  });
  examWindowReady = (async () => {
    await window.loadURL(target.href);
    await window.webContents.executeJavaScript(`new Promise((resolve,reject) => {
      let attempts = 0;
      const check = () => document.getElementById('exam-workspace-open') ? resolve() :
        ++attempts > 300 ? reject(new Error('시험지 화면을 준비하지 못했습니다.')) : setTimeout(check,100);
      check();
    })`);
  })();
  await examWindowReady; return {ok:true};
}

function assertExamSender(event) {
  if (!isTrustedIpcSender(event,examWindow,examOrigin + '/')) throw new Error('Untrusted exam IPC sender.');
}
function boundedExamPayload(payload) {
  if (!payload || typeof payload !== 'object' || Buffer.byteLength(JSON.stringify(payload)) > 128 * 1024 * 1024) throw new Error('그림 연결 요청이 올바르지 않거나 너무 큽니다.');
  return payload;
}
function cancelExamEdit(message) {
  if (!examEdit) return;
  const pendingEdit = examEdit; examEdit = null;
  pendingEdit.reject?.(new Error(message));
  if (win && !win.isDestroyed()) win.webContents.send('exam:cancel');
}
async function revealExamSource() {
  if (!win || win.isDestroyed()) createWindow();
  await win.webContents.executeJavaScript(`new Promise((resolve,reject) => {
    let attempts=0;const ready=()=>document.getElementById('exam-send') ? resolve() : ++attempts>300 ? reject(new Error('5E 작업 탭을 준비하지 못했습니다.')) : setTimeout(ready,100);ready();
  })`);
  win.show();win.focus();return {ok:true};
}
ipcMain.handle('exam:request-edit',async (event,payload) => {
  assertExamSender(event); boundedExamPayload(payload);
  if (!/^[a-f0-9-]{36}$/.test(payload.requestId || '') || !payload.figure?.source || !payload.figure?.link) throw new Error('그림 편집 연결이 올바르지 않습니다.');
  if (examEdit) throw new Error('현재 그림 편집을 마친 뒤 다시 여세요.');
  await revealExamSource(); examEdit = {requestId:payload.requestId,link:payload.figure.link};
  win.webContents.send('exam:edit',payload);return {ok:true};
});
ipcMain.handle('exam:get-names',event => {assertExamSender(event);return examTabNames;});
ipcMain.handle('exam:return-source',async event => {assertExamSender(event);return revealExamSource();});
ipcMain.handle('exam:ack',(event,payload) => {
  assertExamSender(event);boundedExamPayload(payload);
  if (!examEdit || payload.requestId !== examEdit.requestId) return {ok:false};
  const pendingEdit = examEdit;
  if (payload.error) {pendingEdit.reject?.(new Error(payload.error));delete pendingEdit.resolve;delete pendingEdit.reject;return {ok:false};}
  examEdit = null; pendingEdit.resolve?.({ok:true,...(payload.figure ? {figure:payload.figure} : {})});
  if (examWindow && !examWindow.isDestroyed()) {examWindow.show();examWindow.focus();}
  return {ok:true};
});

// Annotation RPC carries data only. It never reveals/activates the primary
// editor; its renderer merges labelers and crop metadata into the linked page.
const examAnnotationRequests = new Map();
const EXAM_ANNOTATION_MAX_BYTES = 64 * 1024 * 1024;
const EXAM_ANNOTATION_LABEL_MAX_BYTES = 2 * 1024 * 1024;
const EXAM_ANNOTATION_MAX_PENDING = 8;
let examAnnotationSchema;
let examAnnotationGeneration = 0;
let examAnnotationValidating = 0;
function annotationRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function annotationFields(value, allowed) {
  if (!annotationRecord(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error('라벨 연결 필드가 올바르지 않습니다.');
}
function boundedAnnotationData(value, maxBytes = EXAM_ANNOTATION_MAX_BYTES) {
  const visit = (item, depth) => {
    if (depth > 100 || (typeof item === 'number' && !Number.isFinite(item))) throw new Error('라벨 연결 데이터가 올바르지 않습니다.');
    if (item === null || ['string','boolean','number','undefined'].includes(typeof item)) return;
    if (!Array.isArray(item) && !annotationRecord(item)) throw new Error('라벨 연결 데이터가 올바르지 않습니다.');
    for (const child of Object.values(item)) visit(child, depth + 1);
  };
  visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(value) || '') > maxBytes) throw new Error('라벨 연결 데이터가 너무 큽니다.');
}
function validateAnnotationLabels(labels, schema) {
  if (!Array.isArray(labels) || labels.length > 10000) throw new Error('라벨 목록이 올바르지 않습니다.');
  boundedAnnotationData(labels, EXAM_ANNOTATION_LABEL_MAX_BYTES);
  const ids = new Set();
  for (const label of labels) {
    if (!annotationRecord(label) || label.type !== 'labeler' || typeof label.id !== 'string' || !label.id || label.id.length > 200 || ids.has(label.id) ||
        ![label.p1?.x,label.p1?.y,label.p2?.x,label.p2?.y].every(Number.isFinite) || (label.text !== undefined && typeof label.text !== 'string')) throw new Error('라벨 객체가 올바르지 않습니다.');
    ids.add(label.id);
  }
  schema.validateAnnotationPatch(labels, labels);
}
function validateAnnotationRender(render, schema) {
  annotationFields(render, ['bounds','options','layout','layoutDraft']);
  if (render.bounds !== null) annotationFields(render.bounds, ['x','y','w','h']);
  annotationFields(render.options, ['includeReferenceImages','excludeAllImages']);
  if (render.layout !== undefined) annotationFields(render.layout, ['treatAsChar','alignment','textWrap','top','bottom','left','right']);
  schema.validateFigureRender(render);
}
function validateAnnotationFigure(figure, schema) {
  if (!annotationRecord(figure) || !/^[a-zA-Z0-9_-]{1,80}$/.test(figure.id || '') ||
      typeof figure.name !== 'string' || figure.name.length > 200 || !Number.isSafeInteger(figure.version) || figure.version < 1 ||
      !annotationRecord(figure.source) || typeof figure.source.activePageId !== 'string' ||
      !Array.isArray(figure.source.pages) || figure.source.pages.length !== 1 || !annotationRecord(figure.link)) throw new Error('라벨 그림 원본이 올바르지 않습니다.');
  annotationFields(figure.link, ['tabId','assetId']);
  schema.validateExamLink(figure.link); schema.validateExamContext(figure.context);
  boundedAnnotationData(figure.source, 32 * 1024 * 1024);
  if (figure.context !== undefined) boundedAnnotationData(figure.context, 32 * 1024 * 1024);
  if (figure.render !== undefined) validateAnnotationRender(figure.render, schema);
  if (figure.nativeCropIncluded !== undefined && typeof figure.nativeCropIncluded !== 'boolean') throw new Error('그림 영역 정보가 올바르지 않습니다.');
  if (figure.editScope !== undefined && figure.editScope !== 'annotations') throw new Error('라벨 편집 범위가 올바르지 않습니다.');
  const page = figure.source.pages[0];
  if (!annotationRecord(page) || page.id !== figure.source.activePageId || !page.id || page.id.length > 200 ||
      !Array.isArray(page.objects) || page.objects.length > 100000 || !Array.isArray(page.layers) || page.layers.length > 10000 ||
      ![page.artboard?.w,page.artboard?.h].every(value => Number.isFinite(value) && value > 0)) throw new Error('라벨 그림 페이지가 올바르지 않습니다.');
  const layerId = value => (typeof value === 'string' && !!value && value.length <= 200) || (typeof value === 'number' && Number.isFinite(value));
  const layers = new Set();
  for (const layer of page.layers) {
    if (!annotationRecord(layer) || !layerId(layer.id) || layers.has(layer.id)) throw new Error('그림 레이어가 올바르지 않습니다.');
    layers.add(layer.id);
  }
  const ids = new Set();
  const point = value => annotationRecord(value) && Number.isFinite(value.x) && Number.isFinite(value.y);
  for (const object of page.objects) {
    if (!annotationRecord(object) || typeof object.id !== 'string' || !object.id || object.id.length > 200 || ids.has(object.id) ||
        !schema.OBJECT_TYPE_IDS.includes(object.type) || (object.layerId != null && !layerId(object.layerId)) ||
        (object.groupId != null && (typeof object.groupId !== 'string' || !object.groupId || object.groupId.length > 200)) ||
        (schema.SIZE_TYPES.has(object.type) && ![object.x,object.y,object.w,object.h].every(Number.isFinite)) ||
        (schema.ENDPOINT_HANDLE_TYPES.has(object.type) && (!point(object.p1) || !point(object.p2))) ||
        (schema.POINT_ARRAY_TYPES.has(object.type) && (!Array.isArray(object.points) || !object.points.every(point))) ||
        ((schema.TEXT_MEASURED_TYPES.has(object.type) || ['anglearc','rightangle'].includes(object.type)) && ![object.x,object.y].every(Number.isFinite))) throw new Error('그림 객체가 올바르지 않습니다.');
    ids.add(object.id);
  }
  validateAnnotationLabels(page.objects.filter(object => object.type === 'labeler'), schema);
}
async function annotationSchema() {
  examAnnotationSchema ||= Promise.all([
    import(pathToFileURL(path.join(__dirname,'..','js','editable-png.js')).href),
    import(pathToFileURL(path.join(__dirname,'..','js','rhwp-exam-links.js')).href),
    import(pathToFileURL(path.join(__dirname,'..','js','rhwp-exam-annotations.js')).href),
    import(pathToFileURL(path.join(__dirname,'..','js','object-types.js')).href),
  ]).then(([render,links,annotations,types]) => ({...render,...links,...annotations,...types}));
  return examAnnotationSchema;
}
async function validateAnnotationRequest(request) {
  const fields = {read:['kind','figure'],patch:['kind','figure','baseline','edited','render'],revision:['kind','figure']};
  if (!annotationRecord(request) || !Object.hasOwn(fields, request.kind)) throw new Error('지원하지 않는 라벨 연결 요청입니다.');
  annotationFields(request, fields[request.kind]); boundedAnnotationData(request);
  const schema = await annotationSchema();
  validateAnnotationFigure(request.figure, schema);
  if (request.kind === 'patch') {
    validateAnnotationLabels(request.baseline, schema); validateAnnotationLabels(request.edited, schema);
    if (request.render !== undefined) validateAnnotationRender(request.render, schema);
  }
  return schema;
}
function settleExamAnnotations(requestId, error, value) {
  const pending = examAnnotationRequests.get(requestId);
  if (!pending) return false;
  clearTimeout(pending.timeout); examAnnotationRequests.delete(requestId);
  if (error) pending.reject(error); else pending.resolve(value);
  return true;
}
function cancelExamAnnotations(message) {
  examAnnotationGeneration++;
  for (const requestId of examAnnotationRequests.keys()) settleExamAnnotations(requestId, new Error(message));
}
ipcMain.handle('exam:annotations', async (event, request) => {
  assertExamSender(event);
  if (examAnnotationRequests.size + examAnnotationValidating >= EXAM_ANNOTATION_MAX_PENDING) throw new Error('라벨 연결 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
  const generation = examAnnotationGeneration;
  let schema;
  examAnnotationValidating++;
  try { schema = await validateAnnotationRequest(request); }
  finally { examAnnotationValidating--; }
  assertExamSender(event); // Validation may yield while a window reloads/closes.
  if (generation !== examAnnotationGeneration) throw new Error('라벨 연결 요청이 만료되었습니다. 그림을 다시 열어주세요.');
  if (!win || win.isDestroyed()) throw new Error('5E 작업 창을 먼저 열어주세요.');
  assertTrustedSender({sender:win.webContents,senderFrame:win.webContents.mainFrame});
  const requestId = require('node:crypto').randomUUID();
  return new Promise((resolve,reject) => {
    const timeout = setTimeout(() => settleExamAnnotations(requestId, new Error('5E 라벨 응답 시간이 초과했습니다.')), 30000);
    examAnnotationRequests.set(requestId, {resolve,reject,timeout,kind:request.kind,schema});
    try { win.webContents.send('exam:annotations-request', {requestId,...request}); }
    catch (error) { settleExamAnnotations(requestId, error); }
  });
});
handleTrustedIpc('exam:annotations-reply', (_event, payload) => {
  annotationFields(payload, ['requestId','value','error']);
  if (typeof payload.requestId !== 'string') throw new Error('라벨 응답 연결이 올바르지 않습니다.');
  const pending = examAnnotationRequests.get(payload.requestId);
  if (!pending) return {ok:false};
  try {
    boundedAnnotationData(payload, 2 * EXAM_ANNOTATION_LABEL_MAX_BYTES + 8192);
    if (payload.error !== undefined && payload.error !== null) {
      if (typeof payload.error !== 'string' || !payload.error || payload.error.length > 4096) throw new Error('라벨 응답 오류가 올바르지 않습니다.');
      settleExamAnnotations(payload.requestId, new Error(payload.error));
    } else {
      if (pending.kind === 'read') {
        annotationFields(payload.value, ['baseline','draft','render']);
        validateAnnotationLabels(payload.value.baseline, pending.schema); validateAnnotationLabels(payload.value.draft, pending.schema);
        if (payload.value.render !== undefined) validateAnnotationRender(payload.value.render, pending.schema);
      } else {
        annotationFields(payload.value, ['labels']); validateAnnotationLabels(payload.value.labels, pending.schema);
      }
      settleExamAnnotations(payload.requestId, null, payload.value);
    }
    return {ok:true};
  } catch (error) { settleExamAnnotations(payload.requestId, error); return {ok:false}; }
});

// The isolated RHWP window obtains a reviewed data snapshot from the primary
// renderer. Replies are correlated and restricted to the primary window.
function validateExamOwnerProof(value) {
  const exact = (object,fields) => annotationRecord(object) && Object.keys(object).length === fields.length && fields.every(field=>Object.hasOwn(object,field));
  const text = (value,max) => typeof value === 'string' && value.length > 0 && value.length <= max;
  const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
  if (!exact(value,['pageId','activePageId','link','ai']) || !text(value.activePageId,200) || !(value.pageId === null || text(value.pageId,200)) || (value.pageId === null) !== (value.link === null) ||
      !(value.link === null || exact(value.link,['tabId','assetId']) && id(value.link.tabId) && id(value.link.assetId)) ||
      !(value.ai === null || exact(value.ai,['scope','taskId']) && typeof value.ai.scope === 'string' && value.ai.scope.length <= 256 && (value.ai.taskId === null || text(value.ai.taskId,256)))) throw new Error('그림 소유 확인 응답이 올바르지 않습니다.');
  return value;
}
const examWorkspaceRequests=new Map();
function requestPrimaryWorkspace(restore, ownerRequest) {
  if(!win || win.isDestroyed()) throw new Error('5E 작업 창을 먼저 열어주세요.');
  const requestId=require('node:crypto').randomUUID();
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{examWorkspaceRequests.delete(requestId);reject(new Error('5E 작업 원본 응답 시간이 초과했습니다.'));},30000);
    examWorkspaceRequests.set(requestId,{resolve,reject,timeout,ownerRequest});
    win.webContents.send('exam:workspace-request',{requestId,...(restore?{restore}:{}),...(ownerRequest?{ownerRequest}:{})});
  });
}
ipcMain.handle('exam:workspace-snapshot',async (event,payload)=>{
  assertExamSender(event);
  if (payload === undefined) return requestPrimaryWorkspace();
  boundedExamPayload(payload);
  if (!annotationRecord(payload) || Object.keys(payload).length !== 1 || !Object.hasOwn(payload,'editRequestId') || typeof payload.editRequestId !== 'string' || !/^[a-f0-9-]{36}$/.test(payload.editRequestId)) throw new Error('그림 소유 확인 요청이 올바르지 않습니다.');
  const session = examEdit;
  if (!session?.resolve || payload.editRequestId !== session.requestId) throw new Error('시험지 편집 연결이 만료되었습니다.');
  const value = await requestPrimaryWorkspace(undefined,{editRequestId:session.requestId,link:session.link});
  assertExamSender(event);
  if (examEdit !== session || !session.resolve) throw new Error('시험지 편집 연결이 만료되었습니다.');
  return value;
});
ipcMain.handle('exam:workspace-restore',(event,payload)=>{assertExamSender(event);boundedExamPayload(payload);return requestPrimaryWorkspace(payload);});
const examProjectRequests=new Map();
ipcMain.handle('exam:project-snapshot-reply',(event,payload)=>{
  assertExamSender(event);
  const pending=examProjectRequests.get(payload?.requestId);if(!pending)return {ok:false};
  clearTimeout(pending.timeout);examProjectRequests.delete(payload.requestId);
  if(payload.error)pending.reject(new Error(payload.error));
  else if(pending.kind==='open')pending.resolve({ok:true});
  else if(!(payload.bytes instanceof ArrayBuffer) || payload.bytes.byteLength>128*1024*1024)pending.reject(new Error('프로젝트 파일이 올바르지 않습니다.'));
  else pending.resolve(payload.bytes);
  return {ok:true};
});
const APP_ID = "com.5e.editor";
const APP_ICON_PATH = path.join(
  __dirname,
  "..",
  "assets",
  process.platform === "darwin" ? "icon-512.png" : "icon.ico",
);
if (process.platform === "win32") app.setAppUserModelId(APP_ID);

const userDataOverride = process.env.FIVE_E_SMOKE_USER_DATA || process.env.FIVE_E_DEV_USER_DATA;
if (userDataOverride) app.setPath("userData", path.resolve(userDataOverride));
if (process.env.FIVE_E_DISABLE_GPU === "1") app.disableHardwareAcceleration();

let win;
let splash;
let server;
let rpcId = 0;
let recoveryTerminatingTurnId = null;
let initialized = false;
let initializingPromise = null;
let codexSendInvocationCount = 0;
let smokeFixtureSendCount = 0;
let realSendCount = 0;
const pending = new Map();
const workspaceRequests = new Map();
const workspaceConversations = new Map();
const turnOwners = new Map();
let earlyTurnEvents = [];
function workspaceScope(payload = {}) {
  if (payload.clientScope == null) return "";
  if (typeof payload.clientScope !== "string" || payload.clientScope.length > 256) throw new Error("Invalid workspace scope");
  return payload.clientScope;
}
function eventTurnIdOf(msg) { return msg?.params?.turnId || msg?.params?.turn?.id || null; }
function eventOwner(msg) {
  const id = eventTurnIdOf(msg);
  const owner = id && turnOwners.get(id);
  if (owner) return owner;
  const thread = msg?.params?.threadId;
  return thread && [...workspaceRequests.values()].find(request => request.threadId === thread);
}
async function interruptWorkspace(payload = {}) {
  const owner = workspaceRequests.get(workspaceScope(payload));
  if (!owner) return null;
  owner.cancelled = true;
  if (!owner.turnId) return { pending: true };
  const { threadId: activeTurnThreadId, turnId } = owner;
  if (!owner.interruptPromise) {
    owner.interruptPromise = rpc("turn/interrupt", { threadId: activeTurnThreadId, turnId });
    owner.interruptPromise.then(() => {
      if (owner.done || autoFinalizingImageTurns.has(turnId)) return;
      autoFinalizingImageTurns.add(turnId);
      void autoFinalizeImageTurn(activeTurnThreadId, turnId, owner.interruptPromise);
    }, () => {});
  }
  return owner.interruptPromise;
}
const turnAttachmentPaths = new Map();
const turnPerformance = new TurnPerformanceRegistry();
const autoFinalizingImageTurns = new Set();
const IMAGE_FINALIZE_TIMEOUT_MS = 10_000;
const IMAGE_FINALIZE_POLL_MS = 500;
const RPC_CHECK_TIMEOUT_MS = 1_500;
const localImages = createLocalImageAccess();
const SMOKE_FIXTURE_IMAGE_PATH = path.join(__dirname, "..", "tests", "fixtures", "rights-clear-smoke.png");

function imageDataUrl({ extension: ext, bytes }) {
  const mime = ext === ".svg" ? "image/svg+xml"
    : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
      : ext === ".webp" ? "image/webp"
        : ext === ".gif" ? "image/gif"
          : ext === ".bmp" ? "image/bmp" : "image/png";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function readSmokeFixtureImageDataUrl() {
  return `data:image/png;base64,${fs.readFileSync(SMOKE_FIXTURE_IMAGE_PATH).toString("base64")}`;
}

function isValidSmokeFixtureRequest(event, payload, expectedWindow = win) {
  const expectedUrl = pathToFileURL(path.join(__dirname, "..", "index.html")).href;
  return isTrustedIpcSender(event, expectedWindow, expectedUrl) &&
    typeof payload?.clientScope === "string" && payload.clientScope.length <= 256;
}

function createSmokeFixtureTurn(payload, index, imageDataUrl) {
  const turnId = `smoke-fixture-${index}`;
  return {
    response: { turnId, renderThreadId: `smoke-render-${index}` },
    events: [
      { clientScope: payload.clientScope, method: "item/completed", params: { turnId, item: { type: "imageGeneration", imageDataUrl } } },
      { clientScope: payload.clientScope, method: "turn/completed", params: { turn: { id: turnId, status: "completed" } } },
    ],
  };
}

function shortcutModifiersForPlatform(platform) {
  return /mac/i.test(String(platform || "")) ? { metaKey: true } : { ctrlKey: true };
}

function handleTrustedIpc(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event);
    return handler(event, ...args);
  });
}

function assertTrustedSender(event) {
  const expectedUrl = pathToFileURL(path.join(__dirname, "..", "index.html")).href;
  if (!isTrustedIpcSender(event, win, expectedUrl)) {
    throw new Error("Untrusted IPC sender.");
  }
}

function collectLocalImages(root, limit = 5000) {
  const output = [];
  const pending = [path.resolve(root)];
  while (pending.length && output.length < limit) {
    const folder = pending.pop();
    let entries = [];
    try { entries = fs.readdirSync(folder, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(folder, entry.name);
      if (entry.isDirectory()) pending.push(fullPath);
      else if (entry.isFile() && LOCAL_IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        let stat;
        try { stat = fs.statSync(fullPath); } catch { continue; }
        output.push({
          path: fullPath,
          name: entry.name,
          relativePath: path.relative(root, fullPath),
          size: stat.size,
          modifiedAt: stat.mtimeMs,
        });
        if (output.length >= limit) break;
      }
    }
  }
  return output.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "ko"));
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}
function sendImageFinalization(turnId, state, extra = {}) {
  send("codex:event", { method: "5e/image-finalization", params: { turnId, state, ...extra } });
}
function releaseActiveTurn(completedTurnId) {
  const owner = turnOwners.get(completedTurnId);
  if (owner) {
    owner.done = true;
    if (workspaceRequests.get(owner.scope) === owner) workspaceRequests.delete(owner.scope);
  }
  cleanupAttachments(completedTurnId);
  autoFinalizingImageTurns.delete(completedTurnId);
}
function sendSyntheticPerformance(completedTurnId) {
  const performance = turnPerformance.snapshot(completedTurnId, Date.now());
  if (!performance) return;
  send("codex:event", { method: "5e/performance", params: performance });
  turnPerformance.delete(completedTurnId);
}
function terminateProcessTreeAndWait(child, timeoutMs = 4_000) {
  if (!child || child.exitCode != null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    let treeTerminationConfirmed = false;
    let childExited = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      resolve(value);
    };
    const maybeFinish = () => {
      if (treeTerminationConfirmed && childExited) finish(true);
    };
    const onExit = () => {
      childExited = true;
      maybeFinish();
    };
    const timer = setTimeout(() => finish(treeTerminationConfirmed && (childExited || child.exitCode != null)), timeoutMs);
    child.once("exit", onExit);
    if (process.platform === "win32") {
      const taskkill = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
      execFile(taskkill, ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, (error) => {
        treeTerminationConfirmed = !error || child.exitCode != null;
        childExited = childExited || child.exitCode != null;
        if (!treeTerminationConfirmed) finish(false); else maybeFinish();
      });
      return;
    }
    try {
      treeTerminationConfirmed = child.kill();
      if (!treeTerminationConfirmed && child.exitCode == null) finish(false);
      childExited = child.exitCode != null;
      maybeFinish();
    } catch {
      finish(false);
    }
  });
}
async function autoFinalizeImageTurn(renderThreadId, completedTurnId, acceptedInterrupt = null) {
  sendImageFinalization(completedTurnId, "interrupting");
  try {
    await withTimeout(
      acceptedInterrupt || rpc("turn/interrupt", { threadId: renderThreadId, turnId: completedTurnId }),
      RPC_CHECK_TIMEOUT_MS,
      "turn/interrupt",
    );
    if (!autoFinalizingImageTurns.has(completedTurnId)) return;
    sendImageFinalization(completedTurnId, "interruptAccepted");
  } catch (error) {
    if (!autoFinalizingImageTurns.has(completedTurnId)) return;
    sendImageFinalization(completedTurnId, "interruptFailed", { message: error.message });
  }

  const deadline = Date.now() + IMAGE_FINALIZE_TIMEOUT_MS;
  while (autoFinalizingImageTurns.has(completedTurnId) && turnOwners.get(completedTurnId)?.done === false && Date.now() < deadline) {
    try {
      const response = await withTimeout(
        rpc("thread/read", { threadId: renderThreadId, includeTurns: true }),
        RPC_CHECK_TIMEOUT_MS,
        "thread/read",
      );
      const status = readTurnTerminalStatus(response, completedTurnId);
      if (status) {
        releaseActiveTurn(completedTurnId);
        sendSyntheticPerformance(completedTurnId);
        sendImageFinalization(completedTurnId, "confirmed", { status });
        return;
      }
    } catch {}
    if (!autoFinalizingImageTurns.has(completedTurnId)) return;
    await delay(IMAGE_FINALIZE_POLL_MS);
  }
  if (!autoFinalizingImageTurns.has(completedTurnId) || turnOwners.get(completedTurnId)?.done !== false) return;

  // A missing turn/completed notification or a stuck interrupt must not leave the
  // editor locked forever. Terminate the local App Server and wait for its process
  // to exit before allowing another render, so remote image turns never overlap.
  sendImageFinalization(completedTurnId, "recovering");
  const child = server;
  let stopped = false;
  recoveryTerminatingTurnId = completedTurnId;
  try {
    stopped = await terminateProcessTreeAndWait(child);
  } finally {
    if (recoveryTerminatingTurnId === completedTurnId) recoveryTerminatingTurnId = null;
  }
  if (!stopped) {
    sendImageFinalization(completedTurnId, "recoveryFailed", { message: "App Server did not exit" });
    return;
  }
  releaseActiveTurn(completedTurnId);
  sendSyntheticPerformance(completedTurnId);
  sendImageFinalization(completedTurnId, "recovered", { status: "interrupted" });
}

function codexInvocation(args) {
  if (process.platform !== "win32") return { file: "codex", args };
  return { file: process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe", args: ["/d", "/s", "/c", "codex", ...args] };
}
function send(event, payload, trustedScope, targetScopes) {
  if (!win || win.isDestroyed()) return;
  const expectedUrl = pathToFileURL(path.join(__dirname, "..", "index.html")).href;
  if (!isTrustedIpcSender({ sender: win.webContents, senderFrame: win.webContents.mainFrame }, win, expectedUrl)) return;
  if (event === "codex:event") {
    const owner = eventOwner(payload);
    const { clientScope: untrustedScope, ...message } = payload;
    const scope = trustedScope ?? owner?.scope;
    win.webContents.send(event, scope ? { ...message, clientScope: scope } : message);
    return;
  }
  win.webContents.send(event, payload);
  for (const scope of targetScopes || new Set([...workspaceRequests.keys(), ...workspaceConversations.keys()])) {
    if (scope) win.webContents.send(event, { ...payload, clientScope: scope });
  }
}
function rejectPending(error) { for (const p of pending.values()) p.reject(error); pending.clear(); }
function reportAttachmentSnapshot(owner, stage, paths) {
  if (!owner?.attachmentDiagnostics) return;
  send("codex:event", { method: "5e/attachment-diagnostics", params: {
    turnId: owner.turnId, stage, observedAt: Date.now(), attachments: snapshotAttachments(paths),
  } }, owner.scope);
}
function cleanupAttachments(id) {
  const paths = turnAttachmentPaths.get(id) || [];
  const owner = turnOwners.get(id);
  reportAttachmentSnapshot(owner, "before-cleanup", paths);
  void Promise.all(paths.map(file => fs.promises.unlink(file).catch(() => {})))
    .then(() => reportAttachmentSnapshot(owner, "after-cleanup", paths));
  turnAttachmentPaths.delete(id);
}
function cleanupAllAttachments() {
  for (const id of turnAttachmentPaths.keys()) cleanupAttachments(id);
}
function attachGeneratedImageData(msg) {
  const item = msg?.params?.item;
  if (item?.type !== "imageGeneration" || !item.savedPath) return;
  try {
    const ext = path.extname(item.savedPath).toLowerCase();
    const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[ext];
    const stat = fs.statSync(item.savedPath);
    if (!mime || stat.size > 20_000_000) return;
    item.imageDataUrl = `data:${mime};base64,${fs.readFileSync(item.savedPath).toString("base64")}`;
  } catch {}
}

function handleServerProcessTermination(child, {
  state,
  error = null,
  code = null,
  signal = null,
} = {}) {
  if (server !== child) return;
  const affectedScopes = new Set([...workspaceRequests.keys(), ...workspaceConversations.keys()]);
  let failure;
  for (const owner of [...workspaceRequests.values()]) {
    failure = createProcessFailureFinalization({ activeTurnId: owner.turnId, recoveryTerminatingTurnId, error, code, signal });
    if (failure) {
      sendImageFinalization(failure.turnId, failure.state, { status: failure.status, message: failure.message });
      sendSyntheticPerformance(failure.turnId);
    }
    if (owner.turnId) releaseActiveTurn(owner.turnId);
    owner.done = true;
  }
  workspaceRequests.clear();
  workspaceConversations.clear();
  earlyTurnEvents = [];
  server = null;
  initialized = false;
  initializingPromise = null;
  turnPerformance.clear();
  autoFinalizingImageTurns.clear();
  cleanupAllAttachments();
  const terminalError = error instanceof Error
    ? error
    : new Error(failure?.message || `Codex App Server exited (${code ?? signal ?? "unknown"})`);
  rejectPending(terminalError);
  send("codex:state", state === "missing"
    ? { state: "missing", message: terminalError.message }
    : { state: "stopped", code, signal }, undefined, affectedScopes);
}

function processTurnEvent(msg) {
  if (msg.params?.turnId != null && msg.params?.turn?.id != null && msg.params.turnId !== msg.params.turn.id) return;
  if (msg.method === "account/rateLimits/updated") {
    send("codex:event", msg);
    for (const scope of new Set([...workspaceRequests.keys(), ...workspaceConversations.keys()])) {
      if (scope) send("codex:event", msg, scope);
    }
    return;
  }
  const owner = eventOwner(msg);
  const eventTurnId = eventTurnIdOf(msg);
  if (!owner || owner.done || !eventTurnId || owner.turnId !== eventTurnId) return;
  if (msg.params?.threadId && owner.threadId !== msg.params.threadId) return;
  const performanceObservation = turnPerformance.observe(msg);
  attachGeneratedImageData(msg);
  send("codex:event", msg);
  if (shouldAutoFinalizeImageTurn({ message: msg, observation: performanceObservation,
    activeTurnId: owner.turnId, alreadyFinalizing: autoFinalizingImageTurns.has(eventTurnId) })) {
    autoFinalizingImageTurns.add(eventTurnId);
    void autoFinalizeImageTurn(owner.threadId, eventTurnId);
  }
  if (performanceObservation?.completed) {
    send("codex:event", { method: "5e/performance", params: performanceObservation.performance });
    turnPerformance.delete(performanceObservation.performance.turnId);
  }
  if (msg.method === "turn/completed" && msg.params?.turn?.id) releaseActiveTurn(owner.turnId);
}

function startServer() {
  if (server) return { ok: true, state: "running" };
  try {
    const launch = codexInvocation(["app-server", "--stdio"]);
    server = spawn(launch.file, launch.args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const child = server;
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      if (server !== child) return;
      let msg; try { msg = JSON.parse(line); } catch { return; }
      if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;
      if (msg.id != null && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || "Codex request failed")); else p.resolve(msg.result);
        return;
      }
      if (typeof msg.method !== "string") return;
      const owner = eventOwner(msg);
      if (owner && !owner.turnId) {
        if (earlyTurnEvents.length < 1024) earlyTurnEvents.push(msg);
        return;
      }
      if (!owner && eventTurnIdOf(msg) && [...workspaceRequests.values()].some(request => !request.turnId)) {
        if (earlyTurnEvents.length < 1024) earlyTurnEvents.push(msg);
        return;
      }
      processTurnEvent(msg);
    });
    child.stdin.on("error", error => handleServerProcessTermination(child, { state: "stopped", error }));
    child.stderr.on("data", (b) => send("codex:log", { level: "error", message: String(b).trim() }));
    child.on("error", (error) => handleServerProcessTermination(child, { state: "missing", error }));
    child.on("exit", (code, signal) => handleServerProcessTermination(child, { state: "stopped", code, signal }));
    send("codex:state", { state: "running" });
    return { ok: true, state: "running" };
  } catch (error) { return { ok: false, state: "missing", message: error.message }; }
}
function stopServer() {
  const child = server;
  if (child) {
    handleServerProcessTermination(child, { state: "stopped", error: new Error("Codex App Server stopped") });
    child.kill();
  }
  return { ok: true, state: "stopped" };
}
function rpc(method, params) {
  if (!server) throw new Error("Codex App Server가 실행되지 않았습니다.");
  const child = server;
  const id = ++rpcId;
  return new Promise((resolve, reject) => {
    const timeoutMs = method === "turn/start" ? 120_000 : method === "turn/interrupt" ? 10_000 : 30_000;
    const timer = setTimeout(() => {
      const error = new Error(`${method} timeout`);
      error.code = "RPC_TIMEOUT";
      // Optional metadata does not own any turn. Recovery reads and mutations
      // retain the fatal deadline because their remote state may be uncertain.
      if (["model/list", "account/read", "account/rateLimits/read", "account/usage/read"].includes(method)) {
        const request = pending.get(id);
        pending.delete(id);
        request?.reject(error);
        return;
      }
      handleServerProcessTermination(child, { state: "stopped", error });
      child.kill();
    }, timeoutMs);
    pending.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
    try { child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); }
    catch (error) { pending.get(id)?.reject(error); pending.delete(id); }
  });
}
function notify(method, params = {}) {
  if (!server) throw new Error("Codex App Server가 실행되지 않았습니다.");
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}
async function ensureInitialized() {
  if (initialized) return;
  if (!initializingPromise) {
    const child = server;
    const initialization = (async () => {
      await rpc("initialize", { clientInfo: { name: "5e-desktop", title: "5E", version: app.getVersion() }, capabilities: { experimentalApi: true } });
      if (server !== child) throw new Error("Codex App Server stopped during initialization");
      notify("initialized");
      initialized = true;
    })();
    initializingPromise = initialization;
    initialization.finally(() => { if (initializingPromise === initialization) initializingPromise = null; }).catch(() => {});
  }
  await initializingPromise;
}
function loginStatus() {
  const launch = codexInvocation(["login", "status"]);
  return new Promise((resolve) => execFile(launch.file, launch.args, { windowsHide: true }, (error, stdout, stderr) => resolve({ loggedIn: !error, output: String(stdout || stderr).trim() })));
}
async function listModels() {
  startServer();
  await ensureInitialized();
  return rpc("model/list", { limit: 100, includeHidden: false });
}
async function accountOverview() {
  startServer();
  await ensureInitialized();
  const [accountResult, limitsResult, usageResult] = await Promise.allSettled([
    rpc("account/read", { refreshToken: false }),
    rpc("account/rateLimits/read"),
    rpc("account/usage/read"),
  ]);
  for (const result of [accountResult, limitsResult, usageResult]) {
    if (result.status === "rejected" && result.reason.code === "RPC_TIMEOUT") throw result.reason;
  }
  return {
    account: accountResult.status === "fulfilled" ? accountResult.value : null,
    limits: limitsResult.status === "fulfilled" ? limitsResult.value : null,
    usage: usageResult.status === "fulfilled" ? usageResult.value : null,
  };
}
async function safeAttachment(data, name) {
  if (typeof data !== "string" || !data.startsWith("data:image/")) throw new Error("이미지 첨부 형식이 올바르지 않습니다.");
  if (data.length > 11_000_000) throw new Error("이미지는 8MB 이하만 첨부할 수 있습니다.");
  const match = data.match(/^data:(image\/[\w.+-]+);base64,(.+)$/); if (!match) throw new Error("이미지 데이터를 읽을 수 없습니다.");
  const dir = path.join(app.getPath("temp"), "5e-codex"); await fs.promises.mkdir(dir, { recursive: true });
  const ext = match[1].split("/")[1].replace(/[^a-z0-9]/gi, "") || "png";
  const file = path.join(dir, `${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`);
  const buffer = Buffer.from(match[2], "base64");
  await fs.promises.writeFile(file, buffer);
  return { file, bytes: buffer.length, name: name || path.basename(file) };
}
async function sendTurn(payload = {}) {
  const scope = workspaceScope(payload);
  if (workspaceRequests.has(scope)) throw new Error("이전 AI 작업을 종료하고 있습니다. 잠시 후 다시 시도해 주세요.");
  const owner = { scope, threadId: null, turnId: null, done: false, cancelled: false };
  workspaceRequests.set(scope, owner);
  try { return await sendWorkspaceTurn(payload, owner); }
  catch (error) {
    if (workspaceRequests.get(scope) === owner) workspaceRequests.delete(scope);
    owner.done = true;
    throw error;
  }
}
// JSON schema is current-turn-only and never a capability/profile override.
function validatedSceneOutputSchema(value, purpose) {
  if (value === undefined) return undefined;
  if (purpose !== "scene" || !value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError("outputSchema는 scene JSON 객체만 허용합니다.");
  let encoded, nodes = 0;
  const ancestors = new Set();
  const visit = (item, depth = 0) => {
    if (++nodes > 20000 || depth > 64 || item === undefined || typeof item === "function" || typeof item === "symbol" || typeof item === "bigint" || typeof item === "number" && !Number.isFinite(item)) throw new TypeError("JSON schema 값이 잘못되었습니다.");
    if (item && typeof item === "object") {
      if ((!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype) || ancestors.has(item)) throw new TypeError("JSON schema 객체가 잘못되었습니다.");
      ancestors.add(item);
      for (const child of Object.values(item)) visit(child, depth + 1);
      ancestors.delete(item);
    }
  };
  try { visit(value); encoded = JSON.stringify(value); }
  catch { throw new TypeError("outputSchema는 직렬화 가능한 JSON 객체여야 합니다."); }
  if (Buffer.byteLength(encoded, "utf8") > 200000) throw new TypeError("outputSchema 크기가 200KB를 초과합니다.");
  return JSON.parse(encoded);
}
async function sendWorkspaceTurn(payload, owner) {
  let threadId = workspaceConversations.get(owner.scope) || null;
  const turnId = owner.turnId;
  const {
    text,
    attachments = [],
    conversationId,
    resetConversation = false,
    model = null,
    effort = null,
    serviceTier = null,
  } = payload;
  if (turnId) throw new Error("이전 AI 작업을 종료하고 있습니다. 잠시 후 다시 시도해 주세요.");
  const startedAt = Date.now();
  const plan = resolveTurnPlan({ ...payload, conversationId, resetConversation });
  owner.attachmentDiagnostics = plan.purpose === "image" && payload.attachmentDiagnostics === true;
  const outputSchema = validatedSceneOutputSchema(payload.outputSchema, plan.purpose);
  startServer();
  await ensureInitialized();
  if (plan.resetChatThread) threadId = null;

  let requestThreadId = null;
  if (plan.ephemeralRender) {
    const started = await rpc("thread/start", buildEphemeralThreadStartParams({
      purpose: plan.purpose,
      model,
      serviceTier,
      cwd: app.getPath("userData"),
    }));
    requestThreadId = started?.thread?.id || null;
  } else {
    if (plan.resumeConversationId && plan.resumeConversationId !== threadId) {
      try {
        const resumed = await rpc("thread/resume", { threadId: plan.resumeConversationId, approvalPolicy: "never", sandbox: "read-only" });
        threadId = resumed?.thread?.id || plan.resumeConversationId;
      } catch { threadId = null; }
    }
    if (!threadId) {
      const started = await rpc("thread/start", { model: model || null, serviceTier: serviceTier || null, cwd: app.getPath("userData"), approvalPolicy: "never", sandbox: "read-only", ephemeral: false, serviceName: "5e-chat" });
      threadId = started?.thread?.id || null;
    }
    requestThreadId = threadId;
  }
  if (!requestThreadId) throw new Error("Codex 대화를 시작하지 못했습니다.");
  if (owner.done || owner.cancelled) throw new Error("AI 작업이 취소되었습니다.");
  if ([...workspaceConversations].some(([scope, id]) => scope !== owner.scope && id === requestThreadId) || [...workspaceRequests.values()].some(other => other !== owner && other.threadId === requestThreadId)) throw new Error("Conversation is active in another workspace");
  owner.threadId = requestThreadId;
  if (!plan.ephemeralRender) workspaceConversations.set(owner.scope, requestThreadId);

  const safeAttachments = Array.isArray(attachments) ? attachments : [];
  const preparedResults = await Promise.allSettled(safeAttachments.map((attachment) => safeAttachment(attachment.data, attachment.name)));
  const failedAttachment = preparedResults.find((result) => result.status === "rejected");
  if (failedAttachment) {
    await Promise.all(preparedResults
      .filter((result) => result.status === "fulfilled")
      .map((result) => fs.promises.unlink(result.value.file).catch(() => {})));
    throw failedAttachment.reason;
  }
  const preparedAttachments = preparedResults.map((result) => result.value);
  const paths = preparedAttachments.map((attachment) => attachment.file);
  const attachmentBytes = preparedAttachments.reduce((sum, attachment) => sum + attachment.bytes, 0);
  const input = [{ type: "text", text }].concat(paths.map((file) => ({ type: "localImage", path: file })));
  reportAttachmentSnapshot(owner, "before-turn-start", paths);
  let result;
  try {
    if (owner.done || owner.cancelled) throw new Error("AI 작업이 취소되었습니다.");
    // Exactly one backend turn is started. Any image retry must be an explicit agent/tool decision.
    result = await rpc("turn/start", { threadId: requestThreadId, input, model: model || null, effort: effort || null, serviceTier: serviceTier || null, ...(outputSchema !== undefined ? { outputSchema } : {}) });
  } catch (error) {
    await Promise.all(paths.map((file) => fs.promises.unlink(file).catch(() => {})));
    throw error;
  }
  const requestTurnId = result?.turn?.id || null;
  if (!requestTurnId) {
    await Promise.all(paths.map((file) => fs.promises.unlink(file).catch(() => {})));
    throw new Error("Codex 작업을 시작하지 못했습니다.");
  }
  if (owner.done) {
    await Promise.all(paths.map(file => fs.promises.unlink(file).catch(() => {})));
    throw new Error("AI 작업이 종료되었습니다.");
  }
  owner.turnId = requestTurnId;
  turnOwners.set(requestTurnId, owner);
  for (const [id, previous] of turnOwners) {
    if (turnOwners.size > 1024 && previous.done) turnOwners.delete(id);
  }
  if (requestTurnId && paths.length) turnAttachmentPaths.set(requestTurnId, paths);
  const performance = turnPerformance.register({
    turnId: requestTurnId,
    threadId: requestThreadId,
    purpose: plan.purpose,
    startedAt,
    prepareEndedAt: Date.now(),
    attachmentCount: preparedAttachments.length,
    attachmentBytes,
  });
  const buffered = earlyTurnEvents;
  earlyTurnEvents = [];
  for (const event of buffered) {
    if (eventOwner(event)?.turnId) processTurnEvent(event);
    else if ([...workspaceRequests.values()].some(request => !request.turnId)) earlyTurnEvents.push(event);
  }
  if (owner.cancelled && !owner.done) await interruptWorkspace({ clientScope: owner.scope });
  const preservedConversationId = plan.ephemeralRender
    ? (threadId || plan.preservedConversationId || null)
    : requestThreadId;
  return {
    threadId: plan.ephemeralRender ? null : requestThreadId,
    conversationId: preservedConversationId,
    renderThreadId: plan.ephemeralRender ? requestThreadId : null,
    ephemeralRender: plan.ephemeralRender,
    purpose: plan.purpose,
    turnId: requestTurnId,
    result,
    performance,
  };
}

function createWindow() {
  if (win && !win.isDestroyed()) {
    win.show();
    return;
  }
  const splashStartedAt = Date.now();
  splash = new BrowserWindow({
    width: 520,
    height: 310,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    backgroundColor: "#111820",
    icon: APP_ICON_PATH,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  splash.loadFile(path.join(__dirname, "splash.html"));
  const platformWindowOptions = process.platform === "darwin"
    ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 12, y: 7 } }
    : {
        titleBarStyle: "hidden",
        titleBarOverlay: { color: "#0e1512", symbolColor: "#9fb8b0", height: 30 },
      };
  win = new BrowserWindow({
    width: 1520,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: "#0e1512",
    icon: APP_ICON_PATH,
    ...platformWindowOptions,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenu(null);
  win.setMenuBarVisibility(false);
  const revealMainWindow = () => {
    const reveal = () => {
      if (splash && !splash.isDestroyed()) splash.destroy();
      splash = null;
      if (win && !win.isDestroyed()) win.show();
    };
    const remaining = Math.max(0, 900 - (Date.now() - splashStartedAt));
    if (remaining) setTimeout(reveal, remaining); else reveal();
  };
  win.once("ready-to-show", revealMainWindow);
  win.webContents.once("did-fail-load", revealMainWindow);
  win.on("closed", () => {
    win = null;
    if (examEdit && examWindow && !examWindow.isDestroyed()) examWindow.webContents.send('exam:result',{requestId:examEdit.requestId,error:'5E 작업 창을 닫았습니다. 그림을 다시 더블클릭해서 여세요.'});
    cancelExamEdit('5E 작업 창을 닫았습니다.');
    cancelExamAnnotations('5E 작업 창을 닫았습니다.');
  });
  win.webContents.on('did-start-navigation',(_event,_url,inPlace,isMainFrame)=>{if(isMainFrame && !inPlace)cancelExamAnnotations('5E 작업 창을 다시 열었습니다.');});
  win.webContents.on('render-process-gone',()=>cancelExamAnnotations('5E 작업 창의 연결이 끊겼습니다.'));
  // 화면이 닫기를 막으면(저장 안 한 지우개·라벨 초안, 출제·조판 변경) Electron은 알림 없이 닫기를 취소한다.
  // 주 창에는 묻는 창이 없어, 작업을 지운 뒤에는 강제 종료밖에 없었다(M40). 시험지 창과 같이 묻는다.
  win.webContents.on('will-prevent-unload', event => {
    const answer = dialog.showMessageBoxSync(win,{type:'question',buttons:['계속 편집','닫기'],defaultId:0,cancelId:0,
      title:'저장하지 않은 편집',message:'저장하지 않은 편집이 있습니다. 창을 닫을까요?'});
    if (answer === 1) event.preventDefault();
  });
  const entryUrl = pathToFileURL(path.join(__dirname, "..", "index.html")).href;
  win.webContents.on("will-navigate", (event, url) => {
    if (String(url).split(/[?#]/, 1)[0] !== entryUrl) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(String(url))) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadFile(path.join(__dirname, "..", "index.html"));
  if (process.env.FIVE_E_SMOKE_TEST === "1") {
    win.webContents.once("did-finish-load", async () => {
      try {
        const codexSendsBeforeSmoke = codexSendInvocationCount;
        const smokeFixtureImageDataUrl = readSmokeFixtureImageDataUrl();
        const smokeStateModuleUrl = resolveSmokeStateModuleUrl();
        const result = await win.webContents.executeJavaScript(`new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(async () => {
            const shortcutModifiersForPlatform = ${shortcutModifiersForPlatform.toString()};
            const waitFor = async (test, timeout = 4000) => {
              const started = Date.now();
              while (Date.now() - started < timeout) {
                if (test()) return true;
                await new Promise((done) => setTimeout(done, 50));
              }
              return false;
            };
            const settleLayout = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
            const isActuallyVisible = (element) => {
              if (!element || element.hidden) return false;
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 &&
                rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 &&
                rect.left < innerWidth && rect.top < innerHeight;
            };
            const isCenteredWithin = (elementRect, containerRect, tolerance = 4) => !!elementRect && !!containerRect &&
              Math.abs(elementRect.left + elementRect.width / 2 - (containerRect.left + containerRect.width / 2)) < tolerance &&
              Math.abs(elementRect.top + elementRect.height / 2 - (containerRect.top + containerRect.height / 2)) < tolerance;
            const publicRasterIsVisible = async (activePanel) => {
              const conversionOptions = activePanel?.querySelector('.ai-conversion-options');
              if (conversionOptions) conversionOptions.open = true;
              const rasterButton = activePanel?.querySelector('[data-ai-output-engine="raster"]');
              rasterButton?.scrollIntoView({ block: 'nearest' });
              await settleLayout();
              return isActuallyVisible(rasterButton);
            };
            const attachFixtureAndInspectRaster = async (activePanel, attachFixture) => {
              attachFixture();
              const referenceReady = await waitFor(() => activePanel.querySelectorAll('[data-ai-reference-id]').length === 1, 4000);
              return {
                referenceReady,
                rasterVisible: referenceReady && await publicRasterIsVisible(activePanel),
              };
            };
            const createAreaComment = async (activePanel, image) => {
              const stage = image?.closest('.ai-preview-stage');
              activePanel?.querySelector('[data-ai-comment-tool="area"]')?.click();
              await settleLayout();
              const rect = image?.getBoundingClientRect();
              if (!stage || !rect?.width || !rect.height) return { stage, ready: false };
              const down = { bubbles: true, pointerId: 91, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1,
                clientX: rect.left + rect.width * .25, clientY: rect.top + rect.height * .25 };
              image.dispatchEvent(new PointerEvent('pointerdown', down));
              stage.dispatchEvent(new PointerEvent('pointermove', { ...down, clientX: rect.left + rect.width * .65, clientY: rect.top + rect.height * .60 }));
              stage.dispatchEvent(new PointerEvent('pointerup', { ...down, buttons: 0,
                clientX: rect.left + rect.width * .65, clientY: rect.top + rect.height * .60 }));
              return { stage, ready: await waitFor(() => !!activePanel.querySelector('[data-ai-comment-row]'), 2000) };
            };
            const contractProbe = globalThis.__FIVE_E_SMOKE_CONTRACT_PROBE__;
            if (contractProbe) {
              const fixture = await attachFixtureAndInspectRaster(contractProbe.panel, contractProbe.attachFixture);
              const area = await createAreaComment(contractProbe.panel, contractProbe.image);
              resolve({
                aiUsesCentralModal: isCenteredWithin(
                  contractProbe.panel.querySelector('.modal-ai')?.getBoundingClientRect(),
                  contractProbe.panel.getBoundingClientRect(),
                ),
                aiPublicRasterVisible: fixture.rasterVisible,
                aiAreaCommentReady: area.ready,
                pointerTargets: contractProbe.pointerTargets,
              });
              return;
            }
            const startupDialogTitles = new Set(["작업 복구", "찾아 주셔서 고맙습니다"]);
            const dismissStartupDialogs = () => {
              document.querySelector(".tut-welcome-overlay .tut-banner-no")?.click();
              for (const title of document.querySelectorAll(".modal-overlay .modal-title")) {
                if (!startupDialogTitles.has(title.textContent?.trim())) continue;
                title.closest(".modal-overlay")?.querySelector(".modal-btn")?.click();
              }
            };
            dismissStartupDialogs();
            const button = document.getElementById("ai-image-install-open");
            const panel = document.getElementById("ai-image-panel");
            button?.click();
            let codexStatusReadable = false;
            let codexStatusError = "";
            let codexServerLifecycle = false;
            let modelCatalogReadable = false;
            let captureSourcesReadable = false;
            let captureSourcesError = "";
            try {
              const status = await window.fiveEDesktop.status();
              codexStatusReadable = typeof status?.login?.loggedIn === "boolean";
              const started = await window.fiveEDesktop.start();
              await new Promise((done) => setTimeout(done, 750));
              const running = await window.fiveEDesktop.status();
              const stopped = await window.fiveEDesktop.stop();
              codexServerLifecycle = started?.ok === true && running?.server === true && stopped?.ok === true;
              const catalog = await window.fiveEDesktop.models();
              modelCatalogReadable = Array.isArray(catalog?.data) && catalog.data.length > 0;
              try {
                const captureSources = await window.fiveEDesktop.captureSources();
                captureSourcesReadable = Array.isArray(captureSources) && captureSources.length > 0 &&
                  /^data:image\\//.test(captureSources[0]?.data || "");
              } catch (error) { captureSourcesError = error?.message || String(error); }
              await window.fiveEDesktop.stop();
            } catch (error) { codexStatusError = error?.message || String(error); }
            const panelWasOpened = panel?.hidden === false;
            const aiUsesCentralModal = await waitFor(() => {
              const aiModalRect = panel?.querySelector(".modal-ai")?.getBoundingClientRect();
              const overlayRect = panel?.getBoundingClientRect();
              return panel?.classList.contains("modal-overlay") && isCenteredWithin(aiModalRect, overlayRect);
            }, 2000);
            const aiAutoConnectControlsSimplified = !panel?.querySelector("[data-ai-start]") &&
              !panel?.querySelector("[data-ai-stop]") && !!panel?.querySelector("[data-ai-login]");
            const aiProgressUiReady = !!panel?.querySelector("[data-ai-generating] .ai-e-loader") &&
              !!panel?.querySelector("[data-ai-e-count]") && !!panel?.querySelector("[data-ai-progress-title]") &&
              !!panel?.querySelector("[data-ai-progress-stage]");
            const resultRect = panel?.querySelector(".ai-results")?.getBoundingClientRect();
            const conversationRect = panel?.querySelector(".ai-conversation")?.getBoundingClientRect();
            const aiResultsPlacedLeft = !!resultRect && !!conversationRect && resultRect.left < conversationRect.left;
            const aiSourceEntrypointsReady = !!panel?.querySelector("[data-ai-source-file]") &&
              !!panel?.querySelector('[data-ai-source-action="library"]') &&
              !!panel?.querySelector('[data-ai-source-action="clipboard"]');
            panel?.querySelector('[data-ai-source-action="library"]')?.click();
            const aiLoadMenuReady = await waitFor(() => {
              const library = document.querySelector(".unified-library-overlay:not([hidden])");
              return !!library?.querySelector("[data-unilib-close]") &&
                !!document.querySelector("[data-unilib-query]");
            }, 4000);
            document.querySelector("[data-unilib-close]")?.click();
            await waitFor(() => !document.querySelector(".unified-library-overlay:not([hidden])"), 2000);
            let aiClipboardSourceReady = false;
            const cancelButton = panel?.querySelector("[data-ai-interrupt]");
            const aiCancelIsContextual = cancelButton?.textContent?.trim() === "작업 취소" && cancelButton.hidden;
            const aiReturnsAfterLibraryClose = panel?.hidden === false &&
              !document.querySelector(".unified-library-overlay:not([hidden])");
            panel.hidden = true;
            dismissStartupDialogs();
            await waitFor(() => !document.querySelector(".tut-welcome-overlay") &&
              !Array.from(document.querySelectorAll(".modal-overlay .modal-title"))
                .some((title) => startupDialogTitles.has(title.textContent?.trim())), 2000);
            const stateModule = await import(${JSON.stringify(smokeStateModuleUrl)});
            const textChooser = document.getElementById("chooser-text");
            const textChooserButton = document.getElementById("tool-text-merged");
            const angleChooser = document.getElementById("chooser-angle");
            const angleChooserButton = document.getElementById("tool-angle-merged");
            const cutChooser = document.getElementById("chooser-cut");
            const cutChooserButton = document.getElementById("tool-cut-merged");
            const choosePersistentTool = async ({ button, chooser, selector, expectedTool }) => {
              if (!isActuallyVisible(chooser)) button?.click();
              const opened = await waitFor(() => isActuallyVisible(chooser));
              const option = chooser?.querySelector(selector);
              option?.click();
              const activated = await waitFor(() => stateModule.state.get().activeTool === expectedTool);
              const persisted = await waitFor(() => isActuallyVisible(chooser));
              const optionActive = await waitFor(() => option?.classList.contains("is-active"));
              const parentActive = button?.classList.contains("is-active") && button?.classList.contains("is-open");
              return { opened, activated, persisted, optionActive, parentActive };
            };
            const textChoice = await choosePersistentTool({
              button: textChooserButton, chooser: textChooser, selector: '[data-tool="T"]', expectedTool: "T",
            });
            document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            const textChooserSurvivesCanvasClick = isActuallyVisible(textChooser);
            textChooserButton?.click();
            const textChooserToggleCloses = await waitFor(() => !isActuallyVisible(textChooser));
            const labelerChoice = await choosePersistentTool({
              button: textChooserButton, chooser: textChooser, selector: '[data-symbol="labeler"]', expectedTool: "LABELER",
            });
            angleChooserButton?.click();
            const chooserSwitchesFromTextToAngle = await waitFor(() =>
              !isActuallyVisible(textChooser) && isActuallyVisible(angleChooser));
            const angleChoice = await choosePersistentTool({
              button: angleChooserButton, chooser: angleChooser, selector: '[data-symbol="anglearc"]', expectedTool: "ARC",
            });
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", code: "Tab", bubbles: true, cancelable: true }));
            const angleTabToggleWorks = await waitFor(() =>
              stateModule.state.get().activeTool === "RIGHTANGLE" &&
              angleChooser?.querySelector('[data-symbol="rightangle"]')?.classList.contains("is-active") &&
              angleChooserButton?.classList.contains("is-active") && isActuallyVisible(angleChooser));
            cutChooserButton?.click();
            const chooserSwitchesFromAngleToCut = await waitFor(() =>
              !isActuallyVisible(angleChooser) && isActuallyVisible(cutChooser));
            const chooseCutTool = (tool) => choosePersistentTool({
              button: cutChooserButton, chooser: cutChooser, selector: '[data-tool="' + tool + '"]', expectedTool: tool,
            });
            const eraseChoice = await chooseCutTool("ERASE");
            const cutChoice = await chooseCutTool("CUT");
            const cutModes = [];
            for (const mode of ["freehand", "line", "polyline", "rect"]) {
              document.querySelector('#cut-mode-tabs [data-cut-mode="' + mode + '"]')?.click();
              cutModes.push(await waitFor(() =>
                document.querySelector('#cut-mode-tabs [data-cut-mode="' + mode + '"]')?.getAttribute("aria-selected") === "true"));
            }
            const delayedChoice = await chooseCutTool("DELAYED_CUT");
            const delayedModes = [];
            for (const mode of ["freehand", "line", "polyline", "rect"]) {
              document.querySelector('#cut-mode-tabs [data-cut-mode="' + mode + '"]')?.click();
              delayedModes.push(await waitFor(() =>
                document.querySelector('#cut-mode-tabs [data-cut-mode="' + mode + '"]')?.getAttribute("aria-selected") === "true"));
            }
            const cutChooserVisible = eraseChoice.opened && cutChoice.opened && delayedChoice.opened;
            const cutChooserInToolPanel = cutChooser?.closest("#tool-list") !== null &&
              cutChooser?.closest("#ai-image-panel") === null;
            const textChooserBehavior = [textChoice, labelerChoice].every((choice) =>
              choice.opened && choice.activated && choice.persisted && choice.optionActive && choice.parentActive) &&
              textChooserSurvivesCanvasClick && textChooserToggleCloses;
            const angleChooserBehavior = angleChoice.opened && angleChoice.activated && angleChoice.persisted &&
              angleChoice.optionActive && angleChoice.parentActive && angleTabToggleWorks;
            const chooserPanelSwitchingWorks = chooserSwitchesFromTextToAngle && chooserSwitchesFromAngleToCut;
            const cutChooserPersistsAfterChoice = [eraseChoice, cutChoice, delayedChoice].every((choice) =>
              choice.opened && choice.activated && choice.persisted && choice.optionActive && choice.parentActive);
            const eraseToolReachable = eraseChoice.activated;
            const cutToolReachable = cutChoice.activated && cutModes.every(Boolean);
            const delayedCutUiReachable = delayedChoice.activated && delayedModes.every(Boolean) &&
              document.getElementById("tool-cut-merged")?.classList.contains("is-active") &&
              document.getElementById("cut-mode-tabs")?.hidden === false &&
              document.getElementById("delayed-cut-action")?.hidden === false;
            const visibleModalOverlaysBeforeCutShortcuts = Array.from(document.querySelectorAll(".modal-overlay:not([hidden])"))
              .map((node) => ({ id: node.id, className: node.className, title: node.querySelector(".modal-title")?.textContent?.trim() || "" }));
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", code: "KeyE", shiftKey: true, bubbles: true }));
            const eraseShortcutWorks = stateModule.state.get().activeTool === "ERASE";
            const shortcutPlatform = navigator.userAgentData?.platform || navigator.platform || "";
            window.dispatchEvent(new KeyboardEvent("keydown", {
              key: "e", code: "KeyE", ...shortcutModifiersForPlatform(shortcutPlatform), bubbles: true,
            }));
            const delayedShortcutWorks = stateModule.state.get().activeTool === "DELAYED_CUT";
            document.querySelector('[data-tool="V"]')?.click();
            const chooserClosesOnOtherTool = await waitFor(() => !isActuallyVisible(cutChooser) &&
              stateModule.state.get().activeTool === "V" &&
              document.querySelector('[data-tool="V"]')?.classList.contains("is-active"));
            stateModule.state.update((s) => {
              s.objects.push({
                id: "smoke-artboard-object", type: "rect",
                x: 0, y: 0, w: 5, h: 5, rotation: 0,
                stroke: "#000000", strokeWidth: 0.4, fill: "none",
              });
              s.guides.push(
                { id: "smoke-artboard-guide-x", axis: "x", position: 0 },
                { id: "smoke-artboard-guide-y", axis: "y", position: 0 },
              );
            });
            const artboardDragButton = document.querySelector(".insp-ab-drag-btn");
            const artboardRectBefore = document.querySelector("#scene > rect");
            const beforeWidth = Number(artboardRectBefore?.getAttribute("width"));
            const beforeHeight = Number(artboardRectBefore?.getAttribute("height"));
            artboardDragButton?.click();
            await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
            const areaOverlay = document.querySelector(".capture-overlay");
            const canvasBox = document.getElementById("canvas")?.getBoundingClientRect();
            const artboardAreaOverlayOpened = !!areaOverlay && !!canvasBox;
            const artboardConfirmButtonPresent = areaOverlay?.parentElement === document.documentElement &&
              Array.from(areaOverlay.querySelectorAll("button")).some((button) => button.textContent?.trim() === "지정");
            if (areaOverlay && canvasBox) {
              const x1 = canvasBox.left + canvasBox.width * 0.25;
              const y1 = canvasBox.top + canvasBox.height * 0.25;
              const x2 = canvasBox.left + canvasBox.width * 0.65;
              const y2 = canvasBox.top + canvasBox.height * 0.60;
              areaOverlay.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: x1, clientY: y1 }));
              window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: x2, clientY: y2 }));
              window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, clientX: x2, clientY: y2 }));
              window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
              await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
            }
            const artboardRectAfter = document.querySelector("#scene > rect");
            const afterWidth = Number(artboardRectAfter?.getAttribute("width"));
            const afterHeight = Number(artboardRectAfter?.getAttribute("height"));
            const artboardAreaCaptureWorks = artboardAreaOverlayOpened && !document.querySelector(".capture-overlay") &&
              Number.isFinite(afterWidth) && Number.isFinite(afterHeight) &&
              (afterWidth !== beforeWidth || afterHeight !== beforeHeight);
            const afterState = stateModule.state.get();
            const movedObject = afterState.objects.find((obj) => obj.id === "smoke-artboard-object");
            const movedGuideX = afterState.guides.find((guide) => guide.id === "smoke-artboard-guide-x");
            const movedGuideY = afterState.guides.find((guide) => guide.id === "smoke-artboard-guide-y");
            const artboardSelectionRecentersObjects = !!movedObject &&
              Math.abs(movedObject.x) > 0.01 && Math.abs(movedObject.y) > 0.01;
            const artboardSelectionRecentersGuides = !!movedGuideX && !!movedGuideY &&
              Math.abs(movedGuideX.position - movedObject.x) < 0.01 &&
              Math.abs(movedGuideY.position - movedObject.y) < 0.01;
            const artboardCornerHandleRemoved = !document.querySelector("[data-artboard-handle]");
            const cutGeometry = await import("./js/cut-geometry.js?v=smoke-cut-separate");
            const cutUi = await import("./js/cut-tool.js?v=smoke-cut-separate");
            const renderer = await import("./js/render.js?v=smoke-cut-separate");
            const sourceImage = { id: "smoke-image", type: "image", src: "data:image/png;base64,iVBORw0KGgo=", x: 0, y: 0, w: 100, h: 80, rotation: 0, cutouts: [] };
            const separated = cutGeometry.cutBoxObject(sourceImage, [
              { x: 25, y: 20 }, { x: 75, y: 20 }, { x: 75, y: 60 }, { x: 25, y: 60 },
            ]);
            if (separated?.length === 2) { separated[0].id = "remainder"; separated[1].id = "extracted"; }
            const cutSelection = cutUi.preferredCutSelectionIds(separated || []);
            const remainderNode = separated?.[0] ? renderer.renderObject(separated[0]) : null;
            const extractedNode = separated?.[1] ? renderer.renderObject(separated[1]) : null;
            const internalCutSeparates = separated?.length === 2 &&
              separated[0].cutouts?.some((cut) => cut.type === "poly") &&
              separated[1].cutouts?.some((cut) => cut.type === "outside-poly");
            const internalCutSelectsExtracted = cutSelection.length === 1 && cutSelection[0] === "extracted";
            const internalCutRendersBoth = !!remainderNode?.querySelector('mask polygon[fill="#000000"]') &&
              !!extractedNode?.querySelector('mask rect[fill="#000000"]') &&
              !!extractedNode?.querySelector('mask polygon[fill="#ffffff"]');
            let currentSourceReferenceWorks = false;
            let aiCurrentComparisonReady = false;
            let aiAreaCommentReady = false;
            let aiAreaCommentTracksZoom = false;
            let aiReferencesOpenImmediately = false;
            let aiPublicRasterVisible = false;
            let aiPublicAssetHidden = false;
            let aiQualityControlsReady = false;
            let aiOutputControlsReady = false;
            let aiTaskIsolationWorks = false;
            let aiTaskIsolationDetails = null;
            let aiWorkspaceControlsReady = false;
            button?.click();
            if (await waitFor(() => panel?.hidden === false, 2000)) {
              const sourceFile = panel.querySelector('[data-ai-source-file]');
              const taskList = panel.querySelector('[data-ai-tab-list]');
              aiWorkspaceControlsReady = !!taskList && !!sourceFile && !!panel.querySelector('[data-ai-task-add]') && !!panel.querySelector('[data-ai-close]');
              aiQualityControlsReady = panel.querySelectorAll('[data-ai-quality]').length === 3;
              aiOutputControlsReady = panel.querySelectorAll('[data-ai-output-engine]').length === 2;
              aiPublicAssetHidden = panel.querySelector('[data-ai-output-engine="asset"]')?.hidden === true;
              if (sourceFile) {
                const fixtureBlob = await fetch(${JSON.stringify(smokeFixtureImageDataUrl)}).then((response) => response.blob());
                const attachFixture = () => {
                  const transfer = new DataTransfer();
                  transfer.items.add(new File([fixtureBlob], 'smoke-reference.png', { type: 'image/png' }));
                  sourceFile.files = transfer.files;
                  sourceFile.dispatchEvent(new Event('change', { bubbles: true }));
                };
                const fixture = await attachFixtureAndInspectRaster(panel, attachFixture);
                currentSourceReferenceWorks = fixture.referenceReady;
                aiPublicRasterVisible = fixture.rasterVisible;
                aiReferencesOpenImmediately = !!panel.querySelector('.ai-reference-section[open]');
                if (currentSourceReferenceWorks) {
                  const conversionOptions = panel.querySelector('.ai-conversion-options');
                  if (conversionOptions) conversionOptions.open = false;
                  const originalTaskId = taskList?.querySelector('.ai-task-tab.is-on')?.dataset.tabId || '';
                  panel.querySelector('[data-ai-send]')?.click();
                  const generated = await waitFor(() => panel.querySelectorAll('.ai-generated-card').length === 1, 4000);
                  panel.querySelector('[data-ai-layout-mode="side-by-side"]')?.click();
                  const paneVisible = (selector) => {
                    const bounds = panel.querySelector(selector)?.getBoundingClientRect();
                    return !!bounds && bounds.width > 0 && bounds.height > 0;
                  };
                  aiCurrentComparisonReady = generated && await waitFor(() => panel.dataset.aiLayout === 'side-by-side' &&
                    paneVisible('.ai-original-pane .ai-reference-card') && paneVisible('.ai-result-pane .ai-generated-card'), 2000);
                  const image = panel.querySelector('.ai-result-pane .ai-generated-card .ai-preview-stage img');
                  await image?.decode?.();
                  await settleLayout();
                  const areaComment = await createAreaComment(panel, image);
                  const stage = areaComment.stage;
                  aiAreaCommentReady = areaComment.ready;
                  if (stage) {
                    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
                    const renderedCommentReady = await waitFor(() => Array.from(panel.querySelectorAll('.ai-result-pane .ai-comment-region'))
                      .some((region) => { const bounds = region.getBoundingClientRect(); return bounds.width > 0 && bounds.height > 0; }), 2000);
                    const normalizedRegion = () => {
                      const region = Array.from(panel.querySelectorAll('.ai-result-pane .ai-comment-region'))
                        .find((candidate) => { const bounds = candidate.getBoundingClientRect(); return bounds.width > 0 && bounds.height > 0; });
                      const regionBounds = region?.getBoundingClientRect();
                      const imageBounds = image?.getBoundingClientRect();
                      if (!regionBounds || !imageBounds?.width || !imageBounds.height) return null;
                      return {
                        x: (regionBounds.left - imageBounds.left) / imageBounds.width,
                        y: (regionBounds.top - imageBounds.top) / imageBounds.height,
                        w: regionBounds.width / imageBounds.width,
                        h: regionBounds.height / imageBounds.height,
                        imageWidth: imageBounds.width,
                        imageHeight: imageBounds.height,
                      };
                    };
                    const before = renderedCommentReady ? normalizedRegion() : null;
                    const zoomBefore = panel.querySelector('[data-ai-zoom-value]')?.textContent?.trim() || '';
                    panel.querySelector('[data-ai-zoom-action="in"]')?.click();
                    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
                    const after = normalizedRegion();
                    const zoomAfter = panel.querySelector('[data-ai-zoom-value]')?.textContent?.trim() || '';
                    aiAreaCommentTracksZoom = !!before && !!after && zoomBefore !== zoomAfter &&
                      (before.imageWidth !== after.imageWidth || before.imageHeight !== after.imageHeight) &&
                      ['x', 'y', 'w', 'h'].every((key) => Math.abs(before[key] - after[key]) < .002);
                  }
                  await waitFor(() => panel.dataset.aiBusy === 'false', 4000);
                  const originalReferenceCount = panel.querySelectorAll('[data-ai-reference-id]').length;
                  const originalResultCount = panel.querySelectorAll('.ai-generated-card').length;
                  attachFixture();
                  const isolatedTaskReady = await waitFor(() => {
                    const activeId = taskList?.querySelector('.ai-task-tab.is-on')?.dataset.tabId || '';
                    return !!originalTaskId && activeId !== originalTaskId &&
                      panel.querySelectorAll('[data-ai-reference-id]').length === 1 &&
                      panel.querySelectorAll('.ai-generated-card').length === 0;
                  }, 4000);
                  taskList?.querySelector('[data-tab-id="' + originalTaskId + '"] .ai-task-tab-select')?.click();
                  const originalTaskRestored = await waitFor(() => {
                    const restoredPanel = document.getElementById('ai-image-panel');
                    return restoredPanel?.querySelector('[data-ai-tab-list] .ai-task-tab.is-on')?.dataset.tabId === originalTaskId &&
                      restoredPanel.querySelectorAll('[data-ai-reference-id]').length === originalReferenceCount &&
                      restoredPanel.querySelectorAll('.ai-generated-card').length === originalResultCount;
                  }, 4000);
                  aiTaskIsolationWorks = isolatedTaskReady && originalTaskRestored;
                  aiTaskIsolationDetails = { isolatedTaskReady, originalTaskRestored, originalTaskId };
                  const pasteTransfer = new DataTransfer();
                  pasteTransfer.items.add(new File([fixtureBlob], 'clipboard-smoke.png', { type: 'image/png' }));
                  document.getElementById('ai-image-panel')?.dispatchEvent(new ClipboardEvent('paste', {
                    bubbles: true, cancelable: true, clipboardData: pasteTransfer,
                  }));
                  aiClipboardSourceReady = await waitFor(() => {
                    const currentPanel = document.getElementById('ai-image-panel');
                    const activeId = currentPanel?.querySelector('[data-ai-tab-list] .ai-task-tab.is-on')?.dataset.tabId;
                    return currentPanel?.hidden === false && !!activeId && activeId !== originalTaskId &&
                      currentPanel.querySelectorAll('[data-ai-reference-id]').length === 1 &&
                      currentPanel.querySelector('.ai-reference-card img')?.src === ${JSON.stringify(smokeFixtureImageDataUrl)} &&
                      currentPanel.querySelectorAll('.ai-generated-card').length === 0;
                  }, 4000);
                }
              }
              document.getElementById('ai-image-panel')?.querySelector('[data-ai-close]')?.click();
            }
            if (${process.env.FIVE_E_SMOKE_CUT_SCREENSHOT === "1" ? "true" : "false"}) {
              dismissStartupDialogs();
              panel.hidden = true;
              panel.style.display = "none";
              await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
              if (!cutChooser?.hidden) cutChooserButton?.click();
              cutChooserButton?.click();
              await waitFor(() => isActuallyVisible(cutChooser), 2000);
            }
            resolve({
              codexStatusReadable,
              codexStatusError,
              codexServerLifecycle,
              modelCatalogReadable,
              captureSourcesReadable,
              captureSourcesError,
              aiUsesCentralModal,
              aiAutoConnectControlsSimplified,
              aiProgressUiReady,
              aiResultsPlacedLeft,
              aiSourceEntrypointsReady,
              aiLoadMenuReady,
              aiClipboardSourceReady,
              aiCancelIsContextual,
              aiReturnsAfterLibraryClose,
              cutChooserVisible,
              cutChooserInToolPanel,
              textChooserBehavior,
              textChoice,
              labelerChoice,
              angleChooserBehavior,
              angleChoice,
              activeToolAfterAngleTab: angleTabToggleWorks ? "RIGHTANGLE" : stateModule.state.get().activeTool,
              angleTabToggleWorks,
              chooserPanelSwitchingWorks,
              cutChooserPersistsAfterChoice,
              chooserClosesOnOtherTool,
              eraseToolReachable,
              cutToolReachable,
              delayedCutUiReachable,
              eraseShortcutWorks,
              delayedShortcutWorks,
              visibleModalOverlaysBeforeCutShortcuts,
              artboardAreaOverlayOpened,
              artboardConfirmButtonPresent,
              artboardAreaCaptureWorks,
              artboardSelectionRecentersObjects,
              artboardSelectionRecentersGuides,
              artboardCornerHandleRemoved,
              internalCutSeparates,
              internalCutSelectsExtracted,
              internalCutRendersBoth,
              currentSourceReferenceWorks,
              aiCurrentComparisonReady,
              aiAreaCommentReady,
              aiAreaCommentTracksZoom,
              aiReferencesOpenImmediately,
              aiPublicRasterVisible,
              aiPublicAssetHidden,
              aiQualityControlsReady,
              aiOutputControlsReady,
              aiTaskIsolationWorks,
              aiTaskIsolationDetails,
              aiWorkspaceControlsReady,
              aiComposerDockedRight: !!panel.querySelector(".ai-conversation [data-ai-input]") &&
                panel.querySelector("[data-ai-chat-send]")?.textContent?.trim() === "",
              buttonText: button?.textContent?.trim() || "",
              panelOpened: panelWasOpened,
              installDialogOpened: Array.from(document.querySelectorAll(".modal-overlay .modal-title"))
                .some((node) => node.textContent?.trim() === "AI 이미지 생성/변환"),
            });
          }));
        })`);
        result.codexSendInvocationsDuringLocalSmoke = codexSendInvocationCount - codexSendsBeforeSmoke;
        result.fixtureSendCount = smokeFixtureSendCount;
        result.realSendCount = realSendCount;
        result.menuBarVisible = win.isMenuBarVisible();
        result.menuBarStateValid = process.platform === "darwin" ? result.menuBarVisible : !result.menuBarVisible;
        result.appIconReadable = !nativeImage.createFromPath(APP_ICON_PATH).isEmpty();
        const ok = desktopSmokePasses(result);
        if (process.env.FIVE_E_IMAGE_E2E === "1") {
          result.imageE2e = await win.webContents.executeJavaScript(`new Promise(async (resolve) => {
            let settled = false;
            let imageItemSeen = false;
            const imagesBefore = document.querySelectorAll("#scene image[data-id]").length;
            const finish = (value) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
            const timer = setTimeout(() => finish({ generated: false, error: "timeout" }), 210000);
            window.fiveEDesktop.onEvent(async (msg) => {
              const item = msg?.params?.item;
              if (msg?.method === "item/completed" && item?.type === "imageGeneration") {
                imageItemSeen = true;
                const previewReady = /^data:image\\//.test(item.imageDataUrl || "");
                await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
                const insertButton = document.querySelector(".ai-preview-card button");
                insertButton?.click();
                const deadline = Date.now() + 5000;
                while (Date.now() < deadline && document.querySelectorAll("#scene image[data-id]").length <= imagesBefore) {
                  await new Promise((done) => setTimeout(done, 100));
                }
                finish({
                  generated: true,
                  previewReady,
                  inserted: document.querySelectorAll("#scene image[data-id]").length > imagesBefore,
                  status: item.status || "",
                });
              } else if (msg?.method === "turn/completed" && !imageItemSeen) {
                setTimeout(() => finish({ generated: false, error: "turn completed without image" }), 250);
              }
            });
            try {
              await window.fiveEDesktop.send({
                text: "5E 통합 종단 테스트입니다. 이미지 생성 도구를 사용해 흰 배경에 검은 선으로만 된 단순한 빈 비커 1개를 생성하세요. 문자, 숫자, 기호, 라벨, 지시선, 화살표는 생성하지 마세요.",
                attachments: [],
                conversationId: null,
                purpose: "image",
                ephemeralRender: true,
              });
            } catch (error) { finish({ generated: false, error: error?.message || String(error) }); }
          })`);
        }
        const finalOk = ok && result.codexStatusReadable && result.codexServerLifecycle &&
          (process.env.FIVE_E_IMAGE_E2E !== "1" ||
            (result.imageE2e?.generated && result.imageE2e?.previewReady && result.imageE2e?.inserted));
        if (process.env.FIVE_E_SMOKE_SCREENSHOT) {
          if (process.env.FIVE_E_SMOKE_CUT_SCREENSHOT !== "1") {
            await win.webContents.executeJavaScript(`document.getElementById("ai-image-install-open")?.click()`);
          }
          await new Promise((resolve) => setTimeout(resolve, 900));
          const capture = await win.webContents.capturePage();
          fs.writeFileSync(process.env.FIVE_E_SMOKE_SCREENSHOT, capture.toPNG());
        }
        if (process.env.FIVE_E_SMOKE_RESULT) fs.writeFileSync(process.env.FIVE_E_SMOKE_RESULT, JSON.stringify({ ok: finalOk, result }), "utf8");
        console.log(`[5E desktop smoke] ${JSON.stringify(result)}`);
        app.exit(finalOk ? 0 : 1);
      } catch (error) {
        if (process.env.FIVE_E_SMOKE_RESULT) fs.writeFileSync(process.env.FIVE_E_SMOKE_RESULT, JSON.stringify({ ok: false, error: error.message }), "utf8");
        console.error("[5E desktop smoke]", error);
        app.exit(1);
      }
    });
  }
}
// ExamPool 출제 대화의 근거 검색(읽기 전용). 입력은 종류·검색어·한도로 제한하고 경로·SQL·명령은 받지 않는다.
handleTrustedIpc("exampool:evidence", async (_event, request) => require("./exampool-evidence.cjs").search(request && typeof request === "object" ? request : {}));
handleTrustedIpc("codex:status", async () => ({ server: !!server, login: await loginStatus() }));
handleTrustedIpc("codex:start", () => startServer());
handleTrustedIpc('exam:open-project',(_event,bytes)=>{
  if(!(bytes instanceof ArrayBuffer) || bytes.byteLength>128*1024*1024)throw new Error('프로젝트 파일이 올바르지 않습니다.');
  if(!examWindow || examWindow.isDestroyed())throw new Error('시험지 창을 먼저 열어주세요.');
  cancelExamEdit('다른 프로젝트를 열었습니다.');
  const requestId=require('node:crypto').randomUUID();
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{examProjectRequests.delete(requestId);reject(new Error('시험지 프로젝트 열기 응답 시간이 초과했습니다.'));},30000);
    examProjectRequests.set(requestId,{kind:'open',resolve,reject,timeout});examWindow.webContents.send('exam:project-open',{requestId,bytes});
  });
});
handleTrustedIpc('exam:project-snapshot',()=>{
  if(!examWindow || examWindow.isDestroyed())return null;
  const requestId=require('node:crypto').randomUUID();
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{examProjectRequests.delete(requestId);reject(new Error('시험지 프로젝트 응답 시간이 초과했습니다.'));},30000);
    examProjectRequests.set(requestId,{resolve,reject,timeout});examWindow.webContents.send('exam:project-snapshot',{requestId});
  });
});
handleTrustedIpc('exam:workspace-reply',(_event,payload)=>{
  boundedExamPayload(payload);
  const pending=examWorkspaceRequests.get(payload.requestId);if(!pending) return {ok:false};
  clearTimeout(pending.timeout);examWorkspaceRequests.delete(payload.requestId);
  if (pending.ownerRequest) {
    try {
      const errorReply = Object.hasOwn(payload,'error');
      const fields = errorReply ? ['requestId','error'] : ['requestId','value'];
      if (!annotationRecord(payload) || Object.keys(payload).length !== 2 || !fields.every(field=>Object.hasOwn(payload,field)) || Buffer.byteLength(JSON.stringify(payload)) > 4096 || errorReply && (typeof payload.error !== 'string' || !payload.error || payload.error.length > 1024)) throw new Error('그림 소유 확인 응답이 올바르지 않습니다.');
      if (errorReply) pending.reject(new Error(payload.error));else pending.resolve(validateExamOwnerProof(payload.value));
    } catch (error) {pending.reject(error);return {ok:false};}
  } else if(payload.error) pending.reject(new Error(payload.error));else pending.resolve(payload.value);
  return {ok:true};
});
handleTrustedIpc('exam:workspace-changed',()=>{if(examWindow && !examWindow.isDestroyed()) examWindow.webContents.send('exam:workspace-changed');return {ok:true};});
handleTrustedIpc('exam:save-workspace',()=>{if(!examWindow || examWindow.isDestroyed()) throw new Error('시험지 창을 먼저 열어주세요.');examWindow.webContents.send('exam:save-workspace');return {ok:true};});
handleTrustedIpc('exam:publish-names', (_event,names) => {
  if (!Array.isArray(names) || names.length > 1000 || names.some(value => !value ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(value.link?.tabId || '') || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.link?.assetId || '') ||
      typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200)) throw new Error('작업 탭 이름 정보가 올바르지 않습니다.');
  examTabNames = names.map(({link,name}) => ({link:{tabId:link.tabId,assetId:link.assetId},name}));
  if (examWindow && !examWindow.isDestroyed()) examWindow.webContents.send('exam:names',examTabNames);
  return {ok:true};
});
handleTrustedIpc('exam:open', (_event,payload) => openExamWindow(payload));
handleTrustedIpc('exam:finish', (_event,payload) => {
  boundedExamPayload(payload);
  if (!examEdit || payload.requestId !== examEdit.requestId || !examWindow || examWindow.isDestroyed()) throw new Error('시험지 편집 연결이 만료되었습니다.');
  if (payload.apply && (payload.captured?.link?.tabId !== examEdit.link.tabId || payload.captured?.link?.assetId !== examEdit.link.assetId)) throw new Error('다른 작업 탭의 그림은 반영할 수 없습니다.');
  if (examEdit.resolve) throw new Error('그림을 반영하고 있습니다.');
  return new Promise((resolve,reject) => {examEdit.resolve = resolve;examEdit.reject = reject;examWindow.webContents.send('exam:result',payload);});
});
handleTrustedIpc("codex:stop", (_event, payload = {}) => workspaceScope(payload) ? interruptWorkspace(payload) : stopServer());
handleTrustedIpc("codex:models", () => listModels());
handleTrustedIpc("codex:account", () => accountOverview());
handleTrustedIpc("codex:send", (event, payload) => {
  if (process.env.FIVE_E_SMOKE_TEST === "1") {
    if (!isValidSmokeFixtureRequest(event, payload)) {
      throw new Error("Invalid smoke fixture request.");
    }
    const imageDataUrl = readSmokeFixtureImageDataUrl();
    const index = ++smokeFixtureSendCount;
    const fixture = createSmokeFixtureTurn(payload, index, imageDataUrl);
    setTimeout(() => {
      for (const event of fixture.events) send("codex:event", event, event.clientScope);
    }, 0);
    return fixture.response;
  }
  codexSendInvocationCount += 1;
  realSendCount += 1;
  return sendTurn(payload);
});
handleTrustedIpc("codex:interrupt", (_event, payload = {}) => interruptWorkspace(payload));
handleTrustedIpc("codex:login", () => { const launch = codexInvocation(["login"]); execFile(launch.file, launch.args, { windowsHide: true }); return { ok: true }; });
handleTrustedIpc("capture:sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 1920, height: 1080 },
    fetchWindowIcons: true,
  });
  return sources.map((source) => ({ id: source.id, name: source.name, data: source.thumbnail.toDataURL() }));
});
handleTrustedIpc("local-images:pick-folder", async (event) => {
  const result = await dialog.showOpenDialog(win, {
    title: "검색할 로컬 이미지 폴더 선택",
    properties: ["openDirectory"],
  });
  const folder = result.canceled ? "" : localImages.addRoot(result.filePaths[0] || "");
  return { folder };
});
handleTrustedIpc("local-images:list", async (event, folder) => {
  const resolved = localImages.requireRoot(folder);
  return { folder: resolved, items: collectLocalImages(resolved) };
});
handleTrustedIpc("local-images:thumbnail", async (event, filePath) => {
  const image = localImages.read(filePath);
  if (image.extension === ".svg") return imageDataUrl(image);
  const source = nativeImage.createFromBuffer(image.bytes);
  if (source.isEmpty()) return imageDataUrl(image);
  const size = source.getSize();
  const scale = Math.min(1, 260 / Math.max(size.width, size.height, 1));
  return source.resize({
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
    quality: "good",
  }).toDataURL();
});
handleTrustedIpc("local-images:read", async (event, filePath) => {
  return imageDataUrl(localImages.read(filePath));
});
// The primary must remain file: for the native RHWP routes and exact IPC trust
// URL. Install on the default session before any loadFile; the auxiliary exam
// partition retains its separate loopback server and protocol policy.
app.on('ready', () => protocol.handle('file', createDesktopEntryProtocolHandler()));
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  if (process.platform === "darwin" && app.dock) app.dock.setIcon(APP_ICON_PATH);
  createWindow();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", stopServer);
app.on('before-quit',()=>{ if (examServerPromise) void examServerPromise.then(host=>host.close()).catch(()=>{}); });

module.exports = { createSmokeFixtureTurn, isValidSmokeFixtureRequest, shortcutModifiersForPlatform, resolveDesktopEntryResource, createDesktopEntryProtocolHandler, resolveSmokeStateModuleUrl };
