const { spawn } = require("node:child_process");
const { createInterface } = require("node:readline");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const timeoutMs = Number(process.env.FIVE_E_BENCHMARK_TIMEOUT) || 240_000;

function codexInvocation(args) {
  if (process.platform !== "win32") return { file: "codex", args };
  return {
    file: process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/s", "/c", "codex", ...args],
  };
}

async function run() {
  const { buildImagePrompt } = await import(`${pathToFileURL(path.join(root, "js", "ai-prompt.js")).href}?benchmark=${Date.now()}`);
  const prompt = buildImagePrompt({
    mode: "diagram",
    request: process.env.FIVE_E_BENCHMARK_PROMPT
      || "흰 배경 없이 실제 투명 배경에 검은 선만 사용하여, 받침대 위에 놓인 빈 비커 하나를 간결한 평가원식 그림형 과학 도식으로 생성해 줘.",
  });

  const launch = codexInvocation(["app-server", "--stdio"]);
  const child = spawn(launch.file, launch.args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const pending = new Map();
  const stderr = [];
  let rpcId = 0;
  let imageCallCount = 0;
  let imageFailedCount = 0;
  let firstImageStartedAt = null;
  let imageToolMs = 0;
  let finalMessage = "";
  const eventErrors = [];
  const imageStarts = new Map();
  let completeTurn;
  let failTurn;
  const completion = new Promise((resolve, reject) => { completeTurn = resolve; failTurn = reject; });

  child.stderr.on("data", (buffer) => {
    stderr.push(String(buffer).trim());
    if (stderr.length > 20) stderr.shift();
  });
  child.on("error", failTurn);
  child.on("exit", (code, signal) => {
    if (code && code !== 0) failTurn(new Error(`Codex app-server exited (${code ?? signal}): ${stderr.join("\n")}`));
  });

  const rl = createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id != null && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message || "Codex RPC failed"));
      else request.resolve(message.result);
      return;
    }
    const item = message.params?.item;
    if (message.method === "item/completed" && item?.type === "agentMessage" && item.phase !== "commentary") {
      finalMessage = String(item.text || "").trim().slice(0, 1000);
    }
    if (message.method === "error") {
      eventErrors.push(String(message.params?.error?.message || message.params?.message || "Unknown App Server error").slice(0, 1000));
    }
    if (item?.type === "imageGeneration") {
      const itemId = item.id || `image-${imageCallCount + 1}`;
      if (message.method === "item/started") {
        const now = Date.now();
        if (!imageStarts.has(itemId)) {
          imageStarts.set(itemId, now);
          imageCallCount += 1;
          if (firstImageStartedAt == null) firstImageStartedAt = now;
        }
      } else if (message.method === "item/completed") {
        const now = Date.now();
        if (!imageStarts.has(itemId)) {
          imageStarts.set(itemId, now);
          imageCallCount += 1;
          if (firstImageStartedAt == null) firstImageStartedAt = now;
        }
        imageToolMs += Math.max(0, now - imageStarts.get(itemId));
        if (/fail|error|cancel|interrupt/i.test(String(item.status || ""))) imageFailedCount += 1;
      }
    }
    if (message.method === "turn/completed") completeTurn(message.params?.turn || {});
  });

  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = ++rpcId;
    pending.set(id, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
  const notify = (method, params = {}) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);

  const timer = setTimeout(() => failTurn(new Error(`Benchmark timed out after ${timeoutMs}ms`)), timeoutMs);
  const startedAt = Date.now();
  try {
    await rpc("initialize", {
      clientInfo: { name: "5e-speed-benchmark", title: "5E Speed Benchmark", version: "1.0.0" },
      capabilities: { experimentalApi: true },
    });
    notify("initialized");
    const catalog = await rpc("model/list", { limit: 100, includeHidden: false });
    const models = Array.isArray(catalog?.data) ? catalog.data : [];
    const luna = models.find((item) => /luna/i.test(`${item.model || item.id} ${item.displayName || ""}`));
    const model = process.env.FIVE_E_BENCHMARK_MODEL || luna?.model || luna?.id || null;
    const thread = await rpc("thread/start", {
      model,
      serviceTier: "priority",
      cwd: process.env.APPDATA ? path.join(process.env.APPDATA, "5e-desktop") : root,
      approvalPolicy: "never",
      sandbox: "read-only",
      ephemeral: true,
      serviceName: "5e-image-speed-benchmark",
    });
    const threadId = thread?.thread?.id;
    if (!threadId) throw new Error("Benchmark render thread was not created.");
    const turn = await rpc("turn/start", {
      threadId,
      input: [{ type: "text", text: prompt }],
      model,
      effort: "low",
      serviceTier: "priority",
    });
    const completed = await completion;
    const totalMs = Date.now() - startedAt;
    const ok = completed.status === "completed" && imageCallCount === 1 && imageFailedCount === 0;
    console.log(JSON.stringify({
      ok,
      status: completed.status || "unknown",
      error: completed.error?.message || completed.error || eventErrors.at(-1) || null,
      finalMessage: finalMessage || null,
      model,
      totalMs,
      firstImageStartMs: firstImageStartedAt == null ? null : firstImageStartedAt - startedAt,
      imageToolMs,
      imageCallCount,
      imageFailedCount,
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

run().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
