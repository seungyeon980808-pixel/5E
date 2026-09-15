const { app, BrowserWindow, ipcMain, shell, Menu, desktopCapturer, dialog, nativeImage, clipboard } = require("electron");
const { spawn, execFile } = require("node:child_process");
const { createInterface } = require("node:readline");
const fs = require("node:fs");
const path = require("node:path");
const {
  resolveTurnPlan,
  shouldAutoFinalizeImageTurn,
  readTurnTerminalStatus,
  TurnPerformanceRegistry,
} = require("./codex-turn-runtime.cjs");
const { buildEphemeralThreadStartParams } = require("./ai-thread-profile.cjs");
const { createProcessFailureFinalization } = require("./codex-process-failure.cjs");
const { createPdfLibraryService } = require("./pdf-library-service.cjs");
const { registerPdfLibraryIpc } = require("./pdf-library-ipc.cjs");
const { RECENT_THREE_PACK_IDENTITY, createBundledPdfPackReader } = require("./bundled-pdf-pack.cjs");
const { createBatchOutputService } = require("./batch-output-service.cjs");
const { createImageExportService } = require("./image-export-service.cjs");
const { createFullscreenCoordinator } = require("./fullscreen-state.cjs");
const { createProjectCloseGuard } = require("./project-close-guard.cjs");

const APP_ID = "com.5e.editor";
const APP_ICON_PATH = path.join(__dirname, "..", "assets", process.platform === "darwin" ? "icon-512.png" : "icon.ico");

function isWindowCloseShortcut(input, platform = process.platform) {
  const command = platform === "darwin" ? input.meta : input.control;
  return input.type === "keyDown" && !input.isAutoRepeat && !input.isComposing
    && command && !input.alt && !input.shift && String(input.key).toLowerCase() === "w";
}
app.setAppUserModelId(APP_ID);

const userDataOverride = process.env.FIVE_E_SMOKE_USER_DATA || process.env.FIVE_E_DEV_USER_DATA;
if (userDataOverride) app.setPath("userData", path.resolve(userDataOverride));
if (process.env.FIVE_E_DISABLE_GPU === "1") app.disableHardwareAcceleration();

let win;
let splash;
const fullscreenCoordinators = new WeakMap();
const aiTaskShortcutWebContents = new Set();
const pendingProjectCloseSnapshots = new Map();
let projectCloseRequestSerial = 0;
const pdfLibraryService = createPdfLibraryService({
  storagePath: path.join(app.getPath("userData"), "pdf-library", "catalog.json"),
  documentsPath: app.getPath("documents"),
  onProgress: (progress) => {
    if (win && !win.isDestroyed()) win.webContents.send("pdf-library:progress", progress);
  },
});
const bundledPdfPackPath = app.isPackaged
  ? path.join(process.resourcesPath, "pdf-library", "recent-three-pack")
  : process.env.FIVE_E_BUNDLED_PDF_PACK_SOURCE;
const bundledPdfPack = bundledPdfPackPath
  ? createBundledPdfPackReader({ root: bundledPdfPackPath, expectedIdentity: RECENT_THREE_PACK_IDENTITY })
  : null;
let codexSendInvocationCount = 0;
const localImageRoots = new Set();
const batchOutputRoots = new Set();
const batchOutputService = createBatchOutputService();
const imageExportService = createImageExportService({
  desktopPath: app.getPath("desktop"),
  showSaveDialog: (options) => dialog.showSaveDialog(win, options),
});
const LOCAL_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"]);

function isPathInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function allowedLocalImagePath(filePath) {
  const resolved = path.resolve(String(filePath || ""));
  return LOCAL_IMAGE_EXTENSIONS.has(path.extname(resolved).toLowerCase())
    && Array.from(localImageRoots).some((root) => isPathInside(root, resolved));
}

function imageDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".svg" ? "image/svg+xml"
    : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
      : ext === ".webp" ? "image/webp"
        : ext === ".gif" ? "image/gif"
          : ext === ".bmp" ? "image/bmp" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
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

