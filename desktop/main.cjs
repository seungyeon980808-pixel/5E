const { app, BrowserWindow, ipcMain, shell, Menu, desktopCapturer, dialog, nativeImage } = require("electron");
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
const {
  collectLocalAssets,
  isAllowedLocalAsset,
  IMAGE_EXTENSIONS,
  PDF_EXTENSIONS,
} = require("./local-assets.cjs");

const APP_ID = "com.5e.editor";
const APP_ICON_PATH = path.join(__dirname, "..", "assets", "icon.ico");
app.setAppUserModelId(APP_ID);

const userDataOverride = process.env.FIVE_E_SMOKE_USER_DATA || process.env.FIVE_E_DEV_USER_DATA;
if (userDataOverride) app.setPath("userData", path.resolve(userDataOverride));
if (process.env.FIVE_E_DISABLE_GPU === "1") app.disableHardwareAcceleration();

let win;
let splash;
let server;
let rpcId = 0;
const activeTurns = new Map();
const recoveryTerminatingTurnIds = new Set();
let pendingTurnStarts = 0;
let initialized = false;
let initializingPromise = null;
let codexSendInvocationCount = 0;
const pending = new Map();
const turnAttachmentPaths = new Map();
const turnPerformance = new TurnPerformanceRegistry();
const autoFinalizingImageTurns = new Set();
const MAX_CONCURRENT_TURNS = 5;
const IMAGE_FINALIZE_TIMEOUT_MS = 10_000;
const IMAGE_FINALIZE_POLL_MS = 500;
const RPC_CHECK_TIMEOUT_MS = 1_500;
const localImageRoots = new Set();

function allowedLocalImagePath(filePath) {
  return isAllowedLocalAsset(localImageRoots, filePath, IMAGE_EXTENSIONS);
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

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    delay(ms).then(() => { throw new Error(`${label} timeout`); }),
  ]);
}
function sendImageFinalization(turnId, state, extra = {}) {
  const clientRequestId = activeTurns.get(turnId)?.clientRequestId || null;
  send("codex:event", { method: "5e/image-finalization", params: { turnId, clientRequestId, state, ...extra } });
}
function releaseActiveTurn(completedTurnId) {
  cleanupAttachments(completedTurnId);
  autoFinalizingImageTurns.delete(completedTurnId);
  recoveryTerminatingTurnIds.delete(completedTurnId);
  activeTurns.delete(completedTurnId);
}
function sendSyntheticPerformance(completedTurnId) {
  const performance = turnPerformance.snapshot(completedTurnId, Date.now());
  if (!performance) return;
  send("codex:event", {
    method: "5e/performance",
    params: { ...performance, clientRequestId: activeTurns.get(completedTurnId)?.clientRequestId || null },
  });
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
  while (autoFinalizingImageTurns.has(completedTurnId) && activeTurns.has(completedTurnId) && Date.now() < deadline) {
    try {
      const response = await withTimeout(
        rpc("thread/read", { threadId: renderThreadId, includeTurns: true }),
        RPC_CHECK_TIMEOUT_MS,
        "thread/read",
      );
      const status = readTurnTerminalStatus(response, completedTurnId);
      if (status) {
        sendSyntheticPerformance(completedTurnId);
        sendImageFinalization(completedTurnId, "confirmed", { status });
        releaseActiveTurn(completedTurnId);
        return;
      }
    } catch {}
    await delay(IMAGE_FINALIZE_POLL_MS);
  }
  if (!autoFinalizingImageTurns.has(completedTurnId) || !activeTurns.has(completedTurnId)) return;

  // A shared App Server may have other healthy turns in flight. Never terminate
  // the whole process to recover one stuck image turn; release only that slot.
  if (activeTurns.size > 1) {
    sendSyntheticPerformance(completedTurnId);
    sendImageFinalization(completedTurnId, "recovered", { status: "interrupted" });
    releaseActiveTurn(completedTurnId);
    return;
  }

  // A missing turn/completed notification or a stuck interrupt must not leave the
  // editor locked forever. Terminate the local App Server and wait for its process
  // to exit before allowing another render, so remote image turns never overlap.
  sendImageFinalization(completedTurnId, "recovering");
  const child = server;
  let stopped = false;
  recoveryTerminatingTurnIds.add(completedTurnId);
  try {
    stopped = await terminateProcessTreeAndWait(child);
  } finally {
    recoveryTerminatingTurnIds.delete(completedTurnId);
  }
  if (!stopped) {
    sendImageFinalization(completedTurnId, "recoveryFailed", { message: "App Server did not exit" });
    return;
  }
  sendSyntheticPerformance(completedTurnId);
  sendImageFinalization(completedTurnId, "recovered", { status: "interrupted" });
  releaseActiveTurn(completedTurnId);
}

