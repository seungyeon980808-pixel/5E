const { spawn } = require("node:child_process");
const { createInterface } = require("node:readline");
const { performance } = require("node:perf_hooks");
const { pathToFileURL } = require("node:url");
const crypto = require("node:crypto");
const path = require("node:path");
const { buildEphemeralThreadStartParams } = require("./ai-thread-profile.cjs");

const root = path.resolve(__dirname, "..");
const requestedTimeoutMs = Number(process.env.FIVE_E_SCENE_BENCHMARK_TIMEOUT) || 120_000;
// This benchmark must stay bounded even when a caller supplies a larger value.
const timeoutMs = Math.min(120_000, Math.max(1_000, requestedTimeoutMs));

function codexInvocation(args) {
  if (process.platform !== "win32") return { file: "codex", args };
  return {
    file: process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/s", "/c", "codex", ...args],
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

async function run() {
  const scenePromptModule = await import(
    `${pathToFileURL(path.join(root, "js", "ai-scene-prompt.js")).href}?benchmark=${Date.now()}`
  );
  const sceneCompilerModule = await import(
    `${pathToFileURL(path.join(root, "js", "ai-motif-catalog.js")).href}?benchmark=${Date.now()}`
  );
  const request = process.env.FIVE_E_SCENE_BENCHMARK_PROMPT
    || "문자, 숫자, 기호, 화살표 없이 직사각형 한 개, 고정 도르래 한 개, 도르래를 지나는 줄, 줄 양끝에 매달린 같은 크기의 직사각형 추 두 개를 흰 배경의 검은 선 과학 도식으로 구성해 줘.";
  const prompt = scenePromptModule.buildFastScenePrompt({ mode: "diagram", request });

  const launch = codexInvocation(["app-server", "--stdio"]);
  const child = spawn(launch.file, launch.args, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const pending = new Map();
  const stderr = [];
  const eventErrors = [];
  const itemTypes = new Map();
  let rpcId = 0;
  let finalMessage = "";
  let finalMessageAt = null;
  let imageCallCount = 0;
  let completeTurn;
  let failTurn;
  const completion = new Promise((resolve, reject) => {
    completeTurn = resolve;
    failTurn = reject;
  });

  child.stderr.on("data", (buffer) => {
    const line = String(buffer).trim();
    if (line) stderr.push(line);
    if (stderr.length > 20) stderr.shift();
  });
  child.on("error", failTurn);
  child.on("exit", (code, signal) => {
    if (code && code !== 0) {
      failTurn(new Error(`Codex app-server exited (${code ?? signal}): ${stderr.join("\n")}`));
    }
  });

  const rl = createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.id != null && pending.has(message.id)) {
      const requestState = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) requestState.reject(new Error(message.error.message || "Codex RPC failed"));
      else requestState.resolve(message.result);
      return;
    }
    const item = message.params?.item;
    if (item?.type) itemTypes.set(item.type, (itemTypes.get(item.type) || 0) + 1);
    if (message.method === "item/started" && item?.type === "imageGeneration") imageCallCount += 1;
    if (message.method === "item/completed" && item?.type === "agentMessage" && item.phase !== "commentary") {
      finalMessage = String(item.text || "").trim();
      finalMessageAt = performance.now();
    }
    if (message.method === "error") {
      eventErrors.push(String(message.params?.error?.message || message.params?.message || "Unknown App Server error"));
    }
    if (message.method === "turn/completed") completeTurn(message.params?.turn || {});
  });

  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = ++rpcId;
    pending.set(id, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
  const notify = (method, params = {}) => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  };

  const timer = setTimeout(() => {
    failTurn(new Error(`Fast-scene benchmark timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  const processStartedAt = performance.now();
  let turnRequestedAt = null;
  let turnStartedAt = null;
  try {
    await rpc("initialize", {
      clientInfo: { name: "5e-fast-scene-benchmark", title: "5E Fast Scene Benchmark", version: "1.0.0" },
      capabilities: { experimentalApi: true },
    });
    notify("initialized");
    const catalog = await rpc("model/list", { limit: 100, includeHidden: false });
    const models = Array.isArray(catalog?.data) ? catalog.data : [];
    const luna = models.find((item) => /luna/i.test(`${item.model || item.id} ${item.displayName || ""}`));
    const model = process.env.FIVE_E_SCENE_BENCHMARK_MODEL || luna?.model || luna?.id || null;
    if (!model) throw new Error("Luna model was not found in the local Codex catalog.");

    const cwd = process.env.APPDATA ? path.join(process.env.APPDATA, "5e-desktop") : root;
    const thread = await rpc("thread/start", buildEphemeralThreadStartParams({
      purpose: "scene",
      model,
      serviceTier: "priority",
      cwd,
    }));
    const threadId = thread?.thread?.id;
    if (!threadId) throw new Error("Fast-scene benchmark thread was not created.");

    turnRequestedAt = performance.now();
    const turn = await rpc("turn/start", {
      threadId,
      input: [{ type: "text", text: prompt }],
      model,
      effort: "low",
      serviceTier: "priority",
    });
    turnStartedAt = performance.now();
    const completed = await completion;
    const turnCompletedAt = performance.now();

    const compileStartedAt = performance.now();
    const compiled = sceneCompilerModule.compileFastSceneWithMotifs(finalMessage, {
      mode: "diagram",
      layerId: 1,
      idPrefix: "benchmark_scene",
    });
    const compileEndedAt = performance.now();
    const noUnexpectedTools = imageCallCount === 0
      && !Array.from(itemTypes.keys()).some((type) => [
        "commandExecution", "webSearch", "imageGeneration", "mcpToolCall",
      ].includes(type));
    const ok = completed.status === "completed"
      && compiled.valid
      && compiled.supported
      && compiled.objects.length > 0
      && noUnexpectedTools;

    console.log(JSON.stringify({
      ok,
      status: completed.status || "unknown",
      error: completed.error?.message || completed.error || eventErrors.at(-1) || null,
      model,
      effort: "low",
      serviceTier: "priority",
      timeoutMs,
      timings: {
        setupMs: Math.round((turnRequestedAt - processStartedAt) * 100) / 100,
        turnStartRpcMs: Math.round((turnStartedAt - turnRequestedAt) * 100) / 100,
        modelResponseMs: Math.round((turnCompletedAt - turnRequestedAt) * 100) / 100,
        finalMessageMs: finalMessageAt == null
          ? null
          : Math.round((finalMessageAt - turnRequestedAt) * 100) / 100,
        localCompileWallMs: Math.round((compileEndedAt - compileStartedAt) * 1000) / 1000,
        localCompileReportedMs: Math.round(compiled.stats.compileMs * 1000) / 1000,
        endToEndMs: Math.round((compileEndedAt - processStartedAt) * 100) / 100,
      },
      response: {
        chars: finalMessage.length,
        sha256: sha256(finalMessage),
        preview: finalMessage.slice(0, 240),
      },
      compile: {
        valid: compiled.valid,
        supported: compiled.supported,
        inputElements: compiled.stats.inputElements,
        outputObjects: compiled.stats.outputObjects,
        warningCount: compiled.warnings.length,
        errorCount: compiled.errors.length,
        unsupportedCount: compiled.unsupported.length,
        errors: compiled.errors.slice(0, 5),
        unsupported: compiled.unsupported.slice(0, 5),
      },
      safety: {
        imageCallCount,
        noUnexpectedTools,
        observedItemTypes: Object.fromEntries(itemTypes),
      },
      threadId,
      turnId: turn?.turn?.id || null,
    }));
    if (!ok) process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    rl.close();
    child.kill();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error?.message || String(error),
      stack: error?.stack || null,
      timeoutMs,
    }));
    process.exitCode = 1;
  });
}

module.exports = { codexInvocation, run, timeoutMs };