function codexInvocation(args) {
  if (process.platform !== "win32") return { file: "codex", args };
  return { file: process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe", args: ["/d", "/s", "/c", "codex", ...args] };
}

function createCodexRuntime(clientScope = "") {
let server;
let rpcId = 0;
let threadId = null;
let turnId = null;
let activeTurnThreadId = null;
let recoveryTerminatingTurnId = null;
let initialized = false;
let initializingPromise = null;
let activeTurnAdmission = null;
const pending = new Map();
const turnAttachmentPaths = new Map();
const turnPerformance = new TurnPerformanceRegistry();
const autoFinalizingImageTurns = new Set();
const IMAGE_FINALIZE_TIMEOUT_MS = 10_000;
const IMAGE_FINALIZE_POLL_MS = 500;
const RPC_CHECK_TIMEOUT_MS = 1_500;

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    delay(ms).then(() => { throw new Error(`${label} timeout`); }),
  ]);
}
function sendImageFinalization(turnId, state, extra = {}) {
  send("codex:event", { method: "5e/image-finalization", params: { turnId, state, ...extra } });
}
function acquireTurnAdmission() {
  if (activeTurnAdmission) {
    throw new Error("이전 AI 작업을 종료하고 있습니다. 잠시 후 다시 시도해 주세요.");
  }
  const admission = {
    cancelled: false,
    threadId: null,
    turnId: null,
    attachmentPaths: [],
    queuedEvents: [],
    interruptPromise: null,
  };
  activeTurnAdmission = admission;
  return admission;
}
function turnCancellationError() {
  const error = new Error("AI 작업 준비가 취소되었습니다.");
  error.code = "AI_TURN_CANCELLED";
  return error;
}
function requireCurrentAdmission(admission) {
  if (activeTurnAdmission !== admission || admission.cancelled) throw turnCancellationError();
}
async function unlinkAttachmentPaths(paths) {
  await Promise.all(paths.map((file) => fs.promises.unlink(file).catch(() => {})));
}
async function releasePreparingAdmission(admission) {
  await unlinkAttachmentPaths(admission.attachmentPaths);
  admission.attachmentPaths = [];
  if (activeTurnAdmission === admission && !admission.turnId) activeTurnAdmission = null;
}
function releaseActiveTurn(completedTurnId) {
  const admission = activeTurnAdmission;
  if (!admission || admission.turnId !== completedTurnId) return false;
  cleanupAttachments(completedTurnId);
  autoFinalizingImageTurns.delete(completedTurnId);
  if (turnId === completedTurnId) {
    turnId = null;
    activeTurnThreadId = null;
  }
  activeTurnAdmission = null;
  return true;
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
async function autoFinalizeImageTurn(renderThreadId, completedTurnId) {
  sendImageFinalization(completedTurnId, "interrupting");
  try {
    await withTimeout(
      rpc("turn/interrupt", { threadId: renderThreadId, turnId: completedTurnId }),
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
  while (autoFinalizingImageTurns.has(completedTurnId) && turnId === completedTurnId && Date.now() < deadline) {
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
    await delay(IMAGE_FINALIZE_POLL_MS);
  }
  if (!autoFinalizingImageTurns.has(completedTurnId) || turnId !== completedTurnId) return;

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

function send(event, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(event, { ...payload, clientScope });
}
function rejectPending(error) { for (const p of pending.values()) p.reject(error); pending.clear(); }
function cleanupAttachments(id) {
  for (const file of turnAttachmentPaths.get(id) || []) void fs.promises.unlink(file).catch(() => {});
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

function notificationTurnId(message, performanceObservation = null) {
  return message?.params?.turnId
    || message?.params?.turn?.id
    || performanceObservation?.performance?.turnId
    || null;
}

function handleServerNotification(msg) {
  const performanceObservation = turnPerformance.observe(msg);
  attachGeneratedImageData(msg);
  send("codex:event", msg);
  const eventTurnId = notificationTurnId(msg, performanceObservation);
  if (shouldAutoFinalizeImageTurn({
    message: msg,
    observation: performanceObservation,
    activeTurnId: turnId,
    alreadyFinalizing: autoFinalizingImageTurns.has(eventTurnId),
  })) {
    const renderThreadId = activeTurnThreadId;
    autoFinalizingImageTurns.add(eventTurnId);
    // The generated file is the terminal result for an image-only turn. Stop any
    // trailing narration, then verify the server-side turn is terminal before a
    // subsequent render is allowed to start.
    void autoFinalizeImageTurn(renderThreadId, eventTurnId);
  }
  if (performanceObservation?.completed) {
    send("codex:event", { method: "5e/performance", params: performanceObservation.performance });
    turnPerformance.delete(performanceObservation.performance.turnId);
  }
  if (msg.method === "turn/completed" && eventTurnId) releaseActiveTurn(eventTurnId);
}

function handleServerProcessTermination(child, {
  state,
  error = null,
  code = null,
  signal = null,
} = {}) {
  if (server !== child) return;
  const failure = createProcessFailureFinalization({
    activeTurnId: turnId,
    recoveryTerminatingTurnId,
    error,
    code,
    signal,
  });
  // Preserve the active turn identity until the renderer has received its
  // terminal signal and the last performance snapshot has been emitted.
  if (failure) {
    sendImageFinalization(failure.turnId, failure.state, {
      status: failure.status,
      message: failure.message,
    });
    sendSyntheticPerformance(failure.turnId);
    releaseActiveTurn(failure.turnId);
  }
  server = null;
  threadId = null;
  turnId = null;
  activeTurnThreadId = null;
  initialized = false;
  initializingPromise = null;
  turnPerformance.clear();
  autoFinalizingImageTurns.clear();
  if (activeTurnAdmission) void unlinkAttachmentPaths(activeTurnAdmission.attachmentPaths);
  activeTurnAdmission = null;
  cleanupAllAttachments();
  const terminalError = error instanceof Error
    ? error
    : new Error(failure?.message || `Codex App Server exited (${code ?? signal ?? "unknown"})`);
  rejectPending(terminalError);
  send("codex:state", state === "missing"
    ? { state: "missing", message: terminalError.message }
    : { state: "stopped", code, signal });
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
      if (msg.id != null && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || "Codex request failed")); else p.resolve(msg.result);
      }
      if (!msg.method) return;
      const eventTurnId = notificationTurnId(msg);
      if (eventTurnId) {
        const admission = activeTurnAdmission;
        if (!admission) return;
        if (!admission.turnId) {
          admission.queuedEvents.push(msg);
          return;
        }
        if (eventTurnId !== admission.turnId) return;
      }
      handleServerNotification(msg);
    });
    child.stderr.on("data", (b) => send("codex:log", { level: "error", message: String(b).trim() }));
    child.on("error", (error) => handleServerProcessTermination(child, { state: "missing", error }));
    child.on("exit", (code, signal) => handleServerProcessTermination(child, { state: "stopped", code, signal }));
    send("codex:state", { state: "running" });
    return { ok: true, state: "running" };
  } catch (error) { return { ok: false, state: "missing", message: error.message }; }
}
function stopServer() {
  rejectPending(new Error("Codex App Server가 중지되었습니다."));
  if (server) server.kill();
  server = null;
  threadId = null;
  turnId = null;
  activeTurnThreadId = null;
  initialized = false;
  initializingPromise = null;
  turnPerformance.clear();
  autoFinalizingImageTurns.clear();
  if (activeTurnAdmission) void unlinkAttachmentPaths(activeTurnAdmission.attachmentPaths);
  activeTurnAdmission = null;
  cleanupAllAttachments();
  return { ok: true, state: "stopped" };
}
function rpc(method, params) {
  if (!server) throw new Error("Codex App Server가 실행되지 않았습니다.");
  const id = ++rpcId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
}
function notify(method, params = {}) {
  if (!server) throw new Error("Codex App Server가 실행되지 않았습니다.");
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}
async function ensureInitialized() {
  if (initialized) return;
  if (!initializingPromise) {
    initializingPromise = (async () => {
      await rpc("initialize", { clientInfo: { name: "5e-desktop", title: "5E", version: app.getVersion() }, capabilities: { experimentalApi: true } });
      notify("initialized");
      initialized = true;
    })().finally(() => { initializingPromise = null; });
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
  const {
    text,
    attachments = [],
    conversationId,
    resetConversation = false,
    model = null,
    effort = null,
    serviceTier = null,
  } = payload;
  const admission = acquireTurnAdmission();
  const startedAt = Date.now();
  try {
    const plan = resolveTurnPlan({ ...payload, conversationId, resetConversation });
    startServer();
    await ensureInitialized();
    requireCurrentAdmission(admission);
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
      requireCurrentAdmission(admission);
      if (!threadId) {
        const started = await rpc("thread/start", { model: model || null, serviceTier: serviceTier || null, cwd: app.getPath("userData"), approvalPolicy: "never", sandbox: "read-only", ephemeral: false, serviceName: "5e-chat" });
        threadId = started?.thread?.id || null;
      }
      requestThreadId = threadId;
    }
    requireCurrentAdmission(admission);
    if (!requestThreadId) throw new Error("Codex 대화를 시작하지 못했습니다.");
    admission.threadId = requestThreadId;

    const safeAttachments = Array.isArray(attachments) ? attachments : [];
    const preparedResults = await Promise.allSettled(safeAttachments.map((attachment) => safeAttachment(attachment.data, attachment.name)));
    const preparedAttachments = preparedResults
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    admission.attachmentPaths = preparedAttachments.map((attachment) => attachment.file);
    const failedAttachment = preparedResults.find((result) => result.status === "rejected");
    if (failedAttachment) throw failedAttachment.reason;
    requireCurrentAdmission(admission);
    const paths = admission.attachmentPaths;
    const attachmentBytes = preparedAttachments.reduce((sum, attachment) => sum + attachment.bytes, 0);
    const input = [{ type: "text", text }].concat(paths.map((file) => ({ type: "localImage", path: file })));
    // Exactly one backend turn is started. Any image retry must be an explicit agent/tool decision.
    const result = await rpc("turn/start", { threadId: requestThreadId, input, model: model || null, effort: effort || null, serviceTier: serviceTier || null });
    const requestTurnId = result?.turn?.id || null;
    if (!requestTurnId) throw new Error("Codex 작업을 시작하지 못했습니다.");
    admission.turnId = requestTurnId;
    turnId = requestTurnId;
    activeTurnThreadId = requestThreadId;
    if (paths.length) turnAttachmentPaths.set(requestTurnId, paths);
    const performance = turnPerformance.register({
      turnId: requestTurnId,
      threadId: requestThreadId,
      purpose: plan.purpose,
      startedAt,
      prepareEndedAt: Date.now(),
      attachmentCount: preparedAttachments.length,
      attachmentBytes,
    });
    const queuedEvents = admission.queuedEvents.splice(0);
    for (const message of queuedEvents) {
      if (notificationTurnId(message) === requestTurnId) handleServerNotification(message);
    }
    if (admission.cancelled) void interruptActiveTurn();
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
  } catch (error) {
    if (activeTurnAdmission === admission && !admission.turnId) await releasePreparingAdmission(admission);
    throw error;
  }
}

