const { app, BrowserWindow, ipcMain, shell, Menu, desktopCapturer, dialog, nativeImage } = require("electron");
const { desktopSmokePasses } = require("./smoke-contract.cjs");
const { spawn, execFile } = require("node:child_process");
const { createInterface } = require("node:readline");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
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
const { createProcessFailureFinalization } = require("./codex-process-failure.cjs");

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
  const expectedUrl = pathToFileURL(path.join(__dirname, "..", "preview", "index.html")).href;
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

function assertTrustedLocalImageSender(event) {
  const expectedUrl = pathToFileURL(path.join(__dirname, "..", "preview", "index.html")).href;
  if (!isTrustedIpcSender(event, win, expectedUrl)) {
    throw new Error("허용되지 않은 로컬 이미지 요청입니다.");
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
  let result;
  try {
    if (owner.done || owner.cancelled) throw new Error("AI 작업이 취소되었습니다.");
    // Exactly one backend turn is started. Any image retry must be an explicit agent/tool decision.
    result = await rpc("turn/start", { threadId: requestThreadId, input, model: model || null, effort: effort || null, serviceTier: serviceTier || null });
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
  win.on("closed", () => { win = null; });
  win.loadFile(path.join(__dirname, "..", "preview", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: "deny" }; });
  if (process.env.FIVE_E_SMOKE_TEST === "1") {
    win.webContents.once("did-finish-load", async () => {
      try {
        const codexSendsBeforeSmoke = codexSendInvocationCount;
        const smokeFixtureImageDataUrl = readSmokeFixtureImageDataUrl();
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
              !!panel?.querySelector('[data-ai-source-action="capture"]');
            panel?.querySelector('[data-ai-source-action="library"]')?.click();
            const aiLoadMenuReady = await waitFor(() => {
              const library = document.querySelector(".unified-library-overlay:not([hidden])");
              return !!library?.querySelector("[data-unilib-close]") &&
                !!document.querySelector("[data-unilib-query]");
            }, 4000);
            document.querySelector("[data-unilib-close]")?.click();
            await waitFor(() => !document.querySelector(".unified-library-overlay:not([hidden])"), 2000);
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
            const aiReturnsAfterLibraryClose = panel?.hidden === false &&
              !document.querySelector(".unified-library-overlay:not([hidden])");
            panel.hidden = true;
            dismissStartupDialogs();
            await waitFor(() => !document.querySelector(".tut-welcome-overlay") &&
              !Array.from(document.querySelectorAll(".modal-overlay .modal-title"))
                .some((title) => startupDialogTitles.has(title.textContent?.trim())), 2000);
            const stateModule = await import("./js/state.js?v=1.6.0-preview-labeler-0917-1111");
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
                  const originalTaskRestored = await waitFor(() =>
                    taskList?.querySelector('.ai-task-tab.is-on')?.dataset.tabId === originalTaskId &&
                    panel.querySelectorAll('[data-ai-reference-id]').length === originalReferenceCount &&
                    panel.querySelectorAll('.ai-generated-card').length === originalResultCount, 4000);
                  aiTaskIsolationWorks = isolatedTaskReady && originalTaskRestored;
                }
              }
              panel.querySelector('[data-ai-close]')?.click();
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
ipcMain.handle("codex:status", async () => ({ server: !!server, login: await loginStatus() }));
ipcMain.handle("codex:start", () => startServer());
ipcMain.handle("codex:stop", (_event, payload = {}) => workspaceScope(payload) ? interruptWorkspace(payload) : stopServer());
ipcMain.handle("codex:models", () => listModels());
ipcMain.handle("codex:account", () => accountOverview());
ipcMain.handle("codex:send", (event, payload) => {
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
ipcMain.handle("codex:interrupt", (_event, payload = {}) => interruptWorkspace(payload));
ipcMain.handle("codex:login", () => { const launch = codexInvocation(["login"]); execFile(launch.file, launch.args, { windowsHide: true }); return { ok: true }; });
ipcMain.handle("capture:sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 1920, height: 1080 },
    fetchWindowIcons: true,
  });
  return sources.map((source) => ({ id: source.id, name: source.name, data: source.thumbnail.toDataURL() }));
});
ipcMain.handle("local-images:pick-folder", async (event) => {
  assertTrustedLocalImageSender(event);
  const result = await dialog.showOpenDialog(win, {
    title: "검색할 로컬 이미지 폴더 선택",
    properties: ["openDirectory"],
  });
  const folder = result.canceled ? "" : localImages.addRoot(result.filePaths[0] || "");
  return { folder };
});
ipcMain.handle("local-images:list", async (event, folder) => {
  assertTrustedLocalImageSender(event);
  const resolved = localImages.requireRoot(folder);
  return { folder: resolved, items: collectLocalImages(resolved) };
});
ipcMain.handle("local-images:thumbnail", async (event, filePath) => {
  assertTrustedLocalImageSender(event);
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
ipcMain.handle("local-images:read", async (event, filePath) => {
  assertTrustedLocalImageSender(event);
  return imageDataUrl(localImages.read(filePath));
});
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

module.exports = { createSmokeFixtureTurn, isValidSmokeFixtureRequest, shortcutModifiersForPlatform };
