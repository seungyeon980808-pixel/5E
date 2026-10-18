const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { once } = require("node:events");
const { entryConfiguration, assertCompleteInventory, inspectEntry } = require("./helpers/four-session-entry.cjs");

const root = path.resolve(__dirname, "..");
function startServer() {
  const child = spawn(process.execPath, ["scripts/preview-local-server.cjs"], {
    cwd: root,
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const ready = new Promise((resolve, reject) => {
    let output = "";
    const finish = (error, origin) => {
      clearTimeout(timer);
      child.off("error", fail);
      child.off("exit", exited);
      child.stdout.off("data", receive);
      if (error) reject(error); else resolve(origin);
    };
    const fail = error => finish(error);
    const exited = code => finish(new Error(`Preview server exited with ${code}`));
    const receive = chunk => {
      output += String(chunk);
      const match = output.match(/Local preview: (http:\/\/127\.0\.0\.1:\d+)\/preview\//);
      if (!match) return;
      finish(null, match[1]);
    };
    const timer = setTimeout(() => finish(new Error("Preview server did not start")), 10_000);
    child.once("error", fail);
    child.once("exit", exited);
    child.stdout.on("data", receive);
  });
  return { child, ready };
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, "close");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
  child.kill("SIGTERM");
  try { await closed; } finally { clearTimeout(timer); }
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a path`);
  return value;
}

// 알려진 실패 목록: 여기 적힌 검사의 실패는 CI를 막지 않고, 목록에 없는 새 실패만 막는다.
function loadKnownFailures(file, manifest) {
  const known = new Map();
  if (!file) return known;
  const list = JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
  if (list.schemaVersion !== 1 || !Array.isArray(list.suites)) throw new Error("Unknown known-failures schema");
  const browserPaths = new Set(manifest.browser.map(entry => entry.path));
  for (const entry of list.suites) {
    if (!entry || !browserPaths.has(entry.path)) throw new Error(`Known failure is not a browser suite: ${entry?.path}`);
    if (typeof entry.reason !== "string" || !entry.reason.trim()) throw new Error(`Missing known-failure reason: ${entry.path}`);
    if (known.has(entry.path)) throw new Error(`Duplicate known failure: ${entry.path}`);
    known.set(entry.path, entry.reason);
  }
  return known;
}

function suiteTimeout(value) {
  if (value === undefined || value === "") return 0;
  const ms = Number(value);
  if (!Number.isInteger(ms) || ms < 0) throw new Error("BROWSER_SUITE_TIMEOUT_MS must be a non-negative integer");
  return ms;
}

function suiteRetries(value) {
  if (value === undefined || value === "") return 0;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0 || count > 3) throw new Error("BROWSER_SUITE_RETRIES must be an integer from 0 to 3");
  return count;
}

function annotate(level, message) {
  if (process.env.GITHUB_ACTIONS === "true") console.log(`::${level}::${message}`);
  else console.log(`${level === "error" ? "NEW FAILURE" : "NOTICE"}: ${message}`);
}

async function run() {
  const config = entryConfiguration(process.env);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "suite-manifest.json"), "utf8"));
  assertCompleteInventory(manifest, root);
  if (process.argv.includes("--list")) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  const onlyIndex = process.argv.indexOf("--only");
  const only = process.argv[onlyIndex + 1];
  if (onlyIndex >= 0 && (!only || only.startsWith("--"))) throw new Error("--only requires a suite path");
  const selected = onlyIndex >= 0 ? manifest.browser.filter(entry => entry.path.endsWith(only)) : manifest.browser;
  if (!selected.length) throw new Error("No browser suite matched --only");
  const known = loadKnownFailures(optionValue("--known-failures"), manifest);
  const reportPath = optionValue("--report");
  const timeoutMs = suiteTimeout(process.env.BROWSER_SUITE_TIMEOUT_MS);
  const retries = suiteRetries(process.env.BROWSER_SUITE_RETRIES);
  const server = startServer();
  const failures = [], knownFailures = [], knownPassing = [], flaky = [];
  const report = { entry: config.entry, requested: config, serverPid: server.child.pid, runtime: [], suites: [], cleanup: false };
  const evidenceBase = process.env.EVIDENCE_DIR;
  let transferServer, transferOrigin;
  try {
    const origin = await server.ready;
    report.origin = origin;
    if (selected.some(entry => entry.path === 'tests/test-four-session-integration-browser.cjs')) {
      transferServer = startServer();
      transferOrigin = await transferServer.ready;
      if (transferOrigin === origin) throw new Error('File-transfer verification requires a distinct real origin');
      report.transferServerPid = transferServer.child.pid;
      report.transferOrigin = transferOrigin;
    }
    const playwrightModule = process.env.PLAYWRIGHT_MODULE || require.resolve("playwright");
    const { chromium, webkit } = require(playwrightModule);
    for (const engine of [chromium, webkit]) {
      const browser = await engine.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        const runtime = await inspectEntry(page, origin, config);
        report.runtime.push({ engine: engine.name(), ...runtime });
        if (evidenceBase) {
          fs.mkdirSync(evidenceBase, { recursive: true });
          await page.screenshot({ path: path.join(evidenceBase, `entry-${engine.name()}.png`) });
        }
      } finally { await browser.close(); }
    }
    const runtime = report.runtime[0];
    console.log(`Browser entry: ${runtime.entryUrl}; main: ${runtime.mainUrl}; state: ${runtime.stateUrl}`);
    for (const entry of selected) {
      console.log(`Browser suite: ${entry.path} [${entry.findingIds.join(", ")}] entry=${config.entry}`);
      const environment = {
        ...process.env,
        PLAYWRIGHT_MODULE: playwrightModule,
        APP_ENTRY: config.entry,
        APP_MODULE_BASE: runtime.moduleBase,
        APP_MODULE_QUERY: runtime.moduleQuery,
        PREVIEW_URL: runtime.entryUrl,
        RELEASE_URL: `${origin}/`,
        EXAM_URL: `${origin}/`,
        ...(transferOrigin ? { CROSS_TRANSFER_URL: `${transferOrigin}/` } : {}),
      };
      if (evidenceBase) environment.EVIDENCE_DIR = path.join(evidenceBase, path.basename(entry.path, ".cjs"));
      const startedAt = Date.now();
      const knownReason = known.get(entry.path);
      const attempt = () => {
        const result = spawnSync(process.execPath, [entry.path], { cwd: root, stdio: "inherit", env: environment,
          ...(timeoutMs ? { timeout: timeoutMs, killSignal: "SIGKILL" } : {}) });
        const timedOut = result.error?.code === "ETIMEDOUT";
        if (result.error && !timedOut) throw result.error;
        return { result, timedOut, passed: result.status === 0 && !timedOut };
      };
      let { result, timedOut, passed } = attempt(), attempts = 1;
      // 느린 CI 컴퓨터의 타이밍 흔들림: 목록에 없는 검사가 실패하면 정해진 횟수만큼 다시 돌려 본다.
      while (!passed && !knownReason && attempts <= retries) {
        console.log(`Retrying browser suite: ${entry.path} (${attempts}/${retries})`);
        ({ result, timedOut, passed } = attempt());
        attempts++;
      }
      if (passed && attempts > 1) flaky.push({ path: entry.path, attempts });
      report.suites.push({ path: entry.path, findingIds: entry.findingIds, entry: config.entry, status: result.status, signal: result.signal,
        timedOut, attempts, elapsedMs: Date.now() - startedAt, ...(knownReason ? { knownFailure: knownReason } : {}) });
      const outcome = { path: entry.path, findingIds: entry.findingIds, status: result.status, ...(timedOut ? { timedOut } : {}) };
      if (passed) { if (knownReason) knownPassing.push(outcome); }
      else if (knownReason) knownFailures.push(outcome);
      else failures.push(outcome);
    }
  } catch (error) {
    report.error = { message: error.message, resources: error.resourceReceipt };
    throw error;
  } finally {
    try { if (transferServer) await stopServer(transferServer.child); }
    finally { await stopServer(server.child); }
    report.cleanup = true;
    if (evidenceBase) {
      fs.mkdirSync(evidenceBase, { recursive: true });
      fs.writeFileSync(path.join(evidenceBase, "entry-runtime.json"), JSON.stringify(report, null, 2) + "\n");
    }
    if (reportPath) {
      fs.mkdirSync(path.dirname(path.resolve(root, reportPath)), { recursive: true });
      fs.writeFileSync(path.resolve(root, reportPath), JSON.stringify(report, null, 2) + "\n");
    }
  }
  if (known.size) {
    console.log(`Browser suites: ${selected.length} run, ${failures.length} new failures, ${knownFailures.length} known failures, ${knownPassing.length} known now passing, ${flaky.length} passed on retry`);
    for (const outcome of knownPassing) annotate("warning", `${outcome.path} 통과 — 알려진 실패 목록에서 빼세요`);
  }
  for (const outcome of flaky) annotate("warning", `${outcome.path} 다시 돌려서 통과(${outcome.attempts}번째) — 흔들리는 검사`);
  for (const outcome of failures) annotate("error", `${outcome.path} 새 실패${outcome.timedOut ? " (시간 초과)" : ""}`);
  if (failures.length) {
    console.error(`Mapped browser failures: ${JSON.stringify(failures)}`);
    process.exitCode = 1;
  }
}

if (require.main === module) run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { startServer, stopServer, run };