function interruptActiveTurn() {
  const admission = activeTurnAdmission;
  if (!admission) return Promise.resolve({ ok: false, state: "idle" });
  admission.cancelled = true;
  if (!admission.threadId || !admission.turnId) {
    return Promise.resolve({ ok: true, state: "cancelling" });
  }
  if (!admission.interruptPromise) {
    admission.interruptPromise = rpc("turn/interrupt", {
      threadId: admission.threadId,
      turnId: admission.turnId,
    }).then((result) => ({ ok: true, state: "interrupt-requested", result }))
      .catch((error) => ({ ok: false, state: "interrupt-failed", message: error.message }));
  }
  return admission.interruptPromise;
}

  return {
    startServer, stopServer, listModels, accountOverview, sendTurn, interruptActiveTurn,
    status: async () => ({ server: !!server, login: await loginStatus() }),
  };
}

const codexRuntimes = new Map();
function runtimeFor(payload = {}) {
  const clientScope = payload?.clientScope ?? "";
  if (typeof clientScope !== "string" || clientScope.length > 128) {
    throw new Error("AI 작업 식별자가 올바르지 않습니다.");
  }
  if (!codexRuntimes.has(clientScope)) codexRuntimes.set(clientScope, createCodexRuntime(clientScope));
  return codexRuntimes.get(clientScope);
}
function stopAllServers() {
  for (const runtime of codexRuntimes.values()) runtime.stopServer();
}

function requestProjectCloseSnapshot(target) {
  if (!target || target.isDestroyed() || target.webContents.isDestroyed()) return Promise.resolve(null);
  const requestId = `project-close-${++projectCloseRequestSerial}`;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingProjectCloseSnapshots.delete(requestId);
      resolve(null);
    }, 15_000);
    pendingProjectCloseSnapshots.set(requestId, { sender: target.webContents, resolve: (value) => {
      clearTimeout(timeout);
      resolve(value);
    } });
    target.webContents.send("project:close-request", requestId);
  });
}

async function saveProjectFile(sender, payload = {}) {
  if (!win || win.isDestroyed() || sender !== win.webContents) return { kind: "failed", error: "unauthorized" };
  if (typeof payload.json !== "string") return { kind: "failed", error: "invalid-project" };
  const result = await dialog.showSaveDialog(win, {
    title: "프로젝트 저장",
    defaultPath: "physics_drawing.5e",
    filters: [{ name: "5E 프로젝트 파일", extensions: ["5e"] }],
  });
  if (result.canceled || !result.filePath) return { kind: "cancelled" };
  try {
    await fs.promises.writeFile(result.filePath, payload.json, "utf8");
    return { kind: "saved" };
  } catch {
    return { kind: "failed", error: "write-failed" };
  }
}

