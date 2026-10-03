const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "suite-manifest.json"), "utf8"));
const onlyIndex = process.argv.indexOf("--only");
const selected = onlyIndex >= 0
  ? manifest.browser.filter((entry) => entry.path.endsWith(process.argv[onlyIndex + 1] || ""))
  : manifest.browser;

function assertCompleteInventory() {
  const classified = new Set([...manifest.unit, ...manifest.browser, ...manifest.deferred].map((entry) => entry.path));
  const candidates = fs.readdirSync(__dirname)
    .filter((name) => /\.(?:cjs|mjs)$/.test(name) && name !== "run-browser-tests.cjs")
    .map((name) => `tests/${name}`);
  const missing = candidates.filter((file) => !classified.has(file));
  if (missing.length) throw new Error(`Unclassified test scripts: ${missing.join(", ")}`);
}

async function startServer() {
  const child = spawn(process.execPath, ["scripts/preview-local-server.cjs"], {
    cwd: root,
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Preview server did not start")), 10_000);
    child.once("exit", (code) => reject(new Error(`Preview server exited with ${code}`)));
    child.stdout.on("data", (chunk) => {
      const match = String(chunk).match(/Local preview: (http:\/\/127\.0\.0\.1:\d+)\/preview\//);
      if (!match) return;
      clearTimeout(timer);
      resolve({ child, origin: match[1] });
    });
  });
}

(async () => {
  assertCompleteInventory();
  if (process.argv.includes("--list")) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  if (!selected.length) throw new Error("No browser suite matched --only");
  const server = await startServer();
  const failures = [];
  try {
    for (const entry of selected) {
      console.log(`Browser suite: ${entry.path} [${entry.findingIds.join(", ")}]`);
      const evidenceBase = process.env.EVIDENCE_DIR;
      const environment = {
        ...process.env,
        PLAYWRIGHT_MODULE: process.env.PLAYWRIGHT_MODULE || require.resolve('playwright'),
        PREVIEW_URL: `${server.origin}/preview/`,
        RELEASE_URL: `${server.origin}/`,
      };
      if (evidenceBase) environment.EVIDENCE_DIR = path.join(evidenceBase, path.basename(entry.path, ".cjs"));
      const result = spawnSync(process.execPath, [entry.path], { cwd: root, stdio: "inherit", env: environment });
      if (result.error) throw result.error;
      if (result.status !== 0) failures.push({ path: entry.path, findingIds: entry.findingIds, status: result.status });
    }
  } finally {
    server.child.kill("SIGTERM");
  }
  if (failures.length) {
    console.error(`Mapped browser failures: ${JSON.stringify(failures)}`);
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
