const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const electron = process.env.FIVE_E_SMOKE_EXE || path.join(root, "node_modules", "electron", "dist", "electron.exe");
const launchArgs = process.env.FIVE_E_SMOKE_EXE ? [] : [root];
const marker = path.join(os.tmpdir(), `5e-desktop-smoke-${process.pid}.json`);

const run = spawnSync(electron, launchArgs, {
  cwd: root,
  env: { ...process.env, FIVE_E_SMOKE_TEST: "1", FIVE_E_SMOKE_RESULT: marker },
  encoding: "utf8",
  timeout: Number(process.env.FIVE_E_SMOKE_TIMEOUT) || 30_000,
});

let report;
try {
  report = JSON.parse(fs.readFileSync(marker, "utf8"));
} catch (error) {
  console.error(run.stdout || "");
  console.error(run.stderr || "");
  throw new Error(`Desktop smoke result was not created: ${error.message}`);
} finally {
  if (fs.existsSync(marker)) fs.unlinkSync(marker);
}

if (run.error) throw run.error;
if (run.status !== 0 || !report.ok) throw new Error(`Desktop smoke failed: ${JSON.stringify(report)}`);
console.log(`[5E desktop smoke] ${JSON.stringify(report.result)}`);