function createWindow() {
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
  win = new BrowserWindow({
    width: 1520,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: "#0e1512",
    icon: APP_ICON_PATH,
    titleBarStyle: "hidden",
    ...(process.platform === "darwin"
      ? { trafficLightPosition: { x: 12, y: 8 } }
      : { titleBarOverlay: { color: "#0e1512", symbolColor: "#9fb8b0", height: 30 } }),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const fullscreenWindow = win;
  const fullscreenCoordinator = createFullscreenCoordinator(fullscreenWindow, (active) => {
    if (!fullscreenWindow.webContents.isDestroyed()) {
      fullscreenWindow.webContents.send("window:fullscreen-changed", active);
    }
  });
  fullscreenCoordinators.set(fullscreenWindow, fullscreenCoordinator);
  fullscreenWindow.webContents.on("did-finish-load", () => {
    if (!fullscreenWindow.webContents.isDestroyed()) {
      fullscreenWindow.webContents.send("window:fullscreen-changed", fullscreenCoordinator.current());
    }
  });
  fullscreenWindow.once("closed", () => fullscreenCoordinator.dispose());
  const shortcutWindow = win;
  const shortcutWebContents = win.webContents;
  const shortcutWebContentsId = shortcutWebContents.id;
  shortcutWebContents.on("before-input-event", (event, input) => {
    if (!isWindowCloseShortcut(input)) return;
    event.preventDefault();
    if (aiTaskShortcutWebContents.has(shortcutWebContentsId)) shortcutWebContents.send("ai:close-task-shortcut");
    else shortcutWindow.close();
  });
  shortcutWebContents.once("destroyed", () => aiTaskShortcutWebContents.delete(shortcutWebContentsId));
  let bypassProjectCloseGuard = false;
  const projectCloseGuard = createProjectCloseGuard({
    requestSnapshot: () => requestProjectCloseSnapshot(fullscreenWindow),
    prompt: (snapshot) => dialog.showMessageBox(fullscreenWindow, {
      type: "warning",
      buttons: ["저장 후 종료", "저장하지 않고 종료", "취소"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      message: "저장하지 않은 캔버스 작업이 있습니다.",
      detail: snapshot.aiHasWork
        ? "AI 작업은 프로젝트 파일에 포함되지 않습니다. 이 기기의 별도 복구 저장소에 저장한 뒤 종료합니다."
        : "저장 후 종료를 선택하면 프로젝트 파일을 저장한 뒤 종료합니다.",
    }).then((result) => result.response),
    saveProject: (json) => saveProjectFile(fullscreenWindow.webContents, { json }),
    notifyUnrecoverableAi: () => dialog.showMessageBox(fullscreenWindow, {
      type: "error",
      buttons: ["확인"],
      defaultId: 0,
      message: "AI 작업 복구 저장에 실패했습니다.",
      detail: "AI 작업은 프로젝트 파일에 포함되지 않습니다. 작업을 보존하기 위해 종료하지 않았습니다.",
    }),
    notifySaveFailure: () => dialog.showMessageBox(fullscreenWindow, {
      type: "error",
      buttons: ["확인"],
      defaultId: 0,
      message: "프로젝트 파일을 저장하지 못했습니다.",
      detail: "작업을 보존하기 위해 종료하지 않았습니다. 저장 위치와 권한을 확인한 뒤 다시 시도해 주세요.",
    }),
    close: () => {
      bypassProjectCloseGuard = true;
      fullscreenWindow.close();
    },
  });
  fullscreenWindow.on("close", (event) => {
    if (bypassProjectCloseGuard) return;
    event.preventDefault();
    void projectCloseGuard();
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
  win.loadFile(path.join(__dirname, "..", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: "deny" }; });
  if (process.env.FIVE_E_BUNDLED_PDF_SMOKE_TEST === "1") {
    win.webContents.once("did-finish-load", async () => {
      try {
        const result = await win.webContents.executeJavaScript(`(async () => {
          const [{ loadBundledDesktopPack }, { createPdfRuntime }] = await Promise.all([
            import("./js/pdf-library/desktop-pack.js"), import("./js/pdf-library/pdf-runtime.js"),
          ]);
          const pack = await loadBundledDesktopPack();
          const runtime = createPdfRuntime();
          const first = pack?.documents?.[0];
          const opened = first ? await pack.openDocument(runtime, first) : null;
          if (opened) await runtime.closeDocument(opened.id);
          return {
            id: pack?.id || null, documentCount: pack?.documentCount || 0,
            pageCount: pack?.pageCount || 0, openedId: opened?.id || null,
            openedPageCount: opened?.pageCount || 0,
          };
        })()`);
        const ok = result.id === RECENT_THREE_PACK_IDENTITY.id && result.documentCount === 72
          && result.pageCount === 288 && result.openedId && result.openedPageCount > 0;
        fs.writeFileSync(process.env.FIVE_E_BUNDLED_PDF_SMOKE_RESULT, JSON.stringify({ ok, result }), "utf8");
        app.exit(ok ? 0 : 1);
      } catch (error) {
        fs.writeFileSync(process.env.FIVE_E_BUNDLED_PDF_SMOKE_RESULT, JSON.stringify({ ok: false, error: error.message }), "utf8");
        app.exit(1);
      }
    });
  }
  if (process.env.FIVE_E_PDF_SMOKE_TEST === "1") {
    win.webContents.once("did-finish-load", async () => {
      try {
        const connection = await pdfLibraryService.connect(process.env.FIVE_E_PDF_SMOKE_FOLDER);
        const result = await win.webContents.executeJavaScript(`(async () => {
          const api = window.fiveEDesktop.pdfLibrary;
          const connectionId = ${JSON.stringify(connection.connectionId)};
          const connected = (await api.connections()).connections.some((item) => item.connectionId === connectionId);
          const firstSync = await api.sync(connectionId, "electron-surface-smoke");
          const tree = (await api.folderTree(connectionId)).tree;
          const initial = await api.list(connectionId);
          const documents = initial.documents;
          const bytes = await api.read({ documentId: documents[0].documentId });
          const image = initial.images[0] ? await api.readImage(initial.images[0].imageId) : null;
          await api.setFolderSelection(tree.folderId, false);
          const hidden = await api.list(connectionId);
          await api.setFolderSelection(tree.folderId, true);
          await api.sync(connectionId, "electron-surface-restore");
          const restored = await api.list(connectionId);
          const capabilities = await api.capabilities();
          return {
            connected,
            documentCount: documents.length,
            byteLength: bytes.byteLength,
            imageByteLength: image?.data?.byteLength || 0,
            hiddenCount: hidden.documents.length + hidden.images.length,
            restoredCount: restored.documents.length + restored.images.length,
            treeSelection: tree.selection,
            warningCount: firstSync.warningCount,
            warningsSafe: firstSync.warnings.every((warning) => !warning.relativePath.startsWith("/") && !warning.relativePath.includes("..")),
            ocrIntegrated: capabilities.ocr.integrated,
          };
        })()`);
        const ok = result.connected && result.documentCount > 0 && result.byteLength > 0 && result.imageByteLength > 0 && result.hiddenCount === 0 && result.restoredCount > 1;
        fs.writeFileSync(process.env.FIVE_E_PDF_SMOKE_RESULT, JSON.stringify({ ok, result }));
        app.exit(ok ? 0 : 1);
      } catch (error) {
        fs.writeFileSync(process.env.FIVE_E_PDF_SMOKE_RESULT, JSON.stringify({ ok: false, error: error.message }));
        app.exit(1);
      }
    });
  }
  if (process.env.FIVE_E_HANDOFF_SMOKE_TEST === "1") {
    win.webContents.once("did-finish-load", async () => {
      try {
        const result = await win.webContents.executeJavaScript(`new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(async () => {
            const started = Date.now();
            while (!document.querySelector('input[type="file"][accept*=".5e"]') && Date.now() - started < 4000) {
              await new Promise(done => setTimeout(done, 50));
            }
            const input = document.querySelector('input[type="file"][accept*=".5e"]');
            let chooserClicks = 0;
            input?.addEventListener('click', event => { chooserClicks += 1; event.preventDefault(); }, true);
            window.dispatchEvent(new CustomEvent('5e:ai-output-success'));
            window.dispatchEvent(new CustomEvent('5e:local-folder-intent'));
            await new Promise(done => setTimeout(done, 100));
            const transfer = document.querySelector('[data-ai-project-transfer]');
            const beforeAction = chooserClicks;
            transfer?.click();
            await new Promise(done => setTimeout(done, 100));
            resolve({
              panelOpened: document.getElementById('ai-image-panel')?.hidden === false,
              transferVisible: !!transfer && !transfer.hidden,
              transferLabel: transfer?.textContent?.trim() || '',
              chooserBeforeAction: beforeAction,
              chooserAfterAction: chooserClicks,
            });
          }));
        })`);
        const ok = result.panelOpened && result.transferVisible && result.transferLabel === "웹 프로젝트 열기" && result.chooserBeforeAction === 0 && result.chooserAfterAction === 1;
        if (process.env.FIVE_E_HANDOFF_SMOKE_RESULT) fs.writeFileSync(process.env.FIVE_E_HANDOFF_SMOKE_RESULT, JSON.stringify({ ok, result }), "utf8");
        if (process.env.FIVE_E_HANDOFF_SMOKE_SCREENSHOT) fs.writeFileSync(process.env.FIVE_E_HANDOFF_SMOKE_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
        app.exit(ok ? 0 : 1);
      } catch (error) {
        if (process.env.FIVE_E_HANDOFF_SMOKE_RESULT) fs.writeFileSync(process.env.FIVE_E_HANDOFF_SMOKE_RESULT, JSON.stringify({ ok: false, error: error.message }), "utf8");
        app.exit(1);
      }
    });
  }
  if (process.env.FIVE_E_SMOKE_TEST === "1") {
    win.webContents.once("did-finish-load", async () => {
      try {
        const codexSendsBeforeSmoke = codexSendInvocationCount;
        let smokeBlockedCodexSends = 0;
        ipcMain.removeHandler("codex:send");
        ipcMain.handle("codex:send", (_, payload) => {
          smokeBlockedCodexSends += 1;
          const suffix = `${smokeBlockedCodexSends}-${String(payload?.clientScope || "legacy")}`;
          return { turnId: `smoke-blocked-turn-${suffix}`, renderThreadId: `smoke-blocked-thread-${suffix}` };
        });
        let result;
        try {
          result = await win.webContents.executeJavaScript(`new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(async () => {
            const waitFor = async (test, timeout = 4000) => {
              const started = Date.now();
              while (Date.now() - started < timeout) {
                if (test()) return true;
                await new Promise((done) => setTimeout(done, 50));
              }
              return false;
            };
            const startupDialogTitles = new Set(["작업 복구", "찾아 주셔서 고맙습니다"]);
            const dismissStartupDialogs = () => {
              for (const title of document.querySelectorAll(".modal-overlay .modal-title")) {
                if (!startupDialogTitles.has(title.textContent?.trim())) continue;
                title.closest(".modal-overlay")?.querySelector(".modal-btn")?.click();
              }
            };
            dismissStartupDialogs();
            const button = document.getElementById("ai-image-install-open");
            const panel = document.getElementById("ai-image-panel");
            const activePanel = () => document.getElementById("ai-image-panel");
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
            const aiModal = panel?.querySelector(".modal-ai");
            const aiModalRect = aiModal?.getBoundingClientRect();
            const aiUsesCentralModal = panel?.classList.contains("modal-overlay") && !!aiModalRect &&
              Math.abs(aiModalRect.left + aiModalRect.width / 2 - window.innerWidth / 2) < 4 &&
              Math.abs(aiModalRect.top + aiModalRect.height / 2 - window.innerHeight / 2) < 4;
            const aiAutoConnectControlsSimplified = !panel?.querySelector("[data-ai-start]") &&
              !panel?.querySelector("[data-ai-stop]") && !!panel?.querySelector("[data-ai-login]");
            const aiProgressUiReady = !!panel?.querySelector("[data-ai-generating] .ai-e-loader") &&
              !!panel?.querySelector("[data-ai-e-count]") && !!panel?.querySelector("[data-ai-progress-title]") &&
              !!panel?.querySelector("[data-ai-progress-stage]");
            const resultRect = panel?.querySelector(".ai-results")?.getBoundingClientRect();
            const conversationRect = panel?.querySelector(".ai-conversation")?.getBoundingClientRect();
            const aiResultsPlacedLeft = !!resultRect && !!conversationRect && resultRect.left < conversationRect.left;
            const sourceTrigger = panel?.querySelector("[data-ai-source-menu-trigger]");
            const sourceMenu = panel?.querySelector("[data-ai-source-menu]");
            const sourceFile = panel?.querySelector("[data-ai-source-file]");
            const closedSourceStyle = sourceTrigger ? getComputedStyle(sourceTrigger) : null;
            const neutralSourceBackground = closedSourceStyle?.backgroundColor;
            const aiSourceEntrypointsReady = sourceFile?.multiple === true &&
              sourceMenu?.querySelectorAll("[data-ai-source-action]").length === 4 &&
              !!sourceMenu.querySelector('[data-ai-source-action="library"]') &&
              !!sourceMenu.querySelector('[data-ai-source-action="capture"]');
            sourceTrigger?.click();
            const sourceMenuOpened = await waitFor(() => sourceTrigger?.getAttribute("aria-expanded") === "true" && sourceMenu?.hidden === false);
            const openSourceStyle = sourceTrigger ? getComputedStyle(sourceTrigger) : null;
            const aiSourceMenuVisualStatesReady = sourceMenuOpened && neutralSourceBackground !== openSourceStyle?.backgroundColor &&
              openSourceStyle?.color === "rgb(255, 255, 255)";
            const thicknessSelect = panel?.querySelector('select[data-ai-line-thickness]');
            const initialThicknessValues = Array.from(thicknessSelect?.options || []).map((option) => option.value);
            if (thicknessSelect) {
              thicknessSelect.value = "1";
              thicknessSelect.dispatchEvent(new Event("change", { bubbles: true }));
            }
            const initialThicknessChanged = await waitFor(() => thicknessSelect?.value === "1");
            if (thicknessSelect) {
              thicknessSelect.value = "0";
              thicknessSelect.dispatchEvent(new Event("change", { bubbles: true }));
            }
            const aiInitialThicknessReady = initialThicknessValues.join(",") === "0,1,2" && initialThicknessChanged &&
              await waitFor(() => thicknessSelect?.value === "0");
            sourceMenu?.querySelector('[data-ai-source-action="library"]')?.click();
            const aiLoadMenuReady = await waitFor(() => {
              const libraryPicker = document.querySelector(".unified-library-overlay:not([hidden])");
              return !!libraryPicker?.querySelector('[data-unilib-type="image"]') &&
                !!libraryPicker.querySelector("[data-unilib-query]");
            }, 4000);
            document.querySelector(".unified-library-overlay:not([hidden]) [data-unilib-close]")?.click();
            sourceTrigger?.click();
            sourceMenu?.querySelector('[data-ai-source-action="capture"]')?.click();
            await waitFor(() => document.querySelector(".ai-capture-source"), 5000);
            document.querySelector(".ai-capture-source")?.click();
            await waitFor(() => document.querySelector(".ai-crop-dialog"), 3000);
            const cropDialog = document.querySelector(".ai-crop-dialog");
            const aiCaptureCropReady = cropDialog?.closest(".ai-compare-overlay")?.parentElement === document.documentElement &&
              !!cropDialog?.querySelector(".ai-crop-image-wrap") &&
              cropDialog.querySelectorAll(".ai-crop-mask").length === 4 &&
              !!cropDialog.querySelector("[data-ai-crop-apply]");
            cropDialog?.querySelector(".ai-crop-foot button")?.click();
            const cancelButton = panel?.querySelector("[data-ai-interrupt]");
            const aiCancelIsContextual = cancelButton?.textContent?.trim() === "작업 취소" && cancelButton.hidden;
            const aiReturnsAfterLibraryClose = panel?.hidden === false && !document.querySelector(".unified-library-overlay:not([hidden])");
            panel.hidden = true;
            dismissStartupDialogs();
            await waitFor(() => !Array.from(document.querySelectorAll(".modal-overlay .modal-title"))
              .some((title) => startupDialogTitles.has(title.textContent?.trim())), 2000);
            const stateModule = await import("./js/state.js?v=1.4.0");
            const textChooser = document.getElementById("chooser-text");
            const textChooserButton = document.getElementById("tool-text-merged");
            const angleChooser = document.getElementById("chooser-angle");
            const angleChooserButton = document.getElementById("tool-angle-merged");
            const cutChooser = document.getElementById("chooser-cut");
            const cutChooserButton = document.getElementById("tool-cut-merged");
            const isActuallyVisible = (element) => {
              if (!element || element.hidden) return false;
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 &&
                rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 &&
                rect.left < innerWidth && rect.top < innerHeight;
            };
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
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "v", code: "KeyV", bubbles: true }));
            const chooserClosesOnSelectShortcut = await waitFor(() =>
              stateModule.state.get().activeTool === "V" &&
              !isActuallyVisible(textChooser) &&
              !textChooserButton?.classList.contains("is-open") &&
              textChooserButton?.getAttribute("aria-expanded") === "false");
            await choosePersistentTool({
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
            const commandModifier = /Mac/i.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", code: "KeyE", ...commandModifier, bubbles: true }));
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
            let unifiedLibraryReady = false;
            let aiLibraryIndependentWorkspaces = false;
            let aiOneImagePerTaskReady = false;
            let aiSingleImageComparisonGuardReady = false;
            let aiAreaCommentReady = false;
            let aiAreaCommentTracksZoom = false;
            let aiAreaCommentZoomDiagnostics = null;
            let aiReferencesOpenImmediately = false;
            let aiLocalAssetZeroRoundTripWorks = false;
            let aiLocalApparatusZeroRoundTripWorks = false;
            let aiLocalOneResultPerWorkspace = false;
            let aiQualityControlsReady = false;
            let aiOutputControlsReady = false;
            let aiTaskWorkspacesIsolated = false;
            let aiCollectiveExportControlReady = false;
            document.getElementById("exam-library-open")?.click();
            const libraryOpened = await waitFor(() => {
              const library = document.querySelector(".unified-library-overlay:not([hidden])");
              return library?.querySelectorAll("[data-result-id]").length >= 2;
            }, 10000);
            const library = document.querySelector(".unified-library-overlay:not([hidden])");
            library?.querySelector('[data-unilib-tab="image"]')?.click();
            const imageResultsReady = await waitFor(() =>
              library?.querySelectorAll("[data-result-id]").length >= 2, 10000);
            const selectedLibraryChecks = Array.from(library?.querySelectorAll("[data-select-result]") || []).slice(0, 2);
            selectedLibraryChecks.forEach((check) => check.click());
            const libraryAiButton = library?.querySelector("[data-unilib-ai]");
            unifiedLibraryReady = libraryOpened && imageResultsReady && selectedLibraryChecks.length === 2 &&
              !!libraryAiButton && !libraryAiButton.disabled && /선택 2개/.test(libraryAiButton.textContent || "");
            libraryAiButton?.click();
            await waitFor(() => !!library?.querySelector(".unilib-ai-placement"), 2000);
            Array.from(library?.querySelectorAll(".unilib-ai-placement button") || [])
              .find((candidate) => candidate.textContent?.trim() === "이미지마다 별도 작업")?.click();
            await waitFor(() => Array.from(document.querySelectorAll(".modal-overlay"))
              .filter((candidate) => candidate.querySelector(".modal-ai"))
              .filter((candidate) => candidate.querySelectorAll(".ai-reference-card").length === 1).length === 2, 12000);
            const independentPanels = Array.from(document.querySelectorAll(".modal-overlay"))
              .filter((candidate) => candidate.querySelector(".modal-ai"))
              .filter((candidate) => candidate.querySelectorAll(".ai-reference-card").length === 1)
              .slice(0, 2);
            aiLibraryIndependentWorkspaces = unifiedLibraryReady && independentPanels.length === 2 &&
              new Set(independentPanels.map((candidate) => candidate.querySelector(".ai-reference-card img")?.src)).size === 2;
            aiOneImagePerTaskReady = aiLibraryIndependentWorkspaces && independentPanels.every((candidate) =>
              candidate.querySelectorAll(".ai-reference-card").length === 1 &&
              candidate.querySelectorAll(".ai-generated-card").length === 0);
            aiReferencesOpenImmediately = independentPanels.every((candidate) => candidate.querySelector(".ai-reference-section")?.open);
            library?.querySelector("[data-unilib-close]")?.click();
            const activateWorkspace = async (target) => {
              if (!target || activePanel() === target) return Boolean(target);
              const scope = target.id.replace(/^ai-workspace-/, "");
              activePanel()?.querySelector('[data-ai-workspace-link="' + scope + '"]')?.click();
              return waitFor(() => activePanel() === target, 4000);
            };
            for (const independentPanel of independentPanels) {
              await activateWorkspace(independentPanel);
              if (independentPanel.dataset.aiBusy === "true") {
                independentPanel.querySelector("[data-ai-interrupt]")?.click();
                await waitFor(() => independentPanel.dataset.aiBusy === "false", 5000);
              }
            }
            const commentPanel = independentPanels[0];
            if (await activateWorkspace(commentPanel)) {
                if (commentPanel.dataset.aiBusy === "true") {
                  commentPanel.querySelector("[data-ai-interrupt]")?.click();
                  await waitFor(() => commentPanel.dataset.aiBusy === "false", 5000);
                }
                const referenceDetails = commentPanel.querySelector(".ai-reference-section");
                aiReferencesOpenImmediately = aiReferencesOpenImmediately && !!referenceDetails?.open;
                const commentCard = commentPanel.querySelector(".ai-reference-card");
                const commentStage = commentCard?.querySelector(".ai-preview-stage");
                const commentImage = commentStage?.querySelector("img");
                const commentButton = commentPanel.querySelector('[data-ai-comment-tool="area"]');
                if (commentStage && commentImage && commentButton) {
                  commentButton.click();
                  const rect = commentImage.getBoundingClientRect();
                  commentImage.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 77, isPrimary: true, button: 0, clientX: rect.left + rect.width * .2, clientY: rect.top + rect.height * .2 }));
                  commentStage.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 77, isPrimary: true, clientX: rect.left + rect.width * .6, clientY: rect.top + rect.height * .6 }));
                  commentStage.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 77, isPrimary: true, button: 0, clientX: rect.left + rect.width * .6, clientY: rect.top + rect.height * .6 }));
                  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
                  const selection = commentCard.querySelector(".ai-comment-region");
                  aiAreaCommentReady = !!selection && !!commentPanel.querySelector("[data-ai-inline-editor]");
                  if (selection) {
                    const beforeImage = commentImage.getBoundingClientRect();
                    const beforeSelection = selection.getBoundingClientRect();
                    const before = {
                      x: (beforeSelection.left - beforeImage.left) / beforeImage.width,
                      y: (beforeSelection.top - beforeImage.top) / beforeImage.height,
                      w: beforeSelection.width / beforeImage.width,
                      h: beforeSelection.height / beforeImage.height,
                    };
                    commentPanel.querySelector('[data-ai-pane-zoom="source"] [data-ai-zoom-action="in"]')?.click();
                    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
                    const afterImage = commentImage.getBoundingClientRect();
                    const afterSelectionNode = commentCard.querySelector(".ai-comment-region");
                    const afterSelection = afterSelectionNode?.getBoundingClientRect();
                    const after = {
                      x: (afterSelection?.left - afterImage.left) / afterImage.width,
                      y: (afterSelection?.top - afterImage.top) / afterImage.height,
                      w: afterSelection?.width / afterImage.width,
                      h: afterSelection?.height / afterImage.height,
                    };
                    aiAreaCommentZoomDiagnostics = {
                      before, after, beforeImageHeight: beforeImage.height, afterImageHeight: afterImage.height,
                      zoomValue: commentPanel.querySelector('[data-ai-pane-zoom="source"] [data-ai-zoom-value]')?.textContent || "",
                    };
                    aiAreaCommentTracksZoom = !!afterSelectionNode && afterImage.height > beforeImage.height &&
                      commentPanel.querySelector('[data-ai-pane-zoom="source"] [data-ai-zoom-value]')?.textContent === "120%" &&
                      Object.keys(before).every((key) => Math.abs(before[key] - after[key]) < .02);
                  }
                }
                const compareButton = commentPanel.querySelector("[data-ai-compare]");
                aiSingleImageComparisonGuardReady = compareButton?.disabled === true && /첫 결과/.test(compareButton.title || "");
            }
            let workingPanel = activePanel();
            if (workingPanel) {
              aiQualityControlsReady = workingPanel.querySelectorAll("[data-ai-quality]").length === 3;
              aiOutputControlsReady = workingPanel.querySelectorAll("[data-ai-output-engine]").length === 2;
              const originalWorkspace = workingPanel;
              const originalInputValue = originalWorkspace.querySelector("[data-ai-input]")?.value || "";
              originalWorkspace.querySelector("[data-ai-tab-new]")?.click();
              await waitFor(() => activePanel() && activePanel() !== originalWorkspace, 5000);
              const isolatedWorkspace = activePanel();
              const isolatedInput = isolatedWorkspace?.querySelector("[data-ai-input]");
              if (isolatedInput) isolatedInput.value = "workspace isolation smoke";
              await activateWorkspace(originalWorkspace);
              const originalRestored = originalWorkspace.querySelector("[data-ai-input]")?.value === originalInputValue;
              await activateWorkspace(isolatedWorkspace);
              aiTaskWorkspacesIsolated = originalRestored &&
                isolatedWorkspace?.querySelector("[data-ai-input]")?.value === "workspace isolation smoke";
              workingPanel = activePanel();
              // Local zero-round-trip diagrams are now an explicit user choice;
              // textbook raster conversion is never auto-routed to 5E assets.
              const localRequests = [
                "한반도 물리 해안선 지도를 그려 줘",
                "one closed rectangular series circuit with exactly one dc source on the left, one open switch on the top, one resistor on the right, and one lamp on the bottom, no labels or arrows",
                "one ceiling-fixed pulley with one continuous rope, one blank rectangular load on the left branch, and on the right branch one spring followed by one blank rectangular load of the same shape, no labels or arrows",
                "optical bench with exactly one convex lens on the left, one plane mirror at 45 degrees in the center, and one screen on the right, no rays labels or arrows",
                "beaker and particle box side by side comparison: beaker liquid fill fraction 0.45, gas 16 circular particles, unmixed, no labels or arrows",
                "one generic unlabeled logistic S-shaped population curve without labels text numbers",
              ];
              const localResults = [];
              const localPanels = [];
              for (const localRequest of localRequests) {
                if (localPanels.length) {
                  const previousPanel = activePanel();
                  previousPanel?.querySelector("[data-ai-tab-new]")?.click();
                  await waitFor(() => activePanel() && activePanel() !== previousPanel, 5000);
                }
                workingPanel = activePanel();
                localPanels.push(workingPanel);
                workingPanel?.querySelector('[data-ai-output-engine="asset"]')?.click();
                workingPanel?.querySelector('[data-ai-mode="diagram"]')?.click();
                const aiInput = workingPanel?.querySelector("[data-ai-input]");
                let historyTail = "";
                try {
                  const history = JSON.parse(localStorage.getItem("5e.aiPerformance.v1") || "[]");
                  historyTail = JSON.stringify(Array.isArray(history) ? history.at(-1) || null : null);
                } catch {}
                if (aiInput) aiInput.value = localRequest;
                workingPanel?.querySelector("[data-ai-send]")?.click();
                const localPreviewReady = await waitFor(() =>
                  !!workingPanel?.querySelector("[data-ai-previews] .ai-preview-card img[src^='data:image/svg+xml']"), 4000);
                let localMetric = null;
                await waitFor(() => {
                  try {
                    const history = JSON.parse(localStorage.getItem("5e.aiPerformance.v1") || "[]");
                    if (!Array.isArray(history)) return false;
                    const nextMetric = history.at(-1) || null;
                    if (JSON.stringify(nextMetric) === historyTail) return false;
                    localMetric = nextMetric;
                    return true;
                  } catch { return false; }
                }, 4000);
                localResults.push(localPreviewReady && localMetric?.route === "local-asset" &&
                  localMetric?.imageCallCount === 0 && localMetric?.localAsset === true);
              }
              aiLocalAssetZeroRoundTripWorks = localResults.length === localRequests.length && localResults.every(Boolean);
              aiLocalApparatusZeroRoundTripWorks = localResults.slice(1).length === 5 && localResults.slice(1).every(Boolean);
              aiLocalOneResultPerWorkspace = localPanels.length === localRequests.length && localPanels.every((candidate) =>
                candidate.querySelectorAll(".ai-reference-card").length === 0 &&
                candidate.querySelectorAll(".ai-generated-card").length === 1);
              const exportMode = workingPanel?.querySelector("[data-ai-task-export-mode]");
              const exportButton = workingPanel?.querySelector("[data-ai-task-export]");
              aiCollectiveExportControlReady = Array.from(exportMode?.options || []).map((option) => option.value).join(",") === "selected,all" &&
                exportButton?.textContent?.trim() === "한 폴더에 저장" && !exportButton.disabled;
              workingPanel?.querySelector("[data-ai-close]")?.click();
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
              aiSourceMenuVisualStatesReady,
              aiLoadMenuReady,
              aiCaptureCropReady,
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
              chooserClosesOnSelectShortcut,
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
              aiInitialThicknessReady,
              unifiedLibraryReady,
              aiLibraryIndependentWorkspaces,
              aiOneImagePerTaskReady,
              aiSingleImageComparisonGuardReady,
              aiAreaCommentReady,
              aiAreaCommentTracksZoom,
              aiAreaCommentZoomDiagnostics,
              aiReferencesOpenImmediately,
              aiLocalAssetZeroRoundTripWorks,
              aiLocalApparatusZeroRoundTripWorks,
              aiLocalOneResultPerWorkspace,
              aiQualityControlsReady,
              aiOutputControlsReady,
              aiTaskWorkspacesIsolated,
              aiCollectiveExportControlReady,
              aiComposerDockedRight: !!activePanel()?.querySelector(".ai-conversation [data-ai-input]") &&
                activePanel()?.querySelector("[data-ai-chat-send]")?.textContent?.trim() === "",
              buttonText: button?.textContent?.trim() || "",
              panelOpened: panelWasOpened,
              installDialogOpened: Array.from(document.querySelectorAll(".modal-overlay .modal-title"))
                .some((node) => node.textContent?.trim() === "AI 이미지 생성/변환"),
            });
          }));
        })`);
        } finally {
          ipcMain.removeHandler("codex:send");
          ipcMain.handle("codex:send", (_, payload) => {
            codexSendInvocationCount += 1;
            return runtimeFor(payload).sendTurn(payload);
          });
        }
        result.smokeBlockedCodexSends = smokeBlockedCodexSends;
        result.codexSendInvocationsDuringLocalSmoke = codexSendInvocationCount - codexSendsBeforeSmoke;
        result.menuBarVisible = win.isMenuBarVisible();
        result.menuBarPolicySatisfied = process.platform === "darwin" || result.menuBarVisible === false;
        result.appIconReadable = !nativeImage.createFromPath(APP_ICON_PATH).isEmpty();
        const ok = result.buttonText === "AI 이미지 변환" && result.panelOpened &&
          result.modelCatalogReadable && result.captureSourcesReadable && result.aiUsesCentralModal &&
          result.aiAutoConnectControlsSimplified && result.aiProgressUiReady && result.aiResultsPlacedLeft &&
          result.aiSourceEntrypointsReady && result.aiSourceMenuVisualStatesReady && result.aiLoadMenuReady && result.aiCaptureCropReady && result.aiCancelIsContextual && result.aiReturnsAfterLibraryClose &&
          result.cutChooserVisible && result.cutChooserInToolPanel && result.textChooserBehavior && result.angleChooserBehavior &&
          result.angleTabToggleWorks && result.chooserPanelSwitchingWorks && result.cutChooserPersistsAfterChoice &&
          result.chooserClosesOnSelectShortcut && result.chooserClosesOnOtherTool && result.eraseToolReachable &&
          result.cutToolReachable && result.delayedCutUiReachable && result.eraseShortcutWorks && result.delayedShortcutWorks &&
          result.aiInitialThicknessReady && result.unifiedLibraryReady && result.aiLibraryIndependentWorkspaces &&
          result.aiOneImagePerTaskReady && result.aiSingleImageComparisonGuardReady &&
          result.aiAreaCommentReady && result.aiAreaCommentTracksZoom &&
          result.aiReferencesOpenImmediately && result.aiComposerDockedRight && result.aiLocalAssetZeroRoundTripWorks &&
          result.aiLocalApparatusZeroRoundTripWorks && result.aiLocalOneResultPerWorkspace &&
          result.aiQualityControlsReady && result.aiOutputControlsReady &&
          result.aiTaskWorkspacesIsolated && result.aiCollectiveExportControlReady &&
          result.codexSendInvocationsDuringLocalSmoke === 0 &&
          result.artboardAreaOverlayOpened && result.artboardConfirmButtonPresent && result.artboardAreaCaptureWorks && result.artboardCornerHandleRemoved &&
          result.artboardSelectionRecentersObjects && result.artboardSelectionRecentersGuides &&
          result.internalCutSeparates && result.internalCutSelectsExtracted && result.internalCutRendersBoth &&
          !result.installDialogOpened && result.menuBarPolicySatisfied && result.appIconReadable;
        if (process.env.FIVE_E_IMAGE_E2E === "1") {
          result.imageE2e = await win.webContents.executeJavaScript(`new Promise(async (resolve) => {
            let settled = false;
            let imageItemSeen = false;
            let imageItemStarted = false;
            let analysisTurnsCompleted = 0;
            const imagesBefore = document.querySelectorAll("#scene image[data-id]").length;
            const finish = (value) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
            const timer = setTimeout(() => finish({ generated: false, error: "timeout" }), 210000);
            window.fiveEDesktop.onEvent(async (msg) => {
              const item = msg?.params?.item;
              if (msg?.method === "item/started" && item?.type === "imageGeneration") imageItemStarted = true;
              if (msg?.method === "item/completed" && item?.type === "imageGeneration") {
                imageItemSeen = true;
                const previewReady = /^data:image\\//.test(item.imageDataUrl || "");
                const previewDeadline = Date.now() + 10000;
                let insertButton = null;
                while (Date.now() < previewDeadline) {
                  insertButton = document.querySelector("#ai-image-panel [data-ai-insert-selected]:not(:disabled)");
                  if (insertButton && document.querySelector("#ai-image-panel .ai-generated-card.is-ai-active-candidate")) break;
                  await new Promise((done) => setTimeout(done, 100));
                }
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
                  analysisTurnsCompleted,
                  imageItemStarted,
                });
              } else if (msg?.method === "turn/completed" && imageItemStarted && !imageItemSeen) {
                finish({ generated: false, error: "image turn completed without an image", analysisTurnsCompleted, imageItemStarted });
              } else if (msg?.method === "turn/completed" && !imageItemStarted) {
                analysisTurnsCompleted += 1;
              }
            });
            try {
              document.getElementById("ai-image-install-open")?.click();
              const uiDeadline = Date.now() + 10000;
              while (Date.now() < uiDeadline && document.getElementById("ai-image-panel")?.hidden) {
                await new Promise((done) => setTimeout(done, 100));
              }
              const panel = document.getElementById("ai-image-panel");
              const canvas = document.createElement("canvas");
              canvas.width = 64; canvas.height = 64;
              const context = canvas.getContext("2d");
              context.fillStyle = "#fff"; context.fillRect(0, 0, 64, 64);
              context.strokeStyle = "#000"; context.lineWidth = 3; context.strokeRect(18, 12, 28, 42);
              const blob = await new Promise((done) => canvas.toBlob(done, "image/png"));
              const transfer = new DataTransfer();
              transfer.items.add(new File([blob], "desktop-smoke-source.png", { type: "image/png" }));
              const fileInput = panel?.querySelector("[data-ai-source-file]");
              fileInput.files = transfer.files;
              fileInput.dispatchEvent(new Event("change", { bubbles: true }));
              while (Date.now() < uiDeadline && !panel?.querySelector(".ai-reference-card")) {
                await new Promise((done) => setTimeout(done, 100));
              }
              const requestInput = panel?.querySelector("[data-ai-input]");
              requestInput.value = "5E 통합 종단 테스트입니다. 흰 배경에 검은 선으로만 된 단순한 빈 비커 1개를 생성하세요. 문자, 숫자, 기호, 라벨, 지시선, 화살표는 생성하지 마세요.";
              requestInput.dispatchEvent(new Event("input", { bubbles: true }));
              panel?.querySelector('[data-ai-output-engine="raster"]')?.click();
              panel?.querySelector("[data-ai-send]")?.click();
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
ipcMain.handle("codex:status", (_, payload) => runtimeFor(payload).status());
ipcMain.handle("window:toggle-fullscreen", (event) => {
  const target = BrowserWindow.fromWebContents(event.sender);
  if (!target) return false;
  return fullscreenCoordinators.get(target)?.toggle() ?? target.isFullScreen();
});
ipcMain.handle("window:get-fullscreen", (event) => {
  const target = BrowserWindow.fromWebContents(event.sender);
  return target ? target.isFullScreen() : false;
});
ipcMain.on("project:close-snapshot", (event, payload = {}) => {
  const pending = pendingProjectCloseSnapshots.get(payload.requestId);
  if (!pending || pending.sender !== event.sender) return;
  pendingProjectCloseSnapshots.delete(payload.requestId);
  pending.resolve(payload.snapshot || null);
});
ipcMain.handle("project:save", (event, payload = {}) => saveProjectFile(event.sender, payload));
ipcMain.on("ai:task-shortcut-active", (event, active) => {
  if (active) aiTaskShortcutWebContents.add(event.sender.id);
  else aiTaskShortcutWebContents.delete(event.sender.id);
});
ipcMain.handle("clipboard:read-image", () => {
  const image = clipboard.readImage();
  return image.isEmpty() ? null : image.toDataURL();
});
ipcMain.handle("codex:start", (_, payload) => runtimeFor(payload).startServer());
ipcMain.handle("codex:stop", (_, payload) => runtimeFor(payload).stopServer());
ipcMain.handle("codex:models", (_, payload) => runtimeFor(payload).listModels());
ipcMain.handle("codex:account", (_, payload) => runtimeFor(payload).accountOverview());
ipcMain.handle("codex:send", (_, payload) => {
  codexSendInvocationCount += 1;
  return runtimeFor(payload).sendTurn(payload);
});
ipcMain.handle("codex:interrupt", (_, payload) => runtimeFor(payload).interruptActiveTurn());
ipcMain.handle("codex:login", () => { const launch = codexInvocation(["login"]); execFile(launch.file, launch.args, { windowsHide: true }); return { ok: true }; });
ipcMain.handle("capture:sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 1920, height: 1080 },
    fetchWindowIcons: true,
  });
  return sources.map((source) => ({ id: source.id, name: source.name, data: source.thumbnail.toDataURL() }));
});
ipcMain.handle("local-images:pick-folder", async () => {
  const result = await dialog.showOpenDialog(win, {
    title: "검색할 로컬 이미지 폴더 선택",
    properties: ["openDirectory"],
  });
  const folder = result.canceled ? "" : path.resolve(result.filePaths[0] || "");
  if (folder) localImageRoots.add(folder);
  return { folder };
});
ipcMain.handle("local-images:list", async (_, folder) => {
  const resolved = path.resolve(String(folder || ""));
  if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error("로컬 이미지 폴더를 찾을 수 없습니다.");
  }
  if (!localImageRoots.has(resolved)) throw new Error("먼저 폴더 선택 창에서 로컬 폴더를 연결하세요.");
  return { folder: resolved, items: collectLocalImages(resolved) };
});
ipcMain.handle("local-images:thumbnail", async (_, filePath) => {
  if (!allowedLocalImagePath(filePath)) throw new Error("허용되지 않은 이미지 경로입니다.");
  const resolved = path.resolve(filePath);
  if (path.extname(resolved).toLowerCase() === ".svg") return imageDataUrl(resolved);
  const source = nativeImage.createFromPath(resolved);
  if (source.isEmpty()) return imageDataUrl(resolved);
  const size = source.getSize();
  const scale = Math.min(1, 260 / Math.max(size.width, size.height, 1));
  return source.resize({
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
    quality: "good",
  }).toDataURL();
});
ipcMain.handle("local-images:read", async (_, filePath) => {
  if (!allowedLocalImagePath(filePath)) throw new Error("허용되지 않은 이미지 경로입니다.");
  return imageDataUrl(path.resolve(filePath));
});
ipcMain.handle("batch-output:pick-folder", async () => {
  const result = await dialog.showOpenDialog(win, {
    title: "변환 결과 저장 폴더 선택",
    properties: ["openDirectory", "createDirectory"],
  });
  const folder = result.canceled ? "" : path.resolve(result.filePaths[0] || "");
  if (folder) batchOutputRoots.add(folder);
  return { folder };
});
ipcMain.handle("batch-output:save", async (_, payload = {}) => {
  const outputDirectory = path.resolve(String(payload.outputDirectory || ""));
  if (!batchOutputRoots.has(outputDirectory)) throw new Error("먼저 결과 저장 폴더를 선택하세요.");
  const match = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=]+)$/i.exec(String(payload.dataUrl || ""));
  if (!match) throw new Error("저장할 이미지 데이터가 올바르지 않습니다.");
  return batchOutputService.write({
    outputDirectory,
    sourceName: payload.sourceName,
    originalPath: payload.originalPath || null,
    data: Buffer.from(match[1], "base64"),
    extension: payload.extension || ".png",
    appendConverted: payload.appendConverted !== false,
  });
});
ipcMain.handle("image-export:save", (event, payload = {}) => {
  if (!win || win.isDestroyed() || event.sender !== win.webContents) {
    return { ok: false, canceled: false, error: "unauthorized" };
  }
  return imageExportService.save(payload);
});
registerPdfLibraryIpc({ ipcMain, dialog, shell, getWindow: () => win, service: pdfLibraryService, bundledPack: bundledPdfPack });
app.whenReady().then(() => { Menu.setApplicationMenu(null); createWindow(); });
app.on("will-quit", stopAllServers);