function codexInvocation(args) {
  if (process.platform !== "win32") return { file: "codex", args };
  return { file: process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe", args: ["/d", "/s", "/c", "codex", ...args] };
}
function send(event, payload) { if (win && !win.isDestroyed()) win.webContents.send(event, payload); }
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

function handleServerProcessTermination(child, {
  state,
  error = null,
  code = null,
  signal = null,
} = {}) {
  if (server !== child) return;
  const activeTurnIds = Array.from(activeTurns.keys());
  for (const activeTurnId of activeTurnIds) {
    const failure = createProcessFailureFinalization({
      activeTurnId,
      recoveryTerminatingTurnId: recoveryTerminatingTurnIds.has(activeTurnId) ? activeTurnId : null,
      error,
      code,
      signal,
    });
    // Preserve each turn identity until the renderer receives its terminal
    // signal and its final performance snapshot.
    if (failure) {
      sendImageFinalization(failure.turnId, failure.state, {
        status: failure.status,
        message: failure.message,
      });
      sendSyntheticPerformance(failure.turnId);
      releaseActiveTurn(failure.turnId);
    }
  }
  server = null;
  activeTurns.clear();
  pendingTurnStarts = 0;
  initialized = false;
  initializingPromise = null;
  turnPerformance.clear();
  autoFinalizingImageTurns.clear();
  recoveryTerminatingTurnIds.clear();
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
      let msg; try { msg = JSON.parse(line); } catch { return; }
      if (msg.id != null && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || "Codex request failed")); else p.resolve(msg.result);
      }
      const performanceObservation = turnPerformance.observe(msg);
      attachGeneratedImageData(msg);
      const eventTurnId = msg.params?.turnId || msg.params?.turn?.id || performanceObservation?.performance?.turnId || null;
      const activeTurn = eventTurnId ? activeTurns.get(eventTurnId) : null;
      if (activeTurn?.clientRequestId && msg.params) msg.params.clientRequestId = activeTurn.clientRequestId;
      send("codex:event", msg);
      if (shouldAutoFinalizeImageTurn({
        message: msg,
        observation: performanceObservation,
        activeTurnId: activeTurn ? eventTurnId : null,
        alreadyFinalizing: autoFinalizingImageTurns.has(eventTurnId),
      })) {
        const renderThreadId = activeTurn?.threadId;
        autoFinalizingImageTurns.add(eventTurnId);
        // The generated file is the terminal result for an image-only turn. Stop any
        // trailing narration, then verify the server-side turn is terminal before a
        // subsequent render is allowed to start.
        void autoFinalizeImageTurn(renderThreadId, eventTurnId);
      }
      if (performanceObservation?.completed) {
        send("codex:event", {
          method: "5e/performance",
          params: { ...performanceObservation.performance, clientRequestId: activeTurn?.clientRequestId || null },
        });
        turnPerformance.delete(performanceObservation.performance.turnId);
      }
      if (msg.method === "turn/completed" && msg.params?.turn?.id) {
        releaseActiveTurn(msg.params.turn.id);
      }
    });
    child.stderr.on("data", (b) => send("codex:log", { level: "error", message: String(b).trim() }));
    child.on("error", (error) => handleServerProcessTermination(child, { state: "missing", error }));
    child.on("exit", (code, signal) => handleServerProcessTermination(child, { state: "stopped", code, signal }));
    send("codex:state", { state: "running" });
    return { ok: true, state: "running" };
  } catch (error) { return { ok: false, state: "missing", message: error.message }; }
}
function stopServer() {
  if (server) server.kill();
  server = null;
  activeTurns.clear();
  pendingTurnStarts = 0;
  initialized = false;
  initializingPromise = null;
  turnPerformance.clear();
  autoFinalizingImageTurns.clear();
  recoveryTerminatingTurnIds.clear();
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
    clientRequestId = null,
  } = payload;
  if (activeTurns.size + pendingTurnStarts >= MAX_CONCURRENT_TURNS) {
    throw new Error(`동시에 실행할 수 있는 AI 작업은 최대 ${MAX_CONCURRENT_TURNS}개입니다.`);
  }
  pendingTurnStarts += 1;
  const startedAt = Date.now();
  const plan = resolveTurnPlan({ ...payload, conversationId, resetConversation });
  try {
    startServer();
    await ensureInitialized();

    let requestThreadId = null;
    if (plan.ephemeralRender) {
      const started = await rpc("thread/start", buildEphemeralThreadStartParams({
        purpose: plan.purpose,
        model,
        serviceTier,
        cwd: app.getPath("userData"),
      }));
      requestThreadId = started?.thread?.id || null;
    } else if (plan.resumeConversationId) {
      try {
        const resumed = await rpc("thread/resume", {
          threadId: plan.resumeConversationId,
          approvalPolicy: "never",
          sandbox: "read-only",
        });
        requestThreadId = resumed?.thread?.id || plan.resumeConversationId;
      } catch { requestThreadId = null; }
    }
    if (!requestThreadId && !plan.ephemeralRender) {
      const started = await rpc("thread/start", {
        model: model || null,
        serviceTier: serviceTier || null,
        cwd: app.getPath("userData"),
        approvalPolicy: "never",
        sandbox: "read-only",
        ephemeral: false,
        serviceName: "5e-chat",
      });
      requestThreadId = started?.thread?.id || null;
    }
    if (!requestThreadId) throw new Error("Codex 대화를 시작하지 못했습니다.");

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
    let result;
    try {
      result = await rpc("turn/start", {
        threadId: requestThreadId,
        input,
        model: model || null,
        effort: effort || null,
        serviceTier: serviceTier || null,
      });
    } catch (error) {
      await Promise.all(paths.map((file) => fs.promises.unlink(file).catch(() => {})));
      throw error;
    }
    const requestTurnId = result?.turn?.id || null;
    if (!requestTurnId) {
      await Promise.all(paths.map((file) => fs.promises.unlink(file).catch(() => {})));
      throw new Error("Codex 작업을 시작하지 못했습니다.");
    }
    activeTurns.set(requestTurnId, {
      turnId: requestTurnId,
      threadId: requestThreadId,
      clientRequestId: typeof clientRequestId === "string" ? clientRequestId : null,
      purpose: plan.purpose,
    });
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
    return {
      threadId: plan.ephemeralRender ? null : requestThreadId,
      conversationId: plan.ephemeralRender ? plan.preservedConversationId : requestThreadId,
      renderThreadId: plan.ephemeralRender ? requestThreadId : null,
      ephemeralRender: plan.ephemeralRender,
      purpose: plan.purpose,
      turnId: requestTurnId,
      clientRequestId,
      result,
      performance,
    };
  } finally {
    pendingTurnStarts = Math.max(0, pendingTurnStarts - 1);
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
    titleBarOverlay: { color: "#0e1512", symbolColor: "#9fb8b0", height: 30 },
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
  win.loadFile(path.join(__dirname, "..", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: "deny" }; });
  if (process.env.FIVE_E_SMOKE_TEST === "1") {
    win.webContents.once("did-finish-load", async () => {
      try {
        const codexSendsBeforeSmoke = codexSendInvocationCount;
        const result = await win.webContents.executeJavaScript(`new Promise((resolve) => {
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
            const aiSourceEntrypointsReady = !!panel?.querySelector(".ai-file-button input[type=file]") &&
              !!panel?.querySelector("[data-ai-reference-search]") && !!panel?.querySelector("[data-ai-capture]");
            panel?.querySelector("[data-ai-reference-search]")?.click();
            const aiLoadMenuReady = await waitFor(() => {
              const search = document.querySelector(".ai-reference-search-dialog");
              return search?.querySelectorAll("[data-ai-search-source]").length === 3 &&
                search.querySelector("input[type=search]") === document.activeElement;
            }, 4000);
            document.querySelector("[data-ai-search-close]")?.click();
            panel?.querySelector("[data-ai-capture]")?.click();
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
            const aiReturnsAfterLibraryClose = panel?.hidden === false && !document.querySelector(".ai-reference-search-dialog");
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
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", code: "KeyE", ctrlKey: true, bubbles: true }));
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
            let examLibraryAiReferenceWorks = false;
            let imageLibraryAiReferenceWorks = false;
            let aiMultipleReferencesReady = false;
            let aiComparisonReady = false;
            let aiAreaCommentReady = false;
            let aiAreaCommentTracksZoom = false;
            let aiReferencesOpenImmediately = false;
            let aiLocalAssetZeroRoundTripWorks = false;
            let aiLocalApparatusZeroRoundTripWorks = false;
            let aiQualityControlsReady = false;
            let aiOutputControlsReady = false;
            let aiTaskTabsIsolated = false;
            let aiBusyTabCreationWorks = false;
            let aiBatchControlReady = false;
            document.getElementById("exam-library-open")?.click();
            if (await waitFor(() => document.querySelector(".examlib-card"))) {
              const examCards = Array.from(document.querySelectorAll(".examlib-card")).slice(0, 2);
              examCards.forEach((card) => card.click());
              const examAiButton = document.getElementById("examlib-ai");
              if (examAiButton && !examAiButton.disabled) {
                examAiButton.click();
                examLibraryAiReferenceWorks = await waitFor(() =>
                  panel?.hidden === false && panel.querySelectorAll(".ai-reference-card").length >= examCards.length);
                panel.querySelector("[data-ai-close]")?.click();
              }
            }
            document.getElementById("parts-library-open")?.click();
            if (await waitFor(() => document.querySelector(".partslib-card"))) {
              const partCards = Array.from(document.querySelectorAll(".partslib-card")).slice(0, 2);
              partCards.forEach((card) => card.click());
              const imageAiReady = await waitFor(() => {
                const candidate = document.getElementById("partslib-ai");
                return candidate && !candidate.disabled;
              });
              if (imageAiReady) {
                document.getElementById("partslib-ai")?.click();
                imageLibraryAiReferenceWorks = await waitFor(() =>
                  panel?.hidden === false && panel.querySelectorAll(".ai-reference-card").length >= 4);
                aiMultipleReferencesReady = imageLibraryAiReferenceWorks;
                const referenceDetails = panel.querySelector(".ai-reference-section");
                aiReferencesOpenImmediately = !!referenceDetails?.open;
                const commentCard = panel.querySelector(".ai-reference-card");
                const commentStage = commentCard?.querySelector(".ai-preview-stage");
                const commentImage = commentStage?.querySelector("img");
                const commentButton = commentCard?.querySelector(".ai-preview-actions button:last-child");
                if (commentStage && commentImage && commentButton) {
                  commentButton.click();
                  const rect = commentStage.getBoundingClientRect();
                  commentImage.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 77, clientX: rect.left + rect.width * .2, clientY: rect.top + rect.height * .2 }));
                  commentStage.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 77, clientX: rect.left + rect.width * .6, clientY: rect.top + rect.height * .6 }));
                  commentStage.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 77, clientX: rect.left + rect.width * .6, clientY: rect.top + rect.height * .6 }));
                  const selection = commentCard.querySelector(".ai-selection-box");
                  aiAreaCommentReady = !!selection && !!commentCard.querySelector(".ai-comment-row input");
                  if (selection) {
                    const beforeStage = commentStage.getBoundingClientRect();
                    const beforeSelection = selection.getBoundingClientRect();
                    const before = {
                      x: (beforeSelection.left - beforeStage.left) / beforeStage.width,
                      y: (beforeSelection.top - beforeStage.top) / beforeStage.height,
                      w: beforeSelection.width / beforeStage.width,
                      h: beforeSelection.height / beforeStage.height,
                    };
                    commentCard.querySelector(".ai-preview-actions button:first-child")?.click();
                    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
                    const afterStage = commentStage.getBoundingClientRect();
                    const afterImage = commentImage.getBoundingClientRect();
                    const afterSelection = selection.getBoundingClientRect();
                    const after = {
                      x: (afterSelection.left - afterStage.left) / afterStage.width,
                      y: (afterSelection.top - afterStage.top) / afterStage.height,
                      w: afterSelection.width / afterStage.width,
                      h: afterSelection.height / afterStage.height,
                    };
                    aiAreaCommentTracksZoom = Math.abs(afterStage.height - afterImage.height) < 4 &&
                      Object.keys(before).every((key) => Math.abs(before[key] - after[key]) < .02);
                  }
                }
                panel.querySelector("[data-ai-compare]")?.click();
                aiComparisonReady = await waitFor(() =>
                  document.querySelectorAll(".ai-compare-pane").length === 2 &&
                  document.querySelectorAll(".ai-compare-picker button").length >= 4);
                document.querySelector(".ai-compare-head button")?.click();
                panel.querySelector("[data-ai-close]")?.click();
              }
            }
            button?.click();
            if (await waitFor(() => panel?.hidden === false, 2000)) {
              aiQualityControlsReady = panel.querySelectorAll("[data-ai-quality]").length === 3;
              aiOutputControlsReady = panel.querySelectorAll("[data-ai-output-engine]").length === 2;
              aiBatchControlReady = !!panel.querySelector("[data-ai-batch]") && !!panel.querySelector("[data-ai-batch-panel]");
              const originalTab = panel.querySelector("[data-ai-tab-list] .ai-task-tab.is-on");
              const originalInputValue = panel.querySelector("[data-ai-input]")?.value || "";
              panel.querySelector("[data-ai-tab-new]")?.click();
              const isolatedInput = panel.querySelector("[data-ai-input]");
              if (isolatedInput) isolatedInput.value = "tab isolation smoke";
              originalTab?.click();
              const originalRestored = panel.querySelector("[data-ai-input]")?.value === originalInputValue;
              const createdTab = Array.from(panel.querySelectorAll("[data-ai-tab-list] .ai-task-tab")).at(-1);
              createdTab?.click();
              aiTaskTabsIsolated = originalRestored && panel.querySelector("[data-ai-input]")?.value === "tab isolation smoke";
              // Local zero-round-trip diagrams are now an explicit user choice;
              // textbook raster conversion is never auto-routed to 5E assets.
              panel.querySelector('[data-ai-output-engine="asset"]')?.click();
              const localRequests = [
                "한반도 물리 해안선 지도를 그려 줘",
                "one closed rectangular series circuit with exactly one dc source on the left, one open switch on the top, one resistor on the right, and one lamp on the bottom, no labels or arrows",
                "one ceiling-fixed pulley with one continuous rope, one blank rectangular load on the left branch, and on the right branch one spring followed by one blank rectangular load of the same shape, no labels or arrows",
                "optical bench with exactly one convex lens on the left, one plane mirror at 45 degrees in the center, and one screen on the right, no rays labels or arrows",
                "beaker and particle box side by side comparison: beaker liquid fill fraction 0.45, gas 16 circular particles, unmixed, no labels or arrows",
                "one generic unlabeled logistic S-shaped population curve without labels text numbers",
              ];
              const localResults = [];
              for (const localRequest of localRequests) {
                panel.querySelector("[data-ai-new]")?.click();
                panel.querySelector('[data-ai-mode="diagram"]')?.click();
                const aiInput = panel.querySelector("[data-ai-input]");
                let historyTail = "";
                try {
                  const history = JSON.parse(localStorage.getItem("5e.aiPerformance.v1") || "[]");
                  historyTail = JSON.stringify(Array.isArray(history) ? history.at(-1) || null : null);
                } catch {}
                if (aiInput) aiInput.value = localRequest;
                panel.querySelector("[data-ai-send]")?.click();
                let busyOriginTabId = null;
                if (localResults.length === 0) {
                  const tabsBefore = panel.querySelectorAll("[data-ai-tab-list] .ai-task-tab").length;
                  const activeTabBefore = panel.querySelector("[data-ai-tab-list] .ai-task-tab.is-on")?.dataset.tabId;
                  busyOriginTabId = activeTabBefore || null;
                  const addTabButton = panel.querySelector("[data-ai-tab-new]");
                  const addTabEnabledWhileBusy = addTabButton?.disabled === false;
                  addTabButton?.click();
                  const activeTabAfter = panel.querySelector("[data-ai-tab-list] .ai-task-tab.is-on")?.dataset.tabId;
                  aiBusyTabCreationWorks = addTabEnabledWhileBusy &&
                    panel.querySelectorAll("[data-ai-tab-list] .ai-task-tab").length === tabsBefore + 1 &&
                    activeTabAfter === activeTabBefore;
                }
                if (busyOriginTabId) {
                  const switchedToNewTab = await waitFor(() =>
                    panel.querySelector("[data-ai-tab-list] .ai-task-tab.is-on")?.dataset.tabId !== busyOriginTabId, 4000);
                  const originTab = panel.querySelector('[data-ai-tab-list] .ai-task-tab[data-tab-id="' + busyOriginTabId + '"]');
                  originTab?.click();
                  aiBusyTabCreationWorks = aiBusyTabCreationWorks && switchedToNewTab &&
                    panel.querySelector("[data-ai-tab-list] .ai-task-tab.is-on")?.dataset.tabId === busyOriginTabId;
                }
                const localPreviewReady = await waitFor(() =>
                  !!panel.querySelector("[data-ai-previews] .ai-preview-card img[src^='data:image/svg+xml']"), 4000);
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
              panel.querySelector("[data-ai-close]")?.click();
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
              examLibraryAiReferenceWorks,
              imageLibraryAiReferenceWorks,
              aiMultipleReferencesReady,
              aiComparisonReady,
              aiAreaCommentReady,
              aiAreaCommentTracksZoom,
              aiReferencesOpenImmediately,
              aiLocalAssetZeroRoundTripWorks,
              aiLocalApparatusZeroRoundTripWorks,
              aiQualityControlsReady,
              aiOutputControlsReady,
              aiTaskTabsIsolated,
              aiBusyTabCreationWorks,
              aiBatchControlReady,
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
        result.menuBarVisible = win.isMenuBarVisible();
        result.appIconReadable = !nativeImage.createFromPath(APP_ICON_PATH).isEmpty();
        const ok = result.buttonText === "AI 이미지 생성" && result.panelOpened &&
          result.modelCatalogReadable && result.captureSourcesReadable && result.aiUsesCentralModal &&
          result.aiAutoConnectControlsSimplified && result.aiProgressUiReady && result.aiResultsPlacedLeft &&
          result.aiSourceEntrypointsReady && result.aiLoadMenuReady && result.aiCaptureCropReady && result.aiCancelIsContextual && result.aiReturnsAfterLibraryClose &&
          result.cutChooserVisible && result.cutChooserInToolPanel && result.textChooserBehavior && result.angleChooserBehavior &&
          result.angleTabToggleWorks && result.chooserPanelSwitchingWorks && result.cutChooserPersistsAfterChoice &&
          result.chooserClosesOnOtherTool && result.eraseToolReachable &&
          result.cutToolReachable && result.delayedCutUiReachable && result.eraseShortcutWorks && result.delayedShortcutWorks &&
          result.examLibraryAiReferenceWorks && result.imageLibraryAiReferenceWorks &&
          result.aiMultipleReferencesReady && result.aiComparisonReady && result.aiAreaCommentReady && result.aiAreaCommentTracksZoom &&
          result.aiReferencesOpenImmediately && result.aiComposerDockedRight && result.aiLocalAssetZeroRoundTripWorks &&
          result.aiLocalApparatusZeroRoundTripWorks && result.aiQualityControlsReady && result.aiOutputControlsReady &&
          result.aiTaskTabsIsolated && result.aiBusyTabCreationWorks && result.aiBatchControlReady && result.codexSendInvocationsDuringLocalSmoke === 0 &&
          result.artboardAreaOverlayOpened && result.artboardConfirmButtonPresent && result.artboardAreaCaptureWorks && result.artboardCornerHandleRemoved &&
          result.artboardSelectionRecentersObjects && result.artboardSelectionRecentersGuides &&
          result.internalCutSeparates && result.internalCutSelectsExtracted && result.internalCutRendersBoth &&
          !result.installDialogOpened && result.menuBarVisible === false && result.appIconReadable;
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
        if (process.env.FIVE_E_PARALLEL_TURN_E2E === "1") {
          result.parallelTurnE2e = await win.webContents.executeJavaScript(`(async () => {
            const requestIds = ["parallel-smoke-a", "parallel-smoke-b"];
            try {
              const turns = await Promise.all(requestIds.map((clientRequestId, index) => window.fiveEDesktop.send({
                text: "Return one minimal valid editable-scene description for a blank rectangle. No image generation tool. Variant " + (index + 1) + ".",
                attachments: [],
                conversationId: null,
                purpose: "scene",
                ephemeralRender: true,
                effort: "low",
                clientRequestId,
              })));
              const status = await window.fiveEDesktop.status();
              const turnIds = turns.map((turn) => turn.turnId).filter(Boolean);
              await Promise.all(turnIds.map((turnId) => window.fiveEDesktop.interrupt(turnId)));
              return {
                started: turnIds.length === 2,
                distinct: new Set(turnIds).size === 2,
                activeTogether: Number(status.activeTurns) >= 2,
                maxConcurrentTurns: status.maxConcurrentTurns,
              };
            } catch (error) {
              return { started: false, error: error?.message || String(error) };
            }
          })()`);
        }
        const finalOk = ok && result.codexStatusReadable && result.codexServerLifecycle &&
          (process.env.FIVE_E_IMAGE_E2E !== "1" ||
            (result.imageE2e?.generated && result.imageE2e?.previewReady && result.imageE2e?.inserted)) &&
          (process.env.FIVE_E_PARALLEL_TURN_E2E !== "1" ||
            (result.parallelTurnE2e?.started && result.parallelTurnE2e?.distinct &&
              result.parallelTurnE2e?.activeTogether && result.parallelTurnE2e?.maxConcurrentTurns === MAX_CONCURRENT_TURNS));
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
ipcMain.handle("codex:status", async () => ({
  server: !!server,
  activeTurns: activeTurns.size,
  maxConcurrentTurns: MAX_CONCURRENT_TURNS,
  login: await loginStatus(),
}));
ipcMain.handle("codex:start", () => startServer());
ipcMain.handle("codex:stop", () => stopServer());
ipcMain.handle("codex:models", () => listModels());
ipcMain.handle("codex:account", () => accountOverview());
ipcMain.handle("codex:send", (_, payload) => {
  codexSendInvocationCount += 1;
  return sendTurn(payload);
});
ipcMain.handle("codex:interrupt", async (_, requestedTurnId) => {
  const targetTurnId = typeof requestedTurnId === "string"
    ? requestedTurnId
    : requestedTurnId?.turnId;
  const activeTurn = targetTurnId ? activeTurns.get(targetTurnId) : null;
  return server && activeTurn
    ? rpc("turn/interrupt", { threadId: activeTurn.threadId, turnId: targetTurnId }).catch(() => null)
    : null;
});
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
    title: "PDF 파일은 표시되지 않습니다 — 현재 폴더를 선택하세요",
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
  const assets = collectLocalAssets(resolved);
  return { folder: resolved, items: assets.images, pdfs: assets.pdfs };
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
ipcMain.handle("local-pdfs:read", async (_, filePath) => {
  if (!isAllowedLocalAsset(localImageRoots, filePath, PDF_EXTENSIONS)) {
    throw new Error("허용되지 않은 PDF 경로입니다.");
  }
  return fs.promises.readFile(path.resolve(filePath));
});
app.whenReady().then(() => { Menu.setApplicationMenu(null); createWindow(); });
app.on("before-quit", stopServer);
