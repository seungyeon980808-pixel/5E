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
  const server = startServer();
  const failures = [];
  const report = { entry: config.entry, requested: config, serverPid: server.child.pid, runtime: [], suites: [], cleanup: false };
  const evidenceBase = process.env.EVIDENCE_DIR;
  try {
    const origin = await server.ready;
    report.origin = origin;
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
      };
      if (evidenceBase) environment.EVIDENCE_DIR = path.join(evidenceBase, path.basename(entry.path, ".cjs"));
      const result = spawnSync(process.execPath, [entry.path], { cwd: root, stdio: "inherit", env: environment });
      report.suites.push({ path: entry.path, findingIds: entry.findingIds, entry: config.entry, status: result.status, signal: result.signal });
      if (result.error) throw result.error;
      if (result.status !== 0) failures.push({ path: entry.path, findingIds: entry.findingIds, status: result.status });
    }
  } catch (error) {
    report.error = { message: error.message, resources: error.resourceReceipt };
    throw error;
  } finally {
    await stopServer(server.child);
    report.cleanup = true;
    if (evidenceBase) {
      fs.mkdirSync(evidenceBase, { recursive: true });
      fs.writeFileSync(path.join(evidenceBase, "entry-runtime.json"), JSON.stringify(report, null, 2) + "\n");
    }
  }
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
